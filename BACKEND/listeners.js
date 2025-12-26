const { getIO } = require('./socket'); // Tu archivo de socket
const { Client } = require('pg');

// Configuración de conexión (asegúrate de usar tus variables de entorno)
const pgClient = new Client({
    host: process.env.PGHOST,
    port: process.env.PGPORT,
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD,
    max: 20, // Máximo de conexiones en el pool
    min: 1,  // Mínimo de conexiones en el pool
    idleTimeoutMillis: 30000, // Tiempo de inactividad antes de cerrar conexiones
    connectionTimeoutMillis: 10000 // Tiempo de espera para conectar
});

async function startPGListener() {
    try {
        await pgClient.connect();
        console.log('✅ Escuchador de base de datos conectado correctamente.');

        // Suscribirse a ambos canales
        await pgClient.query('LISTEN balance_update');
        await pgClient.query('LISTEN balance_update_proveedor');

        pgClient.on('notification', (msg) => {
            const io = getIO();
            let data;

            try {
                data = JSON.parse(msg.payload);
            } catch (e) {
                return console.error("Error parseando JSON de PG:", e);
            }

            console.log(`Canal: ${msg.channel} | CUIT: ${data.cuit}`);

            switch (msg.channel) {
                case 'balance_update':
                    io.emit('balanceUpdatedCliente', data);
                    break;
                
                case 'balance_update_proveedor':
                    io.emit('balanceUpdatedProveedor', data);
                    break;
                
                default:
                    console.log('Canal no reconocido:', msg.channel);
            }
        });

    } catch (err) {
        console.error('Error al iniciar el Listener de PG:', err);
    }
}

startPGListener().catch(console.error);