/**
 * Document Version & Bookmark Controller
 * Handles version history and page bookmarking for documents
 */
const { supabase } = require('../config/supabase');
const multer = require('multer');
const path = require('path');

// Multer config for version uploads
const versionUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 50 * 1024 * 1024 }
});

// ============================================
// VERSION HISTORY ENDPOINTS
// ============================================

/**
 * Get all versions of a document
 * GET /api/documents/:id/versions
 */
const getDocumentVersions = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Check document exists and user has access
        const { data: document, error: docError } = await supabase
            .from('documents')
            .select('id, created_by, group_id, file_path, file_size, file_name, created_at')
            .eq('id', id)
            .single();

        if (docError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
            });
        }

        // Get all versions
        const { data: versions, error: versionsError } = await supabase
            .from('document_versions')
            .select(`
                id,
                version_number,
                file_path,
                file_size,
                file_name,
                change_description,
                is_current,
                created_at,
                created_by
            `)
            .eq('document_id', id)
            .order('version_number', { ascending: false });

        if (versionsError) {
            console.error('Get versions error:', versionsError);
            return res.status(400).json({
                error: 'Bad Request',
                message: versionsError.message
            });
        }

        // If no versions exist, return the original document as version 0
        const allVersions = versions?.length ? versions : [{
            id: null,
            version_number: 0,
            file_path: document.file_path,
            file_size: document.file_size,
            file_name: document.file_name,
            change_description: 'Original upload',
            is_current: true,
            created_at: document.created_at,
            created_by: document.created_by
        }];

        return res.status(200).json({
            success: true,
            data: allVersions,
            count: allVersions.length
        });

    } catch (error) {
        console.error('Get document versions error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch document versions'
        });
    }
};

/**
 * Upload a new version of a document
 * POST /api/documents/:id/versions
 */
const createDocumentVersion = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { change_description } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'No file provided'
            });
        }

        // Get existing document
        const { data: document, error: docError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .single();

        if (docError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
            });
        }

        // Create file path for new version
        const timestamp = Date.now();
        const fileExt = path.extname(file.originalname);
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileName = `${timestamp}_v_${sanitizedName}`;
        const filePath = document.category_id
            ? `${userId}/${document.category_id}/versions/${fileName}`
            : `${userId}/uncategorized/versions/${fileName}`;

        // Upload new version file to storage
        const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('Version upload error:', uploadError);
            return res.status(400).json({
                error: 'Upload Failed',
                message: uploadError.message
            });
        }

        // Create version record (trigger will auto-set version_number)
        const { data: version, error: versionError } = await supabase
            .from('document_versions')
            .insert({
                document_id: id,
                file_path: filePath,
                file_size: file.size,
                file_name: file.originalname,
                mime_type: file.mimetype,
                created_by: userId,
                change_description: change_description || null
            })
            .select()
            .single();

        if (versionError) {
            // Cleanup uploaded file on error
            await supabase.storage.from('documents').remove([filePath]);
            console.error('Create version error:', versionError);
            return res.status(400).json({
                error: 'Bad Request',
                message: versionError.message
            });
        }

        // Update main document to point to new version
        const { error: updateError } = await supabase
            .from('documents')
            .update({
                file_path: filePath,
                file_size: file.size,
                file_name: file.originalname,
                last_edited_by: userId,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) {
            console.error('Update document after version error:', updateError);
        }

        return res.status(201).json({
            success: true,
            data: version,
            message: 'New version created successfully'
        });

    } catch (error) {
        console.error('Create document version error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to create document version'
        });
    }
};

/**
 * Restore document to a specific version
 * POST /api/documents/:id/versions/:versionId/restore
 */
const restoreDocumentVersion = async (req, res) => {
    try {
        const { id, versionId } = req.params;
        const userId = req.user.id;

        // Get the version to restore
        const { data: version, error: versionError } = await supabase
            .from('document_versions')
            .select('*')
            .eq('id', versionId)
            .eq('document_id', id)
            .single();

        if (versionError || !version) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Version not found'
            });
        }

        // Update document to use this version's file
        const { error: updateError } = await supabase
            .from('documents')
            .update({
                file_path: version.file_path,
                file_size: version.file_size,
                file_name: version.file_name,
                last_edited_by: userId,
                updated_at: new Date().toISOString()
            })
            .eq('id', id);

        if (updateError) {
            console.error('Restore version error:', updateError);
            return res.status(400).json({
                error: 'Bad Request',
                message: updateError.message
            });
        }

        // Mark this version as current
        await supabase
            .from('document_versions')
            .update({ is_current: false })
            .eq('document_id', id);

        await supabase
            .from('document_versions')
            .update({ is_current: true })
            .eq('id', versionId);

        return res.status(200).json({
            success: true,
            message: `Restored to version ${version.version_number}`,
            data: version
        });

    } catch (error) {
        console.error('Restore document version error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to restore document version'
        });
    }
};

