import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.13";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateStaffRequest {
    email: string;
    role: "teacher" | "finance" | "admin";
    password: string;
    school_id: string;
    full_name: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        if (req.method !== "POST") {
            return new Response(
                JSON.stringify({ ok: false, error: "Method not allowed" }),
                { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const authHeader = req.headers.get("Authorization");
        if (!authHeader) {
            return new Response(
                JSON.stringify({ ok: false, error: "Missing authorization header" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const adminClient = createClient(supabaseUrl, supabaseServiceKey);

        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) {
            return new Response(
                JSON.stringify({ ok: false, error: "Unauthorized" }),
                { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const body: CreateStaffRequest = await req.json();
        const { email, role, password, school_id, full_name } = body;

        if (!email || !role || !password || !school_id || !full_name) {
            return new Response(
                JSON.stringify({ ok: false, error: "Missing required fields" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const validRoles = ["teacher", "finance", "admin"];
        if (!validRoles.includes(role)) {
            return new Response(
                JSON.stringify({ ok: false, error: "Invalid role" }),
                { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        const { data: memberData, error: memberError } = await adminClient
            .from("school_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("school_id", school_id)
            .single();

        if (memberError || !memberData || memberData.role !== "principal") {
            return new Response(
                JSON.stringify({ ok: false, error: "Only principals can add staff" }),
                { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
            );
        }

        let userId = "";
        let isNewUser = false;

        const { data: newUser, error: createError } = await adminClient.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
            user_metadata: { full_name, created_by_admin: true }
        });

        if (createError) {
            console.log("Create user error (maybe expected):", createError);
            const { data: { users }, error: listError } = await adminClient.auth.admin.listUsers();
            const existing = users?.find(u => u.email?.toLowerCase() === email.toLowerCase());

            if (existing) {
                userId = existing.id;
            } else {
                return new Response(
                    JSON.stringify({ ok: false, error: createError.message || "Failed to create user" }),
                    { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
                );
            }
        } else {
            userId = newUser.user.id;
            isNewUser = true;
        }

        const { error: memberError2 } = await adminClient
            .from("school_members")
            .upsert({
                school_id,
                user_id: userId,
                role
            }, { onConflict: 'school_id, user_id' });

        if (memberError2) throw memberError2;

        const { error: profileError } = await adminClient
            .from("profiles")
            .upsert({
                id: userId,
                role: role,
                full_name
            });

        if (profileError) throw profileError;

        const smtpHost = Deno.env.get("SMTP_HOST");
        const smtpUser = Deno.env.get("SMTP_USER");
        const smtpPass = Deno.env.get("SMTP_PASS");

        if (smtpHost && smtpUser && smtpPass) {
            try {
                const transporter = nodemailer.createTransport({
                    host: smtpHost,
                    port: 465,
                    secure: true,
                    auth: { user: smtpUser, pass: smtpPass }
                });

                const siteUrl = Deno.env.get("SITE_URL") || req.headers.get("origin") || "https://edu-opus.vercel.app";

                const emailContent = isNewUser
                    ? `You have been added to the school staff.\n\nLogin: ${siteUrl}\nEmail: ${email}\nPassword: ${password}`
                    : `You have been added to the school staff.\n\nRole: ${role}\nLogin: ${siteUrl}\n\nPlease login with your existing account password.`;

                await transporter.sendMail({
                    from: smtpUser,
                    to: email,
                    subject: "School Staff Credentials",
                    text: emailContent,
                });
                console.log("Email sent successfully");
            } catch (emailError) {
                console.error("Failed to send email:", emailError);
                // We do NOT throw here because the user is created. We return 200 but maybe with a warning?
                // Or just log it. The UI says "User created". Use console for debugging.
            }
        } else {
            console.log("Skipping email: SMTP credentials not set");
        }

        return new Response(
            JSON.stringify({ ok: true, userId, isNewUser }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
