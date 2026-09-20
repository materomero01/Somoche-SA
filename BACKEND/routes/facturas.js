const express = require('express');
const router = express.Router();
const ctrlFacturas = require('../controllers/ctrlFacturas');

/* GETs facturas */
router.get('/descargar-factura', ctrlFacturas.descargarFactura);
router.get('/archivos-viaje', ctrlFacturas.getArchivosViaje);
router.get('/descargar-archivo', ctrlFacturas.descargarArchivoViaje);
router.get('/buscar-archivos', ctrlFacturas.buscarArchivosTermino);


/* POSTs facturas */
router.post('/getFacturasData', ctrlFacturas.getFacturasData);
router.post('/generar-factura', ctrlFacturas.generarFacturaCtrl);
router.post('/upload-factura', ctrlFacturas.uploadFactura);
router.post('/upload-cartaPorte', ctrlFacturas.uploadCartaPorte);
router.post('/upload-archivo', ctrlFacturas.uploadArchivoViaje);
router.post('/pagarFacturas', ctrlFacturas.pagarFacturas);
router.post('/generar-nota-credito', ctrlFacturas.generarNotaCredito);

/* DELETEs facturas*/
router.delete('/delete-documents', ctrlFacturas.deleteFactura);

module.exports = router;