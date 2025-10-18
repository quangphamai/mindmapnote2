const { supabase } = require('../config/supabase');

/**
 * Groups Controller
 * Handles CRUD operations for groups and group management
 */

/**
 * Get all groups for the authenticated user
 */
const getAllGroups = async (req, res) => {
    try {
        const userId = req.user.id;

        // Get groups where user is a member
        const { data: groups, error } = await supabase
            .from('groups')
            .select(`
                *,
                group_members!inner(
                    role,
                    joined_at,
                    user_id
                )
            `)
            .eq('group_members.user_id', userId)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error fetching groups:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch groups',
                message: error.message
            });
        }

        // Transform data to include user role
        const transformedGroups = groups.map(group => ({
            ...group,
            user_role: group.group_members[0]?.role || 'viewer'
        }));

        res.json({
            success: true,
            data: transformedGroups,
            count: transformedGroups.length
        });
    } catch (error) {
        console.error('Get all groups error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Get a specific group by ID
 */
const getGroupById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user is member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', id)
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

        // Get group details with members
        const { data: group, error } = await supabase
            .from('groups')
            .select(`
                *,
                group_members(
                    id,
                    role,
                    joined_at,
                    is_active,
                    user:user_id(
                        id,
                        email,
                        raw_user_meta_data
                    )
                )
            `)
            .eq('id', id)
            .eq('is_active', true)
            .single();

        if (error) {
            console.error('Error fetching group:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch group',
                message: error.message
            });
        }

        if (!group) {
            return res.status(404).json({
                success: false,
                error: 'Group not found',
                message: 'The requested group does not exist'
            });
        }

        res.json({
            success: true,
            data: {
                ...group,
                user_role: membership.role
            }
        });
    } catch (error) {
        console.error('Get group by ID error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Create a new group
 */
const createGroup = async (req, res) => {
    try {
        const { name, description, color } = req.body;
        const userId = req.user.id;

        if (!name || name.trim().length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Group name is required'
            });
        }

        // Create group
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .insert({
                name: name.trim(),
                description: description?.trim() || null,
                color: color || '#3b82f6',
                created_by: userId
            })
            .select()
            .single();

        if (groupError) {
            console.error('Error creating group:', groupError);
            return res.status(500).json({
                success: false,
                error: 'Failed to create group',
                message: groupError.message
            });
        }

        // Add creator as owner
        const { error: memberError } = await supabase
            .from('group_members')
            .insert({
                group_id: group.id,
                user_id: userId,
                role: 'owner',
                invited_by: userId
            });

        if (memberError) {
            console.error('Error adding owner to group:', memberError);
            // Rollback group creation
            await supabase.from('groups').delete().eq('id', group.id);
            return res.status(500).json({
                success: false,
                error: 'Failed to create group',
                message: 'Group created but failed to add owner'
            });
        }

        res.status(201).json({
            success: true,
            data: {
                ...group,
                user_role: 'owner'
            },
            message: 'Group created successfully'
        });
    } catch (error) {
        console.error('Create group error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Update a group
 */
const updateGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, color } = req.body;
        const userId = req.user.id;

        // Check if user has permission to update
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', id)
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
                message: 'You do not have permission to update this group'
            });
        }

        // Update group
        const updateData = {};
        if (name !== undefined) updateData.name = name.trim();
        if (description !== undefined) updateData.description = description?.trim() || null;
        if (color !== undefined) updateData.color = color;

        const { data: group, error } = await supabase
            .from('groups')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating group:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update group',
                message: error.message
            });
        }

        if (!group) {
            return res.status(404).json({
                success: false,
                error: 'Group not found',
                message: 'The requested group does not exist'
            });
        }

        res.json({
            success: true,
            data: {
                ...group,
                user_role: membership.role
            },
            message: 'Group updated successfully'
        });
    } catch (error) {
        console.error('Update group error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Delete a group (only owner can delete)
 */
const deleteGroup = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user is owner
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', id)
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
                message: 'Only group owner can delete the group'
            });
        }

        // Delete group (cascade will handle related records)
        const { error } = await supabase
            .from('groups')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Error deleting group:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to delete group',
                message: error.message
            });
        }

        res.json({
            success: true,
            message: 'Group deleted successfully'
        });
    } catch (error) {
        console.error('Delete group error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Get group statistics
 */
const getGroupStats = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check if user is member
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', id)
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

        // Get member count
        const { count: memberCount, error: memberCountError } = await supabase
            .from('group_members')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', id)
            .eq('is_active', true);

        if (memberCountError) {
            console.error('Error getting member count:', memberCountError);
        }

        // Get document count
        const { count: documentCount, error: documentCountError } = await supabase
            .from('group_documents')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', id);

        if (documentCountError) {
            console.error('Error getting document count:', documentCountError);
        }

        res.json({
            success: true,
            data: {
                member_count: memberCount || 0,
                document_count: documentCount || 0,
                user_role: membership.role
            }
        });
    } catch (error) {
        console.error('Get group stats error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

module.exports = {
    getAllGroups,
    getGroupById,
    createGroup,
    updateGroup,
    deleteGroup,
    getGroupStats
};
