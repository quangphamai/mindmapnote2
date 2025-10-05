const { supabase } = require('../config/supabase');

/**
 * Tìm kiếm toàn diện với full-text search
 * GET /api/search
 */
const globalSearch = async (req, res) => {
    try {
        const userId = req.user.id;
        const {
            q: query,
            type,
            category_id,
            file_type,
            date_start,
            date_end,
            size_min,
            size_max,
            limit = 20,
            offset = 0,
            sort_by = 'relevance',
            sort_order = 'desc',
            include_content = false,
            fuzzy_search = true
        } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Search query must be at least 2 characters long'
            });
        }

        const searchQuery = query.trim();
        const searchLimit = Math.min(parseInt(limit), 100);
        const searchOffset = Math.max(parseInt(offset), 0);

        // Tạo base query cho documents
        let documentsQuery = supabase
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
            .eq('created_by', userId);

        // Tạo base query cho categories
        let categoriesQuery = supabase
            .from('categories')
            .select('*')
            .eq('created_by', userId);

        // Tạo base query cho groups (nếu có bảng groups)
        let groupsQuery = supabase
            .from('groups')
            .select('*')
            .eq('created_by', userId);

        // Apply filters
        if (type && type !== 'all') {
            if (type === 'document') {
                categoriesQuery = categoriesQuery.eq('id', 'none'); // Exclude categories
                groupsQuery = groupsQuery.eq('id', 'none'); // Exclude groups
            } else if (type === 'category') {
                documentsQuery = documentsQuery.eq('id', 'none'); // Exclude documents
                groupsQuery = groupsQuery.eq('id', 'none'); // Exclude groups
            } else if (type === 'group') {
                documentsQuery = documentsQuery.eq('id', 'none'); // Exclude documents
                categoriesQuery = categoriesQuery.eq('id', 'none'); // Exclude categories
            }
        }

        if (category_id) {
            documentsQuery = documentsQuery.eq('category_id', category_id);
        }

        if (file_type) {
            documentsQuery = documentsQuery.eq('file_type', file_type);
        }

        if (date_start && date_end) {
            documentsQuery = documentsQuery
                .gte('created_at', date_start)
                .lte('created_at', date_end);
            categoriesQuery = categoriesQuery
                .gte('created_at', date_start)
                .lte('created_at', date_end);
        }

        if (size_min && size_max) {
            documentsQuery = documentsQuery
                .gte('file_size', size_min)
                .lte('file_size', size_max);
        }

        // Apply search filters
        const searchFilters = fuzzy_search ? 
            `%${searchQuery}%` : 
            `%${searchQuery}%`;

        // Search in documents
        let documentsResults = [];
        if (type !== 'category' && type !== 'group') {
            const { data: docs, error: docsError } = await documentsQuery
                .or(`title.ilike.${searchFilters},description.ilike.${searchFilters},file_name.ilike.${searchFilters}`)
                .order('created_at', { ascending: sort_order === 'asc' });

            if (docsError) {
                console.error('Documents search error:', docsError);
            } else {
                documentsResults = docs.map(doc => ({
                    id: doc.id,
                    type: 'document',
                    title: doc.title,
                    content: include_content ? doc.content : undefined,
                    description: doc.description,
                    file_name: doc.file_name,
                    file_type: doc.file_type,
                    file_size: doc.file_size,
                    category_id: doc.category_id,
                    category_name: doc.categories?.name,
                    category_color: doc.categories?.color,
                    created_at: doc.created_at,
                    updated_at: doc.updated_at,
                    relevance_score: calculateRelevanceScore(doc, searchQuery)
                }));
            }
        }

        // Search in categories
        let categoriesResults = [];
        if (type !== 'document' && type !== 'group') {
            const { data: cats, error: catsError } = await categoriesQuery
                .or(`name.ilike.${searchFilters},description.ilike.${searchFilters}`)
                .order('created_at', { ascending: sort_order === 'asc' });

            if (catsError) {
                console.error('Categories search error:', catsError);
            } else {
                categoriesResults = cats.map(cat => ({
                    id: cat.id,
                    type: 'category',
                    title: cat.name,
                    description: cat.description,
                    category_id: cat.id,
                    category_name: cat.name,
                    category_color: cat.color,
                    created_at: cat.created_at,
                    updated_at: cat.updated_at,
                    relevance_score: calculateRelevanceScore(cat, searchQuery)
                }));
            }
        }

        // Search in groups (nếu có bảng groups)
        let groupsResults = [];
        if (type !== 'document' && type !== 'category') {
            try {
                const { data: grps, error: grpsError } = await groupsQuery
                    .or(`name.ilike.${searchFilters},description.ilike.${searchFilters}`)
                    .order('created_at', { ascending: sort_order === 'asc' });

                if (grpsError) {
                    console.error('Groups search error:', grpsError);
                } else {
                    groupsResults = grps.map(grp => ({
                        id: grp.id,
                        type: 'group',
                        title: grp.name,
                        description: grp.description,
                        created_at: grp.created_at,
                        updated_at: grp.updated_at,
                        relevance_score: calculateRelevanceScore(grp, searchQuery)
                    }));
                }
            } catch (error) {
                // Groups table might not exist, ignore error
                console.log('Groups table not found, skipping groups search');
            }
        }

        // Combine và sort results
        let allResults = [...documentsResults, ...categoriesResults, ...groupsResults];

        // Sort by relevance hoặc field khác
        if (sort_by === 'relevance') {
            allResults.sort((a, b) => (b.relevance_score || 0) - (a.relevance_score || 0));
        } else if (sort_by === 'date') {
            allResults.sort((a, b) => {
                const dateA = new Date(a.created_at);
                const dateB = new Date(b.created_at);
                return sort_order === 'asc' ? dateA - dateB : dateB - dateA;
            });
        } else if (sort_by === 'title') {
            allResults.sort((a, b) => {
                return sort_order === 'asc' ? 
                    a.title.localeCompare(b.title) : 
                    b.title.localeCompare(a.title);
            });
        } else if (sort_by === 'size') {
            allResults.sort((a, b) => {
                const sizeA = a.file_size || 0;
                const sizeB = b.file_size || 0;
                return sort_order === 'asc' ? sizeA - sizeB : sizeB - sizeA;
            });
        }

        // Apply pagination
        const paginatedResults = allResults.slice(searchOffset, searchOffset + searchLimit);

        // Get facets
        const facets = await getSearchFacets(userId, searchQuery);

        // Get suggestions
        const suggestions = await getSearchSuggestions(searchQuery, userId);

        return res.status(200).json({
            success: true,
            results: paginatedResults,
            total: allResults.length,
            query: searchQuery,
            filters: {
                type,
                category_id,
                file_type,
                date_range: date_start && date_end ? { start: date_start, end: date_end } : undefined,
                size_range: size_min && size_max ? { min: parseInt(size_min), max: parseInt(size_max) } : undefined
            },
            suggestions,
            facets
        });

    } catch (error) {
        console.error('Global search error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to perform search'
        });
    }
};

