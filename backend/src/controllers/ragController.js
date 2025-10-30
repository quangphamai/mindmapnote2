const path = require('path');
const { spawn } = require('child_process');

/**
 * POST /api/rag/chat
 * Hàm xử lý request RAG từ frontend
 * 
 * PHASE C1: Đã đổi từ chọn document cụ thể → search TẤT CẢ documents của user
 * 
 * Body: { query: string, topK?: number, systemPrompt?: string }
 * - KHÔNG CẦN documentId nữa, user_id lấy từ JWT token (req.user.id)
 * 
 * Authentication: Cần JWT token (middleware authenticateUser đã verify)
 * - req.user chứa thông tin user từ JWT token
 * - req.user.id = UUID của user trong database
 */
async function chatRAG(req, res) {
  try {
    // PHASE C1: Lấy user_id từ JWT token thay vì documentId từ body
    // Middleware authenticateUser đã decode JWT và gán vào req.user
    const userId = req.user?.id;
    
    // Kiểm tra user_id có tồn tại không (JWT hợp lệ)
    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Không tìm thấy thông tin user từ JWT token',
        code: 'MISSING_USER_ID'
      });
    }

    // Lấy dữ liệu từ request body
    // ĐÃ BỎ: documentId (không cần nữa, dùng userId từ JWT)
    const { query, topK, systemPrompt } = req.body || {};

    // Kiểm tra query là bắt buộc và không rỗng
    if (!query || typeof query !== 'string' || !query.trim()) {
      return res.status(400).json({
        error: 'Bad Request',
        message: "Field 'query' là bắt buộc và phải là chuỗi không rỗng",
        code: 'INVALID_QUERY'
      });
    }

    // Lấy đường dẫn Python executable từ environment variable
    const pythonExe = process.env.RAG_PYTHON_PATH || 'python';
    // Đường dẫn mặc định đến script rag_runner.py
    const defaultRunner = path.resolve(__dirname, '../../../../Embedding_langchain/scripts/rag_runner.py');
    // Lấy đường dẫn rag_runner từ env hoặc dùng mặc định
    const runnerPath = process.env.RAG_RUNNER_PATH || defaultRunner;
    // Thư mục làm việc cho Python process (Embedding_langchain)
    const runnerCwd = path.resolve(__dirname, '../../../../Embedding_langchain');
    // Thời gian chờ tối đa (180 giây = 3 phút, tăng từ 60s để đủ load model lần đầu)
    const timeoutMs = parseInt(process.env.RAG_TIMEOUT_MS || '180000', 10);

    // Tạo payload dữ liệu gửi cho Python process qua stdin
    // PHASE C1: Gửi user_id thay vì document_id
    const payload = {
      query,
      user_id: userId,  // ĐÃ ĐỔI: Gửi user_id từ JWT token (không phải document_id từ body)
      top_k: typeof topK === 'number' ? topK : undefined,
      system_prompt: typeof systemPrompt === 'string' ? systemPrompt : undefined,
    };

    // Ghi log để debug
    console.log('[RAG] Spawn Python:', pythonExe);
    console.log('[RAG] Đường dẫn runner:', runnerPath);
    console.log('[RAG] Thư mục làm việc:', runnerCwd);
    console.log('[RAG] User ID:', userId);  // Log user_id để debug
    console.log('[RAG] Timeout:', timeoutMs, 'ms');
    console.log('[RAG] Payload:', JSON.stringify(payload));
    
    // Spawn Python process con với UTF-8 encoding cho stdin/stdout/stderr
    // UTF-8 rất quan trọng để xử lý text tiếng Việt
    const child = spawn(pythonExe, [runnerPath], {
      cwd: runnerCwd,
      env: { 
        ...process.env,             // Kế thừa biến môi trường hiện tại ở môi trường python
        PYTHONIOENCODING: 'utf-8',  // Bắt Python dùng UTF-8 cho I/O
        PYTHONUTF8: '1'              // Bật UTF-8 mode trên Windows (Python 3.7+)
      },
      stdio: ['pipe', 'pipe', 'pipe']  // stdin, stdout, stderr đều là pipes
    });

    // Biến lưu output từ Python process
    let stdout = '';
    let stderr = '';
    let timeoutHandle;

    // Lắng nghe stdout từ Python (kết quả RAG)
    child.stdout.on('data', (data) => {
      const chunk = data.toString();
      console.log('[RAG stdout]', chunk);
      stdout += chunk;
    });
    // Lắng nghe stderr từ Python (lỗi)
    child.stderr.on('data', (data) => {
      const chunk = data.toString();
      console.error('[RAG stderr]', chunk);
      stderr += chunk;
    });

    // Xử lý timeout - nếu Python process chạy quá lâu thì kill nó
    timeoutHandle = setTimeout(() => {
      console.error('[RAG] TIMEOUT sau', timeoutMs, 'ms - đang kill process');
      // Terminate process (hoạt động trên cả Windows và Unix)
      child.kill();
    }, timeoutMs);

    // Xử lý lỗi khi spawn process thất bại
    child.on('error', (err) => {
      clearTimeout(timeoutHandle);
      console.error('Lỗi start Python process:', err);
      // Kiểm tra xem response đã được gửi chưa trước khi gửi
      if (!res.headersSent) {
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Lỗi khởi động process RAG',
          details: err.message,
          code: 'RAG_PROCESS_START_FAILED'
        });
      }
    });

    // Xử lý khi Python process kết thúc
    child.on('close', (code) => {
      clearTimeout(timeoutHandle);
      console.log('[RAG] Process đóng với code:', code);
      console.log('[RAG] stdout length:', stdout.length);
      console.log('[RAG] stderr length:', stderr.length);
      
      // Kiểm tra xem response đã được gửi chưa
      if (res.headersSent) {
        console.log('[RAG] Response đã được gửi, bỏ qua');
        return;
      }
      
      // Kiểm tra exit code - 0 = thành công, khác 0 = lỗi
      if (code !== 0) {
        console.error('RAG runner lỗi:', stderr || `Thoát với code ${code}`);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'RAG runner thất bại',
          details: stderr || `Thoát với code ${code}`,
          code: 'RAG_RUNNER_FAILED'
        });
      }
      // Parse JSON kết quả từ stdout
      try {
        const json = JSON.parse(stdout);
        console.log('[RAG] Thành công - trả về answer');
        return res.status(200).json(json);
      } catch (e) {
        console.error('JSON không hợp lệ từ RAG runner:', e, '\nOutput:', stdout);
        return res.status(500).json({
          error: 'Internal Server Error',
          message: 'Response không hợp lệ từ RAG runner',
          details: e.message,
          code: 'RAG_RUNNER_INVALID_JSON'
        });
      }
    });

    // Ghi dữ liệu vào stdin của Python process và đóng
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  } catch (error) {
    console.error('chatRAG handler lỗi:', error);
    return res.status(500).json({
      error: 'Internal Server Error',
      message: 'Lỗi không dự báo trong RAG handler',
      details: error.message,
      code: 'RAG_HANDLER_ERROR'
    });
  }
}

module.exports = { chatRAG };
