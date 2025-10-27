const { supabase } = require('../config/supabase');

/**
 * Group Members Controller
 * Handles member management, roles, and permissions
 */

/**
 * Get all members of a group
 */
const getGroupMembers = async (req, res) => {
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

        // Get all members
        const { data: members, error } = await supabase
            .from('group_members')
            .select('id, role, joined_at, is_active, invited_by, user_id')
            .eq('group_id', groupId)
            .eq('is_active', true)
            .order('joined_at', { ascending: false });

        if (error) {
            console.error('Error fetching group members:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch group members',
                message: error.message
            });
        }

        // Fetch user details separately
        const userIds = members.map(m => m.user_id);
        const { data: profiles, error: profilesError } = await supabase
            .from('profiles')
            .select('id, username, full_name, avatar_url')
            .in('id', userIds);

        if (profilesError) {
            console.warn('Error fetching user profiles:', profilesError);
        }

        // Get emails from auth admin API (requires service role key)
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

        // Merge user data with members
        const membersWithUsers = members.map(member => {
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

        res.json({
            success: true,
            data: membersWithUsers,
            count: membersWithUsers.length
        });
    } catch (error) {
        console.error('Get group members error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Add a member to a group
 */
const addGroupMember = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { userEmail, role = 'member' } = req.body;
        const userId = req.user.id;

        if (!userEmail) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'User email is required'
            });
        }

        // Check if current user has permission to add members
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
                message: 'You do not have permission to add members'
            });
        }

        // Find user by email using auth admin API
        let targetUser = null;
        try {
            const { data: { users } = {}, error: authError } = await supabase.auth.admin.listUsers();
            if (authError) {
                console.error('Error fetching users from auth:', authError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to search for user',
                    message: authError.message
                });
            }
            
            targetUser = users?.find(u => u.email?.toLowerCase() === userEmail.toLowerCase());
        } catch (authErr) {
            console.error('Error calling auth admin API:', authErr);
            return res.status(500).json({
                success: false,
                error: 'Failed to search for user',
                message: authErr.message
            });
        }

        if (!targetUser) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
                message: 'No user found with the provided email'
            });
        }

        // Check if user is already a member
        const { data: existingMember, error: existingError } = await supabase
            .from('group_members')
            .select('id, is_active')
            .eq('group_id', groupId)
            .eq('user_id', targetUser.id)
            .single();

        if (existingMember) {
            if (existingMember.is_active) {
                return res.status(409).json({
                    success: false,
                    error: 'User already a member',
                    message: 'This user is already a member of the group'
                });
            } else {
                // Reactivate existing membership
                const { error: updateError } = await supabase
                    .from('group_members')
                    .update({
                        is_active: true,
                        role: role,
                        joined_at: new Date().toISOString()
                    })
                    .eq('id', existingMember.id);

                if (updateError) {
                    console.error('Error reactivating member:', updateError);
                    return res.status(500).json({
                        success: false,
                        error: 'Failed to add member',
                        message: updateError.message
                    });
                }
            }
        } else {
            // Add new member
            const { error: addError } = await supabase
                .from('group_members')
                .insert({
                    group_id: groupId,
                    user_id: targetUser.id,
                    role: role,
                    invited_by: userId
                });

            if (addError) {
                console.error('Error adding member:', addError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to add member',
                    message: addError.message
                });
            }
        }

        res.status(201).json({
            success: true,
            message: 'Member added successfully'
        });
    } catch (error) {
        console.error('Add group member error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Update member role
 */
const updateMemberRole = async (req, res) => {
    try {
        const { groupId, memberId } = req.params;
        const { role } = req.body;
        const userId = req.user.id;

        if (!role || !['owner', 'admin', 'member', 'viewer'].includes(role)) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Valid role is required (owner, admin, member, viewer)'
            });
        }

        // Check if current user has permission to update roles
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

        // Only owners can change roles, and owners cannot change their own role
        if (membership.role !== 'owner') {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'Only group owners can change member roles'
            });
        }

        // Get target member
        const { data: targetMember, error: targetError } = await supabase
            .from('group_members')
            .select('user_id, role')
            .eq('id', memberId)
            .eq('group_id', groupId)
            .single();

        if (targetError || !targetMember) {
            return res.status(404).json({
                success: false,
                error: 'Member not found',
                message: 'The specified member does not exist in this group'
            });
        }

        // Prevent owner from changing their own role
        if (targetMember.user_id === userId && targetMember.role === 'owner') {
            return res.status(400).json({
                success: false,
                error: 'Invalid operation',
                message: 'Group owner cannot change their own role'
            });
        }

        // Update member role
        const { error: updateError } = await supabase
            .from('group_members')
            .update({ role: role })
            .eq('id', memberId);

        if (updateError) {
            console.error('Error updating member role:', updateError);
            return res.status(500).json({
                success: false,
                error: 'Failed to update member role',
                message: updateError.message
            });
        }

        res.json({
            success: true,
            message: 'Member role updated successfully'
        });
    } catch (error) {
        console.error('Update member role error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Remove member from group
 */
const removeGroupMember = async (req, res) => {
    try {
        const { groupId, memberId } = req.params;
        const userId = req.user.id;

        // Check if current user has permission to remove members
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

        // Get target member
        const { data: targetMember, error: targetError } = await supabase
            .from('group_members')
            .select('user_id, role')
            .eq('id', memberId)
            .eq('group_id', groupId)
            .single();

        if (targetError || !targetMember) {
            return res.status(404).json({
                success: false,
                error: 'Member not found',
                message: 'The specified member does not exist in this group'
            });
        }

        // Check permissions
        if (targetMember.role === 'owner') {
            return res.status(400).json({
                success: false,
                error: 'Invalid operation',
                message: 'Cannot remove group owner'
            });
        }

        // Only owners and admins can remove members
        if (!['owner', 'admin'].includes(membership.role)) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You do not have permission to remove members'
            });
        }

        // Regular members can only remove themselves
        if (membership.role === 'member' && targetMember.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You can only remove yourself from the group'
            });
        }

        // Remove member (soft delete)
        const { error: removeError } = await supabase
            .from('group_members')
            .update({ is_active: false })
            .eq('id', memberId);

        if (removeError) {
            console.error('Error removing member:', removeError);
            return res.status(500).json({
                success: false,
                error: 'Failed to remove member',
                message: removeError.message
            });
        }

        res.json({
            success: true,
            message: 'Member removed successfully'
        });
    } catch (error) {
        console.error('Remove group member error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Leave group
 */
const leaveGroup = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        // Check if user is a member
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

        // Owner cannot leave group (must transfer ownership first)
        if (membership.role === 'owner') {
            return res.status(400).json({
                success: false,
                error: 'Invalid operation',
                message: 'Group owner cannot leave group. Transfer ownership first.'
            });
        }

        // Leave group
        const { error: leaveError } = await supabase
            .from('group_members')
            .update({ is_active: false })
            .eq('group_id', groupId)
            .eq('user_id', userId);

        if (leaveError) {
            console.error('Error leaving group:', leaveError);
            return res.status(500).json({
                success: false,
                error: 'Failed to leave group',
                message: leaveError.message
            });
        }

        res.json({
            success: true,
            message: 'Successfully left the group'
        });
    } catch (error) {
        console.error('Leave group error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

module.exports = {
    getGroupMembers,
    addGroupMember,
    updateMemberRole,
    removeGroupMember,
    leaveGroup
};
