const pool = require('../db');
const userSchema = require('../models/User');

exports.getChoferesAll = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(
            'SELECT nombre_apellido AS nombre, cuil FROM usuario WHERE role = $1 ORDER BY nombre_apellido ASC',
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
            WHERE u.role = $1
            ORDER BY 1`,
            ['chofer']
        );
        
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

        if (cuilOriginal !== validatedData.cuil){
            await client.query(
                `UPDATE viaje
                SET chofer_cuil = $1
                WHERE chofer_cuil = $2`,
                [
                    validatedData.cuil,
                    cuilOriginal
                ]
            );

            await client.query(
                `UPDATE pagos_cheque
                SET chofer_cuil_c = $1
                WHERE chofer_cuil_c = $2`,
                [
                    validatedData.cuil,
                    cuilOriginal
                ]
            );

            await client.query(
                `UPDATE pagos_gasoil
                SET chofer_cuil_g = $1
                WHERE chofer_cuil_g = $2`,
                [
                    validatedData.cuil,
                    cuilOriginal
                ]
            );

            await client.query(
                `UPDATE pagos_otros
                SET chofer_cuil_o = $1
                WHERE chofer_cuil_o = $2`,
                [
                    validatedData.cuil,
                    cuilOriginal
                ]
            );
        }
        
        await client.query('COMMIT');
        
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
    const cuil = req.params.cuil;

    try {
        const viajesResult = await pool.query(
            'SELECT chofer_cuil FROM viaje WHERE chofer_cuil = $1 AND pagado = $2',
            [cuil, false]
        );
        if (viajesResult.rows.length > 0) {
            return res.status(401).json({ message: 'No se pudo eliminar el chofer: El chofer aun tiene viajes por cobrar' });
        }

        const chequesResult = await pool.query(
            'SELECT chofer_cuil_c FROM pagos_cheque WHERE chofer_cuil_c = $1 AND pagado = $2',
            [cuil, false]
        );
        if (chequesResult.rows.length > 0) {
            return res.status(401).json({ message: 'No se pudo eliminar el chofer: El chofer aun tiene cheques por cobrar' });
        }
        
        res.status(201).json({ message: 'Usuario modificado con éxito' });
    } catch (error) {
        console.error('Error en updateUser:', error);
        res.status(500).json({ message: 'Error interno del servidor.' });
    }
}

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