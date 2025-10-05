const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const {
    upload,
    uploadDocument,
    getAllDocuments,
    getDocumentById,
    getDownloadUrl,
    updateDocument,
    deleteDocument,
    getDocumentsByCategory
} = require('../controllers/documentController');

// Tất cả routes đều cần authentication
router.use(authenticateUser);

// Routes cho documents
router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', getAllDocuments);
router.get('/by-category', getDocumentsByCategory);
router.get('/:id', getDocumentById);
router.get('/:id/download', getDownloadUrl);
router.put('/:id', updateDocument);
router.delete('/:id', deleteDocument);

module.exports = router;

