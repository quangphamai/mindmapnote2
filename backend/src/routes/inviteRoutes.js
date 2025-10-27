const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { acceptInvite } = require('../controllers/inviteController');

router.use(authenticateUser);

router.post('/accept', acceptInvite);

module.exports = router;
