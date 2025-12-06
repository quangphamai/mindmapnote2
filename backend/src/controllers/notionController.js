const { Client } = require('@notionhq/client');
const { NotionToMarkdown } = require('notion-to-md');
const crypto = require('crypto');
const { supabase } = require('../config/supabase');

/**
 * Notion Integration Controller
 * 
 * Handles API key authentication and content import
 */

/**
 * Connect to Notion workspace
 * POST /api/integrations/notion/connect
 */
exports.connect = async (req, res) => {
    try {
        const { apiKey } = req.body;
        const userId = req.user.id;

        if (!apiKey) {
            return res.status(400).json({
                success: false,
                message: 'API key is required'
            });
        }

        // Verify API key by making a test request
        const notion = new Client({ auth: apiKey });
        
        let workspaceName = 'Notion Workspace';
        let botId;
        
        try {
            // Get bot info
            const botInfo = await notion.users.me();
            botId = botInfo.id;
            workspaceName = botInfo.name || workspaceName;
        } catch (error) {
            return res.status(401).json({
                success: false,
                message: 'Invalid Notion API key'
            });
        }

        // Encrypt API key before storing
        const encryptedApiKey = encrypt(apiKey);

        // Store in database
        await supabase
            .from('integration_tokens')
            .upsert({
                user_id: userId,
                integration_type: 'notion',
                access_token: encryptedApiKey,
                metadata: {
                    workspace_name: workspaceName,
                    bot_id: botId
                }
            }, {
                onConflict: 'user_id,integration_type'
            });

        res.json({
            connected: true,
            workspaceName,
            botId
        });
    } catch (error) {
        console.error('Error connecting to Notion:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to connect to Notion'
        });
    }
};

/**
 * Check connection status
 * GET /api/integrations/notion/status
 */
exports.checkStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('integration_tokens')
            .select('metadata')
            .eq('user_id', userId)
            .eq('integration_type', 'notion')
            .single();

        if (error || !data) {
            return res.json({ connected: false });
        }

        res.json({
            connected: true,
            workspaceName: data.metadata?.workspace_name,
            botId: data.metadata?.bot_id
        });
    } catch (error) {
        console.error('Error checking Notion status:', error);
        res.json({ connected: false });
    }
};

/**
 * Disconnect Notion
 * DELETE /api/integrations/notion/disconnect
 */
exports.disconnect = async (req, res) => {
    try {
        const userId = req.user.id;

        await supabase
            .from('integration_tokens')
            .delete()
            .eq('user_id', userId)
            .eq('integration_type', 'notion');

        res.json({ success: true });
    } catch (error) {
        console.error('Error disconnecting Notion:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to disconnect'
        });
    }
};

/**
 * List pages
 * GET /api/integrations/notion/pages?pageSize=50&startCursor=
 */
exports.listPages = async (req, res) => {
    try {
        const userId = req.user.id;
        const { pageSize = 50, startCursor } = req.query;

        const notion = await getNotionClient(userId);

        const response = await notion.search({
            filter: { property: 'object', value: 'page' },
            page_size: parseInt(pageSize),
            start_cursor: startCursor || undefined
        });

        const pages = response.results.map(page => ({
            id: page.id,
            title: extractTitle(page),
            icon: page.icon,
            cover: page.cover,
            createdTime: page.created_time,
            lastEditedTime: page.last_edited_time,
            url: page.url,
            parent: page.parent
        }));

        res.json({
            pages,
            hasMore: response.has_more,
            nextCursor: response.next_cursor
        });
    } catch (error) {
        console.error('Error listing Notion pages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pages'
        });
    }
};

/**
 * List databases
 * GET /api/integrations/notion/databases
 */
exports.listDatabases = async (req, res) => {
    try {
        const userId = req.user.id;
        const notion = await getNotionClient(userId);

        const response = await notion.search({
            filter: { property: 'object', value: 'database' }
        });

        const databases = response.results.map(db => ({
            id: db.id,
            title: extractTitle(db),
            description: db.description,
            icon: db.icon,
            cover: db.cover,
            createdTime: db.created_time,
            lastEditedTime: db.last_edited_time,
            properties: db.properties
        }));

        res.json({ databases });
    } catch (error) {
        console.error('Error listing Notion databases:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch databases'
        });
    }
};

