const { supabase } = require('../config/supabase');

/**
 * Group Permissions Controller
 * Handles role-based permissions and access control
 */

/**
 * Get user permissions for a specific group
 */
const getUserPermissions = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        // Check if user is member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (membershipError || !membership) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }

        // Get all permissions for user's role
        const { data: permissions, error } = await supabase
            .from('role_permissions')
            .select('*')
            .eq('role', membership.role);

        if (error) {
            console.error('Error fetching permissions:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch permissions',
                message: error.message
            });
        }

        res.json({
            success: true,
            data: {
                role: membership.role,
                permissions: permissions || []
            }
        });
    } catch (error) {
        console.error('Get user permissions error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Check if user has specific permission
 */
const checkPermission = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { resource, action } = req.query;
        const userId = req.user.id;

        if (!resource || !action) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Resource and action are required'
            });
        }

        // Use the database function to check permission
        const { data: hasPermission, error } = await supabase
            .rpc('has_permission', {
                _user_id: userId,
                _group_id: groupId,
                _resource: resource,
                _action: action
            });

        if (error) {
            console.error('Error checking permission:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to check permission',
                message: error.message
            });
        }

        res.json({
            success: true,
            data: {
                has_permission: hasPermission || false
            }
        });
    } catch (error) {
        console.error('Check permission error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Get all role permissions (for admins/owners)
 */
const getRolePermissions = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        // Check if user is admin or owner
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (membershipError || !membership) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }

        if (!['owner', 'admin'].includes(membership.role)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You do not have permission to view role permissions'
            });
        }

        // Get all role permissions
        const { data: permissions, error } = await supabase
            .from('role_permissions')
            .select('*')
            .order('role', { ascending: true })
            .order('resource', { ascending: true })
            .order('action', { ascending: true });

        if (error) {
            console.error('Error fetching role permissions:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch role permissions',
                message: error.message
            });
        }

        // Group permissions by role
        const groupedPermissions = {};
        permissions?.forEach(permission => {
            if (!groupedPermissions[permission.role]) {
                groupedPermissions[permission.role] = [];
            }
            groupedPermissions[permission.role].push({
                resource: permission.resource,
                action: permission.action,
                permission_level: permission.permission_level,
                description: permission.description
            });
        });

        res.json({
            success: true,
            data: groupedPermissions
        });
    } catch (error) {
        console.error('Get role permissions error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Update role permissions (for owners only)
 */
const updateRolePermissions = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { role, resource, action, permission_level } = req.body;
        const userId = req.user.id;

        // Validate input
        if (!role || !resource || !action || permission_level === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Role, resource, action, and permission_level are required'
            });
        }

        if (!['owner', 'admin', 'member'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Role must be one of: owner, admin, member'
            });
        }

        if (!['group', 'member', 'document', 'category', 'invite'].includes(resource)) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Resource must be one of: group, member, document, category, invite'
            });
        }

        if (!['create', 'read', 'update', 'delete', 'manage'].includes(action)) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Action must be one of: create, read, update, delete, manage'
            });
        }

        if (permission_level < 0 || permission_level > 5) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Permission level must be between 0 and 5'
            });
        }

        // Check if user is owner
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (membershipError || !membership) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }

        if (membership.role !== 'owner') {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Only group owners can update role permissions'
            });
        }

        // Update or insert permission
        const { data: permission, error } = await supabase
            .from('role_permissions')
            .upsert({
                role,
                resource,
                action,
                permission_level
            })
            .select()
            .single();

        if (error) {
            console.error('Error updating role permission:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update role permission',
                message: error.message
            });
        }

        res.json({
            success: true,
            data: permission,
            message: 'Role permission updated successfully'
        });
    } catch (error) {
        console.error('Update role permission error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Get all available roles for a group
 */
const getGroupRoles = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        // Check if user is member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (membershipError || !membership) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }

        // Get all available roles with their permissions
        const { data: roles, error } = await supabase
            .from('role_permissions')
            .select('*')
            .order('role', { ascending: true });

        if (error) {
            console.error('Error fetching group roles:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch group roles',
                message: error.message
            });
        }

        // Group permissions by role
        const groupedRoles = {};
        roles.forEach(role => {
            if (!groupedRoles[role.role]) {
                groupedRoles[role.role] = {
                    role: role.role,
                    permissions: []
                };
            }
            groupedRoles[role.role].permissions.push({
                resource: role.resource,
                action: role.action,
                permission_level: role.permission_level
            });
        });

        // Convert to array and add role descriptions
        const roleList = Object.values(groupedRoles).map(role => {
            let description = '';
            switch (role.role) {
                case 'owner':
                    description = 'Full control over the group and all its resources';
                    break;
                case 'admin':
                    description = 'Can manage group settings, members, and content';
                    break;
                case 'moderator':
                    description = 'Can moderate content and manage members';
                    break;
                case 'member':
                    description = 'Can view and create content within the group';
                    break;
                default:
                    description = 'Custom role with specific permissions';
            }
            
            return {
                ...role,
                description
            };
        });

        res.json({
            success: true,
            data: roleList
        });
    } catch (error) {
        console.error('Get group roles error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Get permission level for a specific resource/action
 */
const getPermissionLevel = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { resource, action } = req.query;
        const userId = req.user.id;

        if (!resource || !action) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Resource and action are required'
            });
        }

        // Use the database function to get permission level
        const { data: permissionLevel, error } = await supabase
            .rpc('get_permission_level', {
                _user_id: userId,
                _group_id: groupId,
                _resource: resource,
                _action: action
            });

        if (error) {
            console.error('Error getting permission level:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to get permission level',
                message: error.message
            });
        }

        res.json({
            success: true,
            data: {
                permission_level: permissionLevel || 0
            }
        });
    } catch (error) {
        console.error('Get permission level error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

module.exports = {
    getUserPermissions,
    checkPermission,
    getRolePermissions,
    updateRolePermissions,
    getPermissionLevel,
    getGroupRoles
};