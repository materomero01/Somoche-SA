const pool = require('../db');
const viajeSchema = require('../models/Viaje.js');

exports.insertViaje = async (req, res) => {
    try {
        // Validar datos de entrada
        const { errors, validatedData } = viajeSchema(req.body);
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
                chofer_cuil, comprobante, fecha, campo, kilometros, tarifa, variacion, toneladas, cargado, descargado, pagado
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
            [
                validatedData.cuil,
                validatedData.comprobante,
                validatedData.fecha,
                validatedData.campo,
                validatedData.kilometro,
                validatedData.tarifa,
                validatedData.variacion,
                validatedData.toneladas,
                validatedData.cargado,
                validatedData.descargado,
                validatedData.pagado
            ]
        );

        res.status(201).json({ message: `Viaje cargado con éxito al chofer "${validatedData.nombre}"` });
    } catch (error) {
        console.error('Error en insertViaje:', error);
        res.status(500).json({ message: 'Error interno del servidor al cargar el viaje.' });
    }
};