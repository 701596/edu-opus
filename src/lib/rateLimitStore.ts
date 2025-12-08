/**
 * Rate Limit Store - Token Bucket Implementation
 * 
 * In-memory rate limit counter with sliding window algorithm.
 * Designed to be Redis-compatible for future upgrade.
 */

interface RateLimitEntry {
    count: number;
    windowStart: number;
    expiresAt: number;
}

interface RateLimitResult {
    allowed: boolean;
    currentCount: number;
    remaining: number;
    resetAt: number; // Unix timestamp
    limit: number;
}

class RateLimitStore {
    private store: Map<string, RateLimitEntry> = new Map();
    private cleanupInterval: ReturnType<typeof setInterval> | null = null;

    constructor() {
        // Start cleanup interval (every 60 seconds)
        this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
    }

    /**
     * Check and increment rate limit counter
     */
    check(
        key: string,
        maxRequests: number,
        windowSeconds: number
    ): RateLimitResult {
        const now = Date.now();
        const windowMs = windowSeconds * 1000;
        const windowStart = now - windowMs;

        let entry = this.store.get(key);

        // If entry exists but window has expired, reset it
        if (entry && entry.windowStart < windowStart) {
            entry = undefined;
        }

        if (!entry) {
            // Create new entry
            entry = {
                count: 1,
                windowStart: now,
                expiresAt: now + windowMs,
            };
            this.store.set(key, entry);
        } else {
            // Increment existing entry
            entry.count += 1;
            entry.expiresAt = now + windowMs;
        }

        const allowed = entry.count <= maxRequests;
        const remaining = Math.max(0, maxRequests - entry.count);
        const resetAt = Math.floor(entry.expiresAt / 1000); // Unix seconds

        return {
            allowed,
            currentCount: entry.count,
            remaining,
            resetAt,
            limit: maxRequests,
        };
    }

    /**
     * Get current count without incrementing
     */
    peek(key: string, windowSeconds: number): number {
        const now = Date.now();
        const windowStart = now - windowSeconds * 1000;
        const entry = this.store.get(key);

        if (!entry || entry.windowStart < windowStart) {
            return 0;
        }

        return entry.count;
    }

    /**
     * Reset counter for a key
     */
    reset(key: string): void {
        this.store.delete(key);
    }

    /**
     * Clean up expired entries
     */
    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.store.entries()) {
            if (entry.expiresAt < now) {
                this.store.delete(key);
            }
        }
    }

    /**
     * Get all keys matching a pattern (for debugging)
     */
    getKeys(pattern?: string): string[] {
        const keys = Array.from(this.store.keys());
        if (!pattern) return keys;
        return keys.filter(k => k.includes(pattern));
    }

    /**
     * Get store size
     */
    size(): number {
        return this.store.size;
    }

    /**
     * Destroy the store and cleanup
     */
    destroy(): void {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
        this.store.clear();
    }
}

// Singleton instance
export const rateLimitStore = new RateLimitStore();

// =============================================
// Violation Tracker (for escalation)
// =============================================

interface ViolationEntry {
    count: number;
    firstViolation: number;
    lastViolation: number;
    escalationLevel: number; // 1=standard, 2=suspicious, 3=kill
}

class ViolationTracker {
    private violations: Map<string, ViolationEntry> = new Map();
    private escalationWindowMs = 60 * 60 * 1000; // 1 hour

    /**
     * Record a violation and check for escalation
     */
    record(key: string): { level: number; shouldEscalate: boolean } {
        const now = Date.now();
        let entry = this.violations.get(key);

        // Clean old entries outside window
        if (entry && entry.firstViolation < now - this.escalationWindowMs) {
            entry = undefined;
        }

        if (!entry) {
            entry = {
                count: 1,
                firstViolation: now,
                lastViolation: now,
                escalationLevel: 1,
            };
        } else {
            entry.count += 1;
            entry.lastViolation = now;
        }

