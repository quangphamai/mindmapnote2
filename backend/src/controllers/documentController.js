const { supabase } = require('../config/supabase');
const { hasDocumentAccess } = require('../middleware/acl');
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');

/**
 * Cấu hình multer để xử lý upload files
 * Lưu file tạm thời trong memory trước khi upload lên Supabase Storage
 */
const DOCUMENT_SELECT = `
    *,
    categories:category_id (
        id,
        name,
        color,
        description
    )
`;

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

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB max file size
    },
    fileFilter: (req, file, cb) => {
        // Danh sách file types được phép
        const allowedTypes = [
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            'text/plain',
            'text/markdown',
            // Images
            'image/jpeg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/svg+xml',
            // Videos
            'video/mp4',
            'video/webm',
            'video/ogg',
            // Archives
            'application/zip',
            'application/x-rar-compressed',
        ];

        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error(`File type ${file.mimetype} not allowed`), false);
        }
    }
});

/**
 * Upload document
 * POST /api/documents/upload
 */
const uploadDocument = async (req, res) => {
    try {
    const userId = req.user.id;
    const userEmail = req.user.email;
    const { title, description, category_id, group_id, tags } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'No file provided'
            });
        }

        let groupMembership = null;
        if (group_id) {
            const { data: membership, error: membershipError } = await supabase
                .from('group_members')
                .select('role')
                .eq('group_id', group_id)
                .eq('user_id', userId)
                .eq('is_active', true)
                .single();

            if (membershipError || !membership) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'You are not a member of this group'
                });
            }

            groupMembership = membership;
        }

        if (!title || title.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Document title is required'
            });
        }

        // Sanitize file name để tránh ký tự đặc biệt
        const sanitizeFileName = (name) => {
            return name
                .replace(/[^a-zA-Z0-9.-]/g, '_') // Thay thế ký tự đặc biệt bằng _
                .replace(/_+/g, '_') // Gộp nhiều _ liên tiếp thành 1
                .replace(/^_|_$/g, ''); // Xóa _ ở đầu và cuối
        };

        // Tạo file path: userId/categoryId/timestamp_filename
        const timestamp = Date.now();
        const fileExt = path.extname(file.originalname);
        const sanitizedFileName = sanitizeFileName(file.originalname);
        const fileName = `${timestamp}_${sanitizedFileName}`;
        const filePath = category_id 
            ? `${userId}/${category_id}/${fileName}`
            : `${userId}/uncategorized/${fileName}`;

        // Upload file lên Supabase Storage
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, file.buffer, {
                contentType: file.mimetype,
                cacheControl: '3600',
                upsert: false
            });

        if (uploadError) {
            console.error('Storage upload error:', uploadError);
            return res.status(400).json({
                error: 'Upload Failed',
                message: uploadError.message
            });
        }

        // Xác định document type dựa vào mime type
        let documentType = 'document';
        if (file.mimetype.startsWith('image/')) {
            documentType = 'image';
        } else if (file.mimetype.startsWith('video/')) {
            documentType = 'video';
        } else if (file.mimetype === 'application/pdf') {
            documentType = 'pdf';
        }

        // Lưu metadata vào database
        const documentData = {
            title: title.trim(),
            description: description || null,
            file_name: file.originalname,
            file_path: filePath,
            file_size: file.size,
            file_type: fileExt.replace('.', ''),
            mime_type: file.mimetype,
            category_id: category_id || null,
            group_id: group_id || null,
            created_by: userId,
            last_edited_by: userId,
            document_type: documentType,
            tags: tags ? (Array.isArray(tags) ? tags : JSON.parse(tags)) : [],
            metadata: {
                original_name: file.originalname,
                upload_date: new Date().toISOString()
            }
        };

        const { data, error } = await supabase
            .from('documents')
            .insert([documentData])
            .select()
            .single();

        if (error) {
            // Nếu lưu database thất bại, xóa file đã upload
            await supabase.storage.from('documents').remove([filePath]);
            console.error('Database insert error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        if (group_id) {
            const defaultAccess = groupMembership?.role === 'owner' ? 'admin' : 'write';
            const { error: linkError } = await supabase
                .from('group_documents')
                .upsert({
                    group_id,
                    document_id: data.id,
                    access_level: defaultAccess,
                    added_by: userId
                }, { onConflict: 'group_id,document_id' });

            if (linkError) {
                console.error('Error linking document to group:', linkError);
                await supabase
                    .from('documents')
                    .delete()
                    .eq('id', data.id);
                await supabase.storage.from('documents').remove([filePath]);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: 'Document created but failed to link to group'
                });
            }
        }

        // Log activity
        await supabase
            .from('activity_logs')
            .insert([{
                user_id: userId,
                activity_type: 'document_created',
                metadata: { 
                    document_id: data.id, 
                    document_title: data.title,
                    file_type: data.file_type
                }
            }]);

        return res.status(201).json({
            success: true,
            data: data,
            message: 'Document uploaded successfully'
        });

    } catch (error) {
        console.error('Upload document error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to upload document'
        });
    }
};

