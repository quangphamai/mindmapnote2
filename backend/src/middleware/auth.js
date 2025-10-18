const { supabase } = require('../config/supabase');

/**
 * Middleware để xác thực user từ JWT token
 * Token được gửi trong header: Authorization: Bearer <token>
 */
const authenticateUser = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Missing or invalid authorization header',
        code: 'MISSING_AUTH_HEADER'
      });
    }

    const token = authHeader.substring(7); // Bỏ "Bearer " prefix

    // Kiểm tra token format cơ bản
    if (!token || token.length < 10) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }

    // Verify token với Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error('Token verification error:', error.message);
      
      // Phân loại lỗi cụ thể
      if (error.message.includes('expired') || error.message.includes('invalid')) {
        return res.status(401).json({ 
          error: 'Unauthorized',
          message: 'Token has expired or is invalid',
          code: 'TOKEN_EXPIRED_OR_INVALID'
        });
      }
      
      if (error.message.includes('network') || error.message.includes('connection')) {
        return res.status(503).json({ 
          error: 'Service Unavailable',
          message: 'Authentication service is temporarily unavailable',
          code: 'AUTH_SERVICE_UNAVAILABLE'
        });
      }

      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Token verification failed',
        code: 'TOKEN_VERIFICATION_FAILED'
      });
    }

    if (!user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'User not found for this token',
        code: 'USER_NOT_FOUND'
      });
    }

    // Kiểm tra user có bị disabled không
    if (user.banned_until && new Date(user.banned_until) > new Date()) {
      return res.status(403).json({ 
        error: 'Forbidden',
        message: 'User account is temporarily suspended',
        code: 'USER_SUSPENDED'
      });
    }

    // Gắn user vào request để sử dụng trong các route handlers
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    
    // Phân loại lỗi để trả về response phù hợp
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Invalid token format',
        code: 'INVALID_TOKEN_FORMAT'
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Token has expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    return res.status(500).json({ 
      error: 'Internal Server Error',
      message: 'Authentication service error',
      code: 'AUTH_SERVICE_ERROR'
    });
  }
};

module.exports = { authenticateUser };
