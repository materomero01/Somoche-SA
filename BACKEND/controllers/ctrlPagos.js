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
        const choferCuil = req.body.choferCuil? req.body.choferCuil : null;
        if(!choferCuil) return res.status(406).json({ message: 'El chofer no fue proporcionado'});
        const pagos = Array.isArray(req.body.pagos) ? req.body.pagos : [req.body.pagos];

        // Validar los datos de entrada
        const { errors, validatedData } = pagoSchema(pagos);
        if (errors.length > 0) {
            return res.status(400).json({ message: 'Errores de validación', errors });
        }
        const userExists = await client.query(
            'SELECT cuil FROM usuario WHERE cuil = $1',
            [choferCuil]
        );
        if (userExists.rows.length === 0) {
            return res.status(409).json({ 
                message: `El chofer con CUIL ${choferCuil} no está registrado.`
            });
        }

        // Procesar cada pago
        for (const [index, pago] of validatedData.entries()) {

            // Insertar según el tipo de pago
            if (pago.tipo === 'cheque') {
                await client.query(
                    `INSERT INTO pagos_cheque (
                        chofer_cuil_c, fecha_pago, fecha_c, nro, tercero, destinatario, importe, pagado
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
                    [
                        choferCuil,
                        pago.fechaPago,
                        pago.fechaCheque,
                        pago.nroCheque,
                        pago.tercero,
                        pago.destinatario,
                        pago.importe,
                        false
                    ]
                );
            } else if (pago.tipo === 'gasoil') {
                await client.query(
                    `INSERT INTO pagos_gasoil (
                        chofer_cuil_g, fecha_pago, precio, litros
                    ) VALUES ($1, $2, $3, $4)`,
                    [
                        choferCuil,
                        pago.fechaPago,
                        pago.precioGasoil,
                        pago.litros,
                    ]
                );
            } else if (pago.tipo === 'otro') {
                await client.query(
                    `INSERT INTO pagos_otros (
                        chofer_cuil_o, fecha_pago, detalle, importe
                    ) VALUES ($1, $2, $3, $4)`,
                    [
                        choferCuil,
                        pago.fechaPago,
                        pago.detalle,
                        pago.importe
                    ]
                );
            }
        }
        await client.query('COMMIT');

        res.status(201).json({ 
            message: `Se registraron ${validatedData.length} pago(s) con éxito` 
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error en insertPagos:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar pago(s).' });
    } finally {
        client?.release();
    }
};