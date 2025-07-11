var express = require('express');
var router = express.Router();
var ctrlCatac = require('../controllers/ctrlCatac.js');

/* GETs viajes */
router.get('/tarifas', ctrlCatac.getTarifas);

/* POSTs viajes */
router.post('/update', ctrlCatac.updateTarifas);

module.exports = router;