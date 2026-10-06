var express = require('express');
var router = express.Router();
var ctrlUsers = require('../controllers/ctrlUsers.js');
const rateLimit = require('express-rate-limit');

// Login: lo más sensible a fuerza bruta de contraseñas. 10 intentos cada 15 min por IP.
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' }
});

// Registro / recuperación de contraseña: más laxo (no son fuerza bruta de credenciales),
// pero igual conviene limitarlos para evitar spam de cuentas o de emails de reset.
const authActionLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas solicitudes. Probá de nuevo en unos minutos.' }
});

/* GETs users */

/* POSTs users */
router.post('/register', authActionLimiter, ctrlUsers.insertUser);
router.post('/login', loginLimiter, ctrlUsers.loginUser);

router.put('/forgot-password', authActionLimiter, ctrlUsers.getEmailByCuit)
router.post('/reset-password', authActionLimiter, ctrlUsers.resetPassword);

module.exports = router;
