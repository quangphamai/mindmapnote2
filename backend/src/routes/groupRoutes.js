const express = require('express');
const { authenticateUser } = require('../middleware/auth');
const { 
    checkGroupPermission, 
    isGroupOwner, 
    isGroupAdmin, 
    isGroupMember 
} = require('../middleware/groupPermissions');
const {
    rateLimitGroupOperations,
    validateGroupInput,
    auditGroupOperation,
    detectSuspiciousActivity,
    validateRoleChange,
    sanitizeGroupOutput
} = require('../middleware/groupSecurity');
const {
    getAllGroups,
    getGroupById,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupStats,
    updateGroupVisibility,
    getPublicGroups,
    transferOwnership
} = require('../controllers/groupController');

const {
    getGroupMembers,
    addGroupMember,
    updateMemberRole,
    removeGroupMember,
    leaveGroup,
    getMemberStats,
    searchUsers
} = require('../controllers/groupMemberController');
const { createInvite } = require('../controllers/inviteController');
const {
    getGroupDocuments,
    addGroupDocument,
    updateGroupDocumentAccess,
    removeGroupDocument
} = require('../controllers/groupDocumentController');

const {
    checkPermission,
    getUserPermissions,
    updateRolePermissions,
    getGroupRoles
} = require('../controllers/groupPermissionController');

const {
    getGroupTodos,
    getGroupTodoStats
} = require('../controllers/todoController');

const router = express.Router();

// All routes require authentication
router.use(authenticateUser);

// Apply security middleware to all routes
router.use(detectSuspiciousActivity);
router.use(sanitizeGroupOutput);

// Group CRUD routes
router.get('/', getAllGroups);                    // GET /api/groups
router.get('/public', getPublicGroups);          // GET /api/groups/public
router.get('/:id', getGroupById);                // GET /api/groups/:id (privacy checks in controller)
router.post('/', 
    rateLimitGroupOperations(5, 60000), // Limit group creation to 5 per minute
    validateGroupInput,
    auditGroupOperation('group_created'),
    createGroup
);                   // POST /api/groups
router.put('/:id', 
    detectSuspiciousActivity,
    rateLimitGroupOperations(10, 60000), // Limit group updates to 10 per minute
    validateGroupInput,
    auditGroupOperation('group_updated'),
    checkGroupPermission('group', 'write', 'id'), 
    updateGroup
); // PUT /api/groups/:id
router.delete('/:id', 
    rateLimitGroupOperations(3, 60000), // Limit group deletion to 3 per minute
    auditGroupOperation('group_deleted'),
    checkGroupPermission('group', 'delete', 'id'), 
    deleteGroup
); // DELETE /api/groups/:id
router.get('/:id/stats', checkGroupPermission('group', 'read', 'id'), getGroupStats); // GET /api/groups/:id/stats
router.put('/:id/visibility', isGroupAdmin('id'), updateGroupVisibility); // PUT /api/groups/:id/visibility
router.post('/:id/transfer-ownership', isGroupOwner('id'), transferOwnership); // POST /api/groups/:id/transfer-ownership

// Group member management routes
router.get('/:groupId/members', 
    auditGroupOperation('members_viewed'),
    isGroupMember('groupId'), 
    getGroupMembers
); // View members (members only)
router.post('/:groupId/members', 
    rateLimitGroupOperations(10, 60000), // Limit member additions to 10 per minute
    auditGroupOperation('member_added'),
    isGroupAdmin('groupId'), 
    addGroupMember
); // Add members (admin+)
router.put('/:groupId/members/:memberId', 
    rateLimitGroupOperations(5, 60000), // Limit role changes to 5 per minute
    validateRoleChange,
    auditGroupOperation('member_role_updated'),
    isGroupAdmin('groupId'), 
    updateMemberRole
); // Update roles (admin+)
router.delete('/:groupId/members/:memberId', 
    rateLimitGroupOperations(5, 60000), // Limit member removals to 5 per minute
    auditGroupOperation('member_removed'),
    isGroupAdmin('groupId'), 
    removeGroupMember
); // Remove members (admin+)
router.post('/:groupId/leave', leaveGroup);                          // POST /api/groups/:groupId/leave

// Additional member management routes
router.get('/:groupId/members/stats', isGroupMember('groupId'), getMemberStats); // View member stats (members only)
router.get('/:groupId/search-users', isGroupAdmin('groupId'), searchUsers); // Search users (admin+)
// Invite endpoints
router.post('/:groupId/invites', createInvite);                      // POST /api/groups/:groupId/invites
// Group documents
router.get('/:groupId/documents', isGroupMember('groupId'), getGroupDocuments); // View documents (members only)
router.post('/:groupId/documents', isGroupMember('groupId'), addGroupDocument); // Add documents (members only)
router.put('/:groupId/documents/:documentId', checkGroupPermission('document', 'write', 'groupId'), updateGroupDocumentAccess); // Update document access
router.delete('/:groupId/documents/:documentId', checkGroupPermission('document', 'delete', 'groupId'), removeGroupDocument); // Delete documents

// Group permission management routes
router.get('/:groupId/permissions/check', checkPermission);           // GET /api/groups/:groupId/permissions/check?resource=...&action=...
router.get('/:groupId/permissions/user', isGroupMember('groupId'), getUserPermissions); // View own permissions (members only)
router.put('/:groupId/permissions/roles/:roleId', isGroupOwner('groupId'), updateRolePermissions); // Update role permissions (owner only)
router.get('/:groupId/roles', isGroupMember('groupId'), getGroupRoles); // View group roles (members only)

// Group todo routes
router.get('/:groupId/todos', isGroupMember('groupId'), getGroupTodos); // View todos (members only)
router.get('/:groupId/todos/stats', isGroupMember('groupId'), getGroupTodoStats); // View todo stats (members only)

module.exports = router;
