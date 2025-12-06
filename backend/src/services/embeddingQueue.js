const { supabase } = require('../config/supabase');
const { spawn } = require('child_process');
const path = require('path');

/**
 * Embedding Queue Service
 * Quản lý hàng đợi xử lý embedding cho documents
 * Sử dụng pattern Singleton để đảm bảo chỉ có một instance
 */
class EmbeddingQueue {
    constructor() {
        if (EmbeddingQueue.instance) {
            return EmbeddingQueue.instance;
        }
        
        this.queue = [];
        this.processing = false;
        this.maxConcurrent = 2; // Giới hạn số process chạy cùng lúc
        this.activeJobs = new Set(); // Track đang chạy để tránh trùng lặp
        
        EmbeddingQueue.instance = this;
    }
    
    /**
     * Thêm document vào hàng đợi embedding
     * @param {string} documentId - UUID của document
     * @param {string} priority - Mức độ ưu tiên: 'high', 'normal', 'low'
     * @returns {Promise<string>} - Job ID
     */
    async add(documentId, priority = 'normal') {
        try {
            // Kiểm tra xem document đã có job đang chạy chưa
            if (this.activeJobs.has(documentId)) {
                console.log(`[EMBEDDING_QUEUE] Document ${documentId} already has an active job`);
                return null;
            }
            
            // Tạo embedding job record
            const { data, error } = await supabase.rpc('create_embedding_job', {
                doc_id: documentId
            });
            
            if (error) {
                console.error('[EMBEDDING_QUEUE] Error creating job:', error);
                throw error;
            }
            
            const jobId = data;
            
            // Thêm vào queue
            this.queue.push({
                jobId,
                documentId,
                priority,
                addedAt: Date.now()
            });
            
            // Sort by priority (high > normal > low)
            this.queue.sort((a, b) => {
                const priorityOrder = { high: 3, normal: 2, low: 1 };
                return priorityOrder[b.priority] - priorityOrder[a.priority];
            });
            
            console.log(`[EMBEDDING_QUEUE] Added job ${jobId} for document ${documentId} with priority ${priority}`);
            
            // Start processing if not already
            this.process();
            
            return jobId;
            
        } catch (error) {
            console.error('[EMBEDDING_QUEUE] Error adding to queue:', error);
            throw error;
        }
    }
    
    /**
     * Xử lý hàng đợi embedding
     */
    async process() {
        if (this.processing || this.queue.length === 0) {
            return;
        }
        
        this.processing = true;
        console.log('[EMBEDDING_QUEUE] Starting to process queue');
        
        while (this.queue.length > 0) {
            // Lấy batch jobs để xử lý song song
            const batchSize = Math.min(this.maxConcurrent, this.queue.length);
            const batch = this.queue.splice(0, batchSize);
            
            // Xử lý song song
            await Promise.all(
                batch.map(item => this.processEmbedding(item.jobId, item.documentId))
            );
        }
        
        this.processing = false;
        console.log('[EMBEDDING_QUEUE] Queue processing completed');
    }
    
    /**
     * Xử lý embedding cho một document
     * @param {string} jobId - ID của embedding job
     * @param {string} documentId - ID của document
     */
    async processEmbedding(jobId, documentId) {
        try {
            // Thêm vào active jobs
            this.activeJobs.add(documentId);
            
            // Cập nhật status thành processing
            await supabase.rpc('update_embedding_status', {
                job_id: jobId,
                new_status: 'processing'
            });
            
            console.log(`[EMBEDDING_QUEUE] Starting embedding for document ${documentId} (job: ${jobId})`);
            
            // Chạy embedding process
            const result = await this.runEmbeddingProcess(documentId, jobId);
            
            // Cập nhật status cuối cùng
            if (result.success) {
                await supabase.rpc('update_embedding_status', {
                    job_id: jobId,
                    new_status: 'completed',
                    progress_val: 100
                });
                
                console.log(`[EMBEDDING_QUEUE] ✅ Embedding completed for document ${documentId} (job: ${jobId})`);
                
                // Gửi notification (optional)
                this.notifyEmbeddingComplete(documentId, jobId, true);
                
            } else {
                await supabase.rpc('update_embedding_status', {
                    job_id: jobId,
                    new_status: 'failed',
                    error_msg: result.error
                });
                
                console.error(`[EMBEDDING_QUEUE] ❌ Embedding failed for document ${documentId} (job: ${jobId}):`, result.error);
                
                // Gửi notification (optional)
                this.notifyEmbeddingComplete(documentId, jobId, false, result.error);
            }
            
        } catch (error) {
            console.error(`[EMBEDDING_QUEUE] Exception processing embedding for document ${documentId}:`, error);
            
            // Cập nhật status failed
            await supabase.rpc('update_embedding_status', {
                job_id: jobId,
                new_status: 'failed',
                error_msg: error.message
            });
            
            // Gửi notification (optional)
            this.notifyEmbeddingComplete(documentId, jobId, false, error.message);
            
        } finally {
            // Xóa khỏi active jobs
            this.activeJobs.delete(documentId);
        }
    }
    
