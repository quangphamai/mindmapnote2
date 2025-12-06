const { supabase } = require('../config/supabase');

/**
 * Embedding Status Service
 * Cung cấp các phương thức để truy vấn và quản lý trạng thái của embedding jobs
 */
class EmbeddingStatusService {
    /**
     * Lấy thông tin chi tiết của một embedding job
     * @param {string} jobId - UUID của embedding job
     * @returns {Promise<Object|null>} - Thông tin job hoặc null nếu không tìm thấy
     */
    static async getEmbeddingStatus(jobId) {
        try {
            const { data, error } = await supabase
                .from('embedding_jobs')
                .select('*')
                .eq('id', jobId)
                .single();
            
            if (error) {
                console.error('[EMBEDDING_STATUS] Error fetching job status:', error);
                return null;
            }
            
            return data;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception fetching job status:', error);
            return null;
        }
    }
    
    /**
     * Lấy trạng thái embedding mới nhất của một document
     * @param {string} documentId - UUID của document
     * @returns {Promise<Object|null>} - Thông tin job hoặc null nếu không tìm thấy
     */
    static async getEmbeddingStatusByDocument(documentId) {
        try {
            const { data, error } = await supabase
                .from('embedding_jobs')
                .select('*')
                .eq('document_id', documentId)
                .order('created_at', { ascending: false })
                .limit(1);
            
            if (error) {
                console.error('[EMBEDDING_STATUS] Error fetching document status:', error);
                return null;
            }
            
            return data.length > 0 ? data[0] : null;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception fetching document status:', error);
            return null;
        }
    }
    
    /**
     * Lấy tất cả embedding jobs với trạng thái cụ thể
     * @param {string} status - Trạng thái: 'pending', 'processing', 'completed', 'failed'
     * @param {number} limit - Giới hạn số lượng kết quả
     * @returns {Promise<Array>} - Danh sách embedding jobs
     */
    static async getJobsByStatus(status, limit = 50) {
        try {
            const { data, error } = await supabase
                .from('embedding_jobs')
                .select('*')
                .eq('status', status)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) {
                console.error('[EMBEDDING_STATUS] Error fetching jobs by status:', error);
                return [];
            }
            
            return data;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception fetching jobs by status:', error);
            return [];
        }
    }
    
    /**
     * Lấy tất cả embedding jobs của một user
     * @param {string} userId - UUID của user
     * @param {number} limit - Giới hạn số lượng kết quả
     * @returns {Promise<Array>} - Danh sách embedding jobs
     */
    static async getJobsByUser(userId, limit = 50) {
        try {
            const { data, error } = await supabase
                .from('embedding_jobs')
                .select(`
                    *,
                    documents!inner(
                        user_id
                    )
                `)
                .eq('documents.user_id', userId)
                .order('created_at', { ascending: false })
                .limit(limit);
            
            if (error) {
                console.error('[EMBEDDING_STATUS] Error fetching jobs by user:', error);
                return [];
            }
            
            return data;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception fetching jobs by user:', error);
            return [];
        }
    }
    
    /**
     * Cập nhật trạng thái của embedding job
     * @param {string} jobId - UUID của embedding job
     * @param {string} status - Trạng thái mới
     * @param {string} errorMessage - Error message (nếu có)
     * @param {number} progress - Progress percentage (0-100)
     * @returns {Promise<boolean>} - True nếu cập nhật thành công
     */
    static async updateEmbeddingStatus(jobId, status, errorMessage = null, progress = null) {
        try {
            const { error } = await supabase.rpc('update_embedding_status', {
                job_id: jobId,
                new_status: status,
                error_msg: errorMessage,
                progress_val: progress
            });
            
            if (error) {
                console.error('[EMBEDDING_STATUS] Error updating job status:', error);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception updating job status:', error);
            return false;
        }
    }
    
    /**
     * Cập nhật progress của embedding job
     * @param {string} jobId - UUID của embedding job
     * @param {number} progress - Progress percentage (0-100)
     * @param {number} processedChunks - Số chunks đã xử lý
     * @returns {Promise<boolean>} - True nếu cập nhật thành công
     */
    static async updateEmbeddingProgress(jobId, progress, processedChunks = null) {
        try {
            const { error } = await supabase.rpc('update_embedding_progress', {
                job_id: jobId,
                progress_val: progress,
                processed_chunks_val: processedChunks
            });
            
            if (error) {
                console.error('[EMBEDDING_STATUS] Error updating job progress:', error);
                return false;
            }
            
            return true;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception updating job progress:', error);
            return false;
        }
    }
    
    /**
     * Lấy thống kê embedding jobs
     * @returns {Promise<Object>} - Thống kê theo trạng thái
     */
    static async getEmbeddingStats() {
        try {
            const { data, error } = await supabase
                .from('embedding_jobs')
                .select('status')
                .order('created_at', { ascending: false });
            
            if (error) {
                console.error('[EMBEDDING_STATUS] Error fetching stats:', error);
                return {
                    total: 0,
                    pending: 0,
                    processing: 0,
                    completed: 0,
                    failed: 0
                };
            }
            
            const stats = {
                total: data.length,
                pending: 0,
                processing: 0,
                completed: 0,
                failed: 0
            };
            
            data.forEach(job => {
                stats[job.status]++;
            });
            
            return stats;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception fetching stats:', error);
            return {
                total: 0,
                pending: 0,
                processing: 0,
                completed: 0,
                failed: 0
            };
        }
    }
    
    /**
     * Lấy các embedding jobs đang xử lý
     * @returns {Promise<Array>} - Danh sách jobs đang xử lý
     */
    static async getProcessingJobs() {
        return this.getJobsByStatus('processing');
    }
    
    /**
     * Lấy các embedding jobs đang chờ xử lý
     * @returns {Promise<Array>} - Danh sách jobs đang chờ
     */
    static async getPendingJobs() {
        return this.getJobsByStatus('pending');
    }
    
    /**
     * Lấy các embedding jobs thất bại
     * @param {number} limit - Giới hạn số lượng kết quả
     * @returns {Promise<Array>} - Danh sách jobs thất bại
     */
    static async getFailedJobs(limit = 20) {
        return this.getJobsByStatus('failed', limit);
    }
    
    /**
     * Retry một embedding job thất bại
     * @param {string} jobId - UUID của embedding job
     * @returns {Promise<boolean>} - True nếu retry thành công
     */
    static async retryFailedJob(jobId) {
        try {
            // Lấy thông tin job
            const job = await this.getEmbeddingStatus(jobId);
            if (!job || job.status !== 'failed') {
                return false;
            }
            
            // Reset status về pending
            const success = await this.updateEmbeddingStatus(jobId, 'pending');
            if (!success) {
                return false;
            }
            
            // Thêm vào queue để xử lý lại
            const embeddingQueue = require('./embeddingQueue');
            await embeddingQueue.add(job.document_id, 'high');
            
            return true;
        } catch (error) {
            console.error('[EMBEDDING_STATUS] Exception retrying job:', error);
            return false;
        }
    }
}

module.exports = EmbeddingStatusService;