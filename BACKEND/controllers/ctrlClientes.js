const pool = require('../db');

const regexCuit = /^\d{2}-\d{8}-\d{1}$/;
const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatecuit(cuit){
    return cuit && cuit !== '' && regexCuit.test(cuit);
}

function validateEmail(email){
    return email && email !== '' && regexEmail.test(email);
}

exports.getClientes = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(
            'SELECT razon_social AS nombre, cuit, email FROM cliente ORDER BY razon_social ASC'
        );

        // Mapear los resultados para agregar un id basado en el índice
        const clientes = result.rows.map((row, index) => ({
            id: index + 1, // Genera un id comenzando desde 1
            ...row
        }));
        res.status(208).json({ clientes });

    } catch (error) {
        console.error('Error al buscar clientes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar clientes.' });
    }
}

exports.insertCliente = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const data = req.body;
    if (!validatecuit(data.cuit))
        return res.status(404).json({ message: 'El CUIT no cumple con el formato requerido XX-XXXXXXXX-X'});
    if (!data.nombre || data.nombre === '')
        return res.status(405).json({ message: 'El cliente debe llevar el Nombre / Razon Social'});
    if (data.email && data.email !== '' && !validateEmail(data.email))
        return res.status(405).json({ message: 'El email ingresado no es una dirección de email valida'})
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        // Verificar si el cuit o email ya están registrados
        const clientExists = await pool.query(
            'SELECT cuit FROM cliente WHERE cuit = $1',
            [data.cuit]
        );
        if (clientExists.rows.length > 0) {
            return res.status(409).json({ message: 'El CUIT ya está registrado.' });
        }
        
        const result = await pool.query(
            'INSERT INTO cliente(cuit, razon_social, email) VALUES($1, $2, $3)',
            [data.cuit, data.nombre, data.email]
        );

        res.status(208).json({ message: "El cliente fue registrado con exito"});

    } catch (error) {
        console.error('Error al buscar clientes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar el cliente.' });
    }
}

exports.updateClientes = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const data = req.body;
    const cuitOriginal = req.params.cuitOriginal;
    if (!validatecuit(data.cuit))
        return res.status(404).json({ message: 'El CUIT no cumple con el formato requerido XX-XXXXXXXX-X'});
    if (!data.nombre || data.nombre === '')
        return res.status(405).json({ message: 'El cliente debe llevar el Nombre / Razon Social'});
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        // Verificar si el cuit o email ya están registrados
        if (cuitOriginal !== data.cuit){
            const clientExists = await pool.query(
                'SELECT cuit FROM cliente WHERE cuit = $1',
                [data.cuit]
            );
            if (clientExists.rows.length > 0) {
                return res.status(409).json({ message: 'El CUIT ya está registrado.' });
            }
        }

        await pool.query(
            `UPDATE cliente 
            SET cuit = $1, razon_social = $2, email = $3
            WHERE cuit = $4`,
            [data.cuit, data.nombre, data.email, cuitOriginal]
        );

        res.status(207).json({ message: "Cliente modificado con exito"});

    } catch (error) {
        console.error('Error al modificar cliente en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al modificar cliente.' });
    }
}