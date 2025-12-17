const pool = require('../db');
const userSchema = require('../models/User');
const { getIO } = require('../socket');

exports.getChoferesAll = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(
            'SELECT nombre_apellido AS nombre, cuil FROM usuario WHERE role IS DISTINCT FROM $1 AND valid = true ORDER BY nombre_apellido ASC',
            ['admin']
        );
        res.status(208).json({ choferes: result.rows });

    } catch (error) {
        console.error('Error al buscar choferes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar choferes.' });
    }
}

exports.getChoferesAllData = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(`SELECT * FROM choferV`);
        // const response = await pool.query(``);

        // console.log(response.rows);

        res.status(208).json({ choferes: result.rows });

    } catch (error) {
        console.error('Error al buscar choferes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar choferes.' });
    }
}

exports.updateChofer = async (req, res) => {
    if (req.user.role === 'chofer' && req.user.cuil !== req.params.cuilOriginal) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const editingData = req.body;
    const cuilOriginal = req.params.cuilOriginal;

    let client;
    try {
        const { errors, validatedData } = userSchema(editingData);
        if (errors.length > 0) {
            return res.status(400).json({ message: `Los datos ingresados para ${errors.join(', ')} no son validos` });
        }
        if (cuilOriginal !== validatedData.cuil) {
            const userResult = await pool.query(
                'SELECT cuil, valid FROM usuario WHERE cuil = $1',
                [editingData.cuil]
            );
            if (userResult.rows.length > 0) {
                return res.status(401).json({ message: 'El CUIL proporcionado ya se encuentra registrado.' });
            }
        }

        client = await pool.connect();
        await client.query('BEGIN');
        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);
        // Actualizar en la tabla usuario
        await client.query(
            `UPDATE choferV SET cuil = $1, nombre = $2, telefono = $3, email = $4, trabajador = $5, patente_chasis = $6, patente_acoplado = $7
            WHERE cuil = $8`,
            [
                validatedData.cuil,
                validatedData.nombre,
                validatedData.telefono,
                validatedData.email,
                validatedData.trabajador,
                validatedData.patente_chasis?.toUpperCase(),
                validatedData.patente_acoplado?.toUpperCase(),
                cuilOriginal
            ]
        );

        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('updateUsuario', { cuilOriginal: cuilOriginal, updatedData: { nombre: validatedData.nombre, cuil: validatedData.cuil, trabajador: validatedData.trabajador, patente_chasis: validatedData.patente_chasis, patente_acoplado: validatedData.patente_acoplado, telefono: validatedData.telefono, email: validatedData.email } });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }

        res.status(201).json({ message: 'Usuario modificado con éxito' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        console.error('Error en updateUser:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    } finally {
        client?.release();
    }
};

exports.deleteChofer = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const cuil = req.params.cuil;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        let { rowCount } = await client.query(
            'UPDATE usuario SET valid = false WHERE cuil = $1',
            [cuil]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        const result = await client.query(
            'UPDATE chofer SET valid = false WHERE cuil = $1',
            [cuil]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Chofer no encontrado.' });
        }

        await client.query("COMMIT");

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('deleteUsuario', { cuil: cuil });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }
        res.status(200).json({ message: 'Chofer desactivado con éxito' });
    } catch (error) {
        if (client) await client.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    } finally {
        client?.release();
    }
};

exports.getChoferByCuil = async (req, res) => {
    if (req.user.role === 'chofer' && req.user.cuil !== req.params.cuil) {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const cuil = req.params.cuil;
    console.log(cuil);
    try {
        const result = await pool.query(
            `SELECT u.nombre_apellido AS nombre, c.cuil, tipo_trabajador AS trabajador, patente_chasis, patente_acoplado, telefono, email FROM usuario u 
            INNER JOIN chofer c ON u.cuil = c.cuil
            WHERE u.cuil = $1 AND u.role = 'chofer'`,
            [cuil]
        );
        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Chofer no encontrado.' });
        }
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error al obtener chofer por CUIL:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar chofer.' });
    }
};
