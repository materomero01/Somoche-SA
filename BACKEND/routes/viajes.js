var express = require('express');
var router = express.Router();
var ctrlViajes = require('../controllers/ctrlViajes.js');

/* GETs viajes */
router.get('/viajesCliente', ctrlViajes.getViajeCuit);
router.get('/viajesComprobante/:comprobante', ctrlViajes.getViajeComprobante);
router.get('/:cuil', ctrlViajes.getViajeCuil);


/* POSTs viajes */
router.post('/addViaje', ctrlViajes.insertViaje);
router.post('/pagarViajeCliente', ctrlViajes.pagarViajeCliente);

/* PUTs viajes */
router.put('/updateViajes', ctrlViajes.updateViajes);


/* DELETEs viajes */
router.delete('/deleteViaje', ctrlViajes.deleteViaje);

module.exports = router;