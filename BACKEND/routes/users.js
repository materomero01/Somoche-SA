var express = require('express');
var router = express.Router();
var ctrlUsers = require('../controllers/ctrlUsers.js');

/* GETs users */

/* POSTs users */
router.post('/register', ctrlUsers.insertUser);
router.post('/login', ctrlUsers.loginUser);

module.exports = router;
