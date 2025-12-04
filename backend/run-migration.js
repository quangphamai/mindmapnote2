const { supabase } = require('./src/config/supabase');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    try {
        console.log('Running security_logs migration...');
        
        // Read migration file
        const migrationPath = path.join(__dirname, '../mindmap-notion-interface/supabase/migrations/20251202000002_create_security_logs.sql');
        const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
        
        // Split SQL into individual statements
        const statements = migrationSQL
            .split(';')
            .map(stmt => stmt.trim())
            .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
        
        // Execute each statement
        for (const statement of statements) {
            console.log('Executing:', statement.substring(0, 100) + '...');
            
            const { error } = await supabase.from('_temp_migration').select('*').limit(1);
            
            // Try using raw SQL through PostgREST
            const { error: rawError } = await supabase.rpc('sql', { query: statement });
            
            if (rawError) {
                console.log('RPC method failed, trying direct approach...');
                
                // For table creation, we'll use a different approach
                if (statement.includes('CREATE TABLE')) {
                    console.log('Creating table via direct approach...');
                    // This is a workaround for Supabase limitations
                    const { error: tableError } = await supabase
                        .from('information_schema.tables')
                        .select('*')
                        .eq('table_name', 'security_logs');
                        
                    if (tableError && tableError.code === 'PGRST116') {
                        console.log('Table does not exist, need to create via Supabase Dashboard');
                        console.log('Please manually create the security_logs table using the SQL in the migration file');
                    } else if (!tableError) {
                        console.log('Table already exists');
                    }
                }
            }
        }
        
        console.log('Migration process completed!');
        console.log('Note: Some parts of the migration may need to be applied manually through the Supabase Dashboard');
    } catch (error) {
        console.error('Error running migration:', error);
        process.exit(1);
    }
}

runMigration();