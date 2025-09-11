const pool = require('../db');
const pagoSchema = require('../models/Pago.js');

exports.insertPagos = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Asegurar que req.body sea un array
        const { chofer_cuil, cliente_cuit } = req.body || null;
        if (!chofer_cuil && !cliente_cuit) return res.status(406).json({ message: 'El chofer o cliente no fue proporcionado' });
        const pagos = Array.isArray(req.body.pagos) ? req.body.pagos : [req.body.pagos];
        // Validar los datos de entrada
        const { errors, validatedData } = pagoSchema(pagos);
        if (errors.length > 0) {
            console.log(errors);
            return res.status(400).json({ message: 'Errores de validación', errors });
        }
        if (chofer_cuil){
            const userExists = await client.query(
                'SELECT cuil FROM usuario WHERE cuil = $1',
                [chofer_cuil]
            );
            if (userExists.rows.length === 0) {
                return res.status(409).json({ 
                    message: `El chofer con CUIL ${chofer_cuil} no está registrado.`
                });
            }
        }

        if (cliente_cuit){
            const clienteExists = await client.query(
                'SELECT cuit FROM cliente WHERE cuit = $1',
                [cliente_cuit]
            );
            if (clienteExists.rows.length === 0) {
                return res.status(409).json({ 
                    message: `El cliente con CUIL ${cliente_cuit} no está registrado.`
                });
            }
        }
        let pagoId;
        // Procesar cada pago
        for (const [index, pago] of validatedData.entries()) {
            // Insertar según el tipo de pago
            if (pago.tipo.toLowerCase() === 'cheque') {
                const result = await client.query(
                    `INSERT INTO pagos_cheque (
                        chofer_cuil, fecha_pago, fecha_cheque, nro, tercero, destinatario, importe, pagado, cliente_cuit
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING nro AS id`,
                    [
                        chofer_cuil? chofer_cuil : pago.chofer_cuil,
                        pago.fechaPago,
                        pago.fechaCheque,
                        pago.nroCheque,
                        pago.tercero,
                        pago.destinatario,
                        pago.importe,
                        false,
                        cliente_cuit? cliente_cuit : pago.cliente_cuit
                    ]
                );
                pagoId = result.rows[0];
            } else if (pago.tipo.toLowerCase() === 'gasoil') {
                const result = await client.query(
                    `INSERT INTO pagos_gasoil (
                        comprobante, chofer_cuil, fecha_pago, precio, litros
                    ) VALUES ($1, $2, $3, $4, $5) RETURNING comprobante AS id`,
                    [
                        pago.comprobante,
                        chofer_cuil,
                        pago.fechaPago,
                        pago.precioGasoil,
                        pago.litros,
                    ]
                );
                pagoId = result.rows[0];
            } else if (pago.tipo.toLowerCase() === 'otro') {     
                const result = await client.query(
                    `INSERT INTO pagos_otro (
                        comprobante, ${chofer_cuil? 'chofer_cuil' : 'cliente_cuit'}, fecha_pago, detalle, importe
                    ) VALUES ($1, $2, $3, $4, $5) RETURNING comprobante AS id`,
                    [
                        pago.comprobante,
                        chofer_cuil? chofer_cuil : cliente_cuit,
                        pago.fechaPago,
                        pago.detalle,
                        pago.importe
                    ]
                );
                pagoId = result.rows[0];
            }
        }
        await client.query('COMMIT');

        res.status(201).json({ 
            message: `Se registraron ${validatedData.length} pago(s) con éxito`, pagoId
        });
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
    if (req.user.role !== 'admin' && req.user.cuil != cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    try {
        let query = `
            SELECT 'Cheque' AS tipo, nro::varchar(30) AS id, fecha_pago, 
                   fecha_cheque, tercero, NULL AS descripcion, importe, NULL AS litros
            FROM pagos_cheque
            WHERE valid = true AND chofer_cuil = $1 AND "group_r" IS NULL
            UNION ALL
            SELECT 'Gasoil' AS tipo, g.comprobante AS id, fecha_pago, 
                   NULL AS fecha_cheque, NULL AS tercero, NULL AS descripcion, precio * litros AS importe,
                   litros
            FROM pagos_gasoil g
            WHERE valid = true AND chofer_cuil = $1 AND "group_r" IS NULL
            UNION ALL
            SELECT 'Otro' AS tipo, COALESCE(o.comprobante, o.id::varchar(30)) AS id, fecha_pago, 
                   NULL AS fecha_cheque, NULL AS tercero, detalle AS descripcion, importe, NULL AS litros
            FROM pagos_otro o
            WHERE valid = true AND chofer_cuil = $1 AND "group_r" IS NULL
        `;
        const params = [];
        if (cuil)
            params.push(cuil);
        query += ` ORDER BY fecha_pago ASC`;

        const result = await pool.query(query, params);
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
        if (req.user.role !== 'admin') {
            return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
        }
    }
    try {
        
        let query = `
            SELECT nro AS nro_cheque, chofer_cuil, fecha_pago, 
                   fecha_cheque, tercero, destinatario, nombre_apellido AS nombre, importe
            FROM pagos_cheque c
            INNER JOIN (SELECT nombre_apellido, cuil FROM usuario WHERE valid = true) u ON c.valid = true AND c.chofer_cuil = u.cuil
            WHERE valid = true`;
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
    if (req.user.role !== 'admin') {
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
        return res.status(200).json({message: "Cheques actualizados con exito"});

    } catch (error){
        console.error('Error en setChequesPagos:', error);
        res.status(500).json({ message: 'Error interno del servidor al marcar los cheques como pagos.' });
    }
}

exports.getPagosGasoil = async (req, res) => {
    if (req.user.role !== 'admin') {
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
    if (req.user.role !== 'admin') {
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
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { cuit, cantidad} = req.query;

    if (!cuit || !cantidad || cuit === "null" || cantidad === "null" || cuit === "undefined" || cantidad === "undefined"){
        return res.status(405).json({message: "No se reconocieron los datos para obtener los pagos del cliente"});
    }

    let client;
    try {
        client = await pool.connect();
        const choferCuil = req.query.choferCuil || null;
        let query = `
            SELECT 'Cheque' AS tipo, nro::varchar(30) AS id, NULL::NUMERIC AS idAlternativo, fecha_pago, 
                   fecha_cheque, tercero, NULL AS descripcion, importe, NULL AS litros
            FROM pagos_cheque
            WHERE valid = true AND cliente_cuit = $1
            UNION ALL
            SELECT 'Otro' AS tipo, o.comprobante AS id, o.id AS idAlternativo, fecha_pago, 
                   NULL AS fecha_cheque, NULL AS tercero, detalle AS descripcion, importe, NULL AS litros
            FROM pagos_otro o
            WHERE valid = true AND cliente_cuit = $1
            ORDER BY fecha_pago ASC
            LIMIT $2
        `;

        const result = await client.query(query, [cuit, cantidad]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error en getPagosOtro:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener los pagos de otro.' });
    } finally {
        client?.release();
    }
};

exports.updatePagos = async (req, res) => {
    if (req.user.role !== 'admin') {
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
                    fecha_pago: validatedData[0].fechaPago,
                    fecha_c: validatedData[0].fechaCheque,
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
                    fecha_pago: validatedData[0].fechaPago,
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
                    fecha_pago: validatedData[0].fechaPago,
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
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { id, type } = req.query;
    console.log(id);
    console.log(type);
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
                querySelect = 'SELECT nro FROM pagos_cheque WHERE valid = true AND nro = $1';
                queryDelete = 'UPDATE pagos_cheque SET valid = false WHERE nro = $1';
                break;
            case 'gasoil':
                querySelect = 'SELECT comprobante FROM pagos_gasoil WHERE valid = true AND comprobante = $1';
                queryDelete = 'UPDATE pagos_gasoil SET valid = false WHERE comprobante = $1';
                break;
            case 'otro':
                querySelect = 'SELECT comprobante FROM pagos_otro WHERE valid = true AND comprobante = $1';
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

        return res.status(200).json({message: `El pago con comprobante ${id} fue eliminado con exito`});
    } catch (error){
        if (client) await client.query('ROLLBACK');
        if (client) client.release();
        console.error('Error en deletePago: ', error.message, error.stack);
        res.status(500).json({message: 'Ocurrio un error al intentar eliminar el pago'});
    }
};