const path = require('path');
const { spawn } = require('child_process');
const ragFastAPIService = require('../services/ragFastAPIService');

/**
 * POST /api/rag/chat
 * Xử lý RAG query từ frontend.
 * Ưu tiên FastAPI server (nhanh), fallback về spawn process.
 * 
 * Body: { query, topK?, systemPrompt?, retrieveOnly? }
 * Auth: JWT token (req.user.id)
 */
async function chatRAG(req, res) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Không tìm thấy thông tin user',
        code: 'MISSING_USER_ID'
      });
    }

    const { query, topK, systemPrompt, retrieveOnly, model } = req.body || {};
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "Field 'query' là bắt buộc",
        code: 'INVALID_QUERY'
      });
    }

    // Ưu tiên FastAPI server (nhanh), fallback về spawn process
    const useFastAPI = process.env.USE_RAG_FASTAPI !== 'false';
    
    if (useFastAPI) {
      try {
        const isHealthy = await ragFastAPIService.checkHealth();
        if (isHealthy) {
          console.log('[RAG] Using FastAPI server');
          const result = retrieveOnly 
            ? await ragFastAPIService.retrieveChunks({ query, userId, topK: topK || 5 })
            : await ragFastAPIService.queryRAG({ query, userId, topK: topK || 5, systemPrompt, model });
          return res.status(200).json(result);
        }
      } catch (error) {
        console.warn('[RAG] FastAPI error, fallback to spawn:', error.message);
      }
    }

    // Fallback: Spawn Python process
    console.log('[RAG] Using spawn process');

    const pythonExe = process.env.RAG_PYTHON_PATH || 'python';
    const defaultRunner = path.resolve(__dirname, '../../../../Embedding_langchain/scripts/rag_runner.py');
    const runnerPath = process.env.RAG_RUNNER_PATH || defaultRunner;
    const runnerCwd = path.resolve(__dirname, '../../../../Embedding_langchain');
    const timeoutMs = parseInt(process.env.RAG_TIMEOUT_MS || '180000', 10);

    const payload = {
      query,
      user_id: userId,
      top_k: topK,
      system_prompt: systemPrompt,
      model: model,
    };
    
    const child = spawn(pythonExe, [runnerPath], {
      cwd: runnerCwd,
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

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    timeoutHandle = setTimeout(() => {
      child.kill();
    }, timeoutMs);

    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Lỗi khởi động RAG process',
          code: 'RAG_PROCESS_START_FAILED'
        });
      }
    });

    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      if (res.headersSent) return;
      
      if (code !== 0) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'RAG runner thất bại',
          details: stderr,
          code: 'RAG_RUNNER_FAILED'
        });
      }
      
      try {
        const json = JSON.parse(stdout);
        return res.status(200).json(json);
      } catch (e) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Response không hợp lệ',
          code: 'RAG_RUNNER_INVALID_JSON'
        });
      }
    });

    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  } catch (error) {
    console.error('[RAG] Handler error:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: error.message,
      code: 'RAG_HANDLER_ERROR'
    });
  }
}

module.exports = { chatRAG };
