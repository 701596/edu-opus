import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
        JSON.stringify({ error: "Authentication required. Please log in first." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase clients
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client with user's auth token
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Admin client (bypass RLS for invite operations)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Invalid authentication. Please log in again." }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Accepting invite for user:", user.id, user.email);

    // Parse request body
    const body = await req.json();
    const { token } = body;

    if (!token) {
      return new Response(
        JSON.stringify({ error: "Missing invite token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Find the invite using service role (bypass RLS)
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("staff_invites")
      .select("*, schools(name)")
      .eq("invite_token", token)
      .single();

    if (inviteError || !invite) {
      console.error("Invite lookup error:", inviteError);
      return new Response(
        JSON.stringify({ error: "Invalid invite token. The link may be incorrect." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Found invite:", invite.id, "for email:", invite.email);

    // Check if already accepted
    if (invite.accepted) {
      return new Response(
        JSON.stringify({ error: "This invite has already been used." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    const now = new Date();
    const expiresAt = new Date(invite.expires_at);
    if (now > expiresAt) {
      return new Response(
        JSON.stringify({ error: "This invite has expired. Please request a new one." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Optional: Verify email matches (uncomment if you want strict email matching)
    // if (user.email?.toLowerCase() !== invite.email.toLowerCase()) {
    //   return new Response(
    //     JSON.stringify({ error: `This invite was sent to ${invite.email}. Please log in with that email.` }),
    //     { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    //   );
    // }

    // Check if user is already a staff member for this school
    const { data: existingMember } = await supabaseAdmin
      .from("staff_members")
      .select("id")
      .eq("school_id", invite.school_id)
      .eq("user_id", user.id)
      .single();

    if (existingMember) {
      // User already a member, just mark invite as accepted
      await supabaseAdmin
        .from("staff_invites")
        .update({
          accepted: true,
          accepted_by: user.id,
          accepted_at: new Date().toISOString(),
        })
        .eq("id", invite.id);

      return new Response(
        JSON.stringify({
          success: true,
          message: "You are already a member of this school.",
          school_id: invite.school_id,
          school_name: invite.schools?.name || "Unknown",
          role: invite.role,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create staff_members record
    const { error: memberError } = await supabaseAdmin
      .from("staff_members")
      .insert({
        owner_id: invite.owner_id,
        school_id: invite.school_id,
        user_id: user.id,
        role: invite.role,
      });

    if (memberError) {
      console.error("Failed to create staff member:", memberError);
      return new Response(
        JSON.stringify({ error: "Failed to add you to the school. Please try again." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark invite as accepted
    const { error: updateError } = await supabaseAdmin
      .from("staff_invites")
      .update({
        accepted: true,
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    if (updateError) {
      console.error("Failed to update invite:", updateError);
      // Non-critical error, member was already added
    }

    console.log("Staff member added successfully:", user.id, "to school:", invite.school_id);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Welcome! You've joined as ${invite.role}.`,
        school_id: invite.school_id,
        school_name: invite.schools?.name || "Unknown",
        role: invite.role,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
