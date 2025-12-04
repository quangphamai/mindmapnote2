const { supabase } = require('../config/supabase');

/**
 * Middleware to enhance security for group operations
 * Includes rate limiting, input validation, and audit logging
 */

// Simple in-memory rate limiter for production use Redis or similar
const rateLimitStore = new Map();

/**
 * Rate limiting middleware for group operations
 * @param {number} maxRequests - Maximum requests per window
 * @param {number} windowMs - Time window in milliseconds
 */
const rateLimitGroupOperations = (maxRequests = 10, windowMs = 60000) => {
    return (req, res, next) => {
        const userId = req.user?.id;
        const groupId = req.params.groupId || req.params.id;
        const key = `group_${userId}_${groupId}`;
        
        if (!rateLimitStore.has(key)) {
            rateLimitStore.set(key, {
                count: 1,
                resetTime: Date.now() + windowMs
            });
            return next();
        }
        
        const record = rateLimitStore.get(key);
        
        // Reset if window has passed
        if (Date.now() > record.resetTime) {
            record.count = 1;
            record.resetTime = Date.now() + windowMs;
            return next();
        }
        
        // Check if limit exceeded
        if (record.count >= maxRequests) {
            return res.status(429).json({
                success: false,
                error: 'Too Many Requests',
                message: `Rate limit exceeded. Please try again later.`,
                retryAfter: Math.ceil((record.resetTime - Date.now()) / 1000)
            });
        }
        
        record.count++;
        next();
    };
};

/**
 * Validate group input data to prevent injection attacks
 */
const validateGroupInput = (req, res, next) => {
    const { name, description, visibility } = req.body;
    
    // Check for potentially dangerous patterns
    const dangerousPatterns = [
        /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
        /javascript:/gi,
        /on\w+\s*=/gi,
        /expression\s*\(/gi,
        /@import/i,
        /union\s+select/i,
        /drop\s+table/i,
        /delete\s+from/i,
        /insert\s+into/i,
        /update\s+set/i
    ];
    
    const checkString = (str, fieldName) => {
        if (typeof str !== 'string') return;
        
        for (const pattern of dangerousPatterns) {
            if (pattern.test(str)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid Input',
                    message: `Invalid characters detected in ${fieldName}`
                });
            }
        }
        
        // Check length limits
        if (fieldName === 'name' && str.length > 100) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Input',
                message: 'Group name is too long (max 100 characters)'
            });
        }
        
        if (fieldName === 'description' && str.length > 1000) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Input',
                message: 'Description is too long (max 1000 characters)'
            });
        }
    };
    
    if (name) checkString(name, 'name');
    if (description) checkString(description, 'description');
    
    // Validate visibility
    if (visibility && !['public', 'private', 'hidden'].includes(visibility)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid Input',
            message: 'Visibility must be one of: public, private, hidden'
        });
    }
    
    next();
};

/**
 * Log security events for audit purposes
 */
const logSecurityEvent = async (userId, eventType, details) => {
    try {
        await supabase
            .from('security_logs')
            .insert({
                user_id: userId,
                event_type: eventType,
                details: details,
                ip_address: details.ip || 'unknown',
                user_agent: details.userAgent || 'unknown',
                created_at: new Date().toISOString()
            });
    } catch (error) {
        console.error('Failed to log security event:', error);
    }
};

/**
 * Middleware to log sensitive group operations
 */
const auditGroupOperation = (eventType) => {
    return async (req, res, next) => {
        const originalSend = res.send;
        let responseData;
        
        res.send = function(data) {
            responseData = data;
            return originalSend.call(this, data);
        };
        
        res.on('finish', async () => {
            const userId = req.user?.id;
            const groupId = req.params.groupId || req.params.id;
            
            if (userId && res.statusCode >= 200 && res.statusCode < 300) {
                await logSecurityEvent(userId, eventType, {
                    groupId,
                    method: req.method,
                    path: req.path,
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    body: req.method !== 'GET' ? JSON.stringify(req.body) : undefined,
                    responseStatus: res.statusCode
                });
            }
        });
        
        next();
    };
};

/**
 * Check if user is attempting to access a group they shouldn't
 * based on recent failed attempts
 */
const detectSuspiciousActivity = async (req, res, next) => {
    const userId = req.user?.id;
    const groupId = req.params.groupId || req.params.id;
    
    if (!userId || !groupId) return next();
    
    try {
        // Check for recent failed access attempts
        const { data: failedAttempts, error } = await supabase
            .from('security_logs')
            .select('count')
            .eq('user_id', userId)
            .eq('event_type', 'group_access_denied')
            .contains('details', { groupId })
            .gte('created_at', new Date(Date.now() - 60000).toISOString()); // Last minute
        
        if (error) throw error;
        
        // If more than 5 failed attempts in the last minute, block temporarily
        if (failedAttempts && failedAttempts.length > 5) {
            await logSecurityEvent(userId, 'group_access_blocked', {
                groupId,
                reason: 'Too many failed attempts',
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            
            return res.status(429).json({
                success: false,
                error: 'Access Blocked',
                message: 'Too many failed access attempts. Please try again later.'
            });
        }
        
        next();
    } catch (error) {
        console.error('Error checking suspicious activity:', error);
        next(); // Continue on error to avoid breaking functionality
    }
};

/**
 * Validate member role changes to prevent privilege escalation
 */
const validateRoleChange = (req, res, next) => {
    const { role } = req.body;
    const validRoles = ['viewer', 'member', 'admin', 'owner'];
    
    if (!validRoles.includes(role)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid Role',
            message: `Role must be one of: ${validRoles.join(', ')}`
        });
    }
    
    // Only owners can assign owner role
    if (role === 'owner') {
        // This will be checked by the isGroupOwner middleware
        // But we add an additional validation here
        req.body.requiresOwnership = true;
    }
    
    next();
};

/**
 * Sanitize output to prevent information leakage
 */
const sanitizeGroupOutput = (req, res, next) => {
    const originalSend = res.send;
    
    res.send = function(data) {
        if (res.statusCode === 200 && data) {
            try {
                const parsedData = typeof data === 'string' ? JSON.parse(data) : data;
                
                // Remove sensitive information from group data
                if (parsedData.data && Array.isArray(parsedData.data)) {
                    parsedData.data = parsedData.data.map(item => {
                        if (item.email) delete item.email;
                        if (item.password_hash) delete item.password_hash;
                        if (item.reset_token) delete item.reset_token;
                        return item;
                    });
                } else if (parsedData.data) {
                    if (parsedData.data.email) delete parsedData.data.email;
                    if (parsedData.data.password_hash) delete parsedData.data.password_hash;
                    if (parsedData.data.reset_token) delete parsedData.data.reset_token;
                }
                
                return originalSend.call(this, JSON.stringify(parsedData));
            } catch (error) {
                // If parsing fails, send original data
                return originalSend.call(this, data);
            }
        }
        
        return originalSend.call(this, data);
    };
    
    next();
};

module.exports = {
    rateLimitGroupOperations,
    validateGroupInput,
    auditGroupOperation,
    detectSuspiciousActivity,
    validateRoleChange,
    sanitizeGroupOutput,
    logSecurityEvent
};