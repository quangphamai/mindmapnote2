const { supabase } = require('../config/supabase');

async function createSecurityLogsTable(req, res) {
    try {
        // Since we can't execute DDL directly via API, we'll provide instructions
        // for manual creation through Supabase Dashboard
        
        const sql = `
-- Security logs table for auditing group operations
CREATE TABLE IF NOT EXISTS security_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    details JSONB NOT NULL,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_security_logs_user_id ON security_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_security_logs_event_type ON security_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_security_logs_created_at ON security_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_security_logs_ip_address ON security_logs(ip_address);

-- Enable RLS
ALTER TABLE security_logs ENABLE ROW LEVEL SECURITY;

-- Only system and admins can read security logs
CREATE POLICY "Security logs readable by system" ON security_logs
    FOR SELECT USING (
        auth.jwt() ->> 'role' = 'service_role'
    );

-- Only system can write security logs
CREATE POLICY "Security logs writable by system" ON security_logs
    FOR INSERT WITH CHECK (
        auth.jwt() ->> 'role' = 'service_role'
    );

-- Comment on table
COMMENT ON TABLE security_logs IS 'Audit log for security events and group operations';
COMMENT ON COLUMN security_logs.event_type IS 'Type of security event (e.g., group_access_denied, group_created, member_added)';
COMMENT ON COLUMN security_logs.details IS 'JSON object with event details including group ID, action, and context';
        `;
        
        // Return the SQL and instructions
        res.status(200).json({
            success: true,
            message: 'Please execute the following SQL in your Supabase Dashboard SQL Editor',
            sql: sql,
            instructions: [
                '1. Go to your Supabase Dashboard',
                '2. Navigate to SQL Editor',
                '3. Paste and execute the SQL provided in the "sql" field',
                '4. This will create the security_logs table with proper RLS policies'
            ]
        });
    } catch (error) {
        console.error('Error in createSecurityLogsTable:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            message: error.message
        });
    }
}

module.exports = { createSecurityLogsTable };