/**
 * Service gọi Python RAG FastAPI server.
 * Model pre-loaded → Nhanh hơn spawn process 3-4x.
 */

const axios = require('axios');

const RAG_SERVER_URL = process.env.RAG_SERVER_URL || 'http://localhost:8001';

/**
 * Full RAG với LLM (~60s do Ollama)
 */
async function queryRAG({ query, userId, topK = 5, systemPrompt = null, model = null }) {
  try {
    const response = await axios.post(
      `${RAG_SERVER_URL}/rag/query`,
      {
        query,
        user_id: userId,
        top_k: topK,
        system_prompt: systemPrompt,
        model: model
      },
      {
        timeout: 180000, // 3 phút timeout (cho Ollama LLM)
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`RAG server error: ${error.response.status}`);
    } else if (error.request) {
      throw new Error('RAG server không phản hồi');
    }
    throw error;
  }
}

/**
 * Chỉ retrieve chunks (~1-2s). Frontend tự gọi Gemini.
 */
async function retrieveChunks({ query, userId, topK = 5 }) {
  try {
    const response = await axios.post(
      `${RAG_SERVER_URL}/rag/retrieve`,
      {
        query,
        user_id: userId,
        top_k: topK
      },
      {
        timeout: 30000, // 30 giây timeout (retrieve nhanh hơn nhiều)
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    if (error.response) {
      throw new Error(`RAG server error: ${error.response.status}`);
    } else if (error.request) {
      throw new Error('RAG server không phản hồi');
    }
    throw error;
  }
}

async function checkHealth() {
  try {
    const response = await axios.get(`${RAG_SERVER_URL}/health`, { timeout: 5000 });
    return response.data?.status === 'healthy' && response.data?.model_loaded === true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  queryRAG,
  retrieveChunks,
  checkHealth,
  RAG_SERVER_URL
};
