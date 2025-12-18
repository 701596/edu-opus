import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        // 1. Service Role Key Check
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
            throw new Error('Missing Env Vars: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
        }

        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        // 2. Auth Check (Admins only or Open? Healthcheck implies test)
        // We'll require a valid user token to get a User ID for the test row.
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) throw new Error('Missing Auth Header')

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
        if (userError || !user) throw new Error('Invalid Token')

        // 3. Insert Test Row into ai_memories
        const testPayload = {
            user_id: user.id,
            summary: "HEALTHCHECK_TEST_" + Date.now(),
            messages: [{ role: 'system', content: 'Healthcheck verify' }]
        }

        const { data: memData, error: memError } = await supabaseAdmin
            .from('ai_memories')
            .upsert(testPayload, { onConflict: 'user_id' })
            .select()

        if (memError) {
            console.error("DB_ERROR", { function: "memory-healthcheck", table: "ai_memories", error: memError });
            throw new Error(`ai_memories Write Failed: ${memError.message}`)
        }

        // 4. Insert Test Row into ai_identity_memory
        const identityPayload = {
            user_id: user.id,
            name: "Healthcheck User",
            authority: "Tester"
        }

        const { error: idError } = await supabaseAdmin
            .from('ai_identity_memory')
            .upsert(identityPayload, { onConflict: 'user_id' })

        if (idError) {
            console.error("DB_ERROR", { function: "memory-healthcheck", table: "ai_identity_memory", error: idError });
            throw new Error(`ai_identity_memory Write Failed: ${idError.message}`)
        }

        return new Response(JSON.stringify({
            ok: true,
            memory_id: memData?.[0]?.id,
            service_role_active: true
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error: any) {
        return new Response(JSON.stringify({
            ok: false,
            error: error.message
        }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
})