/**
 * Lấy tất cả documents của user
 * GET /api/documents
 */
const getAllDocuments = async (req, res) => {
    try {
        const userId = req.user.id;
        const { category_id, document_type, search } = req.query;

        const applyFilters = (query) => {
            let q = query;
            if (category_id) {
                q = q.eq('category_id', category_id);
            }
            if (document_type) {
                q = q.eq('document_type', document_type);
            }
            if (search) {
                q = q.ilike('title', `%${search}%`);
            }
            return q;
        };

        const ownQuery = applyFilters(
            supabase
                .from('documents')
                .select(DOCUMENT_SELECT)
                .eq('created_by', userId)
                .order('created_at', { ascending: false })
        );

        const { data: ownDocs, error: ownError } = await ownQuery;
        if (ownError) {
            console.error('Get own documents error:', ownError);
            return res.status(400).json({
                error: 'Bad Request',
                message: ownError.message
            });
        }

        const ownDocIds = new Set((ownDocs || []).map(doc => doc.id));
        const accessibleDocIds = new Set();

        const { data: memberships, error: membershipError } = await supabase
            .from('group_members')
            .select('group_id')
            .eq('user_id', userId)
            .eq('is_active', true);

        if (membershipError) {
            console.error('Fetch memberships error:', membershipError);
            return res.status(500).json({
                error: 'Internal Server Error',
                message: membershipError.message
            });
        }

        const groupIds = (memberships || []).map(m => m.group_id);

        if (groupIds.length) {
            const { data: linkedDocs, error: linkedError } = await supabase
                .from('group_documents')
                .select('document_id')
                .in('group_id', groupIds);

            if (linkedError) {
                if (isMissingTableError(linkedError)) {
                    console.warn('group_documents table missing; skipping shared link lookup');
                } else {
                    console.error('Fetch group document links error:', linkedError);
                    return res.status(500).json({
                        error: 'Internal Server Error',
                        message: linkedError.message
                    });
                }
            }

            linkedDocs?.forEach(entry => accessibleDocIds.add(entry.document_id));

            const { data: inlineDocs, error: inlineError } = await supabase
                .from('documents')
                .select('id')
                .in('group_id', groupIds);

            if (inlineError) {
                console.error('Fetch inline group documents error:', inlineError);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: inlineError.message
                });
            }

            inlineDocs?.forEach(doc => accessibleDocIds.add(doc.id));
        }

        const { data: directAclDocs, error: directAclError } = await supabase
            .from('document_acl')
            .select('document_id')
            .eq('subject_type', 'user')
            .eq('subject_id', userId);

        if (directAclError) {
            if (isMissingTableError(directAclError)) {
                console.warn('document_acl table missing; skipping direct ACL lookup');
            } else {
                console.error('Fetch document ACL (user) error:', directAclError);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: directAclError.message
                });
            }
        }

        directAclDocs?.forEach(entry => accessibleDocIds.add(entry.document_id));

        if (groupIds.length) {
            const { data: groupAclDocs, error: groupAclError } = await supabase
                .from('document_acl')
                .select('document_id')
                .eq('subject_type', 'group')
                .in('subject_id', groupIds);

            if (groupAclError) {
                if (isMissingTableError(groupAclError)) {
                    console.warn('document_acl table missing; skipping group ACL lookup');
                } else {
                    console.error('Fetch document ACL (group) error:', groupAclError);
                    return res.status(500).json({
                        error: 'Internal Server Error',
                        message: groupAclError.message
                    });
                }
            }

            groupAclDocs?.forEach(entry => accessibleDocIds.add(entry.document_id));
        }

        ownDocIds.forEach(id => accessibleDocIds.delete(id));

        let sharedDocs = [];

        if (accessibleDocIds.size) {
            const sharedIds = Array.from(accessibleDocIds);
            const sharedQuery = applyFilters(
                supabase
                    .from('documents')
                    .select(DOCUMENT_SELECT)
                    .in('id', sharedIds)
            );

            const { data: sharedData, error: sharedError } = await sharedQuery;
            if (sharedError) {
                console.error('Fetch shared documents error:', sharedError);
                return res.status(500).json({
                    error: 'Internal Server Error',
                    message: sharedError.message
                });
            }

            if (sharedData?.length) {
                sharedDocs = [];
                for (const doc of sharedData) {
                    const allowed = await hasDocumentAccess(userId, userEmail, doc, 'view');
                    if (allowed) {
                        sharedDocs.push(doc);
                    }
                }
            }
        }

        const allDocuments = [...(ownDocs || []), ...sharedDocs];
        allDocuments.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        return res.status(200).json({
            success: true,
            data: allDocuments,
            count: allDocuments.length
        });

    } catch (error) {
        console.error('Get all documents error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch documents'
        });
    }
};

