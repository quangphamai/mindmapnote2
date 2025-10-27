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
    getDocumentsByCategory,
    setDocumentPassword,
    removeDocumentPassword,
    unlockDocument
} = require('../controllers/documentController');
const { requireDocumentPermission } = require('../middleware/acl');

// Tất cả routes đều cần authentication
router.use(authenticateUser);

// Routes cho documents
router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', getAllDocuments);
router.get('/by-category', getDocumentsByCategory);
// Document access routes guarded by ACL middleware
router.get('/:id', requireDocumentPermission('view'), getDocumentById);
router.get('/:id/download', requireDocumentPermission('view'), getDownloadUrl);
router.put('/:id', requireDocumentPermission('edit'), updateDocument);
router.delete('/:id', requireDocumentPermission('admin'), deleteDocument);
router.post('/:id/protect', requireDocumentPermission('admin'), setDocumentPassword);
router.delete('/:id/protect', requireDocumentPermission('admin'), removeDocumentPassword);
router.post('/:id/unlock', requireDocumentPermission('view'), unlockDocument);

module.exports = router;

