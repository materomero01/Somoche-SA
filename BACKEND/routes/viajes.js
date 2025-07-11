var express = require('express');
var router = express.Router();
var ctrlViajes = require('../controllers/ctrlViajes.js');

/* GETs viajes */

/* POSTs viajes */
router.post('/addViaje', ctrlViajes.insertViaje);

module.exports = router;