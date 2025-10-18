const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const {
    getAllGroups,
    getGroupById,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupStats
} = require('../controllers/groupController');

const {
    getGroupMembers,
    addGroupMember,
    updateMemberRole,
    removeGroupMember,
    leaveGroup
} = require('../controllers/groupMemberController');
const { createInvite } = require('../controllers/inviteController');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Group CRUD routes
router.get('/', getAllGroups);                    // GET /api/groups
router.get('/:id', getGroupById);                // GET /api/groups/:id
router.post('/', createGroup);                   // POST /api/groups
router.put('/:id', updateGroup);                 // PUT /api/groups/:id
router.delete('/:id', deleteGroup);              // DELETE /api/groups/:id
router.get('/:id/stats', getGroupStats);         // GET /api/groups/:id/stats

// Group member management routes
router.get('/:groupId/members', getGroupMembers);                    // GET /api/groups/:groupId/members
router.post('/:groupId/members', addGroupMember);                    // POST /api/groups/:groupId/members
router.put('/:groupId/members/:memberId', updateMemberRole);         // PUT /api/groups/:groupId/members/:memberId
router.delete('/:groupId/members/:memberId', removeGroupMember);     // DELETE /api/groups/:groupId/members/:memberId
router.post('/:groupId/leave', leaveGroup);                          // POST /api/groups/:groupId/leave
// Invite endpoints
router.post('/:groupId/invites', createInvite);                      // POST /api/groups/:groupId/invites

module.exports = router;
