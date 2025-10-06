const pool = require('../db');
const { getIO } = require('../socket');

async function fetchAllTarifas(client = null) {
    const queryRunner = client || pool;
    const result = await queryRunner.query(
        'SELECT km, valor FROM catac ORDER BY km ASC'
    );
    return result.rows;
}

exports.getTarifas = async (req, res) => {
    try {
        const tarifas = await fetchAllTarifas();
        res.status(200).json({ tarifas });
    } catch (error) {
        console.error('Error al buscar tarifas:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar tarifas.' });
    }
};

exports.updateTarifas = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }

    const { porcentaje } = req.body;
    console.log(req.body);

    if (typeof porcentaje !== 'number' || porcentaje < -1 || porcentaje > 1) {
        return res.status(400).json({ message: 'El porcentaje debe ser un número entre -100 y 100.' });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const updateResult = await client.query(
            'UPDATE catac SET valor = valor * (1.0 + $1)',
            [porcentaje]
        );

        const updatedTarifas = await fetchAllTarifas(client);

        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('updateCatac');
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en updateTarifas", error.stack);
        }

        res.status(200).json({
            message: 'Tarifas modificadas con éxito',
            affectedRows: updateResult.rowCount,
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