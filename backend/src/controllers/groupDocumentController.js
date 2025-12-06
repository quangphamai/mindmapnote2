const { supabase } = require('../config/supabase');
const { hasDocumentAccess } = require('../middleware/acl');

/**
 * Log group activity
 * @param {string} groupId - Group ID
 * @param {string} userId - User ID performing the action
 * @param {string} activityType - Type of activity
 * @param {object} metadata - Additional metadata about the activity
 */
const logGroupActivity = async (groupId, userId, activityType, metadata = {}) => {
    try {
        await supabase
            .from('group_activity_logs')
            .insert({
                group_id: groupId,
                user_id: userId,
                activity_type: activityType,
                metadata: metadata
            });
    } catch (error) {
        console.error('Failed to log group activity:', error);
        // Don't throw error to avoid breaking main functionality
    }
};

const DOC_SELECT = `
    *,
    categories:category_id (
        id,
        name,
        color,
        description
    )
`;

const ensureMembership = async (groupId, userId, allowedRoles = ['viewer', 'member', 'admin', 'owner']) => {
    const { data, error } = await supabase
        .from('group_members')
        .select('role')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .eq('is_active', true)
        .single();

    if (error || !data) {
        return { ok: false, status: 403, message: 'You are not a member of this group' };
    }

    if (!allowedRoles.includes(data.role)) {
        return { ok: false, status: 403, message: 'You do not have permission for this action' };
    }

    return { ok: true, role: data.role };
};

