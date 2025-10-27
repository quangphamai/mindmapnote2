const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { getDashboardSummary, getDashboardStatistics } = require('../controllers/dashboardController');

const router = express.Router();

router.use(authenticateUser);

router.get('/summary', getDashboardSummary);
router.get('/statistics', getDashboardStatistics);

module.exports = router;
