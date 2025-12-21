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

const MAX_HISTORY_MESSAGES = 30;

interface IdentityMemory {
    user_id?: string;
    name?: string;
    role?: string;
    authority?: string;
}

// 🟢 HARD ERROR LOGGER
const logDbError = (context: string, error: any, payload?: any) => {
    console.error("DB_ERROR", {
        function: "ai-query",
        table: context,
        payload,
        error
    });
    throw new Error(`Database Error (${context}): ${error.message}`);
};

/**
 * IDENTITY UPSERT (Unique per User)
 */
async function upsertIdentity(supabase: any, user_id: string, payload: any) {
    // Check existing
    const { data: existing, error: fetchError } = await supabase
        .from('ai_identity_memory')
        .select('id')
        .eq('user_id', user_id)
        .maybeSingle()

    if (fetchError) logDbError("ai_identity_memory_fetch", fetchError, { user_id });

    if (existing) {
        const { error: updateError } = await supabase
            .from('ai_identity_memory')
            .update(payload)
            .eq('id', existing.id);
        if (updateError) logDbError("ai_identity_memory_update", updateError, { id: existing.id });
    } else {
        const { error: insertError } = await supabase
            .from('ai_identity_memory')
            .insert({ ...payload, user_id });
        if (insertError) logDbError("ai_identity_memory_insert", insertError, payload);
    }
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ ok: false, error: 'Missing authorization header' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 🟢 1. INFRA: SERVICE ROLE CLIENT
        if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing Server Env Vars");
        const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

        if (userError || !user) {
            return new Response(JSON.stringify({ ok: false, error: 'Invalid or expired token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 2. School Membership Check
        const { data: memberships, error: memberError } = await supabaseAdmin
            .from('school_members')
            .select('school_id, role')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)

        if (memberError) logDbError("school_members", memberError, { user_id: user.id });
        if (!memberships?.length) {
            return new Response(JSON.stringify({ ok: false, error: 'Access denied: No active school membership' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }
        const school_id = memberships[0].school_id

        const { message, session_id } = await req.json()
        if (!message) {
            return new Response(JSON.stringify({ ok: false, error: 'Message is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 3. IDENTITY EXTRACTION (REGEX)
        const nameRegex = /(?:my name is|call me|i am)\s+([a-zA-Z]+)/i;
        const nameMatch = message.match(nameRegex);

        let extractedName = null;
        if (nameMatch && nameMatch[1]) {
            extractedName = nameMatch[1];
            await upsertIdentity(supabaseAdmin, user.id, {
                name: extractedName,
                updated_at: new Date().toISOString()
            });
        }

        // 4. LOAD MEMORY LAYERS
        // A. Identity (Global)
        const { data: identityRecord, error: idLoadError } = await supabaseAdmin
            .from('ai_identity_memory')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle()
        if (idLoadError) logDbError("ai_identity_memory_load", idLoadError);

        let identity: IdentityMemory = identityRecord || {}
        if (extractedName) identity.name = extractedName;

        // B. Context (Session Aware)
        // If session_id provided, load THAT session. If not, we will creat a new one.
        let fullMessages = [];
        let longTermSummary = "No specific long-term summary available yet.";
        let currentSessionId = session_id;

        if (currentSessionId) {
            const { data: sessionRecord, error: sessLoadError } = await supabaseAdmin
                .from('ai_memories')
                .select('*')
                .eq('id', currentSessionId)
                .single();

            if (sessLoadError) {
                // If not found, assume invalid session and treat as new? Or error?
                // Let's treat as new if not found, but log warning.
                console.warn(`Session ${currentSessionId} not found. Creating new.`);
                currentSessionId = null;
            } else {
                fullMessages = sessionRecord.messages || [];
                longTermSummary = sessionRecord.summary || longTermSummary;
            }
        }

        // 🟢 5. PERSISTENCE: SAVE USER MESSAGE BEFORE LLM CALL
        const userMsgObj = { role: 'user', content: message, timestamp: new Date().toISOString() };
        const preCallMessages = [...fullMessages, userMsgObj];

        // Save to DB (Update or Insert)
        if (currentSessionId) {
            const { error: updateError } = await supabaseAdmin
                .from('ai_memories')
                .update({
                    messages: preCallMessages,
                    updated_at: new Date().toISOString()
                })
                .eq('id', currentSessionId);

            if (updateError) logDbError("ai_memories_update", updateError, { id: currentSessionId });
        } else {
            // New Session
            const { data: newSession, error: insertError } = await supabaseAdmin
                .from('ai_memories')
                .insert({
                    user_id: user.id,
                    school_id: school_id,
                    messages: preCallMessages,
                    summary: null, // Start fresh
                    updated_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) logDbError("ai_memories_insert", insertError);
            currentSessionId = newSession.id;
        }

        // 6. INTENT & ASSEMBLY
        const intent = classifyIntent(message)
        const promptMessages = []

        // L1: SYSTEM PROMPT
        promptMessages.push({ role: "system", content: AXIOM_SYSTEM_PROMPT })

        // L2: IDENTITY MEMORY
        const identityBlock = `[IDENTITY MEMORY – PROTECTED, AUTHORITATIVE]
• Name: ${identity.name || 'Unknown (Capture if provided)'}
• Role: ${identity.role || 'Principal'}
• Authority: ${identity.authority || 'System Owner'}
• Instruction: This information is factual and must never be questioned, denied, or re-asked.`
        promptMessages.push({ role: "system", content: identityBlock })

        // L3: LONG-TERM SUMMARY
        promptMessages.push({
            role: "system", content: `[LONG-TERM SUMMARY]
${longTermSummary}`
        })

        // L4: BLUEPRINT (Conditional)
        if (intent.category === 'NAVIGATOR') {
            promptMessages.push({
                role: "system", content: `[PLATFORM BLUEPRINT]
${PLATFORM_BLUEPRINT}`
            })
        }

        // L5: LAST 30 MESSAGES
        const historyMessages = preCallMessages.slice(0, -1);
        let recentHistory = historyMessages;
        let summaryContext = "";

        if (historyMessages.length > MAX_HISTORY_MESSAGES) {
            recentHistory = historyMessages.slice(-MAX_HISTORY_MESSAGES);
            summaryContext = `[HISTORY SUMMARY: Previous ${historyMessages.length - MAX_HISTORY_MESSAGES} messages exist in database.]`;
        }

        if (summaryContext) promptMessages.push({ role: "system", content: summaryContext });

        recentHistory.forEach((msg: any) => {
            if (msg.role === 'user' || msg.role === 'assistant') {
                promptMessages.push({ role: msg.role, content: msg.content });
            }
        });

        // L6: CURRENT USER MESSAGE
        promptMessages.push({ role: "user", content: message })

        // 🔴 MEMORY FAILURE GUARD
        if (identity.name && !identityBlock.includes(identity.name)) {
            throw new Error("IDENTITY MEMORY NOT INJECTED — BLOCKING REQUEST")
        }

        // 🚀 7. CALL LLM
        console.log(`[LLM] Calling OpenRouter. Model: meta-llama/llama-3.3-70b-instruct:free`)
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
                messages: promptMessages,
                max_tokens: 1024,
                temperature: intent.category === 'NAVIGATOR' ? 0 : 0.3,
            })
        })

        if (!aiResponse.ok) {
            const errText = await aiResponse.text()
            console.error('[LLM] API Error Response:', errText)
            throw new Error(`OpenRouter Error: ${aiResponse.status}`)
        }

        const aiData = await aiResponse.json()
        if (aiData.error) throw new Error(`LLM Error: ${JSON.stringify(aiData.error)}`)

        let assistantContent = aiData.choices?.[0]?.message?.content || "System Error."

        // 8. PERSISTENCE: SAVE ASSISTANT MESSAGE
        const assistantMsgObj = { role: 'assistant', content: assistantContent, timestamp: new Date().toISOString() };
        const finalMessages = [...preCallMessages, assistantMsgObj];

        const { error: finalSaveError } = await supabaseAdmin.from('ai_memories')
            .update({
                messages: finalMessages,
                updated_at: new Date().toISOString()
            })
            .eq('id', currentSessionId);

        if (finalSaveError) logDbError("ai_memories_final_save", finalSaveError);

        return new Response(JSON.stringify({
            message: assistantContent,
            session_id: currentSessionId, // Return ID for client to track
            intent,
            debug: { identity_used: identity.name, history_length: finalMessages.length }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error: any) {
        return new Response(JSON.stringify({ ok: false, error: error.message || 'Internal server error' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
