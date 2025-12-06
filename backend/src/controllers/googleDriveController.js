const { google } = require('googleapis');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

/**
 * Google Drive Integration Controller
 * 
 * Handles OAuth 2.0 authentication and file operations
 */

// OAuth2 credentials from environment variables
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/integrations/google-drive/callback'
);

// Scopes required for Drive access
const SCOPES = [
    'https://www.googleapis.com/auth/drive.readonly',
    'https://www.googleapis.com/auth/drive.file',
    'https://www.googleapis.com/auth/userinfo.email'
];

/**
 * Initiate OAuth flow
 * POST /api/integrations/google-drive/auth
 */
exports.initiateAuth = async (req, res) => {
    try {
        const { redirectUri } = req.body;
        const userId = req.user.id;

        // Generate state token for CSRF protection
        const state = crypto.randomBytes(32).toString('hex');

        // Store state token in database with expiry (10 minutes)
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await supabase
            .from('integration_states')
            .insert({
                user_id: userId,
                state_token: state,
                integration_type: 'google-drive',
                expires_at: expiresAt.toISOString()
            });

        // Generate authorization URL
        const authUrl = oauth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: SCOPES,
            state: state,
            redirect_uri: redirectUri || process.env.GOOGLE_REDIRECT_URI,
            prompt: 'consent'
        });

        res.json({
            success: true,
            authUrl
        });
    } catch (error) {
        console.error('Error initiating Google Drive auth:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to initiate authentication'
        });
    }
};

/**
 * Handle OAuth callback
 * POST /api/integrations/google-drive/callback
 */
exports.handleCallback = async (req, res) => {
    try {
        const { code, state } = req.body;
        const userId = req.user.id;

        // Verify state token
        const { data: stateData, error: stateError } = await supabase
            .from('integration_states')
            .select('*')
            .eq('state_token', state)
            .eq('user_id', userId)
            .eq('integration_type', 'google-drive')
            .gte('expires_at', new Date().toISOString())
            .single();

        if (stateError || !stateData) {
            return res.status(400).json({
                success: false,
                message: 'Invalid or expired state token'
            });
        }

        // Exchange code for tokens
        const { tokens } = await oauth2Client.getToken(code);
        oauth2Client.setCredentials(tokens);

        // Get user info
        const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
        const { data: userInfo } = await oauth2.userinfo.get();

        // Encrypt tokens before storing
        const encryptedAccessToken = encrypt(tokens.access_token);
        const encryptedRefreshToken = tokens.refresh_token ? encrypt(tokens.refresh_token) : null;

        // Store tokens in database
        await supabase
            .from('integration_tokens')
            .upsert({
                user_id: userId,
                integration_type: 'google-drive',
                access_token: encryptedAccessToken,
                refresh_token: encryptedRefreshToken,
                expires_at: new Date(tokens.expiry_date).toISOString(),
                email: userInfo.email,
                metadata: {
                    scope: tokens.scope,
                    token_type: tokens.token_type
                }
            }, {
                onConflict: 'user_id,integration_type'
            });

        // Delete used state token
        await supabase
            .from('integration_states')
            .delete()
            .eq('state_token', state);

        res.json({ success: true });
    } catch (error) {
        console.error('Error handling Google Drive callback:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to complete authentication'
        });
    }
};

/**
 * Check connection status
 * GET /api/integrations/google-drive/status
 */
exports.checkStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('integration_tokens')
            .select('email, expires_at')
            .eq('user_id', userId)
            .eq('integration_type', 'google-drive')
            .single();

        if (error || !data) {
            return res.json({
                connected: false
            });
        }

        // Check if token is expired
        const isExpired = new Date(data.expires_at) < new Date();

        res.json({
            connected: !isExpired,
            email: data.email
        });
    } catch (error) {
        console.error('Error checking Google Drive status:', error);
        res.json({ connected: false });
    }
};

/**
 * Disconnect Google Drive
 * DELETE /api/integrations/google-drive/disconnect
 */
exports.disconnect = async (req, res) => {
    try {
        const userId = req.user.id;

        await supabase
            .from('integration_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('integration_type', 'google-drive');

        res.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting Google Drive:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect'
        });
    }
};

/**
 * List files from Google Drive
 * GET /api/integrations/google-drive/files?folderId=root&query=
 */
