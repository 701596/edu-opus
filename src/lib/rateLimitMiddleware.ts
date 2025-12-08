/**
 * Rate Limit Middleware
 * 
 * Intercepts Supabase API calls and enforces rate limits.
 * Provides X-RateLimit-* headers and 429 responses.
 */

import {
    rateLimitStore,
    violationTracker,
    responseCache,
    blockList
} from './rateLimitStore';
import {
    getRateLimitRule,
    getIPRateLimit,
    isKillModeThreshold,
    RATE_LIMITING_ENABLED,
    ESCALATION_CONFIG,
    type RateLimitRule,
} from './rateLimitConfig';

// =============================================
// Types
// =============================================

export interface RateLimitHeaders {
    'X-RateLimit-Limit': string;
    'X-RateLimit-Remaining': string;
    'X-RateLimit-Reset': string;
    'X-RateLimit-Cache'?: string;
}

export interface RateLimitError {
    error: 'rate_limited';
    message: string;
    retry_after: number;
    headers: RateLimitHeaders;
}

export interface RateLimitCheckResult {
    allowed: boolean;
    headers: RateLimitHeaders;
    error?: RateLimitError;
    cachedData?: unknown;
    escalationLevel?: number;
}

// =============================================
// Utility Functions
// =============================================

/**
 * Get client IP address (best effort in browser)
 */
export function getClientIP(): string {
    // In browser, we can't get real IP. Use a placeholder.
    // Server-side Edge Functions would extract from headers.
    return localStorage.getItem('_ratelimit_ip') || 'browser-client';
}

/**
 * Set client IP (can be called with IP from response headers)
 */
export function setClientIP(ip: string): void {
    localStorage.setItem('_ratelimit_ip', ip);
}

/**
 * Get current user ID
 */
export function getCurrentUserId(): string | null {
    try {
        const session = localStorage.getItem('sb-fhrskehzyvaqrgfyqopg-auth-token');
        if (session) {
            const parsed = JSON.parse(session);
            return parsed.user?.id || null;
        }
    } catch {
        // Ignore parse errors
    }
    return null;
}

/**
 * Build rate limit key
 */
function buildKey(type: 'user' | 'ip', identifier: string, endpoint: string): string {
    return `${type}:${identifier}:${endpoint}`;
}

/**
 * Map endpoint from Supabase operation
 */
export function mapEndpoint(
    operation: 'rpc' | 'select' | 'insert' | 'update' | 'delete' | 'auth',
    table?: string,
    rpcName?: string
): string {
    if (operation === 'auth') {
        return `auth.${table || 'login'}`;
    }

    if (operation === 'rpc') {
        return `rpc.${rpcName || 'unknown'}`;
    }

    if (!table) return 'default';

    // Map table operations
    const tableMap: Record<string, string> = {
        'payments': operation === 'select' ? 'payments.list' : `payments.${operation}`,
        'expenses': operation === 'select' ? 'expenses.list' : `expenses.${operation}`,
        'students': operation === 'select' ? 'students.list' : `students.${operation}`,
        'staff': operation === 'select' ? 'staff.list' : `staff.${operation}`,
    };

    return tableMap[table] || 'default';
}

// =============================================
// Core Rate Limit Check
// =============================================

/**
 * Check rate limit for an operation
 */
