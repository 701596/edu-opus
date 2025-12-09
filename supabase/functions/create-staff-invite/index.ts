/**
 * Create Staff Invite - Supabase Edge Function
 * 
 * Secure invite creation for school principals.
 * Uses service role key for database operations.
 * 
 * @endpoint POST /create-staff-invite
 * @body { school_id: UUID, email: string, role: user_role, expires_in_hours?: number }
 * @returns { status: 'SUCCESS' | 'ERROR', invite_id?, token?, security_code?, link?, message? }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Valid roles enum
const VALID_ROLES = ["principal", "accountant", "cashier", "teacher"] as const;
type UserRole = typeof VALID_ROLES[number];

interface CreateInviteRequest {
  school_id: string;
  email: string;
  role: UserRole;
  expires_in_hours?: number;
}

interface CreateInviteResponse {
  status: "SUCCESS" | "FORBIDDEN" | "ALREADY_MEMBER" | "VALIDATION_ERROR" | "NOT_AUTHENTICATED" | "ERROR";
  message?: string;
  invite_id?: string;
  token?: string;
  security_code?: string;
  link?: string;
  expires_at?: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // =============================================
    // 1. Validate Authorization Header
    // =============================================
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse<CreateInviteResponse>(
        { status: "NOT_AUTHENTICATED", message: "Authorization header required" },
        401
      );
    }

    // =============================================
    // 2. Initialize Supabase Clients
    // =============================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's auth token (for permission checks)
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client (bypass RLS for operations)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // =============================================
    // 3. Authenticate User
    // =============================================
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      return jsonResponse<CreateInviteResponse>(
        { status: "NOT_AUTHENTICATED", message: "Invalid or expired authentication token" },
        401
      );
    }

    // =============================================
    // 4. Parse and Validate Request Body
    // =============================================
    const body: CreateInviteRequest = await req.json();
    const { school_id, email, role, expires_in_hours = 168 } = body;

    // Validate required fields
    if (!school_id || !email || !role) {
      return jsonResponse<CreateInviteResponse>(
        { status: "VALIDATION_ERROR", message: "Missing required fields: school_id, email, role" },
        400
      );
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return jsonResponse<CreateInviteResponse>(
        { status: "VALIDATION_ERROR", message: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` },
        400
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return jsonResponse<CreateInviteResponse>(
        { status: "VALIDATION_ERROR", message: "Invalid email format" },
        400
      );
    }

    // Validate expires_in_hours
    if (expires_in_hours < 1 || expires_in_hours > 720) {
      return jsonResponse<CreateInviteResponse>(
        { status: "VALIDATION_ERROR", message: "expires_in_hours must be between 1 and 720" },
        400
      );
    }

    // =============================================
    // 5. Call Secure RPC Function
    // =============================================
    // Use RPC which handles permission checks, duplicate detection, and audit logging
    const { data: rpcResult, error: rpcError } = await supabaseUser.rpc("create_invite_secure", {
      p_school_id: school_id,
      p_email: email,
      p_role: role,
      p_expires_hours: expires_in_hours,
    });

    if (rpcError) {
      console.error("RPC error:", rpcError.message);
      return jsonResponse<CreateInviteResponse>(
        { status: "ERROR", message: "Failed to create invite" },
        500
      );
    }

    // Check RPC response status
    if (rpcResult.status !== "SUCCESS") {
      const statusCode = rpcResult.status === "FORBIDDEN" ? 403 : 
                         rpcResult.status === "NOT_AUTHENTICATED" ? 401 : 400;
      return jsonResponse<CreateInviteResponse>(rpcResult, statusCode);
    }

    // =============================================
    // 6. Build Invite Link
    // =============================================
    const origin = req.headers.get("origin") || Deno.env.get("NEXT_PUBLIC_SITE_URL") || "https://fhrskehzyvaqrgfyqopg.lovableproject.com";
    const inviteLink = `${origin}/invite/${rpcResult.token}`;

    // =============================================
    // 7. Return Success Response
    // =============================================
    // NOTE: security_code is returned for TESTING ONLY
    // TODO: Remove security_code from response in production (send via email instead)
    return jsonResponse<CreateInviteResponse>({
      status: "SUCCESS",
      invite_id: rpcResult.invite_id,
      token: rpcResult.token,
      security_code: rpcResult.security_code, // TESTING ONLY - remove for production
      link: inviteLink,
      expires_at: rpcResult.expires_at,
    }, 201);

  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse<CreateInviteResponse>(
      { status: "ERROR", message: "Internal server error" },
      500
    );
  }
});

/**
 * Helper to create JSON response with CORS headers
 */
function jsonResponse<T>(data: T, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