exports.listFiles = async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId = 'root', query, pageSize = 50 } = req.query;

        // Get and refresh tokens
        const auth = await getAuthClient(userId);
        const drive = google.drive({ version: 'v3', auth });

        // Build query
        let q = `'${folderId}' in parents and trashed=false`;
        if (query) {
            q += ` and name contains '${query}'`;
        }

        // Fetch files
        const response = await drive.files.list({
            q,
            pageSize: parseInt(pageSize),
            fields: 'files(id, name, mimeType, size, createdTime, modifiedTime, webViewLink, iconLink, thumbnailLink, parents)',
            orderBy: 'folder,name'
        });

        const items = response.data.files || [];

        // Separate folders and files
        const folders = items
            .filter(item => item.mimeType === 'application/vnd.google-apps.folder')
            .map(folder => ({
                id: folder.id,
                name: folder.name,
                mimeType: folder.mimeType,
                modifiedTime: folder.modifiedTime,
                webViewLink: folder.webViewLink,
                itemCount: 0 // Would need separate API call to count
            }));

        const files = items
            .filter(item => item.mimeType !== 'application/vnd.google-apps.folder')
            .map(file => ({
                id: file.id,
                name: file.name,
                mimeType: file.mimeType,
                size: parseInt(file.size) || 0,
                createdTime: file.createdTime,
                modifiedTime: file.modifiedTime,
                webViewLink: file.webViewLink,
                iconLink: file.iconLink,
                thumbnailLink: file.thumbnailLink,
                parents: file.parents
            }));

        res.json({ files, folders });
    } catch (error) {
        console.error('Error listing Google Drive files:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch files'
        });
    }
};

/**
 * Import single file
 * POST /api/integrations/google-drive/import-file
 */
