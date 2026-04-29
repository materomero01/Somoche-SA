const express = require('express');
const router = express.Router();
const ctrlFacturas = require('../controllers/ctrlFacturas');

/* GETs facturas */
router.get('/descargar-factura', ctrlFacturas.descargarFactura);


/* POSTs facturas */
router.post('/getFacturasData', ctrlFacturas.getFacturasData);
router.post('/generar-factura', ctrlFacturas.generarFacturaCtrl);
router.post('/upload-factura', ctrlFacturas.uploadFactura);
router.post('/upload-cartaPorte', ctrlFacturas.uploadCartaPorte);
router.post('/pagarFacturas', ctrlFacturas.pagarFacturas);

/* DELETEs facturas*/
router.delete('/delete-documents', ctrlFacturas.deleteFactura);

module.exports = router;