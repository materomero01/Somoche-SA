const pool = require('../db');
const { getIO } = require('../socket');

const regexCuit = /^\d{2}-\d{7,9}-\d{1}$/;

function validatecuit(cuit) {
    return cuit && cuit !== '' && regexCuit.test(cuit);
}

exports.getProveedores = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    try {
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        const result = await pool.query(
            'SELECT cuit AS id, razon_social AS nombre, cuit, telefono, balance FROM proveedor WHERE valid = true ORDER BY 2 ASC'
        );

        res.status(208).json({ proveedores: result.rows });

    } catch (error) {
        console.error('Error al buscar proveedores en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al buscar proveedores.' });
    }
}

exports.insertProveedor = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const data = req.body;
    if (!validatecuit(data.cuit))
        return res.status(404).json({ message: 'El formato ingresado del CUIT no es valido.' });
    if (!data.nombre || data.nombre === '')
        return res.status(405).json({ message: 'El cliente debe llevar el Nombre / Razon Social' });
    if (data.telefono && data.telefono !== '' && isNaN(data.telefono))
        return res.status(405).json({ message: 'El telefono ingresado no es valido, deben ser unicamente números.' })

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Configurar usuario para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);
        // Consulta a la base de datos (PostgreSQL ejemplo)
        // Usamos ILIKE para búsqueda insensible a mayúsculas/minúsculas
        // %${searchQuery}% busca el término en cualquier parte del nombre
        // Verificar si el cuit o email ya están registrados
        const proveedorExists = await client.query(
            'SELECT cuit, valid FROM proveedor WHERE cuit = $1',
            [data.cuit]
        );
        let balance = 0;
        let proveedorRecuperado = false;
        if (proveedorExists.rows.length > 0) {
            if (!proveedorExists.rows[0].valid) {
                const responseRecuperar = await client.query('UPDATE proveedor SET valid = true, razon_social = $2, telefono = $3 WHERE valid = false AND cuit = $1 RETURNING balance', [data.cuit, data.nombre, data.telefono]);
                if (responseRecuperar.rowCount > 0) {
                    proveedorRecuperado = true;
                    balance = responseRecuperar.rows[0].balance;
                    res.status(202).json({ message: `Se recupero un proveedor anteriormente registrado con el cuit ${data.cuit}, y se actualizaron sus datos`, balance: balance });
                }
            }
            if (!proveedorRecuperado) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'El CUIT ya está registrado.' });
            }
        }

        if (!proveedorRecuperado)
            await client.query(
                'INSERT INTO proveedor(cuit, razon_social, telefono) VALUES($1, $2, $3)',
                [data.cuit, data.nombre, data.telefono]
            );

        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('nuevoProveedor', { id: data.cuit, balance: balance, ...data });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en insertProveedor", error.stack);
        }
        if (!proveedorRecuperado) res.status(208).json({ message: "El proveedor fue registrado con exito" });

    } catch (error) {
        console.error('Error al buscar proveedores en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al registrar el proveedor.' });
    } finally {
        client?.release();
    }
}

exports.updateProveedores = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const data = req.body;
    const cuitOriginal = req.params.cuitOriginal;
    if (!validatecuit(data.cuit))
        return res.status(404).json({ message: 'El formato ingresado del CUIT no es valido.' });
    if (!data.nombre || data.nombre === '')
        return res.status(405).json({ message: 'El proveedor debe llevar el Nombre / Razon Social' });
    if (data.telefono && data.telefono !== '' && isNaN(data.telefono))
        return res.status(405).json({ message: 'El telefono ingresado no es valido, deben ser unicamente números.' })

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Configurar usuario para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        // Verificar si el cuit ya está registrado (si cambió)
        if (cuitOriginal !== data.cuit) {
            const proveedorExists = await client.query(
                'SELECT cuit FROM proveedor WHERE cuit = $1',
                [data.cuit]
            );
            if (proveedorExists.rows.length > 0) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'El CUIT ya está registrado.' });
            }
        }

        await client.query(
            `UPDATE proveedor
            SET cuit = $1, razon_social = $2, telefono = $3
            WHERE cuit = $4`,
            [data.cuit, data.nombre, data.telefono, cuitOriginal]
        );

        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('updateProveedor', { cuitOriginal: cuitOriginal, updatedData: data });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en UpdateProveedor", error.stack);
        }
        res.status(207).json({ message: "Proveedor modificado con exito" });

    } catch (error) {
        await client?.query('ROLLBACK');
        console.error('Error al modificar proveedor en la DB:', error);
        res.status(500).json({ message: 'Error interno del servidor al modificar proveedor.' });
    } finally {
        client?.release();
    }
}

exports.deleteProveedores = async (req, res) => {
    if (req.user.role === 'chofer') {
        return res.status(403).json({ message: 'No tienes autorización para realizar esta operación.' });
    }
    const cuit = req.params.cuit;
    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        // Configurar usuario para auditoría
        await client.query(`SELECT set_config('app.user_cuil', $1, true)`, [req.user.cuil]);

        // Actualizar el campo 'valid' a false en lugar de eliminar
        const result = await client.query(
            'UPDATE proveedor SET valid = false WHERE cuit = $1 RETURNING *',
            [cuit]
        );

        if (result.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Proveedor no encontrado.' });
        }

        await client.query('COMMIT');

        try {
            const io = getIO();
            // Avisar a todos los clientes conectados
            io.sockets.sockets.forEach((socket) => {
                if (socket.cuil !== req.user.cuil) {
                    socket.emit('deleteProveedor', { cuit: cuit });
                }
            });
        } catch (error) {
            console.error("Error al sincronizar los datos en deletgeProveedores", error.stack);
        }
        res.status(200).json({ message: 'Proveedor eliminado lógicamente con éxito.' });

    } catch (error) {
        await client?.query('ROLLBACK');
        res.status(500).json({ message: error.message });
    } finally {
        client?.release();
    }
}