    /**
     * Chạy Python embedding process
     * @param {string} documentId - ID của document
     * @param {string} jobId - ID của embedding job
     * @returns {Promise<{success: boolean, error?: string}>}
     */
    runEmbeddingProcess(documentId, jobId) {
        return new Promise((resolve) => {
            try {
                // Lấy đường dẫn Python executable và script
                const pythonExe = process.env.RAG_PYTHON_PATH || 'python';
                const ingestScript = path.resolve(__dirname, '../../../../Embedding_langchain/scripts/ingest_document.py');
                const embeddingCwd = path.resolve(__dirname, '../../../../Embedding_langchain');
                
                // Timeout 5 phút (300 giây)
                const timeoutMs = parseInt(process.env.EMBEDDING_TIMEOUT_MS || '300000', 10);
                
                console.log(`[EMBEDDING_QUEUE] Starting embedding process for document ${documentId}, job ${jobId}`);
                console.log(`[EMBEDDING_QUEUE] Python executable: ${pythonExe}`);
                console.log(`[EMBEDDING_QUEUE] Ingest script: ${ingestScript}`);
                console.log(`[EMBEDDING_QUEUE] Working directory: ${embeddingCwd}`);
                
                // Spawn Python process với arguments: document_id và job_id
                const child = spawn(pythonExe, [ingestScript, documentId, jobId], {
                    cwd: embeddingCwd,
                    env: {
                        ...process.env,
                        PYTHONIOENCODING: 'utf-8',
                        PYTHONUTF8: '1'
                    },
                    stdio: ['pipe', 'pipe', 'pipe']
                });
                
                let stdout = '';
                let stderr = '';
                let timeoutHandle;
                
                // Lắng nghe stdout từ Python
                child.stdout.on('data', (data) => {
                    const chunk = data.toString();
                    console.log(`[EMBEDDING_QUEUE stdout][job:${jobId}]`, chunk);
                    stdout += chunk;
                    
                    // Parse progress information
                    this.parseProgressUpdate(jobId, chunk);
                });
                
                // Lắng nghe stderr từ Python
                child.stderr.on('data', (data) => {
                    const chunk = data.toString();
                    console.error(`[EMBEDDING_QUEUE stderr][job:${jobId}]`, chunk);
                    stderr += chunk;
                });
                
                // Timeout handler
                timeoutHandle = setTimeout(() => {
                    console.error(`[EMBEDDING_QUEUE] TIMEOUT for job ${jobId} after ${timeoutMs}ms`);
                    child.kill();
                    resolve({
                        success: false,
                        error: `Embedding timeout sau ${timeoutMs / 1000}s`
                    });
                }, timeoutMs);
                
                // Xử lý lỗi spawn process
                child.on('error', (err) => {
                    clearTimeout(timeoutHandle);
                    console.error(`[EMBEDDING_QUEUE] Error starting Python process for job ${jobId}:`, err);
                    resolve({
                        success: false,
                        error: `Lỗi khởi động embedding process: ${err.message}`
                    });
                });
                
                // Xử lý khi Python process kết thúc
                child.on('close', (code) => {
                    clearTimeout(timeoutHandle);
                    console.log(`[EMBEDDING_QUEUE] Process closed for job ${jobId} with code:`, code);
                    
                    if (code === 0) {
                        // Thành công
                        resolve({
                            success: true,
                            message: 'Embedding completed successfully'
                        });
                    } else {
                        // Thất bại
                        resolve({
                            success: false,
                            error: stderr || `Process thoát với code ${code}`
                        });
                    }
                });
                
            } catch (error) {
                console.error(`[EMBEDDING_QUEUE] Exception for job ${jobId}:`, error);
                resolve({
                    success: false,
                    error: error.message
                });
            }
        });
    }
    
    /**
     * Parse progress information từ Python stdout
     * @param {string} jobId - ID của embedding job
     * @param {string} output - Output từ Python process
     */
    parseProgressUpdate(jobId, output) {
        try {
            // Python script có thể output progress theo format: PROGRESS:{percentage}:{processed}:{total}
            const progressRegex = /PROGRESS:(\d+):(\d+):(\d+)/g;
            const matches = [...output.matchAll(progressRegex)];
            
            if (matches.length > 0) {
                const lastMatch = matches[matches.length - 1];
                const progress = parseInt(lastMatch[1]);
                const processed = parseInt(lastMatch[2]);
                const total = parseInt(lastMatch[3]);
                
                // Cập nhật progress vào database
                supabase.rpc('update_embedding_progress', {
                    job_id: jobId,
                    progress_val: progress,
                    processed_chunks_val: processed
                }).then(({ error }) => {
                    if (error) {
                        console.error(`[EMBEDDING_QUEUE] Error updating progress for job ${jobId}:`, error);
                    }
                });
            }
        } catch (error) {
            // Ignore parsing errors
        }
    }
    
    /**
     * Gửi notification khi embedding hoàn thành
     * @param {string} documentId - ID của document
     * @param {string} jobId - ID của embedding job
     * @param {boolean} success - Trạng thái thành công/thất bại
     * @param {string} error - Error message nếu thất bại
     */
    notifyEmbeddingComplete(documentId, jobId, success, error = null) {
        // Log activity
        supabase
            .from('activity_logs')
            .insert([{
                activity_type: success ? 'embedding_completed' : 'embedding_failed',
                metadata: {
                    document_id: documentId,
                    job_id: jobId,
                    error: error
                }
            }])
            .then(({ error: logError }) => {
                if (logError) {
                    console.error('[EMBEDDING_QUEUE] Error logging activity:', logError);
                }
            });
        
        // TODO: Implement WebSocket notification
        // io.emit('embedding_complete', {
        //     documentId,
        //     jobId,
        //     success,
        //     error
        // });
    }
    
    /**
     * Lấy thông tin hàng đợi hiện tại
     * @returns {Object} - Thông tin hàng đợi
     */
    getQueueInfo() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            activeJobs: Array.from(this.activeJobs),
            maxConcurrent: this.maxConcurrent
        };
    }
}

// Export singleton instance
const embeddingQueue = new EmbeddingQueue();
module.exports = embeddingQueue;