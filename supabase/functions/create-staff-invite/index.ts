import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_ROLES = ["principal", "teacher", "accountant", "manager"];

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's auth token (for RLS)
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client (bypass RLS for operations)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Creating invite for user:", user.id);

    // Parse request body
    const body = await req.json();
    const { school_id, email, role } = body;

    // Validate inputs
    if (!school_id || !email || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: school_id, email, role" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate role
    if (!VALID_ROLES.includes(role)) {
      return new Response(
        JSON.stringify({ error: `Invalid role. Must be one of: ${VALID_ROLES.join(", ")}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is the owner/principal of this school
    // Using user's client to respect RLS (owner_id = auth.uid())
    const { data: existingInvites, error: checkError } = await supabaseUser
      .from("staff_invites")
      .select("id")
      .eq("school_id", school_id)
      .limit(1);

    // If no error, user has access (is owner). If permission denied, user is not owner.
    // We'll also verify by checking schools table
    const { data: schoolData, error: schoolError } = await supabaseAdmin
      .from("schools")
      .select("owner_id, name")
      .eq("id", school_id)
      .single();

    if (schoolError || !schoolData) {
      console.error("School lookup error:", schoolError);
      return new Response(
        JSON.stringify({ error: "School not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the user is the owner
    if (schoolData.owner_id !== user.id) {
      return new Response(
        JSON.stringify({ error: "Access denied. Only the school owner can create invites." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if invite already exists for this email
    const { data: existingInvite } = await supabaseAdmin
      .from("staff_invites")
      .select("id, accepted")
      .eq("school_id", school_id)
      .eq("email", email.toLowerCase())
      .single();

    if (existingInvite && !existingInvite.accepted) {
      return new Response(
        JSON.stringify({ error: "An active invite already exists for this email" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate unique invite token
    const inviteToken = crypto.randomUUID();
    
    // Generate 6-character security code
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Set expiration to 7 days from now
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    // Insert invite using admin client (since user client respects RLS which requires owner_id)
    const { data: invite, error: insertError } = await supabaseAdmin
      .from("staff_invites")
      .insert({
        owner_id: user.id,
        school_id,
        email: email.toLowerCase(),
        role,
        invite_token: inviteToken,
        code,
        expires_at: expiresAt.toISOString(),
        accepted: false,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create invite: " + insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build invite link
    // Use the origin from the request or fallback
    const origin = req.headers.get("origin") || "https://fhrskehzyvaqrgfyqopg.lovableproject.com";
    const inviteLink = `${origin}/join?token=${inviteToken}`;

    console.log("Invite created successfully:", invite.id);

    return new Response(
      JSON.stringify({
        success: true,
        invite: {
          id: invite.id,
          email: invite.email,
          role: invite.role,
          code: invite.code,
          expires_at: invite.expires_at,
          invite_link: inviteLink,
        },
        school_name: schoolData.name,
      }),
      { status: 201, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
