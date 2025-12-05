const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
let io;

function initializeSocket(server) {
    io = new Server(server, {
        cors: {
	    origin: ['https://somochesa.online',
		     'https://www.somochesa.online'
		],
            methods: ['GET', 'PUT', 'DELETE', 'POST'],
            allowedHeaders: ['Content-Type', 'Authorization'],
            credentials: true
        }
    });

    io.on('connection', (socket) => {
        console.log('Cliente conectado:', socket.id);

        // Decodificar el token JWT para obtener el cuil
        const token = socket.handshake.auth.token;
        if (token) {
            try {
                const decoded = jwt.verify(token, JWT_SECRET);
                socket.cuil = decoded.cuil; // Almacenar cuil en el socket
                console.log(`Usuario conectado con CUIL: ${socket.cuil}`);
            } catch (error) {
                console.error('Error al verificar token en conexión:', error);
                socket.disconnect(true); // Desconectar si el token es inválido
            }
        } else {
            console.log('Conexión sin token, desconectando:', socket.id);
            socket.disconnect(true);
        }

        socket.on('disconnect', () => {
            console.log('Cliente desconectado:', socket.id, 'CUIL:', socket.cuil);
        });
    });

    return io;
}

function getIO() {
    if (!io) {
        throw new Error('Socket.IO no está inicializado. Llama a initializeSocket primero.');
    }
    return io;
}

module.exports = { initializeSocket, getIO };
