const express = require('express');
const router = express.Router();
const { authenticateUser } = require('../middleware/auth');
const {
    globalSearch,
    quickSearch,
    searchInContent,
    getSuggestions,
    getTrendingSearches,
    saveSearchHistory,
    getSearchHistory,
    clearSearchHistory
} = require('../controllers/searchController');

// Tất cả routes đều cần authentication
router.use(authenticateUser);

// Search routes
router.get('/', globalSearch);                    // GET /api/search - Global search
router.get('/quick', quickSearch);                // GET /api/search/quick - Quick search with autocomplete
router.get('/content', searchInContent);          // GET /api/search/content - Search in file content
router.get('/suggestions', getSuggestions);       // GET /api/search/suggestions - Get search suggestions
router.get('/trending', getTrendingSearches);     // GET /api/search/trending - Get trending searches

// Search history routes
router.post('/history', saveSearchHistory);       // POST /api/search/history - Save search history
router.get('/history', getSearchHistory);         // GET /api/search/history - Get search history
router.delete('/history', clearSearchHistory);    // DELETE /api/search/history - Clear search history

module.exports = router;
