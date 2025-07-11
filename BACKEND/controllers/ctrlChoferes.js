const pool = require('../db');

exports.getChoferesAll = async (req, res) => {
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