const pool = require('../db');
const pagoSchema = require('../models/Pago.js');
const { getIO } = require('../socket');

exports.insertPagos = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Asegurar que req.body sea un array
        let { chofer_cuil, cliente_cuit } = req.body || null;
        if (!chofer_cuil && !cliente_cuit) return res.status(406).json({ message: 'El chofer o cliente no fue proporcionado' });
        const pagos = Array.isArray(req.body.pagos) ? req.body.pagos : [req.body.pagos];
        // Validar los datos de entrada
        const { errors, validatedData } = pagoSchema(pagos);
        if (errors.length > 0) {
            console.log(errors);
            return res.status(400).json({ message: 'Errores de validación', errors });
        }
        let nombre;
        if (chofer_cuil){
            const userExists = await client.query(
                'SELECT cuil, nombre_apellido AS nombre FROM usuario WHERE valid = true AND cuil = $1',
                [chofer_cuil]
            );
            if (userExists.rows.length === 0) {
                return res.status(409).json({ 
                    message: `El chofer con CUIL ${chofer_cuil} no está registrado.`
                });
            }
            nombre = userExists.rows[0].nombre;
        }

        if (cliente_cuit){
            const clienteExists = await client.query(
                'SELECT cuit FROM cliente WHERE valid = true AND cuit = $1',
                [cliente_cuit]
            );
            if (clienteExists.rows.length === 0) {
                return res.status(409).json({ 
                    message: `El cliente con CUIL ${cliente_cuit} no está registrado.`
                });
            }
        }
        let pagoId;
        let pagosArray = [];
        // Procesar cada pago
        for (const [index, pago] of validatedData.entries()) {
            // Insertar según el tipo de pago
            if (pago.tipo.toLowerCase() === 'cheque') {
                if (pago.fecha_pago > pago.fecha_cheque){
                    return res.status(402).json({message:"La fecha del pago no puede ser mayor a la fecha del cheque"});
                }

                let responseExists = await client.query("SELECT valid FROM pagos_cheque WHERE nro = $1",
                    [pago.nroCheque]
                );

                if (responseExists.rowCount > 0) {
                    if (responseExists.rows[0].valid)
                        return res.status(409).json({message: `El cheque con número ${pago.nroCheque} ya se encuentra registrado`});
                    else 
                        await client.query("DELETE FROM pagos_cheque WHERE valid = false AND nro = $1", [pago.nroCheque]);
                };

                const result = await client.query(
                    `INSERT INTO pagos_cheque (
                        chofer_cuil, fecha_pago, fecha_cheque, nro, tercero, destinatario, importe, pagado, cliente_cuit
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING nro AS id`,
                    [
                        chofer_cuil? chofer_cuil : pago.chofer_cuil,
                        pago.fecha_pago,
                        pago.fecha_cheque,
                        pago.nroCheque,
                        pago.tercero,
                        pago.destinatario,
                        pago.importe,
                        false,
                        cliente_cuit? cliente_cuit : pago.cliente_cuit
                    ]
                );
                pagosArray.push({id: pago.nroCheque, tipo: pago.tipo, nro_cheque: pago.nroCheque, fecha_pago: pago.fecha_pago, fecha_cheque: pago.fecha_cheque, tercero: pago.tercero, destinatario: pago.destinatario, importe: pago.importe, cliente_cuit: cliente_cuit, nombre: nombre})
                if (!cliente_cuit)
                    cliente_cuit = pago.cliente_cuit;
                pagoId = result.rows[0];
            } else if (pago.tipo.toLowerCase() === 'gasoil') {
                let responseExists = await client.query("SELECT valid FROM pagos_gasoil WHERE comprobante = $1",
                    [pago.comprobante]
                );

                if (responseExists.rowCount > 0){ 
                    if (responseExists.rows[0].valid)
                        return res.status(409).json({message: `El pago de gasoil con comprobante ${pago.comprobante} ya se encuentra registrado`})
                    else
                        await client.query("DELETE FROM pagos_gasoil WHERE valid = false AND comprobante = $1", [pago.comprobante]);
                };
                const result = await client.query(
                    `INSERT INTO pagos_gasoil (
                        comprobante, chofer_cuil, fecha_pago, precio, litros
                    ) VALUES ($1, $2, $3, $4, $5) RETURNING comprobante AS id`,
                    [
                        pago.comprobante,
                        chofer_cuil,
                        pago.fecha_pago,
                        pago.precioGasoil,
                        pago.litros,
                    ]
                );
                pagosArray.push({id: pago.comprobante, tipo: pago.tipo, fecha_pago: pago.fecha_pago, importe: pago.precioGasoil * pago.litros, litros: pago.litros});
                pagoId = result.rows[0];
            } else if (pago.tipo.toLowerCase() === 'otro') {  
                let responseExists = await client.query("SELECT valid FROM pagos_otro WHERE comprobante = $1",
                    [pago.comprobante]
                );

                if (responseExists.rowCount > 0){
                    if (responseExists.rows[0].valid)
                        return res.status(409).json({message: `El pago con comprobante ${pago.comprobante} ya se encuentra registrado`})
                    else
                        await client.query("DELETE FROM pagos_otro WHERE valid = false AND comprobante = $1", [pago.comprobante]);
                };  
                
                const result = await client.query(
                    `INSERT INTO pagos_otro (
                        comprobante, ${chofer_cuil? 'chofer_cuil' : 'cliente_cuit'}, fecha_pago, detalle, importe
                    ) VALUES ($1, $2, $3, $4, $5) RETURNING comprobante AS id`,
                    [
                        pago.comprobante,
                        chofer_cuil? chofer_cuil : cliente_cuit,
                        pago.fecha_pago,
                        pago.detalle,
                        pago.importe
                    ]
                );
                pagosArray.push({id: pago.comprobante, tipo: pago.tipo, fecha_pago: pago.fecha_pago, detalle: pago.detalle, importe: pago.importe});
                pagoId = result.rows[0];
            }
        }

        await client.query('COMMIT');

        res.status(201).json({ 
            message: `Se registraron ${validatedData.length} pago(s) con éxito`, pagoId
        });

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('nuevoPago', {pagosArray: pagosArray, cuil: chofer_cuil , cuit: cliente_cuit});
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en insertPagos", error.stack);
        }

    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error en insertPagos:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar pago(s).' });
    } finally {
        client?.release();
    }
};

