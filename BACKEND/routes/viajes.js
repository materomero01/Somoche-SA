var express = require('express');
var router = express.Router();
var ctrlViajes = require('../controllers/ctrlViajes.js');

/* GETs viajes */
router.get('/viajesCliente/:cuit', ctrlViajes.getViajeCuit);
router.get('/:cuil', ctrlViajes.getViajeCuil);


/* POSTs viajes */
router.post('/addViaje', ctrlViajes.insertViaje);

/* PUTs viajes */
router.put('/updateViajes', ctrlViajes.updateViajes);

module.exports = router;