const getGroupDocuments = async (req, res) => {
    try {
        const { groupId } = req.params;
        const userId = req.user.id;

        const membership = await ensureMembership(groupId, userId);
        if (!membership.ok) {
            return res.status(membership.status).json({ success: false, error: 'Access denied', message: membership.message });
        }

        const { data: linkDocuments, error: groupDocError } = await supabase
            .from('group_documents')
            .select(`
                document_id,
                access_level,
                document:document_id(${DOC_SELECT})
            `)
            .eq('group_id', groupId);

        if (groupDocError) {
            console.error('Fetch group documents error:', groupDocError);
            return res.status(500).json({ success: false, error: 'Failed to fetch group documents', message: groupDocError.message });
        }

        const linkedDocIds = new Set((linkDocuments || []).map(entry => entry.document_id));

        const { data: inlineDocuments, error: inlineError } = await supabase
            .from('documents')
            .select(DOC_SELECT)
            .eq('group_id', groupId);

        if (inlineError) {
            console.error('Fetch inline group documents error:', inlineError);
            return res.status(500).json({ success: false, error: 'Failed to fetch group documents', message: inlineError.message });
        }

        const combined = [];

        for (const entry of linkDocuments || []) {
            if (!entry.document) continue;
            combined.push({ ...entry.document, access_level: entry.access_level });
        }

        for (const doc of inlineDocuments || []) {
            if (!linkedDocIds.has(doc.id)) {
                combined.push({ ...doc, access_level: 'write' });
            }
        }

        combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return res.json({ success: true, data: combined, count: combined.length });
    } catch (error) {
        console.error('Get group documents exception:', error);
        return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
};

const addGroupDocument = async (req, res) => {
    try {
        const { groupId } = req.params;
    const { documentId, access_level = 'read' } = req.body;
    const userId = req.user.id;
    const userEmail = req.user.email;

        if (!documentId) {
            return res.status(400).json({ success: false, error: 'Validation error', message: 'documentId is required' });
        }

        if (!['read', 'write', 'admin'].includes(access_level)) {
            return res.status(400).json({ success: false, error: 'Validation error', message: 'Invalid access level' });
        }

        const membership = await ensureMembership(groupId, userId, ['owner', 'admin']);
        if (!membership.ok) {
            return res.status(membership.status).json({ success: false, error: 'Access denied', message: membership.message });
        }

        const { data: document, error: docError } = await supabase
            .from('documents')
            .select('id, created_by, group_id')
            .eq('id', documentId)
            .single();

        if (docError || !document) {
            return res.status(404).json({ success: false, error: 'Document not found', message: 'Document does not exist' });
        }

    const canShare = await hasDocumentAccess(userId, userEmail, document, 'admin');
        if (!canShare) {
            return res.status(403).json({ success: false, error: 'Access denied', message: 'You do not have permission to share this document' });
        }

        const { error: upsertError } = await supabase
            .from('group_documents')
            .upsert({
                group_id: groupId,
                document_id: documentId,
                access_level,
                added_by: userId
            }, { onConflict: 'group_id,document_id' });

        if (upsertError) {
            console.error('Add group document error:', upsertError);
            return res.status(500).json({ success: false, error: 'Failed to add document to group', message: upsertError.message });
        }

        const { data: result, error: fetchError } = await supabase
            .from('group_documents')
            .select(`
                document_id,
                access_level,
                document:document_id(${DOC_SELECT})
            `)
            .eq('group_id', groupId)
            .eq('document_id', documentId)
            .single();

        if (fetchError) {
            console.error('Fetch newly added group document error:', fetchError);
            return res.status(500).json({ success: false, error: 'Failed to fetch document', message: fetchError.message });
        }

        // Log activity
        await logGroupActivity(groupId, userId, 'document_added', {
            document_id: documentId,
            document_title: result.document?.title || 'Untitled',
            access_level: access_level
        });

        return res.status(201).json({ success: true, data: { ...result.document, access_level: result.access_level }, message: 'Document added to group' });
    } catch (error) {
        console.error('Add group document exception:', error);
        return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
};

const updateGroupDocumentAccess = async (req, res) => {
    try {
        const { groupId, documentId } = req.params;
        const { access_level } = req.body;
        const userId = req.user.id;

        if (!['read', 'write', 'admin'].includes(access_level)) {
            return res.status(400).json({ success: false, error: 'Validation error', message: 'Invalid access level' });
        }

        const membership = await ensureMembership(groupId, userId, ['owner', 'admin']);
        if (!membership.ok) {
            return res.status(membership.status).json({ success: false, error: 'Access denied', message: membership.message });
        }

        const { data: existing, error: existingError } = await supabase
            .from('group_documents')
            .select('document_id')
            .eq('group_id', groupId)
            .eq('document_id', documentId)
            .single();

        if (existingError || !existing) {
            return res.status(404).json({ success: false, error: 'Not found', message: 'Document is not linked to this group' });
        }

        const { error: updateError } = await supabase
            .from('group_documents')
            .update({ access_level })
            .eq('group_id', groupId)
            .eq('document_id', documentId);

        if (updateError) {
            console.error('Update group document access error:', updateError);
            return res.status(500).json({ success: false, error: 'Failed to update access level', message: updateError.message });
        }

        // Log activity
        await logGroupActivity(groupId, userId, 'document_access_updated', {
            document_id: documentId,
            new_access_level: access_level
        });

        return res.json({ success: true, message: 'Access level updated successfully' });
    } catch (error) {
        console.error('Update group document exception:', error);
        return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
};

const removeGroupDocument = async (req, res) => {
    try {
        const { groupId, documentId } = req.params;
        const userId = req.user.id;

        const membership = await ensureMembership(groupId, userId, ['owner', 'admin']);
        if (!membership.ok) {
            return res.status(membership.status).json({ success: false, error: 'Access denied', message: membership.message });
        }

        const { error: deleteError } = await supabase
            .from('group_documents')
            .delete()
            .eq('group_id', groupId)
            .eq('document_id', documentId);

        if (deleteError) {
            console.error('Remove group document error:', deleteError);
            return res.status(500).json({ success: false, error: 'Failed to remove document from group', message: deleteError.message });
        }

        // Clear inline group reference if matches
        await supabase
            .from('documents')
            .update({ group_id: null })
            .eq('id', documentId)
            .eq('group_id', groupId);

        // Log activity
        await logGroupActivity(groupId, userId, 'document_removed', {
            document_id: documentId
        });

        return res.json({ success: true, message: 'Document removed from group' });
    } catch (error) {
        console.error('Remove group document exception:', error);
        return res.status(500).json({ success: false, error: 'Internal server error', message: error.message });
    }
};

module.exports = {
    getGroupDocuments,
    addGroupDocument,
    updateGroupDocumentAccess,
    removeGroupDocument
};
