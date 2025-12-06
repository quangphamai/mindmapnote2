-- Bảng tracking embedding jobs
-- Theo dõi trạng thái của các quá trình embedding đang chạy

CREATE TABLE IF NOT EXISTS embedding_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
    progress INTEGER DEFAULT 0, -- 0-100%
    total_chunks INTEGER,
    processed_chunks INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Index cho quick lookup
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_document_id ON embedding_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_embedding_jobs_status ON embedding_jobs(status);

-- Function để tạo embedding job mới
CREATE OR REPLACE FUNCTION create_embedding_job(doc_id UUID)
RETURNS UUID AS $$
DECLARE
    job_id UUID;
BEGIN
    INSERT INTO embedding_jobs (document_id, status)
    VALUES (doc_id, 'pending')
    RETURNING id INTO job_id;
    
    RETURN job_id;
END;
$$ LANGUAGE plpgsql;

-- Function để cập nhật trạng thái embedding job
CREATE OR REPLACE FUNCTION update_embedding_status(
    job_id UUID,
    new_status VARCHAR(20),
    error_msg TEXT DEFAULT NULL,
    progress_val INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE embedding_jobs 
    SET 
        status = new_status,
        error_message = error_msg,
        progress = COALESCE(progress_val, progress),
        started_at = CASE WHEN new_status = 'processing' AND started_at IS NULL THEN NOW() ELSE started_at END,
        completed_at = CASE WHEN new_status IN ('completed', 'failed') THEN NOW() ELSE completed_at END
    WHERE id = job_id;
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function để cập nhật progress
CREATE OR REPLACE FUNCTION update_embedding_progress(
    job_id UUID,
    progress_val INTEGER,
    processed_chunks_val INTEGER DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE embedding_jobs 
    SET 
        progress = progress_val,
        processed_chunks = COALESCE(processed_chunks_val, processed_chunks)
    WHERE id = job_id AND status = 'processing';
    
    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function để lấy embedding status theo document ID
CREATE OR REPLACE FUNCTION get_embedding_status_by_document(doc_id UUID)
RETURNS TABLE (
    id UUID,
    status VARCHAR(20),
    progress INTEGER,
    total_chunks INTEGER,
    processed_chunks INTEGER,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ej.id,
        ej.status,
        ej.progress,
        ej.total_chunks,
        ej.processed_chunks,
        ej.error_message,
        ej.created_at,
        ej.started_at,
        ej.completed_at
    FROM embedding_jobs ej
    WHERE ej.document_id = doc_id
    ORDER BY ej.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;