exports.getAllPagos = async (req, res) => {
    const cuil = req.params.cuil;
    if (req.user.role === 'chofer' && req.user.cuil != cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    try {
        const result = await pool.query('SELECT * FROM pagos_unified WHERE chofer_cuil = $1 AND fecha_pago <= CURRENT_DATE ORDER BY fecha_pago ASC', [cuil]);
        return res.status(202).json(result.rows);
    } catch (error) {
        console.error('Error en getAllPagos:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener los pagos.' });
    }
};

exports.getPagosCheque = async (req, res) => {
    const choferCuil = req.query.choferCuil !== 'null'? req.query.choferCuil : null;
    let pagado;
    const cantidad = parseInt(req.query.cantidad) || null;
    switch (req.query.pagado){
        case "false":
            pagado = false;
            break;
        case "true":
            pagado = true;
            break;
        default:
            pagado = null;
    }
        
    if (!choferCuil || choferCuil != req.user.cuil){
        if (req.user.role === 'chofer') {
            return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
        }
    }
    try {
        
        let query = `
            SELECT nro AS nro_cheque, chofer_cuil, fecha_pago, 
                   fecha_cheque, tercero, destinatario, nombre_apellido AS nombre, importe
            FROM pagos_cheque c
            INNER JOIN usuario u ON c.chofer_cuil = u.cuil
            WHERE c.valid = true ${choferCuil? 'AND c.fecha_pago <= CURRENT_DATE' : ''}`;
        const params = [];
        let conditions = [];

        if (choferCuil) {
            conditions.push(`chofer_cuil = $${params.length + 1}`);
            params.push(choferCuil);
        }
        if (pagado !== null) {
            conditions.push(`pagado = $${params.length + 1}`);
            params.push(pagado === true);
        }
        if (conditions.length > 0) {
            query += ` AND ${conditions.join(' AND ')} AND cliente_cuit IS NULL
            `;
        }
        query += ` ORDER BY fecha_cheque ASC
        `;
        
        if (pagado && cantidad){
            query+= `LIMIT $${params.length + 1}`;
            params.push(cantidad);
        }
        const result = await pool.query(query, params);
        const cheques = result.rows;
        return res.status(200).json(cheques);
    } catch (error) {
        console.error('Error en getPagosCheque:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener los pagos de cheque.' });
    } 
};