/**
 * Tìm kiếm nhanh với autocomplete
 * GET /api/search/quick
 */
const quickSearch = async (req, res) => {
    try {
        const userId = req.user.id;
        const { q: query, limit = 5 } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Search query must be at least 2 characters long'
            });
        }

        const searchQuery = query.trim();
        const searchLimit = Math.min(parseInt(limit), 20);

        // Search documents
        const { data: documents, error: docsError } = await supabase
            .from('documents')
            .select(`
                id,
                title,
                description,
                file_name,
                file_type,
                file_size,
                category_id,
                categories:category_id (name, color)
            `)
            .eq('created_by', userId)
            .or(`title.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
            .limit(searchLimit);

        if (docsError) {
            console.error('Quick search documents error:', docsError);
        }

        // Search categories
        const { data: categories, error: catsError } = await supabase
            .from('categories')
            .select('id, name, description, color')
            .eq('created_by', userId)
            .or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`)
            .limit(searchLimit);

        if (catsError) {
            console.error('Quick search categories error:', catsError);
        }

        // Combine results
        const results = [
            ...(documents || []).map(doc => ({
                id: doc.id,
                type: 'document',
                title: doc.title,
                description: doc.description,
                file_name: doc.file_name,
                file_type: doc.file_type,
                file_size: doc.file_size,
                category_name: doc.categories?.name,
                category_color: doc.categories?.color
            })),
            ...(categories || []).map(cat => ({
                id: cat.id,
                type: 'category',
                title: cat.name,
                description: cat.description,
                category_name: cat.name,
                category_color: cat.color
            }))
        ].slice(0, searchLimit);

        return res.status(200).json({
            success: true,
            results
        });

    } catch (error) {
        console.error('Quick search error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to perform quick search'
        });
    }
};

