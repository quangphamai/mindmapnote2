const { supabase } = require('../config/supabase');
const { logSecurityEvent } = require('./groupSecurity');

/**
 * Middleware to check if user has permission to perform an action on a group resource
 * @param {string} resource - The resource type (e.g., 'group', 'member', 'document')
 * @param {string} action - The action type (e.g., 'read', 'write', 'delete', 'admin')
 * @param {string} groupIdParam - The parameter name that contains the group ID (default: 'groupId')
 * @returns {Function} Express middleware function
 */
const checkGroupPermission = (resource, action, groupIdParam = 'groupId') => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            const groupId = req.params[groupIdParam];

            if (!groupId) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Group ID is required'
                });
            }

            // Check permission using database function
            const { data: hasPermission, error } = await supabase
                .rpc('has_permission', {
                    _user_id: userId,
                    _group_id: groupId,
                    _resource: resource,
                    _action: action
                });

            if (error) {
                console.error('Permission check error:', error);
                return res.status(500).json({
                    success: false,
                    error: 'Internal Server Error',
                    message: 'Failed to check permissions'
                });
            }

            if (!hasPermission) {
                // Log security event for audit
                await logSecurityEvent(userId, 'group_access_denied', {
                    groupId,
                    resource,
                    action,
                    method: req.method,
                    path: req.path,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
                
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: `You don't have permission to ${action} ${resource} in this group`
                });
            }

            // Add permission info to request for later use
            req.groupPermission = {
                userId,
                groupId,
                resource,
                action,
                hasPermission: true
            };

            next();
        } catch (error) {
            console.error('Permission middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Permission check failed'
            });
        }
    };
};

/**
 * Middleware to check if user is group owner
 * @param {string} groupIdParam - The parameter name that contains the group ID (default: 'groupId')
 * @returns {Function} Express middleware function
 */
const isGroupOwner = (groupIdParam = 'groupId') => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            const groupId = req.params[groupIdParam];

            if (!groupId) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Group ID is required'
                });
            }

            // Check if user is the owner
            const { data: membership, error } = await supabase
                .from('group_members')
                .select('role')
                .eq('group_id', groupId)
                .eq('user_id', userId)
                .eq('role', 'owner')
                .eq('is_active', true)
                .single();

            if (error || !membership) {
                // Log security event for audit
                await logSecurityEvent(userId, 'group_access_denied', {
                    groupId,
                    requiredRole: 'owner',
                    method: req.method,
                    path: req.path,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
                
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only group owners can perform this action'
                });
            }

            next();
        } catch (error) {
            console.error('Owner check middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Permission check failed'
            });
        }
    };
};

/**
 * Middleware to check if user is group admin or owner
 * @param {string} groupIdParam - The parameter name that contains the group ID (default: 'groupId')
 * @returns {Function} Express middleware function
 */
const isGroupAdmin = (groupIdParam = 'groupId') => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            const groupId = req.params[groupIdParam];

            if (!groupId) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Group ID is required'
                });
            }

            // Check if user is admin or owner
            const { data: membership, error } = await supabase
                .from('group_members')
                .select('role')
                .eq('group_id', groupId)
                .eq('user_id', userId)
                .eq('is_active', true)
                .in('role', ['admin', 'owner'])
                .single();

            if (error || !membership) {
                // Log security event for audit
                await logSecurityEvent(userId, 'group_access_denied', {
                    groupId,
                    requiredRole: 'admin',
                    method: req.method,
                    path: req.path,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
                
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'Only group admins can perform this action'
                });
            }

            next();
        } catch (error) {
            console.error('Admin check middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Permission check failed'
            });
        }
    };
};

/**
 * Middleware to check if user is a member of the group
 * @param {string} groupIdParam - The parameter name that contains the group ID (default: 'groupId')
 * @returns {Function} Express middleware function
 */
const isGroupMember = (groupIdParam = 'groupId') => {
    return async (req, res, next) => {
        try {
            const userId = req.user.id;
            const groupId = req.params[groupIdParam];

            if (!groupId) {
                return res.status(400).json({
                    success: false,
                    error: 'Bad Request',
                    message: 'Group ID is required'
                });
            }

            // Check if user is a member
            const { data: membership, error } = await supabase
                .from('group_members')
                .select('id')
                .eq('group_id', groupId)
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();

            if (error || !membership) {
                // Log security event for audit
                await logSecurityEvent(userId, 'group_access_denied', {
                    groupId,
                    requiredRole: 'member',
                    method: req.method,
                    path: req.path,
                    ip: req.ip,
                    userAgent: req.get('User-Agent')
                });
                
                return res.status(403).json({
                    success: false,
                    error: 'Forbidden',
                    message: 'You must be a member of this group to perform this action'
                });
            }

            next();
        } catch (error) {
            console.error('Member check middleware error:', error);
            return res.status(500).json({
                success: false,
                error: 'Internal Server Error',
                message: 'Permission check failed'
            });
        }
    };
};

module.exports = {
    checkGroupPermission,
    isGroupOwner,
    isGroupAdmin,
    isGroupMember
};