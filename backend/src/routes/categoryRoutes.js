const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const {
  getAllCategories,
  getCategoryById,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoriesByGroup
} = require('../controllers/categoryController');

// Tất cả routes đều cần authentication
router.use(authenticateUser);

// Routes cho categories
router.get('/', getAllCategories);
router.get('/group/:groupId', getCategoriesByGroup);
router.get('/:id', getCategoryById);
router.post('/', createCategory);
router.put('/:id', updateCategory);
router.delete('/:id', deleteCategory);

module.exports = router;
