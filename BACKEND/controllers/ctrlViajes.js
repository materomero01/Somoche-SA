const pool = require('../db');
const viajeSchema = require('../models/Viaje.js');
const { getIO } = require('../socket');

exports.insertViaje = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    let client;
    try {
        // Validar datos de entrada para inserción (todos los campos requeridos)
        const { errors, validatedData } = viajeSchema(req.body, false); // false indica validación completa
        if (errors.length > 0) {
            return res.status(400).json({ message: 'Errores de validación', errors });
        }

        client = await pool.connect();
        await client.query("BEGIN");
        // Verificar si el chofer existe
        const userExists = await client.query(
            'SELECT cuil FROM usuario WHERE valid = true AND cuil = $1',
            [validatedData.chofer_cuil]
        );
        if (userExists.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(409).json({ message: 'El chofer no se encuentra registrado.' });
        }

        // Verificar si el cliente existe
        const clientExists = await client.query(
            'SELECT cuit FROM cliente WHERE cuit = $1',
            [validatedData.cliente_cuit]
        );
        if (clientExists.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(409).json({ message: 'El cliente no se encuentra registrado.' });
        }

        // Verificar si el comprobante ya existe
        const viajeExists = await client.query(
            'SELECT comprobante FROM viaje WHERE comprobante = $1',
            [validatedData.comprobante]
        );
        if (viajeExists.rows.length > 0) {
            const viajeDelete = await pool.query('DELETE FROM viaje WHERE valid = false AND comprobante = $1', [validatedData.comprobante]);
            if (viajeDelete.rowCount === 0){
                await client.query('ROLLBACK');
                client.release();
                return res.status(409).json({ message: `El viaje con el comprobante ${validatedData.comprobante} ya está registrado.` });
            }
            
        }

        // Insertar el viaje
        await client.query(
            `INSERT INTO viaje (
                chofer_cuil, comprobante, fecha, campo, kilometros, tarifa, variacion, toneladas, cargado, descargado, cliente_cuit
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                validatedData.chofer_cuil,
                validatedData.comprobante,
                validatedData.fecha,
                validatedData.campo,
                validatedData.kilometros,
                validatedData.tarifa,
                validatedData.variacion,
                validatedData.toneladas,
                validatedData.cargado,
                validatedData.descargado,
                validatedData.cliente_cuit
            ]
        );

        await client.query('COMMIT');
        client.release();

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('nuevoViaje', {cuil: validatedData.chofer_cuil, cuit: validatedData.cliente_cuit, ...validatedData});
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }
        
        res.status(201).json({ message: `Viaje cargado con éxito al chofer "${validatedData.nombre}"` });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
            client.release();
        }
        console.error('Error en insertViaje:', error);
        res.status(500).json({ message: 'Error interno del servidor al cargar el viaje.' });
    }
};

exports.getViajeCuil = async (req, res) => {
    const cuil = req.params.cuil;
    if (req.user.role === 'chofer' && req.user.cuil !== cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Verificar si el chofer existe
        const userExists = await pool.query(
            'SELECT cuil FROM usuario WHERE cuil = $1',
            [cuil]
        );
        if (userExists.rows.length === 0) {
            return res.status(409).json({ message: 'El chofer no se encuentra registrado.' });
        }

        const result = await pool.query(
            `SELECT chofer_cuil AS cuil, comprobante, fecha, campo, kilometros, tarifa, variacion, toneladas, cargado, descargado, factura_id, 
            EXISTS (SELECT 1 FROM carta_porte cp WHERE cp.valid = true AND cp.viaje_comprobante = v.comprobante) AS carta_porte
            FROM viaje v
            WHERE v.valid = true AND chofer_cuil = $1 AND "group_r" IS NULL
            ORDER BY 3, 2`,
            [cuil]
        );
        return res.status(200).json({ viajes: result.rows });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener los viajes.' });
    }
};


exports.getViajeComprobante = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const { comprobante } = req.params;

    try {
        const response = await pool.query(`SELECT chofer_cuil AS cuil, u.nombre_apellido AS nombre, comprobante, fecha, campo, 
            kilometros, tarifa, variacion, toneladas, cargado, descargado, cliente_cuit AS cuit, group_r
            FROM viaje v
            LEFT JOIN usuario u ON v.chofer_cuil = u.cuil
            WHERE v.valid = true AND v.comprobante = $1`,
        [comprobante]);

        if (response.rows.length === 0)
            return res.status(405).json({ message:`No se encontro un viaje con comprobante igual a ${comprobante}`});

        res.status(200).json(response.rows[0]);
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener el viaje.' });
    }
}

exports.getViajeCuit = async (req, res) => {
    const { cuit, facturados, cantidad, pagados } = req.query;
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    if (!cuit || !facturados || cuit === 'null' || facturados === 'null' || cuit === 'undefined' || facturados === 'undefined'){
        return res.status(406).json({message: 'No se pudieron obtener los datos para buscar los viajes del cliente'});
    }
    try {
        // Verificar si el cliente existe

        const clientExists = await pool.query(
            'SELECT cuit FROM cliente WHERE valid = true AND cuit = $1',
            [cuit]
        );
        if (clientExists.rows.length === 0) {
            return res.status(409).json({ message: 'El cliente no se encuentra registrado.' });
        }
        let params = [cuit];
        let query = `SELECT * FROM viaje_clienteV WHERE cuit = $1`;

        if (pagados && pagados === "false")
            if (facturados && facturados === "false")
                query+=" AND factura_id IS NULL AND pagado = false";
            else
                query+=" AND factura_id IS NOT NULL AND pagado = false";
        else
            query+= " AND pagado = true";

        if (cantidad && cantidad !== "undefined" && cantidad !== "null") {
            query += `
                ORDER BY 3, 2 DESC
                LIMIT $2`;
            params.push(cantidad);
        }else 
            query += `
                ORDER BY 3, 2`;

        const result = await pool.query(
            query,
            params
        );
        return res.status(200).json({ viajes: result.rows });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener los viajes.' });
    }
};

exports.updateViajes = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    let client;
    try {
        client = await pool.connect(); // Obtener un cliente del pool
        await client.query('BEGIN'); // Iniciar transacción

        const viajes = req.body; // Objeto con formato { [comprobante]: { comprobante, group, ... }, ... }
        if (!viajes || typeof viajes !== 'object' || Object.keys(viajes).length === 0) {
            client.release();
            return res.status(400).json({ message: 'Se debe proporcionar un objeto con viajes a actualizar.' });
        }

        const updatedViajes = [];
        const errors = [];

        for (const [comprobante, data] of Object.entries(viajes)) {
            if (!comprobante) {
                errors.push({ comprobante, message: 'El comprobante en la clave y en el objeto debe coincidir.' });
                continue;
            }
            
            console.log(data);
            // Validar datos de entrada con viajeSchema (validación parcial)
            const { errors: validationErrors, validatedData } = viajeSchema(data, true); // true indica validación parcial

            if (validationErrors.length > 0) {
                errors.push({ comprobante, message: 'Errores de validación', errors: validationErrors });
                continue;
            }
            console.log(validatedData);

            // Verificar si el nuevo comprobante ya existe
            if (comprobante !== validatedData.comprobante){
                const viajeExistsNuevo = await client.query('SELECT valid FROM viaje WHERE comprobante = $1', [validatedData.comprobante]);
                
                if (viajeExistsNuevo.rows.length > 0){
                    if (viajeExistsNuevo.rows[0].valid) {
                        errors.push({comprobante, message: `Ya se encuentra registrado un viaje con el comprobante ${validatedData.comprobante}`});
                        continue;
                    } else {
                        await client.query('DELETE FROM viaje WHERE valid = false AND comprobante = $1', [validatedData.comprobante]);
                    }
                }
            }

            // Verificar si el viaje existe
            const viajeExists = await client.query(
                'SELECT chofer_cuil AS cuil, cliente_cuit AS cuit, kilometros, tarifa, variacion, toneladas, update_at FROM viaje WHERE valid = true AND comprobante = $1',
                [comprobante]
            );

            if (viajeExists.rows.length === 0) {
                errors.push({ comprobante, message: `El viaje con el comprobante ${comprobante} no existe.` });
                continue;
            }

            let tablaUpdate = validatedData.hasOwnProperty("tabla")? validatedData.tabla : "viaje";

            // Construir consulta SQL dinámica
            const fields = Object.keys(validatedData).filter(field => field !== 'tabla');
            if (fields.length === 0) {
                errors.push({ comprobante, message: 'No se proporcionaron campos válidos para actualizar.' });
                continue;
            }

            const setClause = fields
                .map((field, index) => `${field} = $${index + 2}`)
                .join(', ');
            const values = [comprobante, ...Object.entries(validatedData)
                .filter(([key]) => key !== 'tabla')
                .map(([key, value]) => value)
            ];

            let query = `UPDATE ${tablaUpdate} SET ${setClause} WHERE comprobante = $1`;
            const result = await client.query(
                query,
                values
            );

            if (result.rowCount === 0) {
                errors.push({ comprobante, message: `No se pudo actualizar el viaje con comprobante ${comprobante}.` });
                continue;
            }

            const viajeUpdateado = await client.query('SELECT update_at FROM viaje WHERE valid = true AND comprobante = $1', [comprobante]);
            try {
                const io = getIO();
                // Avisar a todos los clientes conectados
                io.sockets.sockets.forEach((socket) => {
                    if (socket.cuil !== req.user.cuil) {
                        if (tablaUpdate === "viaje")
                            socket.emit('updateViaje',{comprobanteOriginal: comprobante, updatedData: {cuil: viajeExists.rows[0].cuil, cuit: viajeExists.rows[0].cuit, ...validatedData}});
                        else {
                            if (new Date(viajeExists.rows[0].update_at) < new Date(viajeUpdateado.rows[0].update_at)) socket.emit('updateViaje',{comprobanteOriginal: comprobante, updatedData: {cuil: viajeExists.rows[0].cuil, cuit: viajeExists.rows[0].cuit, fecha: validatedData.fecha, comprobante: validatedData.comprobante, campo: validatedData.campo, kilometros: viajeExists.rows[0].kilometros, tarifa: viajeExists.rows[0].tarifa, variacion: viajeExists.rows[0].variacion, toneladas: viajeExists.rows[0].toneladas, cargado: validatedData.cargado, descargado: validatedData.descargado}});
                            socket.emit('updateViajeCliente',{comprobanteOriginal: comprobante, updatedData: {cuil: viajeExists.rows[0].cuil, cuit: viajeExists.rows[0].cuit, ...validatedData}});
                        }
                    }
                });
            } catch (error){
                console.error("Error al sincronizar los datos en UpdateViajes", error.stack);
            }

            updatedViajes.push(comprobante);
        }

        if (errors.length > 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({
                message: 'Algunos viajes no pudieron ser actualizados. No se aplicaron cambios.',
                updated: updatedViajes,
                errors
            });
        }

        await client.query('COMMIT'); // Confirmar transacción
        client.release();
        res.status(200).json({
            message: 'Viajes actualizados con éxito.',
            updated: updatedViajes
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK'); // Revertir cambios en caso de error
        client?.release();
        console.error('Error en updateViajes:', error);
        res.status(500).json({ message: error.message });
    }
};

exports.deleteViaje = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    let client;
    try {
        client = await pool.connect(); // Obtener un cliente del pool
        await client.query('BEGIN'); // Iniciar transacción

        const { comprobante } = req.query; // Obtener comprobante del query de la solicitud
        if (!comprobante || typeof comprobante !== 'string' || comprobante === 'null' || comprobante === 'undefined') {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ message: 'Se debe proporcionar un comprobante válido como string.' });
        }
        console.log(comprobante);
        // Verificar si el viaje existe y está válido
        const viajeExists = await client.query(
            'SELECT chofer_cuil AS cuil, group_r FROM viaje WHERE comprobante = $1 AND valid = true',
            [comprobante]
        );
        if (viajeExists.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ message: `El viaje con comprobante ${comprobante} no existe o ya está marcado como no válido.` });
        }

        if (viajeExists.rows[0].group_r) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(405).json({ message: `El viaje con comprobante ${comprobante} no puede ser eliminado, ya que pertenece a un resumen pasado.`});
        }

        const viajeClienteExists = await client.query (`
            SELECT cliente_cuit AS cuit, factura_id
            FROM viaje_cliente
            WHERE valid = true AND viaje_comprobante = $1
            `,
            [comprobante]);
        
        if (viajeClienteExists.rows[0].factura_id){
            await client.query('ROLLBACK');
            client.release();
            return res.status(405).json({ message: `El viaje con comprobante ${comprobante} no puede ser eliminado, ya que fue facturado.`});
        }

                

        // soft delete 
        const result = await client.query(
            'UPDATE viaje SET valid = false, update_at = CURRENT_TIMESTAMP WHERE comprobante = $1 AND valid = true',
            [comprobante]
        );


        if (result.rowCount === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(400).json({ message: `No se pudo eliminar el viaje con comprobante ${comprobante}.` });
        }

        await client.query('COMMIT');
        client.release();

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('deleteViaje',{comprobante: comprobante, cuil: viajeExists.rows[0].cuil, cuit: viajeClienteExists.rows[0].cuit});
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }

        return res.status(200).json({
            message: 'Viaje marcado como no válido con éxito.'
        });
    } catch (error) {
        if (client) {
            await client.query('ROLLBACK');
            client.release();
        }
        console.error('Error en deleteViaje:', error);
        return res.status(500).json({ message: 'Error interno del servidor al realizar el soft delete del viaje.' });
    }
};

exports.pagarViajeCliente = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    let client;
    const viajes = req.body;

    if (viajes && viajes.length === 0)
        return res.status(406).json({ message: "No se obtuvieron los viajes a marcar como pagos"});

    try {
        client =  await pool.connect();
        await client.query('BEGIN');

        const viajesPagados = [];
        const updatedRows = [];
        let cuit;
        for (const viaje of viajes) {
            const { viaje_comprobante, cliente_cuit } = viaje;
            cuit = cliente_cuit;
            // Validate input fields
            if (!viaje_comprobante || !cliente_cuit) {
                throw new Error('Faltan viaje_comprobante o cliente_cuit en uno de los viajes');
            }

            // Update pagado field
            const result = await client.query(
                'UPDATE viaje_cliente SET pagado = true WHERE viaje_comprobante = $1 AND cliente_cuit = $2 AND pagado = false AND valid = true',
                [viaje_comprobante, cliente_cuit]
            );

            
            console.log(result.rowCount);
            if (result.rowCount === 0) {
                updatedRows.push({
                    viaje_comprobante,
                    cliente_cuit,
                    success: false,
                    message: `No se encontró el viaje con comprobante ${viaje_comprobante} para el cliente ${cliente_cuit}, ya está pagado, o no es válido`
                });
            } else {
                updatedRows.push({
                    viaje_comprobante,
                    cliente_cuit,
                    success: true
                });
                viajesPagados.push(viaje_comprobante);
            }
        }

        await client.query('COMMIT');

        // Check if any updates were successful
        const successCount = updatedRows.filter(row => row.success).length;
        if (successCount === 0) {
            return res.status(406).json({
                message: 'Ningún viaje fue actualizado. Verifica los datos enviados.',
                details: updatedRows
            });
        }

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('updatePagados', {cuit: cuit, viajesPagados: viajesPagados});
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en pagarViajeCliente", error.stack);
        }

        res.status(202).json({
            message: `${successCount} de ${viajes.length} viajes marcados como pagados exitosamente`,
            details: updatedRows
        });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error en markAsPagado:', error.message);
        res.status(500).json({ message: `Error al marcar los viajes como pagados: ${error.message}` });
    } finally {
        client.release();
    }
}