        // Check for escalation
        let shouldEscalate = false;
        if (entry.count >= 5 && entry.escalationLevel < 3) {
            entry.escalationLevel = 3; // Kill mode
            shouldEscalate = true;
        } else if (entry.count >= 3 && entry.escalationLevel < 2) {
            entry.escalationLevel = 2; // Suspicious
            shouldEscalate = true;
        }

        this.violations.set(key, entry);

        return {
            level: entry.escalationLevel,
            shouldEscalate,
        };
    }

    /**
     * Get current escalation level for a key
     */
    getLevel(key: string): number {
        const entry = this.violations.get(key);
        if (!entry) return 1;

        // Check if outside window
        if (entry.firstViolation < Date.now() - this.escalationWindowMs) {
            this.violations.delete(key);
            return 1;
        }

        return entry.escalationLevel;
    }

    /**
     * Reset violations for a key
     */
    reset(key: string): void {
        this.violations.delete(key);
    }
}

export const violationTracker = new ViolationTracker();

// =============================================
// Response Cache (for rate-limited RPC fallback)
// =============================================

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttlMs: number;
}

class ResponseCache {
    private cache: Map<string, CacheEntry<unknown>> = new Map();
    private maxSize = 100;

    /**
     * Set cached response
     */
    set<T>(key: string, data: T, ttlSeconds: number = 60): void {
        // Evict oldest if at max size
        if (this.cache.size >= this.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            if (oldestKey) this.cache.delete(oldestKey);
        }

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttlMs: ttlSeconds * 1000,
        });
    }

    /**
     * Get cached response if valid
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);
        if (!entry) return null;

        // Check if expired
        if (Date.now() > entry.timestamp + entry.ttlMs) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Check if cache has valid entry
     */
    has(key: string): boolean {
        return this.get(key) !== null;
    }

    /**
     * Clear all cache
     */
    clear(): void {
        this.cache.clear();
    }
}

export const responseCache = new ResponseCache();

// =============================================
// Block List (in-memory mirror of DB)
// =============================================

class BlockList {
    private blockedIPs: Map<string, number> = new Map(); // IP -> unblockTime
    private blockedUsers: Map<string, number> = new Map(); // userId -> unblockTime
    private allowlistedIPs: Set<string> = new Set();

    isIPBlocked(ip: string): boolean {
        if (this.allowlistedIPs.has(ip)) return false;

        const unblockTime = this.blockedIPs.get(ip);
        if (!unblockTime) return false;

        if (Date.now() > unblockTime) {
            this.blockedIPs.delete(ip);
            return false;
        }

        return true;
    }

    isUserBlocked(userId: string): boolean {
        const unblockTime = this.blockedUsers.get(userId);
        if (!unblockTime) return false;

        if (Date.now() > unblockTime) {
            this.blockedUsers.delete(userId);
            return false;
        }

        return true;
    }

    blockIP(ip: string, durationMs: number): void {
        this.blockedIPs.set(ip, Date.now() + durationMs);
    }

    blockUser(userId: string, durationMs: number): void {
        this.blockedUsers.set(userId, Date.now() + durationMs);
    }

    unblockIP(ip: string): void {
        this.blockedIPs.delete(ip);
    }

    unblockUser(userId: string): void {
        this.blockedUsers.delete(userId);
    }

    allowlistIP(ip: string): void {
        this.allowlistedIPs.add(ip);
    }

    getBlockedIPs(): string[] {
        const now = Date.now();
        return Array.from(this.blockedIPs.entries())
            .filter(([_, unblockTime]) => unblockTime > now)
            .map(([ip]) => ip);
    }

    getBlockedUsers(): string[] {
        const now = Date.now();
        return Array.from(this.blockedUsers.entries())
            .filter(([_, unblockTime]) => unblockTime > now)
            .map(([userId]) => userId);
    }
}

export const blockList = new BlockList();
