const pool = require('../db');
const userSchema = require('../models/User');
const { getIO } = require('../socket');

exports.getChoferesAll = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(
            'SELECT nombre_apellido AS nombre, cuil FROM usuario WHERE role = $1 AND valid = true ORDER BY nombre_apellido ASC',
            ['chofer']
        );
        res.status(208).json({ choferes: result.rows });

    } catch (error) {
        console.error('Error al buscar choferes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar choferes.' });
    }
}

exports.getChoferesAllData = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(
            `SELECT u.nombre_apellido AS nombre, c.cuil, tipo_trabajador AS trabajador, patente_chasis, patente_acoplado, telefono, email FROM usuario u 
            INNER JOIN chofer c ON u.cuil = c.cuil
            WHERE u.role = $1 AND c.valid = true
            ORDER BY 1 ASC`,
            ['chofer']
        );

        // const response = await pool.query(``);

        // console.log(response.rows);

        // Mapear los resultados para agregar un id basado en el índice
        const choferes = result.rows.map((row, index) => ({
            id: index + 1, // Genera un id comenzando desde 1
            ...row
        }));

        res.status(208).json({ choferes });

    } catch (error) {
        console.error('Error al buscar choferes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar choferes.' });
    }
}

exports.updateChofer = async (req, res) => {
    if (req.user.role !== 'admin' && req.user.cuil !== req.params.cuilOriginal) {
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
                'SELECT cuil FROM usuario WHERE cuil = $1',
                [editingData.cuil]
            );
            if (userResult.rows.length > 0) {
                return res.status(401).json({ message: 'El CUIL proporcionado ya se encuentra registrado.' });
            }
        }
        
        client = await pool.connect();
        await client.query('BEGIN');
        // Actualizar en la tabla usuario
        await client.query(
            `UPDATE usuario
             SET cuil = $1, nombre_apellido =  $2, telefono = $3, email = $4
             WHERE cuil = $5`,
            [
                validatedData.cuil,
                validatedData.nombre_y_apellido? validatedData.nombre_y_apellido : validatedData.nombre,
                validatedData.telefono,
                validatedData.email,
                cuilOriginal
            ]
        );

        // Actualizar en la tabla chofer
        await client.query(
            `UPDATE chofer
             SET cuil = $1, tipo_trabajador = $2, patente_chasis = $3, patente_acoplado = $4
             WHERE cuil = $5`,
            [
                validatedData.cuil,
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
                    socket.emit('updateUsuario',{cuilOriginal: cuilOriginal, updatedData:{nombre: validatedData.nombre_y_apellido, cuil: validatedData.cuil, trabajador: validatedData.trabajador, patente_chasis: validatedData.patente_chasis, patente_acoplado: validatedData.patente_acoplado, telefono: validatedData.telefono, email: validatedData.email}});
                }
            });
        } catch (error){
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
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const cuil = req.params.cuil;

    try {
        let { rowCount } = await pool.query(
            'UPDATE usuario SET valid = false WHERE cuil = $1',
            [cuil]
        );
        
        if (rowCount === 0) {
            return res.status(404).json({ message: 'Usuario no encontrado.' });
        }
        const result = await pool.query(
            'UPDATE chofer SET valid = false WHERE cuil = $1',
            [cuil]
        );
        
        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Chofer no encontrado.' });
        }

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('deleteUsuario',{cuil: cuil});
                }
            });
        } catch (error){
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }
        res.status(200).json({ message: 'Chofer desactivado con éxito' });
    } catch (error) {
        console.error('Error en deleteChofer:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

exports.getChoferByCuil = async (req, res) => {
    if (req.user.role !== 'admin' && req.user.cuil !== req.params.cuil) {
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