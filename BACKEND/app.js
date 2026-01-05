var createError = require('http-errors');
var express = require('express');
var path = require('path');
var fs = require('fs');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
const multer = require('multer');
require('dotenv').config();
var cors = require('cors');
const jwt = require('jsonwebtoken');
require('./listeners.js');

const JWT_SECRET = process.env.JWT_SECRET;

var usersRouter = require('./routes/users');
var choferesRouter = require('./routes/choferes');
var viajesRouter = require('./routes/viajes');
var pagosRouter = require('./routes/pagos');
var catacRouter = require('./routes/catac');
var clientesRouter = require('./routes/clientes');
var proveedoresRouter = require('./routes/proveedores');
var resumenesRouter = require('./routes/resumenes');
var facturasRouter = require('./routes/facturas');
var logsRouter = require('./routes/logs'); // Nuevo router

// Inicializar tabla de logs
const { createLogsTable } = require('./utils/logger');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(cookieParser());
// app.use(express.static(path.join(__dirname, 'public')));

// Configuración de archivos estáticos (Frontend)
// Si existe la carpeta ../FRONTEND (entorno local), se sirve esa.
// Si no (producción), se sirve la carpeta pública por defecto.
const frontendPath = path.join(__dirname, '../FRONTEND');
if (fs.existsSync(frontendPath)) {
    console.log(`[INFO] Modo local detectado. Sirviendo frontend desde: ${frontendPath}`);
    app.use(express.static(frontendPath));
    app.use('/FRONTEND', express.static(frontendPath));
} else {
    console.log('[INFO] Modo producción detectado. Sirviendo frontend desde ./public');
    app.use(express.static(path.join(__dirname, 'public')));
}

// Configurar almacenamiento en memoria para multer
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('El archivo debe ser PDF, JPG o PNG'), false);
        }
    },
    limits: { fileSize: 10 * 1024 * 1024 } // Límite de 10 MB
});

// Habilitar CORS para permitir peticiones desde frontend
app.use(cors({
    // origin: ['http://127.0.0.1:5500', 'http://localhost:5500', 'http://localhost:3000'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['X-Factura-Id', 'Content-Disposition', 'X-New-Token']
}));


// Middleware para verificar el token (protege rutas)
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Espera formato "Bearer TOKEN"
    if (token == null) {
        return res.status(403).json({ message: 'Token no proporcionado.' });
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            console.error('Error al verificar token:', err);
            return res.status(403).json({ message: 'Token inválido o expirado.' });
        }
        // Evitar caché cuando se envía X-New-Token
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        // Verificar si el token está a punto de expirar (menos de 5 minutos)
        const currentTime = Math.floor(Date.now() / 1000); // Tiempo actual en segundos
        const timeLeft = user.exp - currentTime; // Tiempo restante hasta la expiración
        const fiveMinutesInSeconds = 5 * 60; // 5 minutos en segundos
        if (timeLeft <= fiveMinutesInSeconds) {
            // Generar un nuevo token
            const newPayload = { ...user }; // Copia el payload original
            delete newPayload.iat; // Elimina 'iat' (issued at) para que se genere uno nuevo
            delete newPayload.exp; // Elimina 'exp' (expiration) para que se genere uno nuevo
            const newToken = jwt.sign(newPayload, JWT_SECRET, { expiresIn: '1h' }); // Ajusta expiresIn según tu caso
            res.setHeader('X-New-Token', newToken); // Enviar el nuevo token en la cabecera
        }

        req.user = user; // Guarda el payload del token en req.user
        next();
    });
};

// Middleware opcional - intenta autenticar pero no falla si no hay token
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        // Sin token, continuar sin usuario
        req.user = null;
        return next();
    }

    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            // Token inválido, continuar sin usuario
            req.user = null;
        } else {
            req.user = user;
        }
        next();
    });
};

// app.use('/api/', indexRouter);
app.use('/api/users', optionalAuth, usersRouter);
//Rutas Protegidas por JSWT
app.use(authenticateToken);
app.use('/api/choferes', choferesRouter);
app.use('/api/viajes', viajesRouter);
app.use('/api/pagos', pagosRouter);
app.use('/api/catac', catacRouter);
app.use('/api/clientes', clientesRouter);
app.use('/api/proveedores', proveedoresRouter);
app.use('/api/resumenes', resumenesRouter);
app.use('/api/logs', logsRouter);
app.use('/api/facturas', upload.fields([{ name: 'factura', maxCount: 1 }, { name: 'cartaPorte', maxCount: 5 }]), facturasRouter);

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    next(createError(404));
});

// error handler
app.use(function (err, req, res, next) {
    // set locals, only providing error in development
    res.locals.title = "Somoche S.A."
    res.locals.message = err.message;
    res.locals.error = req.app.get('env') === 'development' ? err : {};

    // render the error page
    res.status(err.status || 500);
    res.render('error');
});

module.exports = app;