exports.importFile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fileId, categoryId, tags, convertFormat } = req.body;

        const auth = await getAuthClient(userId);
        const drive = google.drive({ version: 'v3', auth });

        // Get file metadata
        const fileMetadata = await drive.files.get({
            fileId,
            fields: 'id, name, mimeType, size, createdTime, modifiedTime'
        });

        const file = fileMetadata.data;

        // Download file content
        let fileContent;
        let fileName = file.name;
        let mimeType = file.mimeType;

        // Handle Google Workspace files (need export)
        if (file.mimeType.startsWith('application/vnd.google-apps.')) {
            const exportMimeTypes = {
                'application/vnd.google-apps.document': {
                    'pdf': 'application/pdf',
                    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    'default': 'application/pdf'
                },
                'application/vnd.google-apps.spreadsheet': {
                    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    'csv': 'text/csv',
                    'default': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                },
                'application/vnd.google-apps.presentation': {
                    'pdf': 'application/pdf',
                    'pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
                    'default': 'application/pdf'
                }
            };

            const exportConfig = exportMimeTypes[file.mimeType];
            if (exportConfig) {
                mimeType = exportConfig[convertFormat] || exportConfig.default;
                const exportResponse = await drive.files.export({
                    fileId,
                    mimeType
                }, { responseType: 'arraybuffer' });
                fileContent = Buffer.from(exportResponse.data);
                
                // Update filename with correct extension
                const ext = mimeType.split('/').pop().split('.').pop();
                fileName = `${file.name}.${ext}`;
            }
        } else {
            // Regular file download
            const response = await drive.files.get({
                fileId,
                alt: 'media'
            }, { responseType: 'arraybuffer' });
            fileContent = Buffer.from(response.data);
        }

        // Upload to Supabase Storage
        const storagePath = `documents/${userId}/${Date.now()}_${fileName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, fileContent, {
                contentType: mimeType,
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        // Create document record
        const { data: document, error: docError } = await supabase
            .from('documents')
            .insert({
                user_id: userId,
                title: file.name,
                file_path: storagePath,
                file_type: mimeType,
                file_size: fileContent.length,
                category_id: categoryId,
                tags: tags || [],
                metadata: {
                    source: 'google-drive',
                    original_file_id: fileId,
                    imported_at: new Date().toISOString()
                }
            })
            .select()
            .single();

        if (docError) throw docError;

        res.json({
            success: true,
            document
        });
    } catch (error) {
        console.error('Error importing file:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to import file'
        });
    }
};

/**
 * Import multiple files
 * POST /api/integrations/google-drive/import-batch
 */
exports.importBatch = async (req, res) => {
    try {
        const { fileIds, categoryId, tags } = req.body;

        const results = {
            success: true,
            imported: 0,
            failed: 0,
            documents: [],
            errors: []
        };

        for (const fileId of fileIds) {
            try {
                const importResult = await exports.importFile({
                    ...req,
                    body: { fileId, categoryId, tags }
                }, {
                    json: (data) => {
                        if (data.success) {
                            results.imported++;
                            results.documents.push(data.document);
                        }
                    }
                });
            } catch (error) {
                results.failed++;
                results.errors.push({ fileId, error: error.message });
            }
        }

        res.json(results);
    } catch (error) {
        console.error('Error in batch import:', error);
        res.status(500).json({
            success: false,
            message: 'Batch import failed'
        });
    }
};

/**
 * Import folder recursively
 * POST /api/integrations/google-drive/import-folder
 */
exports.importFolder = async (req, res) => {
    try {
        const userId = req.user.id;
        const { folderId, categoryId, createSubcategories } = req.body;

        const auth = await getAuthClient(userId);
        const drive = google.drive({ version: 'v3', auth });

        const results = {
            success: true,
            imported: 0,
            failed: 0,
            documents: [],
            errors: []
        };

        // Recursive function to import folder contents
        async function importFolderContents(currentFolderId, currentCategoryId) {
            const response = await drive.files.list({
                q: `'${currentFolderId}' in parents and trashed=false`,
                fields: 'files(id, name, mimeType)'
            });

            const items = response.data.files || [];

            for (const item of items) {
                if (item.mimeType === 'application/vnd.google-apps.folder') {
                    if (createSubcategories) {
                        // Create subcategory
                        const { data: subCategory } = await supabase
                            .from('categories')
                            .insert({
                                user_id: userId,
                                name: item.name,
                                parent_id: currentCategoryId
                            })
                            .select()
                            .single();

                        await importFolderContents(item.id, subCategory.id);
                    } else {
                        await importFolderContents(item.id, currentCategoryId);
                    }
                } else {
                    // Import file
                    try {
                        const mockReq = {
                            ...req,
                            body: { fileId: item.id, categoryId: currentCategoryId }
                        };
                        const mockRes = {
                            json: (data) => {
                                if (data.success) {
                                    results.imported++;
                                    results.documents.push(data.document);
                                }
                            }
                        };
                        await exports.importFile(mockReq, mockRes);
                    } catch (error) {
                        results.failed++;
                        results.errors.push({ fileId: item.id, error: error.message });
                    }
                }
            }
        }

        await importFolderContents(folderId, categoryId);

        res.json(results);
    } catch (error) {
        console.error('Error importing folder:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to import folder'
        });
    }
};

/**
 * Preview file
 * GET /api/integrations/google-drive/files/:fileId/preview
 */
exports.previewFile = async (req, res) => {
    try {
        const userId = req.user.id;
        const { fileId } = req.params;

        const auth = await getAuthClient(userId);
        const drive = google.drive({ version: 'v3', auth });

        const fileMetadata = await drive.files.get({
            fileId,
            fields: 'id, name, mimeType, size, thumbnailLink, webViewLink'
        });

        res.json({
            content: '',
            metadata: fileMetadata.data
        });
    } catch (error) {
        console.error('Error previewing file:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to preview file'
        });
    }
};

/**
 * Helper: Get authenticated Google API client
 */
async function getAuthClient(userId) {
    // Get tokens from database
    const { data, error } = await supabase
        .from('integration_tokens')
        .select('access_token, refresh_token, expires_at')
        .eq('user_id', userId)
        .eq('integration_type', 'google-drive')
        .single();

    if (error || !data) {
        throw new Error('Not connected to Google Drive');
    }

    // Decrypt tokens
    const accessToken = decrypt(data.access_token);
    const refreshToken = data.refresh_token ? decrypt(data.refresh_token) : null;

    oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
        expiry_date: new Date(data.expires_at).getTime()
    });

    // Auto refresh if needed
    if (new Date(data.expires_at) < new Date()) {
        const { credentials } = await oauth2Client.refreshAccessToken();
        oauth2Client.setCredentials(credentials);

        // Update tokens in database
        await supabase
            .from('integration_tokens')
            .update({
                access_token: encrypt(credentials.access_token),
                expires_at: new Date(credentials.expiry_date).toISOString()
            })
            .eq('user_id', userId)
            .eq('integration_type', 'google-drive');
    }

    return oauth2Client;
}

/**
 * Helper: Encrypt sensitive data
 */
function encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32));
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
}

/**
 * Helper: Decrypt sensitive data
 */
function decrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY || crypto.randomBytes(32));
    const parts = text.split(':');
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
