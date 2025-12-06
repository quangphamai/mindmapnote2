const express = require('express');
const router = express.Router();
const { createSecurityLogsTable } = require('../controllers/migrationController');

// Route to create security_logs table
router.post('/security-logs', createSecurityLogsTable);

module.exports = router;