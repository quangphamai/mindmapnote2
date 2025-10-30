const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const { chatRAG } = require('../controllers/ragController');

// Yêu cầu xác thực (Supabase JWT) trước khi sử dụng RAG API
router.use(authenticateUser);

// POST /api/rag/chat - Endpoint để chat với tài liệu qua RAG
router.post('/chat', chatRAG);

module.exports = router;
