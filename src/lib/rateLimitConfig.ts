/**
 * Rate Limit Configuration
 * 
 * Per-endpoint rate limiting rules with escalation logic.
 * All limits are per-user AND per-IP (whichever triggers first).
 */

export interface RateLimitRule {
    endpoint: string;
    maxRequests: number;
    windowSeconds: number;
    burstLimit?: number;
    blockDurationSeconds: number;
    cacheFallback?: boolean; // Return cached data on limit
}

export const RATE_LIMIT_CONFIG: Record<string, RateLimitRule> = {
    // Auth endpoints - strict limits
    'auth.login': {
        endpoint: 'auth.login',
        maxRequests: 5,
        windowSeconds: 600, // 10 minutes
        blockDurationSeconds: 3600, // 1 hour
    },
    'auth.signup': {
        endpoint: 'auth.signup',
        maxRequests: 5,
        windowSeconds: 600,
        blockDurationSeconds: 3600,
    },

    // Dashboard RPCs - moderate limits with cache fallback
    'rpc.get_dashboard_summary': {
        endpoint: 'rpc.get_dashboard_summary',
        maxRequests: 10,
        windowSeconds: 60,
        burstLimit: 20,
        blockDurationSeconds: 300,
        cacheFallback: true,
    },
    'rpc.get_report_summary': {
        endpoint: 'rpc.get_report_summary',
        maxRequests: 10,
        windowSeconds: 60,
        burstLimit: 20,
        blockDurationSeconds: 300,
        cacheFallback: true,
    },

    // Payments - high limits for cashier use
    'payments.create': {
        endpoint: 'payments.create',
        maxRequests: 60,
        windowSeconds: 60,
        burstLimit: 80,
        blockDurationSeconds: 600,
    },
    'payments.list': {
        endpoint: 'payments.list',
        maxRequests: 120,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },
    'payments.search': {
        endpoint: 'payments.search',
        maxRequests: 120,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },

    // Expenses
    'expenses.create': {
        endpoint: 'expenses.create',
        maxRequests: 60,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },
    'expenses.update': {
        endpoint: 'expenses.update',
        maxRequests: 60,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },
    'expenses.list': {
        endpoint: 'expenses.list',
        maxRequests: 120,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },

    // Students
    'students.search': {
        endpoint: 'students.search',
        maxRequests: 120,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },
    'students.list': {
        endpoint: 'students.list',
        maxRequests: 120,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },
    'students.create': {
        endpoint: 'students.create',
        maxRequests: 60,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },

    // Staff
    'staff.search': {
        endpoint: 'staff.search',
        maxRequests: 120,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },
    'staff.list': {
        endpoint: 'staff.list',
        maxRequests: 120,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },

    // Admin RPCs - very strict
    'admin.rpc': {
        endpoint: 'admin.rpc',
        maxRequests: 2,
        windowSeconds: 3600, // 1 hour
        blockDurationSeconds: 7200, // 2 hours
    },

    // Public/health endpoints - high limits
    'public.health': {
        endpoint: 'public.health',
        maxRequests: 1000,
        windowSeconds: 60,
        blockDurationSeconds: 60,
    },

    // Default fallback
    'default': {
        endpoint: 'default',
        maxRequests: 100,
        windowSeconds: 60,
        blockDurationSeconds: 300,
    },
};

// IP-specific limits (per-IP safety caps)
export const IP_RATE_LIMITS: Record<string, number> = {
    'payments.create': 300, // 300/min per IP
    'auth.login': 20, // 20/min per IP
    'auth.signup': 10, // 10/min per IP
    'default': 500, // 500/min per IP default
};

// Kill mode thresholds (trigger auto-block)
export const KILL_MODE_THRESHOLDS: Record<string, number> = {
    'payments.create': 500, // 500+/min IP → Kill Mode
    'auth.login': 50, // 50+/min IP → Kill Mode
    'default': 1000, // 1000+/min IP → Kill Mode
};

// Escalation configuration
export const ESCALATION_CONFIG = {
    // Violations within window to escalate
    standardToSuspicious: 3, // 3 violations in 1 hour → suspicious
    suspiciousToKill: 5, // 5 violations in 1 hour → kill mode
    escalationWindowHours: 1,

    // Block durations by level
    blockDurations: {
        1: 300, // 5 min for standard
        2: 1800, // 30 min for suspicious
        3: 3600, // 1 hour for kill mode
    },
};

// Feature flag
export const RATE_LIMITING_ENABLED =
    typeof import.meta !== 'undefined' &&
    import.meta.env?.VITE_RATE_LIMITING_ENABLED !== 'false';

// Admin emails allowed to manage rate limits
export const RATE_LIMIT_ADMIN_EMAILS = [
    'funtimefact@gmail.com',
    'admin@eduopus.com',
];

/**
 * Get rate limit rule for an endpoint
 */
export function getRateLimitRule(endpoint: string): RateLimitRule {
    return RATE_LIMIT_CONFIG[endpoint] || RATE_LIMIT_CONFIG['default'];
}

/**
 * Get IP rate limit for an endpoint
 */
export function getIPRateLimit(endpoint: string): number {
    const baseEndpoint = endpoint.split('.')[0] + '.' + endpoint.split('.')[1];
    return IP_RATE_LIMITS[baseEndpoint] || IP_RATE_LIMITS['default'];
}

/**
 * Check if request count triggers kill mode
 */
export function isKillModeThreshold(endpoint: string, count: number): boolean {
    const baseEndpoint = endpoint.split('.')[0] + '.' + endpoint.split('.')[1];
    const threshold = KILL_MODE_THRESHOLDS[baseEndpoint] || KILL_MODE_THRESHOLDS['default'];
    return count >= threshold;
}
