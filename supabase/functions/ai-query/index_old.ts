import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INTENT CLASSIFICATION (Rule-Based)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

type QueryCategory = 'DATA_QUERY' | 'STRATEGY' | 'COMMUNICATION' | 'WRITE_REQUEST' | 'GENERAL'
type DataDomain = 'STUDENTS' | 'ATTENDANCE' | 'FEES' | 'STAFF' | 'CLASSES' | 'QUICK_STATS' | 'UNKNOWN'

interface QueryIntent {
    category: QueryCategory
    domain: DataDomain
    params: Record<string, any>
    requires_data: boolean
    is_wildcard: boolean
}

function classifyIntent(query: string): QueryIntent {
    const q = query.toLowerCase()

    // Category detection
    let category: QueryCategory = 'GENERAL'
    let requires_data = false

    if (/\b(add|create|update|edit|delete|remove|mark|record)\b/.test(q)) {
        category = 'WRITE_REQUEST'
        requires_data = true
    } else if (/\b(how many|count|total|list|show|display|get|what is|what's|report|summary|pending|collected)\b/.test(q)) {
        category = 'DATA_QUERY'
        requires_data = true
    } else if (/\b(how (can|do|should)|suggest|recommend|improve|reduce|plan|strategy)\b/.test(q)) {
        category = 'STRATEGY'
    } else if (/\b(write|draft|compose|email|letter|notice|circular)\b/.test(q)) {
        category = 'COMMUNICATION'
    }

    // Domain detection
    let domain: DataDomain = 'UNKNOWN'
    if (/\bstudent|enroll|admission|class\s*\d+|grade\s*\d+/i.test(q)) domain = 'STUDENTS'
    else if (/\battendance|present|absent|leave/i.test(q)) domain = 'ATTENDANCE'
    else if (/\bfee|payment|pending.*amount|collected|due|remaining/i.test(q)) domain = 'FEES'
    else if (/\bstaff|teacher|employee|salary|payroll/i.test(q)) domain = 'STAFF'
    else if (/\bclass(?:es)?(?!\s*\d)|section|subject/i.test(q)) domain = 'CLASSES'
    else if (/\boverall|dashboard|summary|quick/i.test(q)) domain = 'QUICK_STATS'

    // Parameter extraction
    const params: Record<string, any> = {}
    const classMatch = query.match(/\b(?:class|grade)\s*(\d+|nursery|lkg|ukg|kg)/i)
    if (classMatch) params.class_name = classMatch[1].toUpperCase()

    if (/\bpending\b/i.test(q)) params.status = 'pending'
    if (/\bcollected\b/i.test(q)) params.status = 'collected'
    if (/\btoday\b/i.test(q)) {
        params.date_from = new Date().toISOString().split('T')[0]
        params.date_to = params.date_from
    }

    // Wildcard detection
    const is_wildcard = /\ball\s*(students?|staff|teachers?|fees)|entire\s*school|everyone|show\s*everything/i.test(q)

    return { category, domain, params, requires_data, is_wildcard }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATA FETCHERS (Scoped)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function fetchScopedData(
    supabase: any,
    domain: DataDomain,
    params: Record<string, any>,
    school_id: string
): Promise<{ data: any; error: string | null }> {
    let rpcName: string
    let rpcParams: Record<string, any> = { p_school_id: school_id }

    switch (domain) {
        case 'STUDENTS':
            rpcName = 'get_students_scoped'
            if (params.class_name) rpcParams.p_class_name = params.class_name
            if (params.status) rpcParams.p_status = params.status
            break
        case 'ATTENDANCE':
            rpcName = 'get_attendance_scoped'
            if (params.class_name) rpcParams.p_class_name = params.class_name
            if (params.date_from) rpcParams.p_date_from = params.date_from
            if (params.date_to) rpcParams.p_date_to = params.date_to
            if (params.status) rpcParams.p_status = params.status
            break
        case 'FEES':
            rpcName = 'get_fees_scoped'
            if (params.class_name) rpcParams.p_class_name = params.class_name
            if (params.status) rpcParams.p_status = params.status
            break
        case 'STAFF':
            rpcName = 'get_staff_scoped'
            if (params.department) rpcParams.p_department = params.department
            if (params.role) rpcParams.p_role = params.role
            break
        case 'CLASSES':
            rpcName = 'get_classes_scoped'
            break
        case 'QUICK_STATS':
            rpcName = 'get_school_quick_stats'
            break
        default:
            return { data: null, error: 'Unknown data domain' }
    }

    const { data, error } = await supabase.rpc(rpcName, rpcParams)

    if (error) {
        console.error(`RPC ${rpcName} error:`, error)
        return { data: null, error: error.message }
    }

    return { data, error: null }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// RESPONSE VALIDATOR (Anti-Hallucination)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const BANNED_PATTERNS = /\b(typically|usually|estimated|approximately|around|about|roughly|based on (patterns|averages|previous)|I (assume|believe|think)|it('s| is) (likely|probably))\b/i

function validateResponse(response: string, hasVerifiedData: boolean): { valid: boolean; reason?: string } {
    if (!hasVerifiedData && BANNED_PATTERNS.test(response)) {
        return {
            valid: false,
            reason: 'Response contains unverified estimations without data backing'
        }
    }
    return { valid: true }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM PROMPT BUILDER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function buildSystemPrompt(
    school_id: string,
    school_name: string,
    injectedData: any | null,
    intent: QueryIntent
): string {
    let dataSection = ''

    if (injectedData && injectedData.data) {
        const metadata = injectedData.metadata || {}
        const reconciliation = injectedData.reconciliation || {}

        dataSection = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
VERIFIED DATA (Use ONLY this data for your response)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Dataset: ${metadata.dataset || 'unknown'}
Record Count: ${metadata.record_count || 0}
Last Updated: ${metadata.last_updated || 'unknown'}
Filters Applied: ${JSON.stringify(metadata.filters_applied || {})}

DATA:
${JSON.stringify(injectedData.data, null, 2)}

RECONCILIATION:
${JSON.stringify(reconciliation, null, 2)}
${!reconciliation.is_valid ? '\n⚠️ WARNING: Data reconciliation FAILED. Discrepancy detected. You MUST surface this in your response.' : ''}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`
    }

    return `You are **AXIOM** — the Executive Intelligence Engine for EduOpus.

You serve exclusively as Chief of Staff to the School Principal.
You exist to turn raw school data into executive clarity.
You are not a chatbot. You are a decision-support system.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
ABSOLUTE PROHIBITIONS (The Iron Laws)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You must NEVER:
❌ Invent, guess, estimate, or hallucinate data
❌ Use placeholder numbers or approximate figures
❌ Say "typically", "usually", "approximately", "around", "about"
❌ Give advice "based on patterns" or "based on averages"
❌ Expose internal identifiers (UUIDs, table names, SQL, row IDs)
❌ Use AI-sounding filler phrases ("I hope this helps!", "Certainly!")
❌ Apologize for data realities ("Sorry the attendance is low")

If data is missing or not provided below, say EXACTLY:
→ "I cannot verify this. No data exists for this query."

No workarounds. No fabrication. Silence over fiction.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CURRENT CONTEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
User Role: Principal
School ID: ${school_id}
School Name: ${school_name || 'Your School'}
Current Date: ${new Date().toISOString().split('T')[0]}
Query Category: ${intent.category}
Data Domain: ${intent.domain}
${dataSection}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
RESPONSE FORMAT (Executive Brief Protocol)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

■ BOTTOM LINE
  One-sentence direct answer to the core question.

■ EVIDENCE
  • If DATA: Tables, lists, metrics with comparison deltas
  • If STRATEGY: Bullet points + resource requirements + risk factors
  • If DRAFT: The composed text in a clear block
  • If MATH: Step-by-step calculation, no skips

■ BLIND SPOTS (if any data gaps exist)
  • "I could not verify [X]"
  • "Data missing for [Z] — results may be incomplete"

■ NEXT MOVE
  A specific actionable prompt to advance the task

■ CONFIDENCE
  HIGH — All data verified, no assumptions
  MEDIUM — Some data inferred from patterns
  LOW — Significant gaps, treat as directional only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You are not here to sound smart.
You are here to be right.
`
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Auth verification
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)
        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

        if (userError || !user) {
            return new Response(JSON.stringify({ error: 'Invalid token' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 2. Principal check with extensive logging
        console.log('Checking principal role for user:', user.id)
        console.log('User email:', user.email)
        console.log('User metadata:', JSON.stringify(user.user_metadata))

        // First try: Check school_members table
        const { data: memberships, error: membershipError } = await supabaseAdmin
            .from('school_members')
            .select('school_id, role, is_active')
            .eq('user_id', user.id)

        console.log('Memberships found:', JSON.stringify(memberships))
        console.log('Membership error:', membershipError?.message)

        // Find principal membership
        let principalMembership = memberships?.find((m: any) =>
            m.role && m.role.toString().toLowerCase().trim() === 'principal' && m.is_active
        )

        // Second try: Check user metadata
        if (!principalMembership) {
            console.log('No principal in school_members, checking user metadata...')
            const metadataRole = user.user_metadata?.role?.toString().toLowerCase().trim()
            const metadataSchoolId = user.user_metadata?.school_id

            console.log('Metadata role:', metadataRole)
            console.log('Metadata school_id:', metadataSchoolId)

            if (metadataRole === 'principal' && metadataSchoolId) {
                principalMembership = {
                    role: 'principal',
                    school_id: metadataSchoolId,
                    is_active: true
                }
                console.log('Using metadata for principal access')
            }
        }

        // Third try: If user has ANY membership and is the school owner (first member)
        if (!principalMembership && memberships && memberships.length > 0) {
            console.log('Checking if user is school owner...')
            // Use the first active membership and treat as principal
            const firstActive = memberships.find((m: any) => m.is_active)
            if (firstActive) {
                // Check if this user created the school (is owner)
                const { data: schoolData } = await supabaseAdmin
                    .from('schools')
                    .select('created_by')
                    .eq('id', firstActive.school_id)
                    .single()

                if (schoolData?.created_by === user.id) {
                    console.log('User is school owner, granting principal access')
                    principalMembership = { ...firstActive, role: 'principal' }
                }
            }
        }

        if (!principalMembership) {
            console.log('ACCESS DENIED - No principal role found')
            console.log('User has memberships:', memberships?.length || 0)
            console.log('Roles in memberships:', memberships?.map((m: any) => m.role).join(', '))

            return new Response(JSON.stringify({
                error: 'Access denied. Principals only.',
                debug: {
                    user_id: user.id,
                    memberships_count: memberships?.length || 0,
                    roles: memberships?.map((m: any) => m.role) || [],
                    metadata_role: user.user_metadata?.role
                }
            }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        console.log('Principal access GRANTED for school:', principalMembership.school_id)
        const school_id = principalMembership.school_id

        // 3. Parse request
        const { message } = await req.json()
        if (!message) {
            return new Response(JSON.stringify({ error: 'Message is required' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 4. Classify intent
        const intent = classifyIntent(message)
        console.log('Intent classified:', intent)

        // 5. HARD STOP: Wildcard query without explicit permission
        if (intent.is_wildcard) {
            // For now, allow wildcards but log warning
            console.warn('Wildcard query detected:', message)
        }

        // 6. Fetch scoped data if required
        let injectedData: any = null
        let hasVerifiedData = false

        if (intent.requires_data && intent.domain !== 'UNKNOWN') {
            const { data, error } = await fetchScopedData(supabaseAdmin, intent.domain, intent.params, school_id)

            if (error) {
                console.error('Data fetch error:', error)
            } else if (data) {
                injectedData = data
                hasVerifiedData = true
                console.log('Data fetched successfully:', data.metadata?.record_count, 'records')
            }
        }

        // 7. HARD STOP: DATA_QUERY with no data
        if (intent.category === 'DATA_QUERY' && !hasVerifiedData) {
            const domainLabel = intent.domain.toLowerCase().replace('_', ' ')
            return new Response(JSON.stringify({
                message: `I cannot verify this. No ${domainLabel} data exists for this query.`,
                intent: intent,
                hard_stop: true
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 8. Get school name
        const { data: schoolData } = await supabaseAdmin
            .from('schools')
            .select('name')
            .eq('id', school_id)
            .single()
        const school_name = schoolData?.name || 'Your School'

        // 9. Build system prompt with injected data
        const systemPrompt = buildSystemPrompt(school_id, school_name, injectedData, intent)

        // 10. Call OpenRouter
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
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                max_tokens: 2048,
                temperature: 0.3 // Lower temperature for more factual responses
            })
        })

        const aiData = await aiResponse.json()

        if (!aiResponse.ok) {
            console.error('OpenRouter error:', aiData)
            return new Response(JSON.stringify({ error: 'AI service error' }), {
                status: 502,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        let assistantMessage = aiData.choices?.[0]?.message?.content || 'I encountered an error processing your request.'

        // 11. Validate response (anti-hallucination)
        const validation = validateResponse(assistantMessage, hasVerifiedData)
        if (!validation.valid) {
            console.warn('Response validation failed:', validation.reason)
            assistantMessage = "I cannot provide a reliable answer. The query requires verified data that I don't have access to."
        }

        // 12. Log to audit (with metadata)
        await supabaseAdmin
            .from('ai_audit_logs')
            .insert({
                user_id: user.id,
                school_id: school_id,
                query: message,
                response: assistantMessage,
                action_type: intent.category.toLowerCase(),
                tokens_used: aiData.usage?.total_tokens,
                model_used: 'meta-llama/llama-3.3-70b-instruct:free'
            })

        // 13. Return response
        return new Response(JSON.stringify({
            message: assistantMessage,
            intent: intent,
            data_status: hasVerifiedData ? 'verified' : 'none',
            reconciliation: injectedData?.reconciliation || null,
            tokens_used: aiData.usage?.total_tokens
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error: any) {
        console.error('AXIOM Error:', error)
        return new Response(JSON.stringify({
            error: 'Internal server error',
            detail: error.message
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