/**
 * Lấy document theo ID
 * GET /api/documents/:id
 */
const getDocumentById = async (req, res) => {
    try {
    const { id } = req.params;

        const { data, error } = await supabase
            .from('documents')
            .select(DOCUMENT_SELECT)
            .eq('id', id)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Document not found'
                });
            }
            console.error('Get document error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            data: data
        });

    } catch (error) {
        console.error('Get document by ID error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch document'
        });
    }
};

/**
 * Lấy signed URL để download file
 * GET /api/documents/:id/download
 */
const getDownloadUrl = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Kiểm tra quyền truy cập
        const { data: document, error: docError } = await supabase
            .from('documents')
            .select('file_path, is_protected, password_hash')
            .eq('id', id)
            .single();

        if (docError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
            });
        }

        if (document.is_protected && document.password_hash) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Document is password protected'
            });
        }

        // Tạo signed URL (valid trong 1 giờ)
        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUrl(document.file_path, 3600);

        if (error) {
            console.error('Create signed URL error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            data: {
                url: data.signedUrl,
                expiresIn: 3600
            }
        });

    } catch (error) {
        console.error('Get download URL error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to generate download URL'
        });
    }
};

/**
 * Cập nhật document metadata
 * PUT /api/documents/:id
 */
const updateDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, category_id, tags } = req.body;
        const userId = req.user.id;

        const { data: existingDoc, error: checkError } = await supabase
            .from('documents')
            .select('id, created_by, group_id')
            .eq('id', id)
            .single();

        if (checkError || !existingDoc) {
            if (checkError?.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Document not found'
                });
            }
            console.error('Fetch document before update error:', checkError);
            return res.status(400).json({
                error: 'Bad Request',
                message: checkError?.message || 'Failed to fetch document'
            });
        }

        const updateData = {
            last_edited_by: userId
        };
        
        if (title !== undefined) updateData.title = title.trim();
        if (description !== undefined) updateData.description = description;
        if (category_id !== undefined) updateData.category_id = category_id;
        if (tags !== undefined) updateData.tags = tags;

        const { data, error } = await supabase
            .from('documents')
            .update(updateData)
            .eq('id', id)
            .select()
            .single();

        if (error) {
            console.error('Update document error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            data: data,
            message: 'Document updated successfully'
        });

    } catch (error) {
        console.error('Update document error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to update document'
        });
    }
};

