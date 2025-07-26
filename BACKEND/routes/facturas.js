const express = require('express');
const router = express.Router();
const { emitirFacturaA } = require('../controllers/ctrlFacturas');

router.post('/emitir', emitirFacturaA);

module.exports = router;