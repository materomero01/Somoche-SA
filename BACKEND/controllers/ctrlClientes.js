const pool = require('../db');
const { getIO } = require('../socket');

const regexCuit = /^\d{2}-\d{8}-\d{1}$/;
const regexEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validatecuit(cuit) {
    return cuit && cuit !== '' && regexCuit.test(cuit);
}

function validateEmail(email) {
    return email && email !== '' && regexEmail.test(email);
}

exports.getClientes = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(
            'SELECT cuit AS id, razon_social AS nombre, cuit, email, balance FROM cliente WHERE valid = true ORDER BY 1 ASC'
        );

        res.status(208).json({ clientes: result.rows });

    } catch (error) {
        console.error('Error al buscar clientes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar clientes.' });
    }
}

exports.insertCliente = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const data = req.body;
    if (!validatecuit(data.cuit))
        return res.status(404).json({ message: 'El CUIT no cumple con el formato requerido XX-XXXXXXXX-X' });
    if (!data.nombre || data.nombre === '')
        return res.status(405).json({ message: 'El cliente debe llevar el Nombre / Razon Social' });
    if (data.email && data.email !== '' && !validateEmail(data.email))
        return res.status(405).json({ message: 'El email ingresado no es una dirección de email valida' });

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Setear el usuario de la app en la sesión de PostgreSQL para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        // Verificar si el cuit o email ya están registrados
        const clientExists = await client.query(
            'SELECT cuit, valid FROM cliente WHERE cuit = $1',
            [data.cuit]
        );
        let clienteRecuperado = false;
        let balance = 0;
        if (clientExists.rows.length > 0) {
            if (!clientExists.rows[0].valid) {
                const responseRecuperar = await client.query('UPDATE cliente SET valid = true, razon_social = $2, email = $3 WHERE valid = false AND cuit = $1 RETURNING balance', [data.cuit, data.nombre, data.email]);
                if (responseRecuperar.rowCount > 0) {
                    clienteRecuperado = true;
                    balance = responseRecuperar.rows[0].balance;
                    res.status(202).json({ message: `Se recupero un cliente anteriormente registrado con el cuit ${data.cuit}, y se actualizaron sus datos`, balance: balance });
                }
            }
            if (!clienteRecuperado) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'El CUIT ya está registrado.' });
            }
        }

        if (!clienteRecuperado)
            await client.query(
                'INSERT INTO cliente(cuit, razon_social, email) VALUES($1, $2, $3)',
                [data.cuit, data.nombre, data.email]
            );

        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('nuevoCliente', { id: data.cuit, balance: balance, ...data });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }
        if (!clienteRecuperado) res.status(208).json({ message: "El cliente fue registrado con exito" });

    } catch (error) {
        console.error('Error al buscar clientes en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar el cliente.' });
    } finally {
        client?.release();
    }
}

exports.updateClientes = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const data = req.body;
    const cuitOriginal = req.params.cuitOriginal;
    if (!validatecuit(data.cuit))
        return res.status(404).json({ message: 'El CUIT no cumple con el formato requerido XX-XXXXXXXX-X' });
    if (!data.nombre || data.nombre === '')
        return res.status(405).json({ message: 'El cliente debe llevar el Nombre / Razon Social' });
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        // Verificar si el cuit o email ya están registrados
        if (cuitOriginal !== data.cuit) {
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

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('updateCliente', { cuitOriginal: cuitOriginal, updatedData: data });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }
        res.status(207).json({ message: "Cliente modificado con exito" });

    } catch (error) {
        console.error('Error al modificar cliente en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al modificar cliente.' });
    }
}

exports.deleteClientes = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const cuit = req.params.cuit;
    try {
        // Actualizar el campo 'valid' a false en lugar de eliminar
        const result = await pool.query(
            'UPDATE cliente SET valid = false WHERE cuit = $1 RETURNING *',
            [cuit]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: 'Cliente no encontrado.' });
        }


        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('deleteCliente', { cuit: cuit });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UpdateChofer", error.stack);
        }
        res.status(200).json({ message: 'Cliente eliminado lógicamente con éxito.' });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
}   