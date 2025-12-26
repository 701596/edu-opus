import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface DeleteStaffRequest {
    target_user_id: string;
    school_id: string;
}

Deno.serve(async (req: Request) => {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const authHeader = req.headers.get("Authorization");
        if (!authHeader) throw new Error("Missing Authorization header");

        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

        const userClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        const adminClient = createClient(supabaseUrl, supabaseServiceKey);

        // 1. Authenticate Caller
        const { data: { user }, error: authError } = await userClient.auth.getUser();
        if (authError || !user) throw new Error("Unauthorized");

        const { target_user_id, school_id } = await req.json() as DeleteStaffRequest;
        if (!target_user_id || !school_id) throw new Error("Missing required fields");

        if (target_user_id === user.id) throw new Error("You cannot delete yourself");

        // 2. Verify Caller is Principal of this School
        const { data: callerRole, error: roleError } = await adminClient
            .from("school_members")
            .select("role")
            .eq("user_id", user.id)
            .eq("school_id", school_id)
            .single();

        if (roleError || !callerRole || callerRole.role !== 'principal') {
            throw new Error("Only principals can delete staff");
        }

        // 3. Verify Target is member of this School (and NOT a principal?)
        // Actually, principal CAN delete other staff. But deleting another principal might be dangerous?
        // Let's assume Principal can delete anyone else for now, or restrict deleting other principals.
        // We will restrict deleting other principals to prevent lockout if shared.

        const { data: targetMember, error: targetError } = await adminClient
            .from("school_members")
            .select("role")
            .eq("user_id", target_user_id)
            .eq("school_id", school_id)
            .single();

        if (targetError || !targetMember) throw new Error("Target user not found in this school");
        if (targetMember.role === 'principal') throw new Error("Cannot delete another Principal. Demote them first.");

        // 4. Delete from Auth (Cascade should handle school_members if FK is DELETE CASCADE)
        // If not, we manually delete school_members.
        // Usually auth deletion is final.
        // Check if we need to delete school_members first?
        // Best practice: Delete from Auth.

        const { error: deleteError } = await adminClient.auth.admin.deleteUser(target_user_id);
        if (deleteError) throw deleteError;

        // Ensure DB cleanup if cascade didn't happen (Auth usually doesn't cascade to public tables automatically unless setup)
        // We will explicitly delete from school_members and profiles to be clean.
        await adminClient.from("school_members").delete().eq("user_id", target_user_id);
        await adminClient.from("profiles").delete().eq("id", target_user_id);

        return new Response(
            JSON.stringify({ ok: true }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );

    } catch (err: any) {
        console.error("Error:", err);
        return new Response(
            JSON.stringify({ ok: false, error: err.message }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }
});
