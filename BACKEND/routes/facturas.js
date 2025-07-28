const express = require('express');
const router = express.Router();
const { generarFactura } = require('../controllers/ctrlFacturas');

router.post('/generar-factura', generarFactura);

module.exports = router;