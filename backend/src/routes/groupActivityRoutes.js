const express = require('express');
const router = express.Router();
const groupActivityController = require('../controllers/groupActivityController');
const { authenticateToken } = require('../middleware/auth');
const { checkGroupPermission } = require('../middleware/groupPermissions');

const { 
    getGroupActivity, 
    getGroupActivitySummary 
} = groupActivityController;

// Get activity logs for a group
router.get(
    '/groups/:groupId/activity',
    authenticateToken,
    checkGroupPermission('group', 'read', 'groupId'),
    groupActivityController.getGroupActivity
);

// Get activity summary for a group
router.get(
    '/groups/:groupId/activity/summary',
    authenticateToken,
    checkGroupPermission('group', 'read', 'groupId'),
    groupActivityController.getGroupActivitySummary
);

module.exports = router;