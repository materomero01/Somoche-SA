var express = require('express');
var router = express.Router();
var ctrlProveedores = require('../controllers/ctrlProveedores.js');

/* GETs clientes */
router.get('/', ctrlProveedores.getProveedores);

/* POSTs clientes */
router.post('/addProveedor', ctrlProveedores.insertProveedor);

/* PUTs clientes */
router.put('/updateProveedor/:cuitOriginal', ctrlProveedores.updateProveedores);

/* DELETEs clientes*/
router.delete('/deleteProveedor/:cuit', ctrlProveedores.deleteProveedores);

module.exports = router;