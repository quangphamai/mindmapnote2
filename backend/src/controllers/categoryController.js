const { supabase } = require('../config/supabase');

/**
 * Lấy tất cả categories của user hiện tại
 * GET /api/categories
 */
const getAllCategories = async (req, res) => {
  try {
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('categories')
      .select('id, name, description, color, group_id, parent_id, level, path, created_by, created_at, updated_at')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get categories error:', error);
      return res.status(400).json({ 
        error: 'Bad Request',
        message: error.message 
      });
    }

    return res.status(200).json({
      success: true,
      data: data,
      count: data.length
    });
  } catch (error) {
    console.error('Get all categories error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch categories' 
    });
  }
};

/**
 * Lấy một category theo ID
 * GET /api/categories/:id
 */
const getCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('created_by', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return res.status(404).json({ 
          error: 'Not Found',
          message: 'Category not found' 
        });
      }
      console.error('Get category error:', error);
      return res.status(400).json({ 
        error: 'Bad Request',
        message: error.message 
      });
    }

    return res.status(200).json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Get category by ID error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch category' 
    });
  }
};

/**
 * Tạo category mới
 * POST /api/categories
 * Body: { name, description?, color?, group_id?, parent_id? }
 */
const createCategory = async (req, res) => {
  try {
    const { name, description, color, group_id, parent_id } = req.body;
    const userId = req.user.id;

    // Validate required fields
    if (!name || name.trim() === '') {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Category name is required' 
      });
    }

    const categoryData = {
      name: name.trim(),
      created_by: userId,
      description: description || null,
      color: color || '#3b82f6',
      group_id: group_id || null,
      parent_id: parent_id || null
    };

    const { data, error } = await supabase
      .from('categories')
      .insert([categoryData])
      .select()
      .single();

    if (error) {
      console.error('Create category error:', error);
      return res.status(400).json({ 
        error: 'Bad Request',
        message: error.message 
      });
    }

    // Log activity
    await supabase
      .from('activity_logs')
      .insert([{
        user_id: userId,
        activity_type: 'category_created',
        metadata: { category_id: data.id, category_name: data.name }
      }]);

    return res.status(201).json({
      success: true,
      data: data,
      message: 'Category created successfully'
    });
  } catch (error) {
    console.error('Create category error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to create category' 
    });
  }
};

/**
 * Cập nhật category
 * PUT /api/categories/:id
 * Body: { name?, description?, color?, group_id?, parent_id? }
 */
const updateCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, color, group_id, parent_id } = req.body;
    const userId = req.user.id;

    // Kiểm tra category có tồn tại và thuộc về user không
    const { data: existingCategory, error: checkError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('created_by', userId)
      .single();

    if (checkError || !existingCategory) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Category not found or you do not have permission to update it' 
      });
    }

    // Chuẩn bị dữ liệu update
    const updateData = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description;
    if (color !== undefined) updateData.color = color;
    if (group_id !== undefined) updateData.group_id = group_id;
    if (parent_id !== undefined) updateData.parent_id = parent_id;

    // Validate name nếu có update
    if (updateData.name && updateData.name === '') {
      return res.status(400).json({ 
        error: 'Bad Request',
        message: 'Category name cannot be empty' 
      });
    }

    const { data, error } = await supabase
      .from('categories')
      .update(updateData)
      .eq('id', id)
      .eq('created_by', userId)
      .select()
      .single();

    if (error) {
      console.error('Update category error:', error);
      return res.status(400).json({ 
        error: 'Bad Request',
        message: error.message 
      });
    }

    return res.status(200).json({
      success: true,
      data: data,
      message: 'Category updated successfully'
    });
  } catch (error) {
    console.error('Update category error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to update category' 
    });
  }
};

/**
 * Xóa category
 * DELETE /api/categories/:id
 */
const deleteCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Kiểm tra category có tồn tại và thuộc về user không
    const { data: existingCategory, error: checkError } = await supabase
      .from('categories')
      .select('*')
      .eq('id', id)
      .eq('created_by', userId)
      .single();

    if (checkError || !existingCategory) {
      return res.status(404).json({ 
        error: 'Not Found',
        message: 'Category not found or you do not have permission to delete it' 
      });
    }

    const { error } = await supabase
      .from('categories')
      .delete()
      .eq('id', id)
      .eq('created_by', userId);

    if (error) {
      console.error('Delete category error:', error);
      return res.status(400).json({ 
        error: 'Bad Request',
        message: error.message 
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Category deleted successfully'
    });
  } catch (error) {
    console.error('Delete category error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to delete category' 
    });
  }
};

/**
 * Lấy categories theo group_id
 * GET /api/categories/group/:groupId
 */
const getCategoriesByGroup = async (req, res) => {
  try {
    const { groupId } = req.params;
    const userId = req.user.id;

    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Get categories by group error:', error);
      return res.status(400).json({ 
        error: 'Bad Request',
        message: error.message 
      });
    }

    return res.status(200).json({
      success: true,
      data: data,
      count: data.length
    });
  } catch (error) {
    console.error('Get categories by group error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Failed to fetch categories' 
    });
  }
};

module.exports = {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoriesByGroup
};