export function checkRateLimit(
    endpoint: string,
    userId?: string | null,
    ip?: string
): RateLimitCheckResult {
    // Skip if disabled
    if (!RATE_LIMITING_ENABLED) {
        return {
            allowed: true,
            headers: {
                'X-RateLimit-Limit': '∞',
                'X-RateLimit-Remaining': '∞',
                'X-RateLimit-Reset': '0',
            },
        };
    }

    const rule = getRateLimitRule(endpoint);
    const effectiveIP = ip || getClientIP();
    const effectiveUserId = userId ?? getCurrentUserId();

    // Check if blocked
    if (effectiveIP && blockList.isIPBlocked(effectiveIP)) {
        return createBlockedResponse(rule, 'IP is blocked');
    }
    if (effectiveUserId && blockList.isUserBlocked(effectiveUserId)) {
        return createBlockedResponse(rule, 'User is blocked');
    }

    // Check user-based limit
    let userResult = { allowed: true, currentCount: 0, remaining: rule.maxRequests, resetAt: 0, limit: rule.maxRequests };
    if (effectiveUserId) {
        const userKey = buildKey('user', effectiveUserId, endpoint);
        userResult = rateLimitStore.check(userKey, rule.maxRequests, rule.windowSeconds);
    }

    // Check IP-based limit
    let ipResult = { allowed: true, currentCount: 0, remaining: 999, resetAt: 0, limit: getIPRateLimit(endpoint) };
    if (effectiveIP && effectiveIP !== 'browser-client') {
        const ipKey = buildKey('ip', effectiveIP, endpoint);
        const ipLimit = getIPRateLimit(endpoint);
        ipResult = rateLimitStore.check(ipKey, ipLimit, rule.windowSeconds);
    }

    // Use the more restrictive result
    const allowed = userResult.allowed && ipResult.allowed;
    const remaining = Math.min(userResult.remaining, ipResult.remaining);
    const resetAt = Math.max(userResult.resetAt, ipResult.resetAt);
    const currentCount = Math.max(userResult.currentCount, ipResult.currentCount);

    // Build headers
    const headers: RateLimitHeaders = {
        'X-RateLimit-Limit': String(rule.maxRequests),
        'X-RateLimit-Remaining': String(remaining),
        'X-RateLimit-Reset': String(resetAt),
    };

    if (allowed) {
        return { allowed: true, headers };
    }

    // Handle violation
    const violationKey = effectiveUserId || effectiveIP || 'unknown';
    const escalation = violationTracker.record(violationKey);

    // Check for kill mode
    if (isKillModeThreshold(endpoint, currentCount)) {
        handleKillMode(effectiveIP, effectiveUserId, endpoint, currentCount, rule);
        return createBlockedResponse(rule, 'Rate limit exceeded - Kill Mode', escalation.level);
    }

    // Handle escalation
    if (escalation.shouldEscalate) {
        handleEscalation(effectiveIP, effectiveUserId, endpoint, escalation.level, rule);
    }

    // Check for cached fallback
    if (rule.cacheFallback && effectiveUserId) {
        const cacheKey = `${effectiveUserId}:${endpoint}`;
        const cachedData = responseCache.get(cacheKey);
        if (cachedData) {
            headers['X-RateLimit-Cache'] = 'true';
            return {
                allowed: false,
                headers,
                cachedData,
                escalationLevel: escalation.level,
            };
        }
    }

    // Return rate limit error
    const retryAfter = resetAt - Math.floor(Date.now() / 1000);
    return {
        allowed: false,
        headers,
        error: {
            error: 'rate_limited',
            message: `Too many requests. Try again in ${retryAfter} seconds.`,
            retry_after: Math.max(1, retryAfter),
            headers,
        },
        escalationLevel: escalation.level,
    };
}

/**
 * Create blocked response
 */
function createBlockedResponse(
    rule: RateLimitRule,
    message: string,
    escalationLevel: number = 3
): RateLimitCheckResult {
    const retryAfter = ESCALATION_CONFIG.blockDurations[escalationLevel as 1 | 2 | 3] || 3600;
    return {
        allowed: false,
        headers: {
            'X-RateLimit-Limit': String(rule.maxRequests),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + retryAfter),
        },
        error: {
            error: 'rate_limited',
            message,
            retry_after: retryAfter,
            headers: {
                'X-RateLimit-Limit': String(rule.maxRequests),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + retryAfter),
            },
        },
        escalationLevel,
    };
}

/**
 * Handle kill mode - auto-block
 */
function handleKillMode(
    ip: string | undefined,
    userId: string | null,
    endpoint: string,
    count: number,
    rule: RateLimitRule
): void {
    const blockDuration = ESCALATION_CONFIG.blockDurations[3] * 1000; // ms

    if (ip && ip !== 'browser-client') {
        blockList.blockIP(ip, blockDuration);
    }
    if (userId) {
        blockList.blockUser(userId, blockDuration);
    }

    // Log violation (will be sent to DB via logViolation)
    logViolation({
        userId,
        ip,
        endpoint,
        count,
        limit: rule.maxRequests,
        action: 'kill',
        escalationLevel: 3,
    });

    console.warn(`[RateLimit] Kill Mode activated for ${ip || userId} on ${endpoint}`);
}

/**
 * Handle escalation
 */
function handleEscalation(
    ip: string | undefined,
    userId: string | null,
    endpoint: string,
    level: number,
    rule: RateLimitRule
): void {
    const blockDuration = ESCALATION_CONFIG.blockDurations[level as 1 | 2 | 3] * 1000;

    if (level >= 2) {
        if (ip && ip !== 'browser-client') {
            blockList.blockIP(ip, blockDuration);
        }
        if (userId) {
            blockList.blockUser(userId, blockDuration);
        }
    }

    logViolation({
        userId,
        ip,
        endpoint,
        count: 0,
        limit: rule.maxRequests,
        action: level === 3 ? 'kill' : level === 2 ? 'block' : 'warn',
        escalationLevel: level,
    });

    console.warn(`[RateLimit] Escalation to level ${level} for ${ip || userId} on ${endpoint}`);
}

