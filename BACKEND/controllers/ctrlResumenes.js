const pool = require('../db');
const { getIO } = require('../socket');

const isValidDate = (value) => {
    if (typeof value !== 'string') return false;
    console.log(value);
    const date = Date.parse(value);
    return !isNaN(date); // Verifica si la fecha es parseable
};

exports.insertResumen = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const choferCuil = req.body.choferCuil;
    if (!choferCuil) return res.status(406).json({ message: 'El chofer no fue proporcionado' });
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);
        const groupStamp = req.body.groupStamp;
        const pagos = req.body.pagos;
        const viajes = req.body.viajes;
        const iva = req.body.iva === 'Responsable Inscripto';


        if (!groupStamp || !viajes)
            return res.status(405).json({ message: 'Faltan datos ensenciales para cerrar el resumen' });

        if (!isValidDate(groupStamp))
            return res.status(405).json({ message: 'El groupStamp no es valido' });

        const userExists = await client.query(
            'SELECT cuil FROM usuario WHERE valid = true AND cuil = $1',
            [choferCuil]
        );

        if (userExists.rows.length === 0) {
            return res.status(409).json({
                message: `El chofer con CUIL ${choferCuil} no está registrado.`
            });
        }
        for (const [index, pago] of Object.entries(pagos)) {
            // Construir consulta de actualización dinámica
            const tipo = pago.tipo;
            let query, values;

            values = [groupStamp, index.split('°')[0]];
            if (tipo.toLowerCase() === 'cheque') {
                query = `UPDATE pagos_cheque SET group_r = $1 WHERE valid = true AND nro = $2 AND group_r IS NULL`;
            } else if (tipo.toLowerCase() === 'gasoil') {
                query = `UPDATE pagos_gasoil SET group_r = $1 WHERE valid = true AND comprobante = $2 AND group_r IS NULL`;
            } else if (tipo.toLowerCase() === 'otro') {
                query = `UPDATE pagos_otro SET group_r = $1 WHERE valid = true AND comprobante = $2 AND group_r IS NULL`;
            } else {
                await client.query('ROLLBACK');
                client.release();
                return res.status(405).json({ message: `No se pudo modificar el pago ${index}` });
            }
            // Ejecutar la actualización
            const result = await client.query(query, values);
            if (tipo.toLowerCase() === "otro" && result.rowCount === 0) {
                const resultOtro = await client.query('UPDATE pagos_otro SET group_r = $1 WHERE valid = true AND id = $2 AND group_r IS NULL', values);
                if (resultOtro.rowCount === 0) {
                    await client.query('ROLLBACK');
                    client.release();
                    console.log(values);
                    return res.status(405).json({ message: 'No se pudo cerrar el resumen del chofer' });
                }
            }
        }

        for (const [index, viaje] of Object.entries(viajes)) {
            // Ejecutar la actualización
            const result = await client.query(` UPDATE viaje SET group_r = $1 WHERE comprobante = $2`,
                [groupStamp, index]);
        }

        let idPagoAdicional = null;
        const pagoAdicional = req.body.pagoAdicional;
        if (pagoAdicional) {
            if (!pagoAdicional.tipo || pagoAdicional.tipo.toLowerCase() !== "otro") {
                await client.query('ROLLBACK');
                client.release();
                return res.status(405).json({ message: `El tipo del pago para el saldo restante no es valido` });
            }

            if (!pagoAdicional.importe || isNaN(pagoAdicional.importe)) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(405).json({ message: `El importe del pago para el saldo restante no es valido` });
            }

            const responseResumen = await client.query('INSERT INTO saldo_resumen(group_r, chofer_cuil, saldo, iva) VALUES ($1, $2, $3, $4)', [groupStamp, choferCuil, -pagoAdicional.importe, iva]);
            if (responseResumen.rowCount === 0) {
                await client.query('ROLLBACK');
                client.release();
                console.log(groupStamp);
                console.log(choferCuil);
                console.log(pagoAdicional);
                return res.status(405).json({ message: `No se pudo cerrar el resumen del chofer` });
            }

            const response = await client.query("INSERT INTO pagos_otro(detalle, importe, chofer_cuil, fecha_pago) VALUES ($1,$2,$3,$4) RETURNING id",
                [pagoAdicional.detalle, pagoAdicional.importe, choferCuil, groupStamp]
            );
            idPagoAdicional = response.rows[0];
        } else {
            const responseResumen = await client.query('INSERT INTO saldo_resumen(group_r, chofer_cuil, saldo, iva) VALUES ($1, $2, $3, $4)', [groupStamp, choferCuil, 0, iva]);
            if (responseResumen.rowCount === 0) {
                await client.query('ROLLBACK');
                client.release();
                return res.status(405).json({ message: `No se pudo cerrar el resumen del chofer` });
            }
        }


        client.query('COMMIT');
        client.release();

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('cerrarResumen', { cuil: choferCuil });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en insertResumen", error.stack);
        }

        res.status(202).json({ message: "El resumen fue realizado con exito", idPagoAdicional });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        client?.release();
        console.error("ERROR EN insertResumen: ", error.message, error.stack);
        res.status(405).json({ message: "No se pudo realizar el resumen" });
    }
}

exports.getResumenCuil = async (req, res) => {
    const cuil = req.query.cuil;
    const cantidad = parseInt(req.query.cantidad, 10);
    // Validar permisos
    if (req.user.role === 'chofer' && req.user.cuil !== cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    // Validar parámetros
    if (!cuil || !/^\d{2}-\d{7,9}-\d$/.test(cuil)) {
        return res.status(400).json({ message: 'El CUIL proporcionado no es válido.' });
    }
    if (isNaN(cantidad) || cantidad <= 0) {
        return res.status(400).json({ message: 'La cantidad debe ser un número positivo.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        // Verificar si el chofer existe
        const userExists = await client.query(
            'SELECT cuil FROM usuario WHERE valid = true AND cuil = $1',
            [cuil]
        );

        if (userExists.rows.length === 0) {
            await client.query('ROLLBACK');
            client.release();
            return res.status(404).json({ message: `El chofer con CUIL ${cuil} no está registrado.` });
        }

        // Obtener los últimos n grupos de viajes
        const viajesResult = await client.query(`
            SELECT group_r, viajes
            FROM viaje_grouped
            WHERE $1::text = ANY(chofer_cuil_array)
            ORDER BY group_r DESC
            LIMIT $2
        `, [cuil, cantidad]);

        // Obtener los últimos n grupos de pagos (unificados)
        const pagosResult = await client.query(`
            SELECT group_r, pagos
            FROM pagos_grouped
            WHERE $1::text = ANY(chofer_cuil_array)
            ORDER BY group_r DESC
            LIMIT $2
        `, [cuil, cantidad]);

        const saldosResult = await client.query(`
            SELECT group_r, saldo, iva
            FROM saldo_resumen
            WHERE chofer_cuil = $1
            ORDER BY group_r DESC
            LIMIT $2
            `, [cuil, cantidad])

        await client.query('COMMIT');
        client.release();

        // Formatear la respuesta
        const response = {
            viajes: viajesResult.rows.map(row => ({
                group: row.group_r,
                viajes: row.viajes
            })),
            pagos: pagosResult.rows.map(row => ({
                group: row.group_r,
                pagos: row.pagos
            })),
            saldos: saldosResult.rows.map(row => ({
                group: row.group_r,
                saldo: row.saldo,
                iva: row.iva
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
