const express = require('express');
const router = express.Router();
const EmbeddingStatusService = require('../services/embeddingStatusService');
const embeddingQueue = require('../services/embeddingQueue');

/**
 * Lấy trạng thái của một embedding job
 * GET /api/embedding/status/:jobId
 */
router.get('/status/:jobId', async (req, res) => {
    try {
        const { jobId } = req.params;
        const status = await EmbeddingStatusService.getEmbeddingStatus(jobId);
        
        if (!status) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'Embedding job not found'
            });
        }
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching job status:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Lấy trạng thái embedding của một document
 * GET /api/embedding/document/:documentId/status
 */
router.get('/document/:documentId/status', async (req, res) => {
    try {
        const { documentId } = req.params;
        const status = await EmbeddingStatusService.getEmbeddingStatusByDocument(documentId);
        
        if (!status) {
            return res.status(404).json({
                error: 'Not Found',
                message: 'No embedding job found for this document'
            });
        }
        
        res.json({
            success: true,
            data: status
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching document status:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Lấy tất cả embedding jobs đang chờ xử lý
 * GET /api/embedding/jobs/pending
 */
router.get('/jobs/pending', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const jobs = await EmbeddingStatusService.getPendingJobs(parseInt(limit));
        
        res.json({
            success: true,
            data: jobs,
            count: jobs.length
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching pending jobs:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Lấy tất cả embedding jobs đang xử lý
 * GET /api/embedding/jobs/processing
 */
router.get('/jobs/processing', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const jobs = await EmbeddingStatusService.getProcessingJobs();
        
        res.json({
            success: true,
            data: jobs,
            count: jobs.length
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching processing jobs:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Lấy tất cả embedding jobs thất bại
 * GET /api/embedding/jobs/failed
 */
router.get('/jobs/failed', async (req, res) => {
    try {
        const { limit = 20 } = req.query;
        const jobs = await EmbeddingStatusService.getFailedJobs(parseInt(limit));
        
        res.json({
            success: true,
            data: jobs,
            count: jobs.length
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching failed jobs:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Retry một embedding job thất bại
 * POST /api/embedding/jobs/:jobId/retry
 */
router.post('/jobs/:jobId/retry', async (req, res) => {
    try {
        const { jobId } = req.params;
        const success = await EmbeddingStatusService.retryFailedJob(jobId);
        
        if (!success) {
            return res.status(400).json({
                error: 'Bad Request',
                message: 'Failed to retry job. Job may not exist or is not in failed status.'
            });
        }
        
        res.json({
            success: true,
            message: 'Job queued for retry'
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error retrying job:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Lấy thông tin hàng đợi hiện tại
 * GET /api/embedding/queue/info
 */
router.get('/queue/info', async (req, res) => {
    try {
        const queueInfo = embeddingQueue.getQueueInfo();
        
        res.json({
            success: true,
            data: queueInfo
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching queue info:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Lấy thống kê embedding jobs
 * GET /api/embedding/stats
 */
router.get('/stats', async (req, res) => {
    try {
        const stats = await EmbeddingStatusService.getEmbeddingStats();
        
        res.json({
            success: true,
            data: stats
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching stats:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

/**
 * Lấy tất cả embedding jobs của một user
 * GET /api/embedding/jobs/user/:userId
 */
router.get('/jobs/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 50 } = req.query;
        
        // Kiểm tra xem user có quyền xem jobs của userId không
        if (req.user.id !== userId) {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'You can only view your own embedding jobs'
            });
        }
        
        const jobs = await EmbeddingStatusService.getJobsByUser(userId, parseInt(limit));
        
        res.json({
            success: true,
            data: jobs,
            count: jobs.length
        });
    } catch (error) {
        console.error('[EMBEDDING_ROUTES] Error fetching user jobs:', error);
        res.status(500).json({
            error: 'Internal Server Error',
            message: error.message
        });
    }
});

module.exports = router;