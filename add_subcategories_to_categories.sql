-- Migration: Add subcategory support to categories table
-- Run this in Supabase SQL Editor

-- 1. Add new columns for hierarchical structure
ALTER TABLE categories 
ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES categories(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS path TEXT;

-- 2. Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_categories_parent_id ON categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_categories_path ON categories(path);
CREATE INDEX IF NOT EXISTS idx_categories_level ON categories(level);

-- 3. Update existing categories to have level 0 (root categories)
UPDATE categories 
SET level = 0, 
    path = id::text 
WHERE parent_id IS NULL AND level IS NULL;

-- 4. Create function to automatically update level and path
CREATE OR REPLACE FUNCTION update_category_hierarchy()
RETURNS TRIGGER AS $$
BEGIN
  -- If parent_id is NULL, it's a root category
  IF NEW.parent_id IS NULL THEN
    NEW.level := 0;
    NEW.path := NEW.id::text;
  ELSE
    -- Get parent's level and path
    SELECT level + 1, path || '.' || NEW.id::text
    INTO NEW.level, NEW.path
    FROM categories
    WHERE id = NEW.parent_id;
    
    -- If parent not found, treat as root
    IF NEW.level IS NULL THEN
      NEW.level := 0;
      NEW.path := NEW.id::text;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 5. Create trigger to automatically update hierarchy on insert/update
DROP TRIGGER IF EXISTS trigger_update_category_hierarchy ON categories;
CREATE TRIGGER trigger_update_category_hierarchy
  BEFORE INSERT OR UPDATE ON categories
  FOR EACH ROW
  EXECUTE FUNCTION update_category_hierarchy();

-- 6. Add check constraint to prevent circular references
ALTER TABLE categories
ADD CONSTRAINT check_no_self_parent 
CHECK (id != parent_id);

-- 7. Create function to get all descendants of a category
CREATE OR REPLACE FUNCTION get_category_descendants(category_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  parent_id UUID,
  level INTEGER,
  path TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE descendants AS (
    -- Base case: the category itself
    SELECT c.id, c.name, c.parent_id, c.level, c.path
    FROM categories c
    WHERE c.id = category_id
    
    UNION ALL
    
    -- Recursive case: children of current level
    SELECT c.id, c.name, c.parent_id, c.level, c.path
    FROM categories c
    INNER JOIN descendants d ON c.parent_id = d.id
  )
  SELECT * FROM descendants;
END;
$$ LANGUAGE plpgsql;

-- 8. Create function to get category tree (for a specific user)
CREATE OR REPLACE FUNCTION get_category_tree(user_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  color TEXT,
  parent_id UUID,
  level INTEGER,
  path TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    c.id,
    c.name,
    c.description,
    c.color,
    c.parent_id,
    c.level,
    c.path,
    c.created_at,
    c.updated_at
  FROM categories c
  WHERE c.created_by = user_id
  ORDER BY c.path;
END;
$$ LANGUAGE plpgsql;

-- Verification query - uncomment to check results
-- SELECT id, name, parent_id, level, path FROM categories ORDER BY path;

COMMIT;