exports.setChequesPagos = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const data = req.body;
    if(!data || data.length === 0){
        return res.status(404).json({message: 'No se encontraron cheques para marcar como pagos.'});
    }

    try {
        let query = `
        UPDATE pagos_cheque
        SET pagado = true
        `;
        const params = [];
        let conditions = [];
        if (Array.isArray(data))
            data.forEach(cheque => {
                conditions.push(`nro = $${params.length + 1}`);
                params.push(cheque);
            });

        if (conditions.length > 0) {
            query += `WHERE ${conditions.join(' OR ')}`;
        }
        
        const result = await pool.query(query, params);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'No se encontraron cheques para actualizar.' });
        }

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('marcarPago', {nros: data} );
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en deletePago", error.stack);
        }

        return res.status(200).json({message: "Cheques actualizados con exito"});

    } catch (error){
        console.error('Error en setChequesPagos:', error);
        res.status(500).json({ message: 'Error interno del servidor al marcar los cheques como pagos.' });
    }
}

exports.getPagosGasoil = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    try {
        const choferCuil = req.query.choferCuil || null;
        let query = `
            SELECT comprobante AS id, chofer_cuil, fecha_pago, precio, litros
            FROM pagos_gasoil
        `;
        const params = [];
        if (choferCuil) {
            query += ` WHERE chofer_cuil = $1`;
            params.push(choferCuil);
        }
        query += ` ORDER BY fecha_pago DESC`;

        const result = await pool.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error en getPagosGasoil:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener los pagos de gasoil.' });
    }
};

exports.getPagosOtros = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    let client;
    try {
        client = await pool.connect();
        const choferCuil = req.query.choferCuil || null;
        let query = `
            SELECT comprobante AS id, chofer_cuil, fecha_pago, detalle, importe
            FROM pagos_otro
        `;
        const params = [];
        if (choferCuil) {
            query += ` WHERE chofer_cuil = $1`;
            params.push(choferCuil);
        }
        query += ` ORDER BY fecha_pago DESC`;

        const result = await client.query(query, params);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error en getPagosOtro:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener los pagos de otro.' });
    } finally {
        client?.release();
    }
};

exports.getPagosCliente = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { cuit, cantidad} = req.query;

    if (!cuit || !cantidad || cuit === "null" || cantidad === "null" || cuit === "undefined" || cantidad === "undefined"){
        return res.status(405).json({message: "No se reconocieron los datos para obtener los pagos del cliente"});
    }

    try {
        const result = await pool.query('SELECT * FROM pagos_cliente_unified WHERE cliente_cuit = $1 LIMIT $2', [cuit, cantidad]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error en getPagosOtro:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener los pagos de otro.' });
    }
};

