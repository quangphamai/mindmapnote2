const { supabase } = require('../config/supabase');
const multer = require('multer');
const path = require('path');

/**
 * Cấu hình multer để xử lý upload files
 * Lưu file tạm thời trong memory trước khi upload lên Supabase Storage
 */
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
        const { title, description, category_id, group_id, tags } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'No file provided'
            });
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

        let query = supabase
            .from('documents')
            .select(`
                *,
                categories:category_id (
                    id,
                    name,
                    color
                )
            `)
            .eq('created_by', userId)
            .order('created_at', { ascending: false });

        // Filter by category
        if (category_id) {
            query = query.eq('category_id', category_id);
        }

        // Filter by document type
        if (document_type) {
            query = query.eq('document_type', document_type);
        }

        // Search by title
        if (search) {
            query = query.ilike('title', `%${search}%`);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Get documents error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            data: data,
            count: data.length
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
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('documents')
            .select(`
                *,
                categories:category_id (
                    id,
                    name,
                    color,
                    description
                )
            `)
            .eq('id', id)
            .eq('created_by', userId)
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
            .select('file_path')
            .eq('id', id)
            .eq('created_by', userId)
            .single();

        if (docError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
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

        // Kiểm tra document có tồn tại
        const { data: existingDoc, error: checkError } = await supabase
            .from('documents')
            .select('*')
            .eq('id', id)
            .eq('created_by', userId)
            .single();

        if (checkError || !existingDoc) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
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
            .eq('created_by', userId)
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
            .select('file_path')
            .eq('id', id)
            .eq('created_by', userId)
            .single();

        if (getError || !document) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Document not found'
            });
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
            .eq('id', id)
            .eq('created_by', userId);

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
    searchDocuments
};

