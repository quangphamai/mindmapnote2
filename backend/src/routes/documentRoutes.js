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
const {
    versionUpload,
    getDocumentVersions,
    createDocumentVersion,
    restoreDocumentVersion,
    getDocumentBookmarks,
    addDocumentBookmark,
    updateDocumentBookmark,
    removeDocumentBookmark,
    updateDocumentVisibility
} = require('../controllers/documentVersionController');
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

// Version history routes
router.get('/:id/versions', requireDocumentPermission('view'), getDocumentVersions);
router.post('/:id/versions', requireDocumentPermission('edit'), versionUpload.single('file'), createDocumentVersion);
router.post('/:id/versions/:versionId/restore', requireDocumentPermission('edit'), restoreDocumentVersion);

// Bookmark routes
router.get('/:id/bookmarks', requireDocumentPermission('view'), getDocumentBookmarks);
router.post('/:id/bookmarks', requireDocumentPermission('view'), addDocumentBookmark);
router.put('/:id/bookmarks/:bookmarkId', requireDocumentPermission('view'), updateDocumentBookmark);
router.delete('/:id/bookmarks/:bookmarkId', requireDocumentPermission('view'), removeDocumentBookmark);

// Visibility route
router.patch('/:id/visibility', requireDocumentPermission('admin'), updateDocumentVisibility);

module.exports = router;

