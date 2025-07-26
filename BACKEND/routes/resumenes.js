var express = require('express');
var router = express.Router();
var ctrlResumenes = require('../controllers/ctrlResumenes.js');

/* GETs resumenes */
router.get('/getResumenCuil', ctrlResumenes.getResumenCuil);

/* POSTs resumenes */
router.post('/insertResumen', ctrlResumenes.insertResumen);

/* PUTs resumenes */

module.exports = router;