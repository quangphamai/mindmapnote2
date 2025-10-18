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
const { requireDocumentPermission } = require('../middleware/acl');

const { acceptInvite } = require('../controllers/inviteController');

// Tất cả routes đều cần authentication
router.use(authenticateUser);

// Routes cho documents
router.post('/upload', upload.single('file'), uploadDocument);
router.get('/', getAllDocuments);
router.get('/by-category', getDocumentsByCategory);
// Document access routes guarded by ACL middleware
router.get('/:id', requireDocumentPermission('viewer'), getDocumentById);
router.get('/:id/download', requireDocumentPermission('viewer'), getDownloadUrl);
router.put('/:id', requireDocumentPermission('admin'), updateDocument);
router.delete('/:id', requireDocumentPermission('admin'), deleteDocument);

// Invite accept (open to authenticated users)
router.post('/invites/accept', acceptInvite);

module.exports = router;

