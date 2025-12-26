import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface InviteRequest {
    email: string;
    role: "teacher" | "finance" | "admin";
    school_id: string;
    resend?: boolean;
}

Deno.serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        // Validate method
        if (req.method !== "POST") {
            return new Response(
                JSON.stringify({ ok: false, error: "Method not allowed" }),
                { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Get auth header
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ ok: false, error: "Missing authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create Supabase client with user's token
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        // User client for auth verification
        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        // Service client for admin operations
        const adminClient = createClient(supabaseUrl, supabaseServiceKey);

        // Get current user
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
            return new Response(
                JSON.stringify({ ok: false, error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Parse request body
        const body: InviteRequest = await req.json();
        const { email, role, school_id } = body;

        // Validate required fields
        if (!email || !role || !school_id) {
            return new Response(
                JSON.stringify({ ok: false, error: "Missing required fields: email, role, school_id" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Validate role
        const validRoles = ["teacher", "finance", "admin"];
        if (!validRoles.includes(role)) {
            return new Response(
                JSON.stringify({ ok: false, error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return new Response(
                JSON.stringify({ ok: false, error: "Invalid email format" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Verify caller is principal of this school
        const { data: memberData, error: memberError } = await adminClient
            .from("school_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("school_id", school_id)
            .single();

        if (memberError || !memberData || memberData.role !== "principal") {
            return new Response(
                JSON.stringify({ ok: false, error: "Only principals can send invites" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Check for existing unused invite
        const { data: existingInvite } = await adminClient
            .from("staff_invites")
            .select("id, expires_at")
            .eq("email", email.toLowerCase())
            .eq("school_id", school_id)
            .is("used_at", null)
            .single();

        let inviteId;

        // Handle existing invite
        if (existingInvite) {
            const isExpired = new Date(existingInvite.expires_at) < new Date();
            const shouldResend = body.resend === true;

            if (!isExpired && !shouldResend) {
                return new Response(
                    JSON.stringify({ ok: false, error: "An active invite already exists for this email" }),
                    { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }

            // If expired or resending, update the existing invite
            const { data: updatedInvite, error: updateError } = await adminClient
                .from("staff_invites")
                .update({
                    role,
                    invited_by: user.id,
                    created_at: new Date().toISOString(), // effectively "new"
                    expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
                })
                .eq("id", existingInvite.id)
                .select()
                .single();

            if (updateError) {
                throw updateError;
            }
            inviteId = updatedInvite.id;
        } else {
            // Create new invite
            const { data: invite, error: insertError } = await adminClient
                .from("staff_invites")
                .insert({
                    email: email.toLowerCase(),
                    school_id,
                    role,
                    invited_by: user.id,
                })
                .select()
                .single();

            if (insertError) {
                console.error("Insert error:", insertError);
                return new Response(
                    JSON.stringify({ ok: false, error: "Failed to create invite" }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
            inviteId = invite.id;
        }

        // Get school name for the email
        const { data: school } = await adminClient
            .from("schools")
            .select("name")
            .eq("id", school_id)
            .single();

        const schoolName = school?.name || "the school";

        // Send invite email using Supabase's native inviteUserByEmail
        // This effectively sends a magic link (password reset / setup link) via the configured SMTP (Gmail)
        const origin = req.headers.get("origin");

        // Construct redirect URL
        // MUST point to /accept-invite
        // Use origin if available, otherwise fallback to known production URL
        // We use a specific env var for SITE_URL if set, or default
        const siteUrl = Deno.env.get("SITE_URL") || origin || "https://edu-opus.vercel.app";
        const redirectUrl = `${siteUrl.replace(/\/+$/, "")}/accept-invite`;

        const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
            email.toLowerCase(),
            {
                data: {
                    school_id,
                    role,
                    invite_id: inviteId,
                },
                redirectTo: redirectUrl,
            }
        );

        if (inviteError) {
            console.error("Invite email error:", inviteError);
            // Rollback invite record (only if it was new? Actually hard to rollback update. Just log it.)
            if (!existingInvite) {
                await adminClient.from("staff_invites").delete().eq("id", inviteId);
            }
            return new Response(
                JSON.stringify({
                    ok: false,
                    error: `Failed to send invite email: ${inviteError.message || JSON.stringify(inviteError)}`,
                    details: inviteError
                }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        console.log(`Invite sent for ${email} to join ${schoolName} as ${role}`);

        return new Response(
            JSON.stringify({
                ok: true,
                message: `Invite sent to ${email}`,
                invite_id: inviteId,
            }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (error) {
        console.error("Unexpected error:", error);
        return new Response(
            JSON.stringify({ ok: false, error: "Internal server error" }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
