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

        // First, get group details to check visibility
        const { data: group, error: groupError } = await supabase
            .from('groups')
            .select('id, name, visibility, is_public, is_active')
            .eq('id', id)
            .single();

        if (groupError || !group) {
            return res.status(404).json({
                success: false,
                error: 'Group not found',
                message: 'The requested group does not exist'
            });
        }

        if (!group.is_active) {
            return res.status(404).json({
                success: false,
                error: 'Group not found',
                message: 'The requested group is not active'
            });
        }

        // Check if user is member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', id)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        // If user is not a member, check if group is public and visible
        if (membershipError || !membership) {
            if (group.visibility === 'public' && group.is_public) {
                // For public groups, allow limited access
                const { data: publicGroup, error } = await supabase
                    .from('groups')
                    .select('*')
                    .eq('id', id)
                    .single();

                if (error) {
                    console.error('Error fetching group:', error);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to fetch group',
                        message: error.message
                    });
                }

                // Return limited information for non-members
                return res.json({
                    success: true,
                    data: {
                        ...publicGroup,
                        user_role: null,
                        group_members: [] // Don't expose members to non-members
                    }
                });
            } else {
                // Private or hidden groups require membership
                return res.status(403).json({
                    success: false,
                    error: 'Access denied',
                    message: 'You are not a member of this group'
                });
            }
        }

        // Get full group details (we already have basic info above)
        const { data: fullGroup, error } = await supabase
            .from('groups')
            .select('*')
            .eq('id', id)
            .single();

        if (error) {
            console.error('Error fetching group:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch group',
                message: error.message
            });
        }

        // Get group members separately
        const { data: members, error: membersError } = await supabase
            .from('group_members')
            .select('id, role, joined_at, is_active, user_id')
            .eq('group_id', id)
            .eq('is_active', true);

        if (membersError) {
            console.warn('Error fetching group members:', membersError);
        }

        // Fetch user profiles for members
        let membersWithUsers = [];
        if (members && members.length > 0) {
            const userIds = members.map(m => m.user_id);
            const { data: profiles } = await supabase
                .from('profiles')
                .select('id, username, full_name, avatar_url')
                .in('id', userIds);

            // Get emails from auth admin API
            let authUsers = [];
            try {
                const { data: { users } = {}, error: authError } = await supabase.auth.admin.listUsers();
                if (authError) {
                    console.warn('Error fetching auth users:', authError);
                } else {
                    authUsers = users || [];
                }
            } catch (authErr) {
                console.warn('Error calling auth admin API:', authErr);
            }

            membersWithUsers = members.map(member => {
                const profile = profiles?.find(p => p.id === member.user_id);
                const authUser = authUsers.find(u => u.id === member.user_id);
                return {
                    ...member,
                    user: profile ? {
                        id: profile.id,
                        email: authUser?.email || null,
                        username: profile.username,
                        full_name: profile.full_name,
                        avatar_url: profile.avatar_url
                    } : null
                };
            });
        }

        res.json({
            success: true,
            data: {
                ...fullGroup,
                group_members: membersWithUsers,
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

/**
 * Update group visibility settings
 */
const updateGroupVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        const { visibility, is_public } = req.body;
        const userId = req.user.id;

        // Validate visibility value
        if (visibility !== undefined && !['public', 'private', 'hidden'].includes(visibility)) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Visibility must be one of: public, private, hidden'
            });
        }

        // Check if user has permission to update visibility
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
                message: 'You do not have permission to update group visibility'
            });
        }

        // Update visibility settings
        const updateData = {};
        if (visibility !== undefined) updateData.visibility = visibility;
        if (is_public !== undefined) updateData.is_public = is_public;

        const { data: group, error } = await supabase
            .from('groups')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Error updating group visibility:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to update group visibility',
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
            data: group,
            message: 'Group visibility updated successfully'
        });
    } catch (error) {
        console.error('Update group visibility error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Get public groups (discoverable by anyone)
 */
const getPublicGroups = async (req, res) => {
    try {
        const { limit = 20, offset = 0, search } = req.query;
        const userId = req.user?.id; // May be null for unauthenticated users

        let query = supabase
            .from('groups')
            .select(`
                id, name, description, color, avatar_url, 
                is_public, visibility, created_at, updated_at,
                created_by,
                group_members!inner(
                    role,
                    user_id
                )
            `)
            .eq('is_public', true)
            .eq('visibility', 'public')
            .eq('is_active', true);

        // Add search filter if provided
        if (search) {
            query = query.ilike('name', `%${search}%`);
        }

        // Get member count for each group
        const { data: groups, error } = await query
            .order('created_at', { ascending: false })
            .range(parseInt(offset), parseInt(offset) + parseInt(limit) - 1);

        if (error) {
            console.error('Error fetching public groups:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch public groups',
                message: error.message
            });
        }

        // Get member counts for all groups
        const groupIds = groups.map(g => g.id);
        const { data: memberCounts } = await supabase
            .from('group_members')
            .select('group_id')
            .eq('is_active', true)
            .in('group_id', groupIds);

        // Count members per group
        const memberCountMap = {};
        memberCounts?.forEach(mc => {
            memberCountMap[mc.group_id] = (memberCountMap[mc.group_id] || 0) + 1;
        });

        // Transform data and add user role if authenticated
        const transformedGroups = groups.map(group => {
            const userMembership = group.group_members.find(m => m.user_id === userId);
            return {
                id: group.id,
                name: group.name,
                description: group.description,
                color: group.color,
                avatar_url: group.avatar_url,
                is_public: group.is_public,
                visibility: group.visibility,
                created_at: group.created_at,
                updated_at: group.updated_at,
                created_by: group.created_by,
                member_count: memberCountMap[group.id] || 0,
                user_role: userMembership?.role || null
            };
        });

        // Get total count for pagination
        const { count, error: countError } = await supabase
            .from('groups')
            .select('*', { count: 'exact', head: true })
            .eq('is_public', true)
            .eq('visibility', 'public')
            .eq('is_active', true);

        if (countError) {
            console.error('Error counting public groups:', countError);
        }

        res.json({
            success: true,
            data: transformedGroups,
            pagination: {
                total: count || 0,
                limit: parseInt(limit),
                offset: parseInt(offset)
            }
        });
    } catch (error) {
        console.error('Get public groups error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Transfer group ownership to another member
 */
const transferOwnership = async (req, res) => {
    try {
        const { id } = req.params;
        const { newOwnerId } = req.body;
        const userId = req.user.id;

        if (!newOwnerId) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'New owner ID is required'
            });
        }

        // Check if current user is the owner
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
                message: 'Only group owner can transfer ownership'
            });
        }

        // Check if new owner is a member
        const { data: newOwnerMembership, error: newOwnerError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', id)
            .eq('user_id', newOwnerId)
            .eq('is_active', true)
            .single();

        if (newOwnerError || !newOwnerMembership) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: 'The specified user is not a member of this group'
            });
        }

        // Start transaction
        // 1. Update current owner to admin
        const { error: updateCurrentOwnerError } = await supabase
            .from('group_members')
            .update({ role: 'admin' })
            .eq('group_id', id)
            .eq('user_id', userId);

        if (updateCurrentOwnerError) {
            console.error('Error updating current owner role:', updateCurrentOwnerError);
            return res.status(500).json({
                success: false,
                error: 'Failed to transfer ownership',
                message: updateCurrentOwnerError.message
            });
        }

        // 2. Update new owner
        const { error: updateNewOwnerError } = await supabase
            .from('group_members')
            .update({ role: 'owner' })
            .eq('group_id', id)
            .eq('user_id', newOwnerId);

        if (updateNewOwnerError) {
            console.error('Error updating new owner role:', updateNewOwnerError);
            // Rollback current owner change
            await supabase
                .from('group_members')
                .update({ role: 'owner' })
                .eq('group_id', id)
                .eq('user_id', userId);
            
            return res.status(500).json({
                success: false,
                error: 'Failed to transfer ownership',
                message: updateNewOwnerError.message
            });
        }

        res.json({
            success: true,
            message: 'Ownership transferred successfully'
        });
    } catch (error) {
        console.error('Transfer ownership error:', error);
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
    getGroupStats,
    updateGroupVisibility,
    getPublicGroups,
    transferOwnership
};
