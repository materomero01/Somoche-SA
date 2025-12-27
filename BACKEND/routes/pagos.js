var express = require('express');
var router = express.Router();
var ctrlPagos = require('../controllers/ctrlPagos.js');

/* GETs pagos */
router.get('/getPagosCheques', ctrlPagos.getPagosCheque);
router.get('/getPagosGasoil', ctrlPagos.getPagosGasoil);
router.get('/getPagosOtros', ctrlPagos.getPagosOtros);
router.get('/pagosCliente', ctrlPagos.getPagosCliente);
router.get('/pagosProveedor', ctrlPagos.getPagosProveedor);
router.get('/ordenesProveedor', ctrlPagos.getOrdenesProveedor);
router.get('/:cuil', ctrlPagos.getAllPagos);


/* POSTs pagos */
router.post('/addPagos', ctrlPagos.insertPagos);
router.post('/pagarOrdenes', ctrlPagos.pagarOrdenesProveedor);

/* PUTs pagos */
router.put('/updatePagos', ctrlPagos.updatePagos);
router.put('/setChequesPagos', ctrlPagos.setChequesPagos);

/* DELETEs pagos */
router.delete('/deletePago', ctrlPagos.deletePago);

module.exports = router;