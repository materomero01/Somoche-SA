var express = require('express');
var router = express.Router();
var ctrlPagos = require('../controllers/ctrlPagos.js');

/* GETs pagos */

/* POSTs pagos */
router.post('/addPagos', ctrlPagos.insertPagos);

module.exports = router;