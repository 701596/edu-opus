
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req: Request) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
        )

        // Admin client to bypass RLS for fetching all students (if needed) or just to be robust
        // Actually, we should use the user's context to ensure they only affect their own students.
        // However, for bulk operations ensuring we get *all* students, sometimes admin is safer if RLS is tricky,
        // but here we want to Audit.
        // Let's stick to the auth user's scope.
        const {
            data: { user },
        } = await supabaseClient.auth.getUser()

        if (!user) {
            throw new Error('Unauthorized')
        }

        const { folder_name, category, amount_due, amount_paid, due_date } = await req.json()

        if (!folder_name || !category || !amount_due) {
            throw new Error('Missing required fields')
        }

        // 1. Determine Scope (School ID vs User ID)
        const { data: schoolMember } = await supabaseClient
            .from('school_members')
            .select('school_id')
            .eq('user_id', user.id)
            .maybeSingle() // Use maybeSingle to avoid error if no record found

        const schoolId = schoolMember?.school_id

        console.log(`Processing bulk create for User: ${user.id}, School: ${schoolId || 'None'}`)

        // 2. Fetch Active Students
        let studentQuery = supabaseClient
            .from('students')
            .select('id')
            .eq('is_archived', false)

        if (schoolId) {
            // Inclusive search to catch legacy data too
            studentQuery = studentQuery.or(`school_id.eq.${schoolId},user_id.eq.${user.id}`)
        } else {
            studentQuery = studentQuery.eq('user_id', user.id)
        }

        const { data: students, error: fetchError } = await studentQuery

        if (fetchError) throw fetchError
        if (!students || students.length === 0) {
            console.log('No active students found')
            return new Response(
                JSON.stringify({ message: 'No active students found', count: 0 }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        }

        console.log(`Found ${students.length} students. Preparing payload...`)

        // 3. Prepare Payload (Normal rows, real IDs)
        const payload = students.map((student: { id: string }) => ({
            student_id: student.id,
            folder_name,
            category,
            amount_due,
            amount_paid: amount_paid || 0,
            due_date: due_date || null,
            status: (amount_paid || 0) >= amount_due ? 'paid' : (amount_paid || 0) > 0 ? 'partial' : 'pending',
        }))

        // 4. Atomic Bulk Insert
        const { error: insertError } = await supabaseClient
            .from('fee_folders')
            .insert(payload)

        if (insertError) throw insertError

        return new Response(
            JSON.stringify({
                message: 'Bulk creation successful',
                count: payload.length
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )

    } catch (error: any) {
        console.error('Bulk Create Error:', error)
        return new Response(
            JSON.stringify({ error: error.message || 'An unexpected error occurred' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        )
    }
})
