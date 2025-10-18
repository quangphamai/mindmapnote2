const { supabase } = require('../config/supabase');
const crypto = require('crypto');

/**
 * Create an invite for a group by email
 * POST /api/groups/:groupId/invites
 */
const createInvite = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { email, role = 'member', expiresInDays = 7 } = req.body;
        const userId = req.user.id;

        if (!email) return res.status(400).json({ success: false, error: 'Validation error', message: 'Email is required' });

        // Check current user's permission (owner/admin)
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();

        if (membershipError || !membership) return res.status(403).json({ success: false, error: 'Access denied', message: 'You are not a member of this group' });
        if (!['owner', 'admin'].includes(membership.role)) return res.status(403).json({ success: false, error: 'Access denied', message: 'You do not have permission to invite' });

        const token = crypto.randomBytes(24).toString('hex');
        const expires_at = new Date(Date.now() + (expiresInDays * 24 * 3600 * 1000)).toISOString();

        const { data, error } = await supabase
            .from('invites')
            .insert([{ group_id: groupId, email: email.toLowerCase(), token, role, invited_by: userId, expires_at }])
            .select()
            .single();

        if (error) {
            console.error('Create invite error:', error);
            return res.status(500).json({ success: false, error: 'Failed to create invite', message: error.message });
        }

        // TODO: send email with link to frontend e.g. /invite/accept?token=...

        return res.status(201).json({ success: true, data: { id: data.id, token: token }, message: 'Invite created' });
    } catch (err) {
        console.error('Create invite exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
};

/**
 * Accept invite by token. If user is logged-in, use req.user. Otherwise require authentication flow.
 * POST /api/invites/accept
 */
const acceptInvite = async (req, res) => {
    try {
        const { token } = req.body;
        const userId = req.user?.id;

        if (!token) return res.status(400).json({ success: false, error: 'Validation error', message: 'Token is required' });

        const { data: invite, error: inviteError } = await supabase
            .from('invites')
            .select('*')
            .eq('token', token)
            .eq('used', false)
            .single();

        if (inviteError || !invite) return res.status(400).json({ success: false, error: 'Invalid token', message: 'Invite not found or already used' });

        if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
            return res.status(400).json({ success: false, error: 'Expired', message: 'Invite token has expired' });
        }

        // If user not logged in, try to find by email in auth.users
        let targetUserId = userId;
        if (!targetUserId) {
            const { data: authUser, error: authError } = await supabase
                .from('auth.users')
                .select('id, email')
                .eq('email', invite.email)
                .single();

            if (authError || !authUser) {
                return res.status(400).json({ success: false, error: 'User not found', message: 'Please sign up or login using the invited email' });
            }
            targetUserId = authUser.id;
        }

        // Add member to group if not already
        const { data: existingMember } = await supabase
            .from('group_members')
            .select('*')
            .eq('group_id', invite.group_id)
            .eq('user_id', targetUserId)
            .single();

        if (!existingMember) {
            const { error: addError } = await supabase
                .from('group_members')
                .insert([{ group_id: invite.group_id, user_id: targetUserId, role: invite.role, invited_by: invite.invited_by }]);

            if (addError) {
                console.error('Add member from invite error:', addError);
                return res.status(500).json({ success: false, error: 'Failed to join group', message: addError.message });
            }
        } else if (!existingMember.is_active) {
            const { error: reactError } = await supabase
                .from('group_members')
                .update({ is_active: true, role: invite.role, joined_at: new Date().toISOString() })
                .eq('id', existingMember.id);

            if (reactError) {
                console.error('Reactivate member error:', reactError);
                return res.status(500).json({ success: false, error: 'Failed to join group', message: reactError.message });
            }
        }

        // Mark invite as used
        const { error: usedError } = await supabase
            .from('invites')
            .update({ used: true })
            .eq('id', invite.id);

        if (usedError) {
            console.error('Mark invite used error:', usedError);
        }

        return res.json({ success: true, message: 'Joined group successfully' });
    } catch (err) {
        console.error('Accept invite exception:', err);
        return res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
    }
};

module.exports = { createInvite, acceptInvite };
