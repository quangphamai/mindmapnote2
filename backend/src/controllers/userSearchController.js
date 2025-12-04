const { supabase } = require('../config/supabase');

/**
 * Tìm kiếm người dùng toàn cầu
 * GET /api/users/search
 */
const searchUsers = async (req, res) => {
    try {
        const { q } = req.query;
        const userId = req.user.id;

        if (!q || q.length < 2) {
            return res.status(400).json({
                success: false,
                error: 'Validation error',
                message: 'Search query must be at least 2 characters'
            });
        }

        // Search for users by email or username
        let searchResults = [];
        try {
            // Get all users from auth
            const { data: { users } = {}, error: authError } = await supabase.auth.admin.listUsers();
            if (authError) {
                console.error('Error fetching users from auth:', authError);
                return res.status(500).json({
                    success: false,
                    error: 'Failed to search for users',
                    message: authError.message
                });
            }

            // Filter users based on search query and exclude current user
            searchResults = users.filter(user => {
                if (user.id === userId) return false; // Exclude current user
                
                const emailMatch = user.email?.toLowerCase().includes(q.toLowerCase());
                const metadataMatch = user.user_metadata?.username?.toLowerCase().includes(q.toLowerCase()) ||
                                    user.user_metadata?.full_name?.toLowerCase().includes(q.toLowerCase());
                
                return emailMatch || metadataMatch;
            }).map(user => ({
                id: user.id,
                email: user.email,
                username: user.user_metadata?.username || null,
                full_name: user.user_metadata?.full_name || null,
                avatar_url: user.user_metadata?.avatar_url || null
            }));

            // Limit results to 20
            searchResults = searchResults.slice(0, 20);
        } catch (authErr) {
            console.error('Error calling auth admin API:', authErr);
            return res.status(500).json({
                success: false,
                error: 'Failed to search for users',
                message: authErr.message
            });
        }

        res.json({
            success: true,
            data: searchResults,
            count: searchResults.length
        });
    } catch (error) {
        console.error('Search users error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

module.exports = {
    searchUsers
};