exports.updatePagos = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const pagos = req.body; // Objeto con formato { [id]: { id, group, ... }, ... }
    if (!pagos || typeof pagos !== 'object' || Object.keys(pagos).length === 0) {
        return res.status(400).json({ message: 'Se debe proporcionar un objeto con pagos a actualizar.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const updatedPagos = [];
        const errors = [];

        for (const [id, data] of Object.entries(pagos)) {
            if (!id) {
                errors.push({ id, message: 'El ID en la clave y en el objeto debe coincidir.' });
                continue;
            }

            const { tipo, choferCuil, ...fields } = data;
            if (!tipo || !choferCuil) {
                errors.push({ id, message: 'Faltan campos requeridos: tipo o choferCuil.' });
                continue;
            }

            // Validar datos de entrada con pagoSchema (validación parcial)
            const { errors: validationErrors, validatedData } = pagoSchema([{ tipo, ...fields }], true); // true indica validación parcial
            if (validationErrors.length > 0) {
                errors.push({ id, message: 'Errores de validación', errors: validationErrors });
                continue;
            }

            // Verificar si el chofer existe
            const userExists = await client.query(
                'SELECT cuil FROM usuario WHERE cuil = $1',
                [choferCuil]
            );
            if (userExists.rows.length === 0) {
                errors.push({ id, message: `El chofer con CUIL ${choferCuil} no está registrado.` });
                continue;
            }

            // Construir consulta de actualización dinámica
            let query, values, table, idColumn;
            if (tipo.toLowerCase() === 'cheque') {
                table = 'pagos_cheque';
                idColumn = 'nro';
                const allowedFields = {
                    chofer_cuil_c: choferCuil,
                    fecha_pago: validatedData[0].fecha_pago,
                    fecha_c: validatedData[0].fecha_cheque,
                    nro: validatedData[0].nroCheque,
                    tercero: validatedData[0].tercero,
                    destinatario: validatedData[0].destinatario,
                    importe: validatedData[0].importe,
                    pagado: validatedData[0].pagado,
                    group: validatedData[0].group
                };
                const setClauses = [];
                const queryValues = [];
                let paramCount = 1;

                Object.entries(fields).forEach(([key, value]) => {
                    if (key in allowedFields && value !== undefined) {
                        setClauses.push(`"${key}" = $${paramCount}`);
                        queryValues.push(allowedFields[key]);
                        paramCount++;
                    }
                });

                if (setClauses.length === 0) {
                    errors.push({ id, message: 'No se proporcionaron campos válidos para actualizar.' });
                    continue;
                }

                queryValues.push(id);
                query = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${idColumn} = $${paramCount} RETURNING *`;
                values = queryValues;
            } else if (tipo.toLowerCase() === 'gasoil') {
                table = 'pagos_gasoil';
                idColumn = 'comprobante';
                const allowedFields = {
                    chofer_cuil_g: choferCuil,
                    fecha_pago: validatedData[0].fecha_pago,
                    precio: validatedData[0].precioGasoil,
                    litros: validatedData[0].litros,
                    group: validatedData[0].group
                };
                const setClauses = [];
                const queryValues = [];
                let paramCount = 1;

                Object.entries(fields).forEach(([key, value]) => {
                    if (key in allowedFields && value !== undefined) {
                        setClauses.push(`"${key}" = $${paramCount}`);
                        queryValues.push(allowedFields[key]);
                        paramCount++;
                    }
                });

                if (setClauses.length === 0) {
                    errors.push({ id, message: 'No se proporcionaron campos válidos para actualizar.' });
                    continue;
                }

                queryValues.push(id);
                query = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${idColumn} = $${paramCount}`;
                values = queryValues;
            } else if (tipo.toLowerCase() === 'otro') {
                table = 'pagos_otro';
                idColumn = 'comprobante';
                const allowedFields = {
                    chofer_cuil_o: choferCuil,
                    fecha_pago: validatedData[0].fecha_pago,
                    detalle: validatedData[0].detalle,
                    importe: validatedData[0].importe,
                    group: validatedData[0].group
                };
                const setClauses = [];
                const queryValues = [];
                let paramCount = 1;

                Object.entries(fields).forEach(([key, value]) => {
                    if (key in allowedFields && value !== undefined) {
                        setClauses.push(`"${key}" = $${paramCount}`);
                        queryValues.push(allowedFields[key]);
                        paramCount++;
                    }
                });

                if (setClauses.length === 0) {
                    errors.push({ id, message: 'No se proporcionaron campos válidos para actualizar.' });
                    continue;
                }

                queryValues.push(id);
                query = `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${idColumn} = $${paramCount}`;
                values = queryValues;
            } else {
                errors.push({ id, message: `Tipo de pago no válido: ${tipo}` });
                continue;
            }
            // Ejecutar la actualización
            const result = await client.query(query, values);
            if (result.rowCount === 0) {
                errors.push({ id, message: `No se encontró el pago de tipo ${tipo} con ID ${id}.` });
                continue;
            }

            updatedPagos.push({ id, tipo, message: `Pago de tipo ${tipo} actualizado con éxito.` });
        }

        if (errors.length > 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ message: 'Errores al actualizar algunos pagos', errors, updatedPagos });
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Pagos actualizados con éxito.', updatedPagos });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        client?.release();
        console.error('Error en updatePago:', error);
        res.status(500).json({ message: 'Error interno del servidor al actualizar los pagos.' });
    }
};

