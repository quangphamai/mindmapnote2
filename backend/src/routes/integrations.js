const express = require('express');
const router = express.Router();
const googleDriveController = require('../controllers/googleDriveController');
const notionController = require('../controllers/notionController');
const { authenticateUser } = require('../middleware/auth');

// Google Drive Routes
router.post('/google-drive/auth', authenticateUser, googleDriveController.initiateAuth);
router.post('/google-drive/callback', authenticateUser, googleDriveController.handleCallback);
router.get('/google-drive/status', authenticateUser, googleDriveController.checkStatus);
router.delete('/google-drive/disconnect', authenticateUser, googleDriveController.disconnect);
router.get('/google-drive/files', authenticateUser, googleDriveController.listFiles);
router.post('/google-drive/import-file', authenticateUser, googleDriveController.importFile);
router.post('/google-drive/import-batch', authenticateUser, googleDriveController.importBatch);
router.post('/google-drive/import-folder', authenticateUser, googleDriveController.importFolder);
router.get('/google-drive/files/:fileId/preview', authenticateUser, googleDriveController.previewFile);

// Notion Routes
router.post('/notion/connect', authenticateUser, notionController.connect);
router.get('/notion/status', authenticateUser, notionController.checkStatus);
router.delete('/notion/disconnect', authenticateUser, notionController.disconnect);
router.get('/notion/pages', authenticateUser, notionController.listPages);
router.get('/notion/databases', authenticateUser, notionController.listDatabases);
router.get('/notion/pages/:pageId/content', authenticateUser, notionController.getPageContent);
router.post('/notion/databases/:databaseId/query', authenticateUser, notionController.getDatabaseEntries);
router.post('/notion/import-page', authenticateUser, notionController.importPage);
router.post('/notion/import-batch', authenticateUser, notionController.importBatch);
router.post('/notion/import-database', authenticateUser, notionController.importDatabase);
router.post('/notion/search', authenticateUser, notionController.searchPages);

module.exports = router;