/**
 * Đặt mật khẩu bảo vệ tài liệu
 * POST /api/documents/:id/protect
 */
const setDocumentPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;
        const userId = req.user.id;

        if (!password || typeof password !== 'string') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Password is required'
            });
        }

        if (password.length < 6) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Password must be at least 6 characters'
            });
        }

        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

        const { data: existingDoc, error: fetchError } = await supabase
            .from('documents')
            .select('id')
            .eq('id', id)
            .single();

        if (fetchError || !existingDoc) {
            if (fetchError?.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Document not found'
                });
            }
            console.error('Fetch document before protect error:', fetchError);
            return res.status(400).json({
                error: 'Bad Request',
                message: fetchError?.message || 'Failed to fetch document'
            });
        }

        const { data, error } = await supabase
            .from('documents')
            .update({
                is_protected: true,
                password_hash: passwordHash,
                last_edited_by: userId
            })
            .eq('id', id)
            .select('id, is_protected')
            .single();

        if (error) {
            console.error('Set document password error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        await supabase
            .from('activity_logs')
            .insert([{
                user_id: userId,
                activity_type: 'document_password_set',
                metadata: { document_id: id }
            }]);

        return res.status(200).json({
            success: true,
            data,
            message: 'Password protected successfully'
        });

    } catch (error) {
        console.error('Set document password error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to protect document'
        });
    }
};

/**
 * Gỡ mật khẩu bảo vệ tài liệu
 * DELETE /api/documents/:id/protect
 */
const removeDocumentPassword = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        const { data: existingDoc, error: fetchError } = await supabase
            .from('documents')
            .select('id')
            .eq('id', id)
            .single();

        if (fetchError || !existingDoc) {
            if (fetchError?.code === 'PGRST116') {
                return res.status(404).json({
                    error: 'Not Found',
                    message: 'Document not found'
                });
            }
            console.error('Fetch document before remove password error:', fetchError);
            return res.status(400).json({
                error: 'Bad Request',
                message: fetchError?.message || 'Failed to fetch document'
            });
        }

        const { data, error } = await supabase
            .from('documents')
            .update({
                is_protected: false,
                password_hash: null,
                last_edited_by: userId
            })
            .eq('id', id)
            .select('id, is_protected')
            .single();

        if (error) {
            console.error('Remove document password error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        await supabase
            .from('activity_logs')
            .insert([{
                user_id: userId,
                activity_type: 'document_password_removed',
                metadata: { document_id: id }
            }]);

        return res.status(200).json({
            success: true,
            data,
            message: 'Password protection removed'
        });

    } catch (error) {
        console.error('Remove document password error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to remove password'
        });
    }
};

/**
 * Mở khóa tài liệu bằng mật khẩu
 * POST /api/documents/:id/unlock
 */
const unlockDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;
        const userId = req.user.id;

        if (!password || typeof password !== 'string') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Password is required'
            });
        }

        const { data: document, error: docError } = await supabase
            .from('documents')
            .select('password_hash, is_protected, file_path')
            .eq('id', id)
            .single();

        if (docError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
            });
        }

        if (!document.is_protected || !document.password_hash) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Document is not password protected'
            });
        }

        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

        if (passwordHash !== document.password_hash) {
            return res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid password'
            });
        }

        const { data, error } = await supabase.storage
            .from('documents')
            .createSignedUrl(document.file_path, 3600);

        if (error) {
            console.error('Create signed URL error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        await supabase
            .from('activity_logs')
            .insert([{
                user_id: userId,
                activity_type: 'document_unlocked',
                metadata: { document_id: id }
            }]);

        return res.status(200).json({
            success: true,
            data: {
                url: data.signedUrl,
                expiresIn: 3600
            }
        });

    } catch (error) {
        console.error('Unlock document error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to unlock document'
        });
    }
};