exports.deletePago = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { id, type } = req.query;
    if (!id || !type || id === "undefined" || type === "undefined" || id === "null" || type === "null"){
        return res.status(404).json({ message: "No se pudo obtener información sobre el pago a eliminar"});
    }

    let cliente;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        
        let querySelect, queryDelete;
        switch (type.toLowerCase()){
            case 'cheque':
                querySelect = 'SELECT nro, chofer_cuil, cliente_cuit FROM pagos_cheque WHERE valid = true AND nro = $1';
                queryDelete = 'UPDATE pagos_cheque SET valid = false WHERE nro = $1';
                break;
            case 'gasoil':
                querySelect = 'SELECT comprobante, chofer_cuil FROM pagos_gasoil WHERE valid = true AND comprobante = $1';
                queryDelete = 'UPDATE pagos_gasoil SET valid = false WHERE comprobante = $1';
                break;
            case 'otro':
                querySelect = 'SELECT comprobante, chofer_cuil, cliente_cuit FROM pagos_otro WHERE valid = true AND comprobante = $1';
                queryDelete = 'UPDATE pagos_otro SET valid = false WHERE comprobante = $1';
                break;
            default:
                return res.status(404).json({ message: "No se pudo reconocer el pago a eliminar"});
        }

        const responseExists = await client.query(querySelect, [id]);
        
        if (!(responseExists.rows.length > 0)){
            if (type.toLowerCase() === 'otro'){
                const responseOtro = await client.query('SELECT id FROM pagos_otro WHERE valid = true AND id = $1', [id]);
                if (responseOtro.rows.length > 0){
                    return res.status(405).json({ message: "Los pagos por saldo de anteriores resumenes no pueden eliminarse"});
                }
            }
            return res.status(405).json({ message: "El pago a eliminar no se encuentra registrado o ya fue eliminado previamente"});
        }

        await client.query(queryDelete, [id]);

        client.query("COMMIT");
        client.release();

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('deletePago', {id: id.trim(), tipo: type.trim(), cuil: responseExists.rows[0].chofer_cuil, cuit: type.toLowerCase() === "cheque"? responseExists.rows[0].cliente_cuit : null});
                    socket.emit('deletePagoCliente', {id: id.trim(), cuit: type.toLowerCase() !== "gasoil" ? responseExists.rows[0].cliente_cuit : null, tipo: type.trim()});
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en deletePago", error.stack);
        }

        return res.status(200).json({message: `El pago con comprobante ${id} fue eliminado con exito`});
    } catch (error){
        if (client) await client.query('ROLLBACK');
        if (client) client.release();
        console.error('Error en deletePago: ', error.message, error.stack);
        res.status(500).json({message: error.routine.includes('raise')? 'Error: ' + error.message : 'Ocurrio un error al intentar eliminar el pago'});
    }
};