/**
 * Tìm kiếm trong nội dung file
 * GET /api/search/content
 */
const searchInContent = async (req, res) => {
    try {
        const userId = req.user.id;
        const { q: query, file_types, limit = 20 } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Search query must be at least 2 characters long'
            });
        }

        const searchQuery = query.trim();
        const searchLimit = Math.min(parseInt(limit), 50);

        let query_builder = supabase
            .from('documents')
            .select(`
                *,
                categories:category_id (name, color)
            `)
            .eq('created_by', userId)
            .ilike('content', `%${searchQuery}%`);

        // Filter by file types
        if (file_types) {
            const types = file_types.split(',');
            query_builder = query_builder.in('file_type', types);
        }

        const { data, error } = await query_builder.limit(searchLimit);

        if (error) {
            console.error('Content search error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        const results = data.map(doc => ({
            id: doc.id,
            type: 'document',
            title: doc.title,
            content: doc.content,
            description: doc.description,
            file_name: doc.file_name,
            file_type: doc.file_type,
            file_size: doc.file_size,
            category_name: doc.categories?.name,
            category_color: doc.categories?.color,
            created_at: doc.created_at,
            updated_at: doc.updated_at,
            highlight: {
                content: highlightText(doc.content, searchQuery)
            }
        }));

        return res.status(200).json({
            success: true,
            results
        });

    } catch (error) {
        console.error('Content search error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to search in content'
        });
    }
};

/**
 * Lấy search suggestions
 * GET /api/search/suggestions
 */
const getSuggestions = async (req, res) => {
    try {
        const userId = req.user.id;
        const { q: query, limit = 10 } = req.query;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Search query must be at least 2 characters long'
            });
        }

        const searchQuery = query.trim();
        const searchLimit = Math.min(parseInt(limit), 20);

        // Get suggestions from document titles
        const { data: docTitles, error: docsError } = await supabase
            .from('documents')
            .select('title')
            .eq('created_by', userId)
            .ilike('title', `%${searchQuery}%`)
            .limit(searchLimit);

        // Get suggestions from category names
        const { data: catNames, error: catsError } = await supabase
            .from('categories')
            .select('name')
            .eq('created_by', userId)
            .ilike('name', `%${searchQuery}%`)
            .limit(searchLimit);

        const suggestions = new Set();
        
        if (!docsError && docTitles) {
            docTitles.forEach(doc => {
                const words = doc.title.toLowerCase().split(/\s+/);
                words.forEach(word => {
                    if (word.includes(searchQuery.toLowerCase()) && word.length > 2) {
                        suggestions.add(word);
                    }
                });
            });
        }

        if (!catsError && catNames) {
            catNames.forEach(cat => {
                const words = cat.name.toLowerCase().split(/\s+/);
                words.forEach(word => {
                    if (word.includes(searchQuery.toLowerCase()) && word.length > 2) {
                        suggestions.add(word);
                    }
                });
            });
        }

        return res.status(200).json({
            success: true,
            suggestions: Array.from(suggestions).slice(0, searchLimit)
        });

    } catch (error) {
        console.error('Get suggestions error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get suggestions'
        });
    }
};

/**
 * Lấy trending searches
 * GET /api/search/trending
 */
const getTrendingSearches = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 10 } = req.query;
        const searchLimit = Math.min(parseInt(limit), 20);

        // Get trending from search history
        const { data: history, error } = await supabase
            .from('search_history')
            .select('query')
            .eq('user_id', userId)
            .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()) // Last 7 days
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) {
            console.error('Get trending searches error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        // Count query frequency
        const queryCount = {};
        history.forEach(item => {
            queryCount[item.query] = (queryCount[item.query] || 0) + 1;
        });

        // Sort by frequency
        const trending = Object.entries(queryCount)
            .sort(([,a], [,b]) => b - a)
            .slice(0, searchLimit)
            .map(([query]) => query);

        return res.status(200).json({
            success: true,
            trending
        });

    } catch (error) {
        console.error('Get trending searches error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get trending searches'
        });
    }
};

/**
 * Lưu search history
 * POST /api/search/history
 */
const saveSearchHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { query, result_count } = req.body;

        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Search query is required'
            });
        }

        const { error } = await supabase
            .from('search_history')
            .insert({
                user_id: userId,
                query: query.trim(),
                result_count: result_count || 0
            });

        if (error) {
            console.error('Save search history error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Search history saved'
        });

    } catch (error) {
        console.error('Save search history error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to save search history'
        });
    }
};

