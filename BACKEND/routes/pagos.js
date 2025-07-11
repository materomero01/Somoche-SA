var express = require('express');
var router = express.Router();
var ctrlPagos = require('../controllers/ctrlPagos.js');

/* GETs viajes */

/* POSTs viajes */
router.post('/addPagos', ctrlPagos.insertPagos);

module.exports = router;