/**
 * Get page content
 * GET /api/integrations/notion/pages/:pageId/content
 */
exports.getPageContent = async (req, res) => {
    try {
        const userId = req.user.id;
        const { pageId } = req.params;

        const notion = await getNotionClient(userId);
        const n2m = new NotionToMarkdown({ notionClient: notion });

        // Get page metadata
        const page = await notion.pages.retrieve({ page_id: pageId });

        // Get all blocks
        const blocks = await getAllBlocks(notion, pageId);

        // Convert to markdown
        const mdblocks = await n2m.pageToMarkdown(pageId);
        const markdown = n2m.toMarkdownString(mdblocks).parent;

        // Extract plain text
        const content = blocks.map(block => extractTextFromBlock(block)).join('\n');

        res.json({
            page: {
                id: page.id,
                title: extractTitle(page),
                icon: page.icon,
                cover: page.cover,
                createdTime: page.created_time,
                lastEditedTime: page.last_edited_time,
                url: page.url,
                parent: page.parent
            },
            blocks,
            content,
            markdown
        });
    } catch (error) {
        console.error('Error getting page content:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch page content'
        });
    }
};

/**
 * Query database entries
 * POST /api/integrations/notion/databases/:databaseId/query
 */
exports.getDatabaseEntries = async (req, res) => {
    try {
        const userId = req.user.id;
        const { databaseId } = req.params;
        const { filter, sorts, pageSize = 50, startCursor } = req.body;

        const notion = await getNotionClient(userId);

        const response = await notion.databases.query({
            database_id: databaseId,
            filter,
            sorts,
            page_size: parseInt(pageSize),
            start_cursor: startCursor || undefined
        });

        res.json({
            entries: response.results,
            hasMore: response.has_more,
            nextCursor: response.next_cursor
        });
    } catch (error) {
        console.error('Error querying database:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to query database'
        });
    }
};

/**
 * Import single page
 * POST /api/integrations/notion/import-page
 */
