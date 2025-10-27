const { supabase } = require('../config/supabase');

const getDashboardSummary = async (req, res) => {
    try {
        const userId = req.user.id;

        const [documentsResult, groupsResult, profileResult, recentDocumentsResult] = await Promise.all([
            supabase
                .from('documents')
                .select('id', { count: 'exact', head: true })
                .eq('created_by', userId),
            supabase
                .from('group_members')
                .select('group_id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_active', true),
            supabase
                .from('profiles')
                .select('streak_count')
                .eq('id', userId)
                .single(),
            supabase
                .from('documents')
                .select('id, title, updated_at, document_type')
                .eq('created_by', userId)
                .order('updated_at', { ascending: false })
                .limit(5)
        ]);

        if (documentsResult.error) {
            console.error('Dashboard documents count error:', documentsResult.error);
        }

        if (groupsResult.error) {
            console.error('Dashboard groups count error:', groupsResult.error);
        }

        if (profileResult.error && profileResult.status !== 406) {
            console.error('Dashboard profile fetch error:', profileResult.error);
        }

        if (recentDocumentsResult.error) {
            console.error('Dashboard recent documents error:', recentDocumentsResult.error);
        }

        return res.status(200).json({
            success: true,
            data: {
                stats: {
                    documentsCount: documentsResult.count || 0,
                    groupsCount: groupsResult.count || 0,
                    streakCount: profileResult.data?.streak_count || 0
                },
                recentDocuments: recentDocumentsResult.data || []
            }
        });
    } catch (error) {
        console.error('Get dashboard summary error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to load dashboard summary'
        });
    }
};

const getDashboardStatistics = async (req, res) => {
    try {
        const userId = req.user.id;

        const [documentsResult, groupsResult] = await Promise.all([
            supabase
                .from('documents')
                .select(`
                    id,
                    title,
                    document_type,
                    file_size,
                    created_at,
                    updated_at,
                    is_protected,
                    categories:category_id (
                        id,
                        name,
                        color
                    )
                `)
                .eq('created_by', userId),
            supabase
                .from('group_members')
                .select('group_id', { count: 'exact', head: true })
                .eq('user_id', userId)
                .eq('is_active', true)
        ]);

        if (documentsResult.error) {
            console.error('Dashboard statistics documents error:', documentsResult.error);
            return res.status(400).json({
                error: 'Bad Request',
                message: documentsResult.error.message
            });
        }

        if (groupsResult.error) {
            console.error('Dashboard statistics groups error:', groupsResult.error);
            return res.status(400).json({
                error: 'Bad Request',
                message: groupsResult.error.message
            });
        }

        const documents = documentsResult.data || [];
        const groupsCount = groupsResult.count || 0;

        const totals = {
            totalDocuments: documents.length,
            protectedDocuments: documents.filter((doc) => doc.is_protected).length,
            storageBytes: documents.reduce((sum, doc) => sum + (doc.file_size || 0), 0),
            activeGroups: groupsCount
        };

        const today = new Date();
        const weeklyActivity = Array.from({ length: 7 }).map((_, index) => {
            const day = new Date(today);
            day.setDate(today.getDate() - (6 - index));
            const dayKey = day.toISOString().slice(0, 10);

            const count = documents.filter((doc) => {
                const createdKey = new Date(doc.created_at).toISOString().slice(0, 10);
                return createdKey === dayKey;
            }).length;

            return {
                date: dayKey,
                documents: count
            };
        });

        const typeMap = new Map();
        documents.forEach((doc) => {
            const typeKey = (doc.document_type || 'other').toLowerCase();
            typeMap.set(typeKey, (typeMap.get(typeKey) || 0) + 1);
        });

        const documentTypes = Array.from(typeMap.entries()).map(([type, count]) => ({
            type,
            count
        }));

        const categoryMap = new Map();
        documents.forEach((doc) => {
            const category = doc.categories;
            const key = category?.id || 'uncategorized';
            if (!categoryMap.has(key)) {
                categoryMap.set(key, {
                    id: category?.id || null,
                    name: category?.name || 'Uncategorized',
                    color: category?.color || null,
                    count: 0
                });
            }
            categoryMap.get(key).count += 1;
        });

        const categories = Array.from(categoryMap.values()).sort((a, b) => b.count - a.count);

        const topDocuments = documents
            .slice()
            .sort((a, b) => {
                const dateA = new Date(a.updated_at || a.created_at).getTime();
                const dateB = new Date(b.updated_at || b.created_at).getTime();
                return dateB - dateA;
            })
            .slice(0, 5)
            .map((doc) => ({
                id: doc.id,
                title: doc.title,
                updated_at: doc.updated_at || doc.created_at,
                document_type: doc.document_type,
                file_size: doc.file_size,
                category: doc.categories
                    ? { id: doc.categories.id, name: doc.categories.name }
                    : null
            }));

        return res.status(200).json({
            success: true,
            data: {
                totals,
                weeklyActivity,
                documentTypes,
                categories,
                topDocuments
            }
        });
    } catch (error) {
        console.error('Get dashboard statistics error:', error);
        return res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to load dashboard statistics'
        });
    }
};

module.exports = {
    getDashboardSummary,
    getDashboardStatistics
};
