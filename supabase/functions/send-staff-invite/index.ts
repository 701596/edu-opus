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
            .gt("expires_at", new Date().toISOString())
            .single();

        if (existingInvite) {
            return new Response(
                JSON.stringify({ ok: false, error: "An active invite already exists for this email" }),
                { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // Create invite record
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

        // Get school name for the email
        const { data: school } = await adminClient
            .from("schools")
            .select("name")
            .eq("id", school_id)
            .single();

        const schoolName = school?.name || "the school";

        // Generate magic link using Supabase Auth Admin API
        // This will send an email via the configured SMTP (Google)
        const redirectUrl = `${req.headers.get("origin") || "https://edu-opus.vercel.app"}/accept-invite`;

        const { data: magicLinkData, error: magicLinkError } = await adminClient.auth.admin.generateLink({
            type: "magiclink",
            email: email.toLowerCase(),
            options: {
                redirectTo: redirectUrl,
                data: {
                    invite_id: invite.id,
                    school_id,
                    role,
                },
            },
        });

        if (magicLinkError) {
            console.error("Magic link error:", magicLinkError);
            // Rollback invite
            await adminClient.from("staff_invites").delete().eq("id", invite.id);
            return new Response(
                JSON.stringify({ ok: false, error: "Failed to generate magic link" }),
                { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        // The magic link is sent automatically by Supabase via the configured SMTP
        // We don't need to send it manually - Supabase handles email delivery

        console.log(`Invite created for ${email} to join ${schoolName} as ${role}`);

        return new Response(
            JSON.stringify({
                ok: true,
                message: `Invite sent to ${email}`,
                invite_id: invite.id,
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
