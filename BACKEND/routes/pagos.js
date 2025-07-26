var express = require('express');
var router = express.Router();
var ctrlPagos = require('../controllers/ctrlPagos.js');

/* GETs pagos */
router.get('/getPagosCheques', ctrlPagos.getPagosCheque);
router.get('/getPagosGasoil', ctrlPagos.getPagosGasoil);
router.get('/getPagosOtros', ctrlPagos.getPagosOtros);
router.get('/:cuil', ctrlPagos.getAllPagos);

/* POSTs pagos */
router.post('/addPagos', ctrlPagos.insertPagos);

/* PUTs pagos */
router.put('/updatePagos', ctrlPagos.updatePagos);
router.put('/setChequesPagos', ctrlPagos.setChequesPagos);

module.exports = router;