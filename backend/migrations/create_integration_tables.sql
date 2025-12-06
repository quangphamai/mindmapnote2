-- Migration: Create tables for integrations (Google Drive & Notion)

-- Table to store OAuth state tokens for CSRF protection
CREATE TABLE IF NOT EXISTS integration_states (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    state_token VARCHAR(255) NOT NULL UNIQUE,
    integration_type VARCHAR(50) NOT NULL, -- 'google-drive' | 'notion'
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    INDEX idx_state_token (state_token),
    INDEX idx_user_integration_state (user_id, integration_type),
    INDEX idx_expires_at (expires_at)
);

-- Table to store encrypted integration tokens
CREATE TABLE IF NOT EXISTS integration_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    integration_type VARCHAR(50) NOT NULL, -- 'google-drive' | 'notion'
    access_token TEXT NOT NULL, -- Encrypted
    refresh_token TEXT, -- Encrypted, NULL for Notion (uses API key)
    expires_at TIMESTAMPTZ, -- NULL for Notion
    email VARCHAR(255), -- User's email for the integration
    metadata JSONB DEFAULT '{}', -- Additional data (workspace_name, bot_id, etc.)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(user_id, integration_type),
    INDEX idx_user_integration (user_id, integration_type)
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on integration_tokens
CREATE TRIGGER update_integration_tokens_updated_at
    BEFORE UPDATE ON integration_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add RLS policies
ALTER TABLE integration_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only access their own integration states
CREATE POLICY integration_states_user_policy ON integration_states
    FOR ALL
    USING (auth.uid() = user_id);

-- Policy: Users can only access their own integration tokens
CREATE POLICY integration_tokens_user_policy ON integration_tokens
    FOR ALL
    USING (auth.uid() = user_id);

-- Cleanup expired state tokens (run periodically via cron job)
CREATE OR REPLACE FUNCTION cleanup_expired_integration_states()
RETURNS void AS $$
BEGIN
    DELETE FROM integration_states
    WHERE expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT ALL ON integration_states TO authenticated;
GRANT ALL ON integration_tokens TO authenticated;

COMMENT ON TABLE integration_states IS 'Temporary storage for OAuth state tokens (CSRF protection)';
COMMENT ON TABLE integration_tokens IS 'Encrypted storage for integration access/refresh tokens';
COMMENT ON COLUMN integration_tokens.access_token IS 'Encrypted access token or API key';
COMMENT ON COLUMN integration_tokens.refresh_token IS 'Encrypted refresh token (NULL for Notion)';
COMMENT ON COLUMN integration_tokens.metadata IS 'JSON metadata: workspace_name, bot_id, scopes, etc.';
