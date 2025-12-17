var express = require('express');
var router = express.Router();
var ctrlLogs = require('../controllers/ctrlLogs.js');
// Middleware de autenticación se maneja en app.js

// Middleware de autenticación (si es necesario importarlo o se pasa desde app.js)
// Asumo que authenticateToken se aplica globalmente o se importa.
// Si no, tendremos que ver app.js. Por ahora lo dejo limpio y ajustaremos.

router.get('/', ctrlLogs.getLogs);

module.exports = router;
