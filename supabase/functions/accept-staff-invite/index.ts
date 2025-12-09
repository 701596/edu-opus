/**
 * Accept Staff Invite - Supabase Edge Function
 * 
 * Validates security code and adds user to school.
 * Uses atomic RPC function for database operations.
 * 
 * @endpoint POST /accept-staff-invite
 * @body { token: string, code: string }
 * @returns { status: 'SUCCESS' | 'INVALID_TOKEN' | 'INVALID_CODE' | 'EXPIRED' | 'ALREADY_ACCEPTED' | 'NOT_AUTHENTICATED' | 'ERROR', ... }
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type AcceptStatus =
  | "SUCCESS"
  | "INVALID_TOKEN"
  | "INVALID_CODE"
  | "EXPIRED"
  | "ALREADY_ACCEPTED"
  | "NOT_AUTHENTICATED"
  | "ERROR";

interface AcceptInviteRequest {
  token: string;
  code: string;
}

interface AcceptInviteResponse {
  status: AcceptStatus;
  message?: string;
  role?: string;
  school_id?: string;
  school_name?: string;
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
      return jsonResponse<AcceptInviteResponse>(
        {
          status: "NOT_AUTHENTICATED",
          message: "Authentication required. Please log in first."
        },
        401
      );
    }

    // =============================================
    // 2. Initialize Supabase Client
    // =============================================
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    // Client with user's auth token
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // =============================================
    // 3. Authenticate User
    // =============================================
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError?.message);
      return jsonResponse<AcceptInviteResponse>(
        {
          status: "NOT_AUTHENTICATED",
          message: "Invalid or expired authentication. Please log in again."
        },
        401
      );
    }

    // =============================================
    // 4. Parse and Validate Request Body
    // =============================================
    const body: AcceptInviteRequest = await req.json();
    const { token, code } = body;

    if (!token) {
      return jsonResponse<AcceptInviteResponse>(
        { status: "INVALID_TOKEN", message: "Missing invite token" },
        400
      );
    }

    if (!code) {
      return jsonResponse<AcceptInviteResponse>(
        { status: "INVALID_CODE", message: "Security code is required" },
        400
      );
    }

    // Validate code format (6 alphanumeric characters)
    const codeRegex = /^[A-Za-z0-9]{6}$/;
    if (!codeRegex.test(code)) {
      return jsonResponse<AcceptInviteResponse>(
        { status: "INVALID_CODE", message: "Security code must be 6 alphanumeric characters" },
        400
      );
    }

    // =============================================
    // 5. Call Atomic RPC Function
    // =============================================
    // The RPC function handles:
    // - Token validation
    // - Security code verification
    // - Expiration check
    // - Already accepted check
    // - Creating school_members record
    // - Updating invite status
    // - Audit logging
    const { data: rpcResult, error: rpcError } = await supabaseUser.rpc("accept_invite_by_code", {
      p_token: token,
      p_code: code.toUpperCase(),
    });

    if (rpcError) {
      console.error("RPC error:", rpcError.message);
      return jsonResponse<AcceptInviteResponse>(
        { status: "ERROR", message: "Failed to process invite. Please try again." },
        500
      );
    }

    // =============================================
    // 6. Map RPC Response to HTTP Response
    // =============================================
    const statusCodeMap: Record<AcceptStatus, number> = {
      "SUCCESS": 200,
      "NOT_AUTHENTICATED": 401,
      "INVALID_TOKEN": 404,
      "INVALID_CODE": 400,
      "EXPIRED": 410,
      "ALREADY_ACCEPTED": 409,
      "ERROR": 500,
    };

    const httpStatus = statusCodeMap[rpcResult.status as AcceptStatus] || 500;

    return jsonResponse<AcceptInviteResponse>({
      status: rpcResult.status,
      message: rpcResult.message,
      role: rpcResult.role,
      school_id: rpcResult.school_id,
      school_name: rpcResult.school_name,
    }, httpStatus);

  } catch (error) {
    console.error("Unexpected error:", error);
    return jsonResponse<AcceptInviteResponse>(
      { status: "ERROR", message: "Internal server error. Please try again." },
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