/**
 * Lấy search history
 * GET /api/search/history
 */
const getSearchHistory = async (req, res) => {
    try {
        const userId = req.user.id;
        const { limit = 20 } = req.query;
        const searchLimit = Math.min(parseInt(limit), 50);

        const { data, error } = await supabase
            .from('search_history')
            .select('query, result_count, created_at')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(searchLimit);

        if (error) {
            console.error('Get search history error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        // Group by query and count
        const historyMap = {};
        data.forEach(item => {
            if (!historyMap[item.query]) {
                historyMap[item.query] = {
                    query: item.query,
                    count: 1,
                    last_searched: item.created_at
                };
            } else {
                historyMap[item.query].count++;
                if (new Date(item.created_at) > new Date(historyMap[item.query].last_searched)) {
                    historyMap[item.query].last_searched = item.created_at;
                }
            }
        });

        const history = Object.values(historyMap)
            .sort((a, b) => new Date(b.last_searched) - new Date(a.last_searched))
            .slice(0, searchLimit);

        return res.status(200).json({
            success: true,
            history
        });

    } catch (error) {
        console.error('Get search history error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to get search history'
        });
    }
};

/**
 * Xóa search history
 * DELETE /api/search/history
 */
const clearSearchHistory = async (req, res) => {
    try {
        const userId = req.user.id;

        const { error } = await supabase
            .from('search_history')
            .delete()
            .eq('user_id', userId);

        if (error) {
            console.error('Clear search history error:', error);
            return res.status(400).json({
                error: 'Bad Request',
                message: error.message
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Search history cleared'
        });

    } catch (error) {
        console.error('Clear search history error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to clear search history'
        });
    }
};

/**
 * Helper function: Tính relevance score
 */
function calculateRelevanceScore(item, query) {
    let score = 0;
    const queryLower = query.toLowerCase();
    
    // Title match (highest weight)
    if (item.title && item.title.toLowerCase().includes(queryLower)) {
        score += 10;
        if (item.title.toLowerCase().startsWith(queryLower)) {
            score += 5; // Bonus for starts with
        }
    }
    
    // Description match
    if (item.description && item.description.toLowerCase().includes(queryLower)) {
        score += 5;
    }
    
    // File name match
    if (item.file_name && item.file_name.toLowerCase().includes(queryLower)) {
        score += 3;
    }
    
    // Content match (if available)
    if (item.content && item.content.toLowerCase().includes(queryLower)) {
        score += 2;
    }
    
    // Exact match bonus
    if (item.title && item.title.toLowerCase() === queryLower) {
        score += 20;
    }
    
    return score;
}

/**
 * Helper function: Highlight text
 */
function highlightText(text, query) {
    if (!text || !query) return text;
    
    const regex = new RegExp(`(${query})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
}

/**
 * Helper function: Get search facets
 */
async function getSearchFacets(userId, query) {
    try {
        // Get category facets
        const { data: categories, error: catsError } = await supabase
            .from('categories')
            .select('id, name, color')
            .eq('created_by', userId);

        // Get file type facets
        const { data: fileTypes, error: typesError } = await supabase
            .from('documents')
            .select('file_type')
            .eq('created_by', userId);

        const facets = {
            categories: categories || [],
            file_types: []
        };

        if (!typesError && fileTypes) {
            const typeCount = {};
            fileTypes.forEach(doc => {
                typeCount[doc.file_type] = (typeCount[doc.file_type] || 0) + 1;
            });
            
            facets.file_types = Object.entries(typeCount).map(([type, count]) => ({
                type,
                count
            }));
        }

        return facets;
    } catch (error) {
        console.error('Get facets error:', error);
        return { categories: [], file_types: [] };
    }
}

/**
 * Helper function: Get search suggestions
 */
async function getSearchSuggestions(query, userId) {
    try {
        const { data: history, error } = await supabase
            .from('search_history')
            .select('query')
            .eq('user_id', userId)
            .ilike('query', `%${query}%`)
            .limit(5);

        if (error) {
            console.error('Get suggestions error:', error);
            return [];
        }

        return history.map(item => item.query);
    } catch (error) {
        console.error('Get suggestions error:', error);
        return [];
    }
}

module.exports = {
    globalSearch,
    quickSearch,
    searchInContent,
    getSuggestions,
    getTrendingSearches,
    saveSearchHistory,
    getSearchHistory,
    clearSearchHistory
};
