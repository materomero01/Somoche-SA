var express = require('express');
var router = express.Router();
var ctrlClientes = require('../controllers/ctrlClientes.js');

/* GETs clientes */
router.get('/', ctrlClientes.getClientes);

/* POSTs clientes */
router.post('/addCliente', ctrlClientes.insertCliente);

/* PUTs clientes */
router.put('/updateCliente/:cuitOriginal', ctrlClientes.updateClientes);

/* DELETEs clientes*/
router.delete('/deleteCliente/:cuit', ctrlClientes.deleteClientes);

module.exports = router;