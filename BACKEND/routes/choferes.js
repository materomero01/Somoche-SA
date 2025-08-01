var express = require('express');
var router = express.Router();
var ctrlChoferes = require('../controllers/ctrlChoferes.js');

/* GETs choferes */
router.get('/all', ctrlChoferes.getChoferesAll);
router.get('/allData', ctrlChoferes.getChoferesAllData);
/* GET chofer by cuil */
router.get('/:cuil', ctrlChoferes.getChoferByCuil);

/* POSTs choferes */

/* PUTs choferes */
router.put('/updateChofer/:cuilOriginal', ctrlChoferes.updateChofer);

/* DELETEs choferes */
router.delete('/deleteChofer/:cuil', ctrlChoferes.deleteChofer);


module.exports = router;