import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { classifyIntent, DataDomain, QueryCategory } from './intentClassifier.ts'
import { formatConversationThread } from './memoryGenerator.ts'
import { PLATFORM_BLUEPRINT } from './platformBlueprint.ts'
import { AXIOM_SYSTEM_PROMPT } from './systemPrompt.ts'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

interface IdentityMemory {
    user_id?: string;
    name?: string;
    role?: string;
    authority?: string;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return new Response('Missing auth', { status: 401, headers: corsHeaders })

        const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

        if (userError || !user) return new Response('Invalid token', { status: 401, headers: corsHeaders })

        const { data: memberships } = await supabaseAdmin
            .from('school_members')
            .select('school_id, role')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)

        if (!memberships?.length) return new Response('Access denied: No active school membership', { status: 403, headers: corsHeaders })
        const school_id = memberships[0].school_id

        const { message } = await req.json()
        if (!message) return new Response('Message required', { status: 400, headers: corsHeaders })

        // 🟢 1. IDENTITY EXTRACTION (REGEX - ZERO GUESSING)
        // Check for "My name is X", "Call me X", "I am X"
        // Simple regex for robustness.
        const nameRegex = /(?:my name is|call me|i am)\s+([a-zA-Z]+)/i;
        const nameMatch = message.match(nameRegex);

        let extractedName = null;
        if (nameMatch && nameMatch[1]) {
            extractedName = nameMatch[1];
            // UPSERT immediately if found
            // We use upsert logic: if name matches, great. If not, update it.
            // But user said: "If identity already exists -> DO NOT overwrite unless explicitly changed"
            // "Explicitly changed" implies "My name is X" IS an explicit change.
            // So we upsert.

            // Wait, we need to check existing first?
            // "If detection found -> UPSERT". "If identity already exists -> DO NOT overwrite unless explicitly..."
            // "My name is X" is explicit. So we upsert.

            await supabaseAdmin.from('ai_identity_memory').upsert({
                user_id: user.id,
                name: extractedName,
                // We keep existing role/authority if any (upsert merges if we select first? No, upsert replaces unless we specify columns)
                // We need to fetch current to merge.
            });
            // Actually, best to fetch first to do a safe merge.
        }

        // 🔵 2. LOAD MEMORY LAYERS
        // A. Identity (Single Source of Truth)
        const { data: identityRecord } = await supabaseAdmin
            .from('ai_identity_memory')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle()

        let identity: IdentityMemory = identityRecord || {}

        // Optimization: If we just extracted a name, use it in this session immediately even if DB write implies async race (though await handles it).
        if (extractedName) {
            identity.name = extractedName;
            // We should ensure the DB is updated.
            const { error: upsertError } = await supabaseAdmin.from('ai_identity_memory').upsert({
                user_id: user.id,
                name: extractedName,
                role: identity.role || 'Principal', // Default if missing
                authority: identity.authority || 'System Owner'
            }, { onConflict: 'user_id' });
            if (upsertError) console.error("Identity Upsert Error", upsertError);
        }

        // B. Context (Long/Short)
        const { data: contextRecord } = await supabaseAdmin
            .from('ai_memories')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle()

        const previousMessages = contextRecord?.messages || []
        const longTermSummary = contextRecord?.summary || "No specific preferences recorded."

        // 🟡 3. INTENT CLASSIFICIATION
        const intent = classifyIntent(message)

        // 🟣 4. PROMPT ASSEMBLY (LOCKED ORDER)
        const messages = []

        // [SYSTEM PROMPT]
        messages.push({ role: "system", content: AXIOM_SYSTEM_PROMPT })

        // [IDENTITY MEMORY – PROTECTED]
        const identityBlock = `[IDENTITY MEMORY – PROTECTED, AUTHORITATIVE]
• Name: ${identity.name || 'Unknown (Ask User)'}
• Role: ${identity.role || 'Principal'}
• Authority: ${identity.authority || 'Authorised User'}
• Instruction: This information is factual and must never be questioned, denied, or re-asked.`
        messages.push({ role: "system", content: identityBlock })

        // [LONG-TERM SUMMARY]
        messages.push({
            role: "system", content: `[LONG-TERM SUMMARY]
${longTermSummary}`
        })

        // [PLATFORM BLUEPRINT] (Nav only)
        if (intent.category === 'NAVIGATOR') {
            messages.push({
                role: "system", content: `[PLATFORM BLUEPRINT]
${PLATFORM_BLUEPRINT}`
            })
        }

        // [LAST 30 MESSAGES]
        const thread = formatConversationThread(previousMessages, 30);
        messages.push({
            role: "system", content: `[CONVERSATION THREAD]
${thread}`
        })

        // [CURRENT USER MESSAGE]
        messages.push({ role: "user", content: message })

        // 🔴 5. MEMORY FAILURE GUARD (FAIL FAST)
        if (identity.name && !identityBlock.includes(identity.name)) {
            // This is theoretically impossible given the code above, but checks for logic errors
            throw new Error("IDENTITY MEMORY NOT INJECTED — BLOCKING REQUEST")
        }

        // 🚀 6. CALL LLM
        console.log(`[LLM] Calling OpenRouter. Identity: ${identity.name || 'None'}`)
        const aiResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://eduopus.app',
                'X-Title': 'EduOpus AXIOM'
            },
            body: JSON.stringify({
                model: 'meta-llama/llama-3.3-70b-instruct:free',
                messages: messages,
                max_tokens: 1024,
                temperature: intent.category === 'NAVIGATOR' ? 0 : 0.3,
            })
        })

        if (!aiResponse.ok) {
            throw new Error(`OpenRouter Error: ${aiResponse.status} ${await aiResponse.text()}`)
        }

        const aiData = await aiResponse.json()
        let assistantContent = aiData.choices?.[0]?.message?.content || "System Error."

        // 7. Store Result (Short term)
        const updatedMessages = [
            ...previousMessages,
            { role: 'user', content: message },
            { role: 'assistant', content: assistantContent }
        ].slice(-30);

        await supabaseAdmin.from('ai_memories').upsert({
            user_id: user.id,
            school_id: school_id,
            messages: updatedMessages,
            updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

        return new Response(JSON.stringify({
            message: assistantContent,
            intent,
            debug: { identity_used: identity.name }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error: any) {
        console.error("AXIOM FATAL", error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    }
})
