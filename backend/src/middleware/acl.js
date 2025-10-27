const { supabase } = require('../config/supabase');

const memberRoleRank = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4
};

const groupAccessRank = {
    read: 1,
    write: 2,
    admin: 3
};

const permissionRank = {
    view: 1,
    download: 1,
    edit: 2,
    admin: 3
};

const aclRoleRank = {
    view: 1,
    edit: 2,
    admin: 3
};

const shareAccessRank = {
    view: 1,
    download: 1,
    read: 1,
    edit: 2,
    write: 2,
    admin: 3
};

const minMemberRankForPermission = {
    view: 1,
    download: 1,
    edit: 2,
    admin: 3
};

const memberRoleAllows = (memberRole, requiredPermission) => {
    const memberRank = memberRoleRank[memberRole] || 0;
    const requiredRank = minMemberRankForPermission[requiredPermission] || 0;
    return memberRank >= requiredRank;
};

const isMissingTableError = (error) => {
    if (!error) return false;
    const code = error.code || error.hint;
    const rawMessage = error.message || error.details || '';
    const normalizedMessage = typeof rawMessage === 'string' ? rawMessage.toLowerCase() : '';
    return (
        code === '42P01' ||
        code === 'PGRST204' ||
        code === 'PGRST205' ||
        normalizedMessage.includes('does not exist') ||
        normalizedMessage.includes('could not find the table')
    );
};

const groupAccessAllows = (accessLevel, requiredPermission) => {
    const access = groupAccessRank[accessLevel] || 0;
    const needed = permissionRank[requiredPermission] || 0;
    return access >= needed;
};

const aclRoleAllows = (aclRole, requiredPermission) => {
    const aclRank = aclRoleRank[aclRole] || 0;
    const requiredRank = permissionRank[requiredPermission] || 0;
    return aclRank >= requiredRank;
};

const shareAccessAllows = (accessLevel, requiredPermission) => {
    const shareRank = shareAccessRank[accessLevel] || 0;
    const requiredRank = permissionRank[requiredPermission] || 0;
    return shareRank >= requiredRank;
};

const fetchDocument = async (docId) => {
    const { data, error } = await supabase
        .from('documents')
        .select('id, created_by, group_id')
        .eq('id', docId)
        .single();

    if (error) throw error;
    return data;
};

const getUserGroupMemberships = async (userId, groupIds) => {
    if (!groupIds.length) return [];

    const { data, error } = await supabase
        .from('group_members')
        .select('group_id, role')
        .eq('user_id', userId)
        .eq('is_active', true)
        .in('group_id', groupIds);

    if (error) throw error;
    return data || [];
};

const hasDocumentAccess = async (userId, userEmail, document, requiredPermission) => {
    if (document.created_by === userId) return true;

    const groupAccesses = [];

    if (document.group_id) {
        groupAccesses.push({ group_id: document.group_id, access_level: 'write' });
    }

    try {
        const { data: linkedGroups, error: groupDocError } = await supabase
            .from('group_documents')
            .select('group_id, access_level')
            .eq('document_id', document.id);

        if (groupDocError) {
            if (isMissingTableError(groupDocError)) {
                console.warn('group_documents table missing; skipping ACL link resolution');
            } else {
                throw groupDocError;
            }
        }

        if (linkedGroups) groupAccesses.push(...linkedGroups);
    } catch (error) {
        if (!isMissingTableError(error)) {
            throw error;
        }
    }

    if (groupAccesses.length) {
        const groupIds = [...new Set(groupAccesses.map(g => g.group_id))];
        const memberships = await getUserGroupMemberships(userId, groupIds);

        for (const membership of memberships) {
            const access = groupAccesses.find(g => g.group_id === membership.group_id);
            if (access && groupAccessAllows(access.access_level, requiredPermission) && memberRoleAllows(membership.role, requiredPermission)) {
                return true;
            }
        }
    }

    let aclEntries = [];
    try {
        const { data, error: aclError } = await supabase
            .from('document_acl')
            .select('subject_type, subject_id, role')
            .eq('document_id', document.id);

        if (aclError) {
            if (isMissingTableError(aclError)) {
                console.warn('document_acl table missing; skipping fine-grained ACL checks');
            } else {
                throw aclError;
            }
        }

        aclEntries = data || [];
    } catch (error) {
        if (!isMissingTableError(error)) {
            throw error;
        }
    }

    if (aclEntries && aclEntries.length) {
        const direct = aclEntries.find(entry => entry.subject_type === 'user' && entry.subject_id === userId);
        if (direct && aclRoleAllows(direct.role, requiredPermission)) {
            return true;
        }

        const groupEntries = aclEntries.filter(entry => entry.subject_type === 'group');
        if (groupEntries.length) {
            const groupIds = [...new Set(groupEntries.map(entry => entry.subject_id))];
            const memberships = await getUserGroupMemberships(userId, groupIds);

            for (const membership of memberships) {
                const entry = groupEntries.find(e => e.subject_id === membership.group_id);
                if (entry && aclRoleAllows(entry.role, requiredPermission)) {
                    return true;
                }
            }
        }
    }

    if (userEmail || userId) {
        try {
            let shareQuery = supabase
                .from('shared_documents')
                .select('access_level, expires_at, is_active')
                .eq('document_id', document.id)
                .eq('is_active', true);

            if (userEmail && userId) {
                shareQuery = shareQuery.or(`shared_with_email.eq.${userEmail},shared_with_user.eq.${userId}`);
            } else if (userEmail) {
                shareQuery = shareQuery.eq('shared_with_email', userEmail);
            } else {
                shareQuery = shareQuery.eq('shared_with_user', userId);
            }

            const { data: shareEntries, error: shareError } = await shareQuery;

            if (shareError) {
                if (isMissingTableError(shareError)) {
                    console.warn('shared_documents table missing; skipping share permission checks');
                } else {
                    throw shareError;
                }
            }

            if (shareEntries) {
                const now = new Date();
                for (const share of shareEntries) {
                    if (share.expires_at && new Date(share.expires_at) <= now) {
                        continue;
                    }
                    if (shareAccessAllows(share.access_level, requiredPermission)) {
                        return true;
                    }
                }
            }
        } catch (error) {
            if (!isMissingTableError(error)) {
                throw error;
            }
        }
    }

    return false;
};

const requireDocumentPermission = (requiredPermission = 'view') => {
    return async (req, res, next) => {
        try {
            const userId = req.user?.id;
            const userEmail = req.user?.email;
            const docId = req.params.id;

            if (!userId) {
                return res.status(401).json({ success: false, error: 'Unauthorized', message: 'Authentication required' });
            }

            const document = await fetchDocument(docId);
            if (!document) {
                return res.status(404).json({ success: false, error: 'Not Found', message: 'Document not found' });
            }

            const allowed = await hasDocumentAccess(userId, userEmail, document, requiredPermission);
            if (!allowed) {
                return res.status(403).json({ success: false, error: 'Forbidden', message: 'You do not have permission to access this document' });
            }

            return next();
        } catch (error) {
            if (error?.code === 'PGRST116') {
                return res.status(404).json({ success: false, error: 'Not Found', message: 'Document not found' });
            }

            console.error('ACL middleware error:', error);
            return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
        }
    };
};

module.exports = {
    requireDocumentPermission,
    hasDocumentAccess
};
