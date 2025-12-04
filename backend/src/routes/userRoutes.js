const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { searchUsers } = require('../controllers/userSearchController');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Search users globally
router.get('/search', searchUsers);

module.exports = router;