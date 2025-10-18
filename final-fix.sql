-- FINAL FIX - Correct syntax for PostgreSQL
-- Run this in Supabase SQL Editor

-- Step 1: Add created_by column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE;

-- Step 2: Add is_active column to groups table  
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Step 3: Add updated_at column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 4: Add description column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS description TEXT;

-- Step 5: Add color column to groups table
ALTER TABLE public.groups ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#3b82f6';

-- Step 6: Create search_history table
CREATE TABLE IF NOT EXISTS public.search_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    search_type TEXT DEFAULT 'general',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    result_count INTEGER DEFAULT 0
);

-- Step 7: Enable RLS
ALTER TABLE public.search_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Step 8: Drop existing policies first, then create new ones
DROP POLICY IF EXISTS "Users can view their own search history" ON public.search_history;
CREATE POLICY "Users can view their own search history" ON public.search_history
    FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own search history" ON public.search_history;
CREATE POLICY "Users can insert their own search history" ON public.search_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Step 9: Refresh schema
NOTIFY pgrst, 'reload schema';
