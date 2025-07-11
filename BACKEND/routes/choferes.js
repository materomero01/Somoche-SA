var express = require('express');
var router = express.Router();
var ctrlChoferes = require('../controllers/ctrlChoferes.js');

/* GETs navigation */
router.get('/all', ctrlChoferes.getChoferesAll);

/* POSTs navigation */

module.exports = router;