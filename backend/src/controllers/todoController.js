const { supabase } = require('../config/supabase');

// Get todos for a specific group
async function getGroupTodos(req, res) {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        
        console.log(`[${timestamp}] 📝 getGroupTodos: Fetching todos for group ${groupId}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Origin: ${req.headers.origin}`);
        
        // Validate UUID format for groupId
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(groupId)) {
            console.log(`[${timestamp}] ❌ Invalid group ID format: ${groupId}`);
            return res.status(400).json({ 
                error: 'Invalid group ID format',
                message: 'Group ID must be a valid UUID'
            });
        }
        
        // Check if user is a member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
            
        if (membershipError || !membership) {
            console.log(`[${timestamp}] ❌ Access denied for user ${userId} to group ${groupId}`);
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }
        
        // Parse query parameters
        const { completed, priority, assigned_to, due_before, due_after, search } = req.query;
        
        let query = supabase
            .from('todos')
            .select('*')
            .eq('group_id', groupId);
            
        // Apply filters
        if (completed !== undefined) {
            query = query.eq('completed', completed === 'true');
        }
        
        if (priority) {
            query = query.eq('priority', priority);
        }
        
        if (assigned_to) {
            query = query.eq('assigned_to', assigned_to);
        }
        
        if (due_before) {
            query = query.lte('due_date', due_before);
        }
        
        if (due_after) {
            query = query.gte('due_date', due_after);
        }
        
        if (search) {
            query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
        }
        
        const { data: todos, error } = await query.order('created_at', { ascending: false });
        
        if (error) {
            const duration = Date.now() - startTime;
            console.error(`[${new Date().toISOString()}] ❌ Error fetching group todos (${duration}ms):`, error);
            return res.status(500).json({ 
                error: 'Failed to fetch todos',
                message: 'Database query failed',
                details: error.message
            });
        }
        
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] ✅ Successfully fetched ${todos.length} todos for group ${groupId} (${duration}ms)`);
        
        res.json(todos);
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] ❌ Error in getGroupTodos (${duration}ms):`, error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'An unexpected error occurred',
            details: error.message
        });
    }
}

// Get todo statistics for a specific group
async function getGroupTodoStats(req, res) {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();
    
    try {
        const { groupId } = req.params;
        const userId = req.user.id;
        
        console.log(`[${timestamp}] 📊 getGroupTodoStats: Fetching stats for group ${groupId}`);
        console.log(`   User ID: ${userId}`);
        console.log(`   Origin: ${req.headers.origin}`);
        
        // Validate UUID format for groupId
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(groupId)) {
            console.log(`[${timestamp}] ❌ Invalid group ID format: ${groupId}`);
            return res.status(400).json({ 
                error: 'Invalid group ID format',
                message: 'Group ID must be a valid UUID'
            });
        }
        
        // Check if user is a member of the group
        const { data: membership, error: membershipError } = await supabase
            .from('group_members')
            .select('id')
            .eq('group_id', groupId)
            .eq('user_id', userId)
            .eq('is_active', true)
            .single();
            
        if (membershipError || !membership) {
            console.log(`[${timestamp}] ❌ Access denied for user ${userId} to group ${groupId}`);
            return res.status(403).json({ 
                error: 'Access denied',
                message: 'You are not a member of this group'
            });
        }
        
        // Get total todos
        const { count: total, error: totalError } = await supabase
            .from('todos')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', groupId);
            
        if (totalError) {
            console.error('Error fetching total todos:', totalError);
            return res.status(500).json({ error: 'Failed to fetch todo stats' });
        }
        
        // Get completed todos
        const { count: completed, error: completedError } = await supabase
            .from('todos')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('completed', true);
            
        if (completedError) {
            console.error('Error fetching completed todos:', completedError);
            return res.status(500).json({ error: 'Failed to fetch todo stats' });
        }
        
        // Get overdue todos
        const { count: overdue, error: overdueError } = await supabase
            .from('todos')
            .select('*', { count: 'exact', head: true })
            .eq('group_id', groupId)
            .eq('completed', false)
            .lt('due_date', new Date().toISOString());
            
        if (overdueError) {
            console.error('Error fetching overdue todos:', overdueError);
            return res.status(500).json({ error: 'Failed to fetch todo stats' });
        }
        
        // Get todos by priority
        const { data: priorityData, error: priorityError } = await supabase
            .from('todos')
            .select('priority')
            .eq('group_id', groupId);
            
        if (priorityError) {
            console.error('Error fetching priority data:', priorityError);
            return res.status(500).json({ error: 'Failed to fetch todo stats' });
        }
        
        const by_priority = {
            low: priorityData?.filter(item => item.priority === 'low').length || 0,
            medium: priorityData?.filter(item => item.priority === 'medium').length || 0,
            high: priorityData?.filter(item => item.priority === 'high').length || 0
        };
        
        const stats = {
            total: total || 0,
            completed: completed || 0,
            pending: (total || 0) - (completed || 0),
            overdue: overdue || 0,
            by_priority
        };
        
        const duration = Date.now() - startTime;
        console.log(`[${new Date().toISOString()}] ✅ Successfully fetched stats for group ${groupId} (${duration}ms)`);
        console.log(`   Total: ${stats.total}, Completed: ${stats.completed}, Pending: ${stats.pending}, Overdue: ${stats.overdue}`);
        
        res.json(stats);
    } catch (error) {
        const duration = Date.now() - startTime;
        console.error(`[${new Date().toISOString()}] ❌ Error in getGroupTodoStats (${duration}ms):`, error);
        res.status(500).json({ 
            error: 'Internal server error',
            message: 'An unexpected error occurred',
            details: error.message
        });
    }
}

module.exports = {
    getGroupTodos,
    getGroupTodoStats
};