/**
 * Xóa document
 * DELETE /api/documents/:id
 */
const deleteDocument = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.id;

        // Lấy thông tin document
        const { data: document, error: getError } = await supabase
            .from('documents')
            .select('file_path, is_protected, password_hash')
            .eq('id', id)
            .single();

        if (getError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
            });
        }

        if (document.is_protected && document.password_hash) {
            const { password } = req.body || {};

            if (!password || typeof password !== 'string') {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Password is required to delete this document'
                });
            }

            const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

            if (passwordHash !== document.password_hash) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Invalid password'
                });
            }
        }

        // Xóa file từ storage
        const { error: storageError } = await supabase.storage
            .from('documents')
            .remove([document.file_path]);

        if (storageError) {
            console.error('Storage delete error:', storageError);
        }

        // Xóa record từ database
        const { error } = await supabase
            .from('documents')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('Delete document error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Document deleted successfully'
        });

    } catch (error) {
        console.error('Delete document error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to delete document'
        });
    }
};

/**
 * Lấy documents theo category (for graph view)
 * GET /api/documents/by-category
 */
const getDocumentsByCategory = async (req, res) => {
    try {
        const userId = req.user.id;

        // Lấy tất cả categories của user
        const { data: categories, error: catError } = await supabase
            .from('categories')
            .select('*')
            .eq('created_by', userId);

        if (catError) {
            console.error('Get categories error:', catError);
            return res.status(400).json({
                error: 'Bad Request',
                message: catError.message
            });
        }

        // Lấy documents nhóm theo category
        const result = await Promise.all(
            categories.map(async (category) => {
                const { data: docs, error: docError } = await supabase
                    .from('documents')
                    .select('id, title, file_type, document_type, created_at')
                    .eq('category_id', category.id)
                    .eq('created_by', userId);

                return {
                    category: category,
                    documents: docs || []
                };
            })
        );

        // Lấy documents không có category
        const { data: uncategorized } = await supabase
            .from('documents')
            .select('id, title, file_type, document_type, created_at')
            .is('category_id', null)
            .eq('created_by', userId);

        return res.status(200).json({
            success: true,
            data: {
                categorized: result,
                uncategorized: uncategorized || []
            }
        });

    } catch (error) {
        console.error('Get documents by category error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch documents'
        });
    }
};

/**
 * Tìm kiếm documents theo tên hoặc tiêu đề
 * GET /api/documents/search?q=keyword
 */
const searchDocuments = async (req, res) => {
    try {
        const userId = req.user?.id; // Có thể bỏ nếu chưa dùng auth
        const { q, type } = req.query;

        if (!q || q.trim() === '') {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Missing search query parameter (q)'
            });
        }

        // Xây dựng truy vấn cơ bản
        let query = supabase
            .from('documents')
            .select(`
                id,
                title,
                description,
                file_name,
                file_type,
                document_type,
                tags,
                updated_at,
                created_by
            `)
            // Tìm trong title hoặc file_name (case-insensitive)
            .or(`title.ilike.%${q}%,file_name.ilike.%${q}%`)
            .order('updated_at', { ascending: false });

        // Lọc theo document type nếu có
        if (type && type !== 'all') {
            query = query.eq('document_type', type);
        }

        // Lọc theo user nếu có auth
        if (userId) {
            query = query.eq('created_by', userId);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Search documents error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            count: data.length,
            data: data.map((doc) => ({
                id: doc.id,
                title: doc.title || doc.file_name,
                content: doc.description || '',
                type: doc.document_type,
                tags: doc.tags || [],
                lastModified: new Date(doc.updated_at).toISOString(),
            })),
        });
    } catch (error) {
        console.error('Search documents error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to search documents'
        });
    }
};

module.exports = {
    upload,
    uploadDocument,
    getAllDocuments,
    getDocumentById,
    getDownloadUrl,
    updateDocument,
    deleteDocument,
    getDocumentsByCategory,
    searchDocuments,
    setDocumentPassword,
    removeDocumentPassword,
    unlockDocument
};

