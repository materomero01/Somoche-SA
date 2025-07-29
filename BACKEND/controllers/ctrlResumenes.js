const pool = require('../db');

const isValidDate = (value) => {
    if (typeof value !== 'string') return false;
    console.log(value);
    const date = Date.parse(value);
    return !isNaN(date); // Verifica si la fecha es parseable
};

exports.insertResumen = async(req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const choferCuil = req.body.choferCuil;
    if (!choferCuil) return res.status(406).json({ message: 'El chofer no fue proporcionado' });
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        const groupStamp = req.body.groupStamp;
        const pagos = req.body.pagos;
        const viajes = req.body.viajes;
        
        if (!groupStamp || !viajes)
            return res.status(405).json({ message: 'Faltan datos ensenciales para cerrar el resumen'});
        
        if(!isValidDate(groupStamp))
            return res.status(405).json({ message: 'El groupStamp no es valido'});

        const userExists = await client.query(
            'SELECT cuil FROM usuario WHERE cuil = $1',
            [choferCuil]
        );

        if (userExists.rows.length === 0) {
            return res.status(409).json({ 
                message: `El chofer con CUIL ${choferCuil} no está registrado.`
            });
        }
        console.log(pagos);
        for (const [index, pago] of Object.entries(pagos)) {
            // Construir consulta de actualización dinámica
            const tipo = pago.tipo;
            let query, values;

            values = [groupStamp, index.split('-')[0]];
            if (tipo.toLowerCase() === 'cheque') {
                query = `UPDATE pagos_cheque SET "group" = $1 WHERE nro = $2`;
            } else if (tipo.toLowerCase() === 'gasoil') {
                query = `UPDATE pagos_gasoil SET "group" = $1 WHERE id = $2`;
            } else if (tipo.toLowerCase() === 'otro') {
                query = `UPDATE pagos_otros SET "group" = $1 WHERE id = $2`;
            } else {
                await client.query('ROLLBACK');
                client.release();
                return res.status(405).json({ message:`No se pudo modificar el pago ${index}`});
            }
            // Ejecutar la actualización
            const result = await client.query(query, values);
        }

        for (const [index, viaje] of Object.entries(viajes)) {
            // Ejecutar la actualización
            const result = await client.query(` UPDATE viaje SET "group" = $1 WHERE comprobante = $2`, 
                [groupStamp, index]);
        }

        let idPagoAdicional;
        const pagoAdicional = req.body.pagoAdicional;
        if (pagoAdicional){
            if (!pagoAdicional.tipo || pagoAdicional.tipo.toLowerCase() !== "otro"){
                await client.query('ROLLBACK');
                client.release();
                return res.status(405).json({ message:`El tipo del pago para el saldo restante no es valido`});
            }

            if (!pagoAdicional.importe || isNaN(pagoAdicional.importe)) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(405).json({ message:`El importe del pago para el saldo restante no es valido`});
            }
            const response = await client.query("INSERT INTO pagos_otros(detalle, importe, chofer_cuil_o, fecha_pago) VALUES ($1,$2,$3,$4) RETURNING id",
                [pagoAdicional.detalle, pagoAdicional.importe, choferCuil, groupStamp]
            );
            idPagoAdicional = response.rows[0];
        }

        client.query('COMMIT');
        client.release();

        res.status(202).json({message: "El resumen fue realizado con exito", idPagoAdicional});
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        client?.release();
        res.status(405).json({ message: "No se pudo realizar el resumen" });
    }    
}

exports.getResumenCuil = async (req, res) => {
    const cuil = req.query.cuil;
    const cantidad = parseInt(req.query.cantidad, 10);
    // Validar permisos
    if (req.user.role !== 'admin' && req.user.cuil !== cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    // Validar parámetros
    if (!cuil || !/^\d{2}-\d{8}-\d$/.test(cuil)) {
        return res.status(400).json({ message: 'El CUIL proporcionado no es válido.' });
    }
    if (isNaN(cantidad) || cantidad <= 0) {
        return res.status(400).json({ message: 'La cantidad debe ser un número positivo.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Verificar si el chofer existe
        const userExists = await client.query(
            'SELECT cuil FROM usuario WHERE cuil = $1',
            [cuil]
        );
        if (userExists.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ message: `El chofer con CUIL ${cuil} no está registrado.` });
        }

        // Obtener los últimos n grupos de viajes
        const viajesQuery = `
            SELECT "group", 
                   ARRAY_AGG(
                       JSON_BUILD_OBJECT(
                           'comprobante', comprobante,
                           'fecha', fecha,
                           'campo', campo,
                           'kilometros', kilometros,
                           'tarifa', tarifa,
                           'variacion', variacion,
                           'toneladas', toneladas,
                           'cargado', cargado,
                           'descargado', descargado,
                           'factura_id', factura_id
                       )
                   ) as viajes
            FROM viaje
            WHERE chofer_cuil = $1 AND "group" IS NOT NULL
            GROUP BY "group"
            ORDER BY "group" DESC
            LIMIT $2
        `;
        const viajesResult = await client.query(viajesQuery, [cuil, cantidad]);

        // Obtener los últimos n grupos de pagos (unificados)
        const pagosQuery = `
            SELECT "group",
                   ARRAY_AGG(
                       JSON_BUILD_OBJECT(
                           'tipo', tipo,
                           'id', id,
                           'fecha_pago', fecha_pago,
                           'fecha_cheque', fecha_cheque,
                           'tercero', tercero,
                           'descripcion', descripcion,
                           'importe', importe,
                           'litros', litros
                       )
                   ) as pagos
            FROM (
                SELECT 'Cheque' AS tipo, nro AS id, fecha_pago, 
                       fecha_c AS fecha_cheque, tercero, NULL AS descripcion, importe, NULL AS litros, "group"
                FROM pagos_cheque
                WHERE chofer_cuil_c = $1 AND "group" IS NOT NULL
                UNION ALL
                SELECT 'Gasoil' AS tipo, g.id AS id, fecha_pago, 
                       NULL AS fecha_cheque, NULL AS tercero, NULL AS descripcion, precio * litros AS importe,
                       litros, "group"
                FROM pagos_gasoil g
                WHERE chofer_cuil_g = $1 AND "group" IS NOT NULL
                UNION ALL
                SELECT 'Otro' AS tipo, o.id AS id, fecha_pago, 
                       NULL AS fecha_cheque, NULL AS tercero, detalle AS descripcion, importe, NULL AS litros, "group"
                FROM pagos_otros o
                WHERE chofer_cuil_o = $1 AND "group" IS NOT NULL
            ) AS unified_pagos
            GROUP BY "group"
            ORDER BY "group" DESC
            LIMIT $2
        `;
        const pagosResult = await client.query(pagosQuery, [cuil, cantidad]);

        await client.query('COMMIT');
        client.release();

        // Formatear la respuesta
        const response = {
            viajes: viajesResult.rows.map(row => ({
                group: row.group,
                viajes: row.viajes
            })),
            pagos: pagosResult.rows.map(row => ({
                group: row.group,
                pagos: row.pagos
            }))
        };

        res.status(200).json(response);
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        client?.release();
        console.error('Error en getResumenCuil:', error);
        res.status(500).json({ message: 'Error interno del servidor al obtener los resúmenes.' });
    }
};