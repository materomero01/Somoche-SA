const pool = require('../db');
const viajeSchema = require('../models/Viaje.js');

exports.insertViaje = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Validar datos de entrada para inserción (todos los campos requeridos)
        const { errors, validatedData } = viajeSchema(req.body, false); // false indica validación completa
        if (errors.length > 0) {
            return res.status(400).json({ message: 'Errores de validación', errors });
        }

        // Verificar si el chofer existe
        const userExists = await pool.query(
            'SELECT cuil FROM usuario WHERE cuil = $1',
            [validatedData.cuil]
        );
        if (userExists.rows.length === 0) {
            return res.status(409).json({ message: 'El chofer no se encuentra registrado.' });
        }

        // Verificar si el cliente existe
        const clientExists = await pool.query(
            'SELECT cuit FROM cliente WHERE cuit = $1',
            [validatedData.cuit_cliente]
        );
        if (clientExists.rows.length === 0) {
            return res.status(409).json({ message: 'El cliente no se encuentra registrado.' });
        }

        // Verificar si el comprobante ya existe
        const viajeExists = await pool.query(
            'SELECT comprobante FROM viaje WHERE comprobante = $1',
            [validatedData.comprobante]
        );
        if (viajeExists.rows.length > 0) {
            return res.status(409).json({ message: `El viaje con el comprobante ${validatedData.comprobante} ya está registrado.` });
        }

        // Insertar el viaje
        await pool.query(
            `INSERT INTO viaje (
                chofer_cuil, comprobante, fecha, campo, kilometros, tarifa, variacion, toneladas, cargado, descargado, pagado, cuit_cliente
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
                validatedData.cuil,
                validatedData.comprobante,
                validatedData.fecha,
                validatedData.campo,
                validatedData.kilometros,
                validatedData.tarifa,
                validatedData.variacion,
                validatedData.toneladas,
                validatedData.cargado,
                validatedData.descargado,
                validatedData.pagado,
                validatedData.cuit_cliente
            ]
        );

        res.status(201).json({ message: `Viaje cargado con éxito al chofer "${validatedData.nombre}"` });
    } catch (error) {
        console.error('Error en insertViaje:', error);
        res.status(500).json({ message: 'Error interno del servidor al cargar el viaje.' });
    }
};

exports.getViajeCuil = async (req, res) => {
    const cuil = req.params.cuil;
    if (req.user.role !== 'admin' && req.user.cuil !== cuil) {
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
            `SELECT chofer_cuil AS cuil, comprobante, fecha, campo, kilometros, tarifa, variacion, toneladas, cargado, descargado
            FROM viaje
            WHERE chofer_cuil = $1 AND pagado = $2 AND "group" IS NULL`,
            [cuil, false]
        );
        return res.status(200).json({ viajes: result.rows });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener los viajes.' });
    }
};

exports.getViajeCuit = async (req, res) => {
    const cuit = req.params.cuit;
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Verificar si el cliente existe
        const clientExists = await pool.query(
            'SELECT cuit FROM cliente WHERE cuit = $1',
            [cuit]
        );
        if (clientExists.rows.length === 0) {
            return res.status(409).json({ message: 'El cliente no se encuentra registrado.' });
        }

        const result = await pool.query(
            `SELECT cuit_cliente AS cuit, comprobante, fecha, campo, kilometros, tarifa, variacion, toneladas, cargado, descargado
            FROM viaje
            WHERE cuit_cliente = $1 AND pagado = $2`,
            [cuit, false]
        );
        return res.status(200).json({ viajes: result.rows });
    } catch (error) {
        console.log(error.message);
        res.status(500).json({ message: 'Error interno del servidor al obtener los viajes.' });
    }
};

exports.updateViajes = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    let client;
    try {
        client = await pool.connect(); // Obtener un cliente del pool
        await client.query('BEGIN'); // Iniciar transacción

        const viajes = req.body; // Objeto con formato { [comprobante]: { comprobante, group, ... }, ... }
        console.log(viajes);
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

            // Validar datos de entrada con viajeSchema (validación parcial)
            const { errors: validationErrors, validatedData } = viajeSchema(data, true); // true indica validación parcial
            console.log(validationErrors);
            if (validationErrors.length > 0) {
                errors.push({ comprobante, message: 'Errores de validación', errors: validationErrors });
                continue;
            }

            // Verificar si el viaje existe
            const viajeExists = await client.query(
                'SELECT chofer_cuil FROM viaje WHERE comprobante = $1',
                [comprobante]
            );
            if (viajeExists.rows.length === 0) {
                errors.push({ comprobante, message: `El viaje con el comprobante ${comprobante} no existe.` });
                continue;
            }


            // Construir consulta SQL dinámica
            const fields = Object.keys(validatedData);
            if (fields.length === 0) {
                errors.push({ comprobante, message: 'No se proporcionaron campos válidos para actualizar.' });
                continue;
            }

            const setClause = fields
                .map((field, index) => `${field} = $${index + 2}`)
                .join(', ');
            const values = [comprobante, ...Object.values(validatedData)];
            let query = `UPDATE viaje SET ${setClause} WHERE comprobante = $1`;
            console.log(query);
            const result = await client.query(
                query,
                values
            );

            if (result.rowCount === 0) {
                errors.push({ comprobante, message: `No se pudo actualizar el viaje con comprobante ${comprobante}.` });
                continue;
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
        res.status(500).json({ message: 'Error interno del servidor al actualizar los viajes.' });
    }
};