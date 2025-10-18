const { supabase } = require('../config/supabase');

const roleRank = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4
};

function roleAllowed(actual, required) {
    if (!actual || !required) return false;
    return (roleRank[actual] || 0) >= (roleRank[required] || 0);
}

/**
 * Check document permission middleware
 * requiredRole: 'viewer'|'member'|'admin' (maps loosely to view/edit/owner)
 */
const requireDocumentPermission = (requiredRole = 'viewer') => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;
            const docId = req.params.id;

            if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Authentication required' });

            // Fetch document
            const { data: doc, error: docError } = await supabase
                .from('documents')
                .select('id, created_by')
                .eq('id', docId)
                .single();

            if (docError || !doc) return res.status(404).json({ success: false, error: 'Not found', message: 'Document not found' });

            // Owner has full access
            if (doc.created_by === userId) return next();

            // Check group_documents mapping (group-level ACL)
            const { data: groupDoc } = await supabase
                .from('group_documents')
                .select('group_id, access_level')
                .eq('document_id', docId)
                .single();

            if (groupDoc) {
                // Check user's role in that group
                const { data: member } = await supabase
                    .from('group_members')
                    .select('role')
                    .eq('group_id', groupDoc.group_id)
                    .eq('user_id', userId)
                    .eq('is_active', true)
                    .single();

                if (member && roleAllowed(member.role, requiredRole)) return next();
            }

            // Check document-level acl table (optional jsonb field 'acl' on documents)
            const { data: aclRows } = await supabase
                .from('document_acl')
                .select('subject_type, subject_id, role')
                .eq('document_id', docId);

            if (aclRows && aclRows.length > 0) {
                // direct user entries
                const userEntry = aclRows.find(r => r.subject_type === 'user' && r.subject_id === userId);
                if (userEntry && roleAllowed(userEntry.role, requiredRole)) return next();

                // group entries - get user's active groups
                const { data: userGroups } = await supabase
                    .from('group_members')
                    .select('group_id')
                    .eq('user_id', userId)
                    .eq('is_active', true);

                const groupIds = (userGroups || []).map(g => g.group_id);
                const groupEntry = aclRows.find(r => r.subject_type === 'group' && groupIds.includes(r.subject_id));
                if (groupEntry && roleAllowed(groupEntry.role, requiredRole)) return next();
            }

            return res.status(403).json({ success: false, error: 'Forbidden', message: 'You do not have permission to access this document' });
        } catch (err) {
            console.error('ACL middleware error:', err);
            return res.status(500).json({ success: false, error: 'Internal server error', message: err.message });
        }
    };
};

module.exports = { requireDocumentPermission };