// =============================================
// Violation Logging
// =============================================

interface ViolationLog {
    userId: string | null;
    ip: string | undefined;
    endpoint: string;
    count: number;
    limit: number;
    action: 'warn' | 'block' | 'kill';
    escalationLevel: number;
}

const pendingViolations: ViolationLog[] = [];
let flushTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Log violation (batched for efficiency)
 */
function logViolation(log: ViolationLog): void {
    pendingViolations.push(log);

    // Debounce flush
    if (!flushTimeout) {
        flushTimeout = setTimeout(() => {
            flushViolations();
        }, 1000);
    }
}

/**
 * Flush pending violations to storage/API
 */
async function flushViolations(): Promise<void> {
    flushTimeout = null;
    if (pendingViolations.length === 0) return;

    const violations = [...pendingViolations];
    pendingViolations.length = 0;

    // Store in localStorage for now (will be synced to DB)
    try {
        const existing = JSON.parse(localStorage.getItem('_ratelimit_violations') || '[]');
        const updated = [...existing, ...violations].slice(-100); // Keep last 100
        localStorage.setItem('_ratelimit_violations', JSON.stringify(updated));
    } catch {
        // Ignore storage errors
    }

    // TODO: Send to API
    // await supabase.rpc('log_rate_limit_violation', ...)
}

/**
 * Get pending violations
 */
export function getPendingViolations(): ViolationLog[] {
    try {
        return JSON.parse(localStorage.getItem('_ratelimit_violations') || '[]');
    } catch {
        return [];
    }
}

/**
 * Clear violations
 */
export function clearViolations(): void {
    localStorage.removeItem('_ratelimit_violations');
}

// =============================================
// Cache Management
// =============================================

/**
 * Cache RPC response for fallback
 */
export function cacheResponse(endpoint: string, data: unknown, ttlSeconds: number = 60): void {
    const userId = getCurrentUserId();
    if (!userId) return;

    const cacheKey = `${userId}:${endpoint}`;
    responseCache.set(cacheKey, data, ttlSeconds);
}

/**
 * Get cached response
 */
export function getCachedResponse<T>(endpoint: string): T | null {
    const userId = getCurrentUserId();
    if (!userId) return null;

    const cacheKey = `${userId}:${endpoint}`;
    return responseCache.get<T>(cacheKey);
}

// =============================================
// Admin Functions
// =============================================

/**
 * Manually block an IP
 */
export function adminBlockIP(ip: string, durationSeconds: number = 3600): void {
    blockList.blockIP(ip, durationSeconds * 1000);
}

/**
 * Manually unblock an IP
 */
export function adminUnblockIP(ip: string): void {
    blockList.unblockIP(ip);
}

/**
 * Manually block a user
 */
export function adminBlockUser(userId: string, durationSeconds: number = 3600): void {
    blockList.blockUser(userId, durationSeconds * 1000);
}

/**
 * Manually unblock a user
 */
export function adminUnblockUser(userId: string): void {
    blockList.unblockUser(userId);
}

/**
 * Get current block status
 */
export function getBlockStatus(): {
    blockedIPs: string[];
    blockedUsers: string[];
} {
    return {
        blockedIPs: blockList.getBlockedIPs(),
        blockedUsers: blockList.getBlockedUsers(),
    };
}

/**
 * Get rate limit stats
 */
export function getRateLimitStats(): {
    storeSize: number;
    violations: ViolationLog[];
    blockedIPs: string[];
    blockedUsers: string[];
} {
    return {
        storeSize: rateLimitStore.size(),
        violations: getPendingViolations(),
        blockedIPs: blockList.getBlockedIPs(),
        blockedUsers: blockList.getBlockedUsers(),
    };
}

/**
 * Disable rate limiting (emergency toggle)
 */
export function disableRateLimiting(): void {
    localStorage.setItem('_ratelimit_disabled', 'true');
}

/**
 * Enable rate limiting
 */
export function enableRateLimiting(): void {
    localStorage.removeItem('_ratelimit_disabled');
}

/**
 * Check if rate limiting is disabled via emergency toggle
 */
export function isRateLimitingDisabled(): boolean {
    return localStorage.getItem('_ratelimit_disabled') === 'true';
}
