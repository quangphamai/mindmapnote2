const { supabase } = require('../config/supabase');

/**
 * Group Activity Controller
 * Handles tracking and retrieving group activity history
 */

/**
 * Get activity logs for a specific group
 */
const getGroupActivity = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { 
            page = 1, 
            limit = 20, 
            activityType,
            startDate,
            endDate 
        } = req.query;
        
        const userId = req.user.id;
        
        // Check if user is member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
            
        if (membershipError || !membership) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }
        
        // Build query
        let query = supabase
            .from('group_activity_logs')
            .select(`
                id,
                activity_type,
                user_id,
                metadata,
                created_at,
                users: user_id (
                    id,
                    email,
                    full_name,
                    avatar_url
                )
            `, { count: 'exact' })
            .eq('group_id', groupId)
            .order('created_at', { ascending: false });
            
        // Apply filters
        if (activityType) {
            query = query.eq('activity_type', activityType);
        }
        
        if (startDate) {
            query = query.gte('created_at', startDate);
        }
        
        if (endDate) {
            query = query.lte('created_at', endDate);
        }
        
        // Apply pagination
        const offset = (page - 1) * limit;
        query = query.range(offset, offset + limit - 1);
        
        const { data, error, count } = await query;
        
        if (error) {
            console.error('Error fetching group activity:', error);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch activity logs',
                message: error.message
            });
        }
        
        res.json({
            success: true,
            data: data || [],
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total: count || 0,
                pages: Math.ceil((count || 0) / limit)
            }
        });
    } catch (error) {
        console.error('Get group activity error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Get activity summary for a group
 */
const getGroupActivitySummary = async (req, res) => {
    try {
        const { groupId } = req.params;
        const { days = 30 } = req.query;
        
        const userId = req.user.id;
        
        // Check if user is member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('role')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
            
        if (membershipError || !membership) {
            return res.status(403).json({
                success: false,
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }
        
        // Calculate date range
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(endDate.getDate() - parseInt(days));
        
        // Get activity counts by type
        const { data: activityByType, error: typeError } = await supabase
            .from('group_activity_logs')
            .select('activity_type')
            .eq('group_id', groupId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
            
        if (typeError) {
            console.error('Error fetching activity summary:', typeError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch activity summary',
                message: typeError.message
            });
        }
        
        // Count activities by type
        const activityCounts = {};
        activityByType.forEach(item => {
            activityCounts[item.activity_type] = (activityCounts[item.activity_type] || 0) + 1;
        });
        
        // Get daily activity counts
        const { data: dailyActivity, error: dailyError } = await supabase
            .from('group_activity_logs')
            .select('created_at')
            .eq('group_id', groupId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: true });
            
        if (dailyError) {
            console.error('Error fetching daily activity:', dailyError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch daily activity',
                message: dailyError.message
            });
        }
        
        // Group by day
        const dailyCounts = {};
        dailyActivity.forEach(item => {
            const day = new Date(item.created_at).toISOString().slice(0, 10);
            dailyCounts[day] = (dailyCounts[day] || 0) + 1;
        });
        
        // Get top contributors
        const { data: topContributors, error: contributorsError } = await supabase
            .from('group_activity_logs')
            .select(`
                user_id,
                users: user_id (
                    id,
                    email,
                    full_name,
                    avatar_url
                )
            `)
            .eq('group_id', groupId)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString());
            
        if (contributorsError) {
            console.error('Error fetching top contributors:', contributorsError);
            return res.status(500).json({
                success: false,
                error: 'Failed to fetch top contributors',
                message: contributorsError.message
            });
        }
        
        // Count activities by user
        const userCounts = {};
        topContributors.forEach(item => {
            const userId = item.user_id;
            if (!userCounts[userId]) {
                userCounts[userId] = {
                    user: item.users,
                    count: 0
                };
            }
            userCounts[userId].count++;
        });
        
        // Sort and get top 5
        const sortedContributors = Object.values(userCounts)
            .sort((a, b) => b.count - a.count)
            .slice(0, 5);
        
        res.json({
            success: true,
            data: {
                activityCounts,
                dailyCounts,
                topContributors: sortedContributors,
                period: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    days: parseInt(days)
                }
            }
        });
    } catch (error) {
        console.error('Get group activity summary error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
};

/**
 * Log an activity event
 * This is a helper function to be used by other controllers
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

module.exports = {
    getGroupActivity,
    getGroupActivitySummary,
    logGroupActivity
};