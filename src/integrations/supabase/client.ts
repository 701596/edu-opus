/**
 * Rate-Limited Supabase Client Wrapper
 * 
 * Wraps the Supabase client to enforce rate limits on all operations.
 * Provides seamless integration with existing code.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './types';
import {
  checkRateLimit,
  mapEndpoint,
  cacheResponse,
  isRateLimitingDisabled,
} from '@/lib/rateLimitMiddleware';
import { RATE_LIMITING_ENABLED } from '@/lib/rateLimitConfig';

const SUPABASE_URL = "https://fhrskehzyvaqrgfyqopg.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZocnNrZWh6eXZhcXJnZnlxb3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMjA4ODgsImV4cCI6MjA3NDc5Njg4OH0.6J4sqB33uIu-Cpk5AuN3KxT4TShjZAD8VYwXQHeHBcA";

// Create the base Supabase client
const baseSupabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});

// =============================================
// Enhanced Supabase Client with Rate Limiting
// =============================================

/**
 * Create the rate-limited client
 */
function createRateLimitedClient(): SupabaseClient<Database> {
  const client = baseSupabase;

  // Wrap the original rpc method
  const originalRpc = client.rpc.bind(client);
  (client as any).rpc = async function (fnName: string, params?: Record<string, unknown>) {
    const endpoint = mapEndpoint('rpc', undefined, fnName);

    // Check rate limit
    if (RATE_LIMITING_ENABLED && !isRateLimitingDisabled()) {
      const result = checkRateLimit(endpoint);

      if (!result.allowed) {
        // Check for cached fallback
        if (result.cachedData !== undefined) {
          console.log(`[RateLimit] Returning cached data for ${fnName}`);
          return {
            data: result.cachedData,
            error: null,
          };
        }

        // Return rate limit error
        console.warn(`[RateLimit] Blocked ${fnName}:`, result.error?.message);
        return {
          data: null,
          error: {
            message: result.error?.message || 'Rate limited',
            details: 'Too many requests',
            hint: `Retry after ${result.error?.retry_after || 60} seconds`,
            code: 'RATE_LIMITED',
          },
        };
      }
    }

    // Make the actual call
    const response = await originalRpc(fnName as any, params as any);

    // Cache successful RPC responses for fallback
    if (response.data && !response.error) {
      cacheResponse(endpoint, response.data, 60);
    }

    return response;
  };

  // Wrap auth signInWithPassword
  const originalSignIn = client.auth.signInWithPassword.bind(client.auth);
  (client.auth as any).signInWithPassword = async function (credentials: { email: string; password: string }) {
    const endpoint = 'auth.login';

    // Check rate limit
    if (RATE_LIMITING_ENABLED && !isRateLimitingDisabled()) {
      const result = checkRateLimit(endpoint);

      if (!result.allowed) {
        console.warn(`[RateLimit] Blocked login attempt`);
        return {
          data: { user: null, session: null },
          error: {
            message: result.error?.message || 'Too many login attempts',
            status: 429,
          },
        };
      }
    }

    return originalSignIn(credentials);
  };

  // Wrap auth signUp
  const originalSignUp = client.auth.signUp.bind(client.auth);
  (client.auth as any).signUp = async function (credentials: { email: string; password: string }) {
    const endpoint = 'auth.signup';

    // Check rate limit
    if (RATE_LIMITING_ENABLED && !isRateLimitingDisabled()) {
      const result = checkRateLimit(endpoint);

      if (!result.allowed) {
        console.warn(`[RateLimit] Blocked signup attempt`);
        return {
          data: { user: null, session: null },
          error: {
            message: result.error?.message || 'Too many signup attempts',
            status: 429,
          },
        };
      }
    }

    return originalSignUp(credentials);
  };

  return client;
}

// Export the rate-limited client
export const supabase = createRateLimitedClient();

// Also export base client for cases where rate limiting should be bypassed
export const supabaseUnlimited = baseSupabase;

// Export utilities for direct use
export { checkRateLimit, mapEndpoint, cacheResponse } from '@/lib/rateLimitMiddleware';