exports.importPage = async (req, res) => {
    try {
        const userId = req.user.id;
        const { pageId, categoryId, tags, includeSubpages, format = 'markdown' } = req.body;

        const notion = await getNotionClient(userId);
        const n2m = new NotionToMarkdown({ notionClient: notion });

        // Get page content
        const page = await notion.pages.retrieve({ page_id: pageId });
        const title = extractTitle(page);

        // Convert to markdown
        const mdblocks = await n2m.pageToMarkdown(pageId);
        const markdown = n2m.toMarkdownString(mdblocks).parent;

        // Create file content
        let fileContent;
        let fileType;
        let fileName;

        if (format === 'markdown') {
            fileContent = Buffer.from(markdown, 'utf-8');
            fileType = 'text/markdown';
            fileName = `${title}.md`;
        } else {
            // HTML format
            const html = markdownToHtml(markdown);
            fileContent = Buffer.from(html, 'utf-8');
            fileType = 'text/html';
            fileName = `${title}.html`;
        }

        // Upload to Supabase Storage
        const storagePath = `documents/${userId}/${Date.now()}_${fileName}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from('documents')
            .upload(storagePath, fileContent, {
                contentType: fileType,
                cacheControl: '3600'
            });

        if (uploadError) throw uploadError;

        // Create document record
        const { data: document, error: docError } = await supabase
            .from('documents')
            .insert({
                user_id: userId,
                title,
                file_path: storagePath,
                file_type: fileType,
                file_size: fileContent.length,
                category_id: categoryId,
                tags: tags || [],
                metadata: {
                    source: 'notion',
                    original_page_id: pageId,
                    imported_at: new Date().toISOString(),
                    icon: page.icon,
                    cover: page.cover
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
        console.error('Error importing Notion page:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to import page'
        });
    }
};

/**
 * Import multiple pages
 * POST /api/integrations/notion/import-batch
 */
exports.importBatch = async (req, res) => {
    try {
        const { pageIds, categoryId, tags, format } = req.body;

        const results = {
            success: true,
            imported: 0,
            failed: 0,
            documents: [],
            errors: []
        };

        for (const pageId of pageIds) {
            try {
                const mockReq = {
                    ...req,
                    body: { pageId, categoryId, tags, format }
                };
                const mockRes = {
                    json: (data) => {
                        if (data.success) {
                            results.imported++;
                            results.documents.push(data.document);
                        }
                    }
                };
                await exports.importPage(mockReq, mockRes);
            } catch (error) {
                results.failed++;
                results.errors.push({ pageId, error: error.message });
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
 * Import entire database
 * POST /api/integrations/notion/import-database
 */
exports.importDatabase = async (req, res) => {
    try {
        const userId = req.user.id;
        const { databaseId, categoryId, createCategoryFromDatabase, filter } = req.body;

        const notion = await getNotionClient(userId);

        // Get database info
        const database = await notion.databases.retrieve({ database_id: databaseId });
        const dbTitle = extractTitle(database);

        let targetCategoryId = categoryId;

        // Create category if requested
        if (createCategoryFromDatabase) {
            const { data: newCategory } = await supabase
                .from('categories')
                .insert({
                    user_id: userId,
                    name: dbTitle,
                    parent_id: categoryId
                })
                .select()
                .single();
            targetCategoryId = newCategory.id;
        }

        // Query all entries
        const response = await notion.databases.query({
            database_id: databaseId,
            filter
        });

        const results = {
            success: true,
            imported: 0,
            failed: 0,
            documents: [],
            errors: []
        };

        // Import each entry as a page
        for (const entry of response.results) {
            try {
                const mockReq = {
                    ...req,
                    body: {
                        pageId: entry.id,
                        categoryId: targetCategoryId
                    }
                };
                const mockRes = {
                    json: (data) => {
                        if (data.success) {
                            results.imported++;
                            results.documents.push(data.document);
                        }
                    }
                };
                await exports.importPage(mockReq, mockRes);
            } catch (error) {
                results.failed++;
                results.errors.push({ pageId: entry.id, error: error.message });
            }
        }

        res.json(results);
    } catch (error) {
        console.error('Error importing database:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to import database'
        });
    }
};

/**
 * Search pages
 * POST /api/integrations/notion/search
 */
exports.searchPages = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query, filter } = req.body;

        const notion = await getNotionClient(userId);

        const response = await notion.search({
            query,
            filter
        });

        const results = response.results.map(item => ({
            id: item.id,
            title: extractTitle(item),
            icon: item.icon,
            cover: item.cover,
            createdTime: item.created_time,
            lastEditedTime: item.last_edited_time,
            url: item.url,
            parent: item.parent
        }));

        res.json({ results });
    } catch (error) {
        console.error('Error searching Notion:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search pages'
        });
    }
};

/**
 * Helper: Get Notion client
 */
async function getNotionClient(userId) {
    const { data, error } = await supabase
        .from('integration_tokens')
        .select('access_token')
        .eq('user_id', userId)
        .eq('integration_type', 'notion')
        .single();

    if (error || !data) {
        throw new Error('Not connected to Notion');
    }

    const apiKey = decrypt(data.access_token);
    return new Client({ auth: apiKey });
}

/**
 * Helper: Get all blocks recursively
 */
async function getAllBlocks(notion, blockId, blocks = []) {
    const response = await notion.blocks.children.list({
        block_id: blockId,
        page_size: 100
    });

    for (const block of response.results) {
        blocks.push(block);
        if (block.has_children) {
            await getAllBlocks(notion, block.id, blocks);
        }
    }

    return blocks;
}

/**
 * Helper: Extract title from page/database
 */
function extractTitle(page) {
    if (page.properties?.title?.title?.length) {
        return page.properties.title.title[0].plain_text;
    }
    if (page.properties?.Name?.title?.length) {
        return page.properties.Name.title[0].plain_text;
    }
    return 'Untitled';
}

/**
 * Helper: Extract text from block
 */
function extractTextFromBlock(block) {
    const type = block.type;
    if (!block[type]) return '';

    const richText = block[type].rich_text || block[type].text;
    if (!richText) return '';

    return richText.map(rt => rt.plain_text || '').join('');
}

/**
 * Helper: Convert markdown to HTML
 */
function markdownToHtml(markdown) {
    // Basic markdown to HTML conversion
    let html = markdown
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
        .replace(/\*(.*)\*/gim, '<em>$1</em>')
        .replace(/\n/gim, '<br>');

    return `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1, h2, h3 { color: #333; }
    </style>
</head>
<body>
    ${html}
</body>
</html>`;
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