// ============================================
// BOOKMARK ENDPOINTS
// ============================================

/**
 * Get all bookmarks for a document (for current user)
 * GET /api/documents/:id/bookmarks
 */
const getDocumentBookmarks = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data: bookmarks, error } = await supabase
            .from('document_bookmarks')
            .select('*')
            .eq('document_id', id)
            .eq('user_id', userId)
            .order('page_number', { ascending: true });

        if (error) {
            console.error('Get bookmarks error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            data: bookmarks || [],
            count: bookmarks?.length || 0
        });

    } catch (error) {
        console.error('Get document bookmarks error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch bookmarks'
        });
    }
};

/**
 * Add a bookmark to a document
 * POST /api/documents/:id/bookmarks
 */
const addDocumentBookmark = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { page_number, title, note, color } = req.body;

        if (!page_number || page_number < 1) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Valid page_number is required'
            });
        }

        // Check document exists
        const { data: document, error: docError } = await supabase
            .from('documents')
            .select('id')
            .eq('id', id)
            .single();

        if (docError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
            });
        }

        // Insert or update bookmark (upsert based on unique constraint)
        const { data: bookmark, error } = await supabase
            .from('document_bookmarks')
            .upsert({
                document_id: id,
                user_id: userId,
                page_number,
                title: title || null,
                note: note || null,
                color: color || '#3B82F6'
            }, {
                onConflict: 'document_id,user_id,page_number'
            })
            .select()
            .single();

        if (error) {
            console.error('Add bookmark error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(201).json({
            success: true,
            data: bookmark,
            message: 'Bookmark added successfully'
        });

    } catch (error) {
        console.error('Add document bookmark error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to add bookmark'
        });
    }
};

/**
 * Update a bookmark
 * PUT /api/documents/:id/bookmarks/:bookmarkId
 */
const updateDocumentBookmark = async (req, res) => {
    try {
        const { id, bookmarkId } = req.params;
        const userId = req.user.id;
        const { title, note, color } = req.body;

        const updateData = {};
        if (title !== undefined) updateData.title = title;
        if (note !== undefined) updateData.note = note;
        if (color !== undefined) updateData.color = color;

        const { data: bookmark, error } = await supabase
            .from('document_bookmarks')
            .update(updateData)
            .eq('id', bookmarkId)
            .eq('document_id', id)
            .eq('user_id', userId)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Bookmark not found'
                });
            }
            console.error('Update bookmark error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            data: bookmark,
            message: 'Bookmark updated successfully'
        });

    } catch (error) {
        console.error('Update document bookmark error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update bookmark'
        });
    }
};

/**
 * Remove a bookmark
 * DELETE /api/documents/:id/bookmarks/:bookmarkId
 */
const removeDocumentBookmark = async (req, res) => {
    try {
        const { id, bookmarkId } = req.params;
        const userId = req.user.id;

        const { error } = await supabase
            .from('document_bookmarks')
            .delete()
            .eq('id', bookmarkId)
            .eq('document_id', id)
            .eq('user_id', userId);

        if (error) {
            console.error('Remove bookmark error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Bookmark removed successfully'
        });

    } catch (error) {
        console.error('Remove document bookmark error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to remove bookmark'
        });
    }
};

// ============================================
// VISIBILITY ENDPOINT
// ============================================

/**
 * Update document visibility
 * PATCH /api/documents/:id/visibility
 */
const updateDocumentVisibility = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;
        const { visibility } = req.body;

        const validVisibilities = ['private', 'public', 'shared'];
        if (!visibility || !validVisibilities.includes(visibility)) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'visibility must be one of: private, public, shared'
            });
        }

        const { data: document, error } = await supabase
            .from('documents')
            .update({
                visibility,
                is_public: visibility === 'public',
                last_edited_by: userId
            })
            .eq('id', id)
            .select()
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Document not found'
                });
            }
            console.error('Update visibility error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            data: document,
            message: `Document visibility set to ${visibility}`
        });

    } catch (error) {
        console.error('Update document visibility error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update document visibility'
        });
    }
};

module.exports = {
    versionUpload,
    getDocumentVersions,
    createDocumentVersion,
    restoreDocumentVersion,
    getDocumentBookmarks,
    addDocumentBookmark,
    updateDocumentBookmark,
    removeDocumentBookmark,
    updateDocumentVisibility
};
