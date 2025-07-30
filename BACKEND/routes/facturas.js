const express = require('express');
const router = express.Router();
const ctrlFacturas = require('../controllers/ctrlFacturas');

/* GETs facturas */
router.get('/descargar-factura', ctrlFacturas.descargarFactura);

/* POSTs facturas */
router.post('/generar-factura', ctrlFacturas.generarFacturaCtrl);
router.post('/upload-factura', ctrlFacturas.uploadFactura);


module.exports = router;