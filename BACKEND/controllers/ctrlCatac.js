const pool = require('../db');
const { getIO } = require('../socket');

async function fetchAllTarifas(client = null) {
    const queryRunner = client || pool;

    const [catacResult, fetraResult] = await Promise.all([
        queryRunner.query('SELECT km, valor FROM catac ORDER BY km ASC'),
        queryRunner.query('SELECT km, valor FROM fetra ORDER BY km ASC')
    ]);

    return {
        catac: catacResult.rows,
        fetra: fetraResult.rows
    };
}

exports.getTarifas = async (req, res) => {
    try {
        const tarifas = await fetchAllTarifas();
        res.status(200).json(tarifas);   // { catac: [...], fetra: [...] }
    } catch (error) {
        console.error('Error al buscar tarifas:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar tarifas.' });
    }
};

exports.updateTarifas = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { porcentaje, tabla } = req.body;

    // Validación de tabla
    if (!['catac', 'fetra'].includes(tabla)) {
        return res.status(400).json({ 
            message: 'El campo "tabla" debe ser "catac" o "fetra".' 
        });
    }

    // Validación de porcentaje
    if (typeof porcentaje !== 'number' || porcentaje < -1 || porcentaje > 1) {
        return res.status(400).json({ 
            message: 'El porcentaje debe ser un número entre -100 y 100.' 
        });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        const tableName = tabla; // 'catac' o 'fetra'
        const triggerName = `audit_trigger_${tableName}`;

        // Desactivar el trigger de auditoría
        await client.query(`ALTER TABLE ${tableName} DISABLE TRIGGER ${triggerName}`);

        const updateResult = await client.query(
            `UPDATE ${tableName} SET valor = valor * (1.0 + $1)`,
            [porcentaje]
        );

        // Insertar un solo log manual
        const porcentajeTexto = (porcentaje * 100).toFixed(2);
        await client.query(
            `INSERT INTO audit_logs (table_name, entity_id, operation, user_cuil, user_name, before_data, after_data)
             VALUES ($1, 0, 'UPDATE', $2, $3, $4, $5)`,
            [
                tableName,
                req.user.cuil,
                req.user.nombre_apellido || req.user.cuil,
                JSON.stringify({ 
                    porcentaje: porcentajeTexto, 
                    filas_afectadas: updateResult.rowCount,
                    tabla: tableName 
                }),
                JSON.stringify({ 
                    porcentaje: porcentajeTexto, 
                    filas_afectadas: updateResult.rowCount,
                    tabla: tableName 
                })
            ]
        );

        // Reactivar el trigger
        await client.query(`ALTER TABLE ${tableName} ENABLE TRIGGER ${triggerName}`);

        const updatedTarifas = await fetchAllTarifas(client);

        await client.query('COMMIT');

        // Notificación vía socket
        try {
            const io = getIO();
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('updateTarifas', { tabla: tableName }); // Enviamos cuál tabla se actualizó
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en updateTarifas", error.stack);
        }

        res.status(200).json({
            message: `Tarifas de ${tableName} modificadas con éxito`,
            affectedRows: updateResult.rowCount,
            tabla: tableName,
            tarifas: updatedTarifas
        });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error al actualizar tarifas:', error);
        res.status(500).json({ message: 'Error interno del servidor al procesar tarifas.' });
    } finally {
        client?.release();
    }
};