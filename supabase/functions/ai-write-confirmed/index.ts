import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

/**
 * AI Write Confirmed Endpoint
 * 
 * Executes a pending write action after principal confirmation.
 * Supports: add_student, update_student, add_payment, add_expense, etc.
 */
serve(async (req: Request) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // 1. Get auth token
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'Missing authorization' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 2. Create Supabase client with service role for writes
        const supabaseAdmin = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        // Verify user token
        const supabaseUser = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
            global: { headers: { Authorization: authHeader } }
        })

        const { data: { user } } = await supabaseUser.auth.getUser(authHeader.replace('Bearer ', ''))
        if (!user) {
            return new Response(JSON.stringify({ error: 'Invalid user' }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 3. Check principal role
        const { data: membership } = await supabaseAdmin
            .from('school_members')
            .select('role, school_id')
            .eq('user_id', user.id)
            .eq('role', 'principal')
            .eq('is_active', true)
            .single()

        if (!membership) {
            return new Response(JSON.stringify({ error: 'Access denied. Principals only.' }), {
                status: 403,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 4. Parse request
        const { action_id } = await req.json()
        if (!action_id) {
            return new Response(JSON.stringify({ error: 'Missing action_id' }), {
                status: 400,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 5. Fetch pending action
        const { data: pendingAction, error: fetchError } = await supabaseAdmin
            .from('ai_pending_writes')
            .select('*')
            .eq('id', action_id)
            .eq('user_id', user.id)
            .eq('confirmed', false)
            .single()

        if (fetchError || !pendingAction) {
            return new Response(JSON.stringify({ error: 'Action not found or already executed' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 6. Check expiry
        if (new Date(pendingAction.expires_at) < new Date()) {
            return new Response(JSON.stringify({ error: 'Action has expired' }), {
                status: 410,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            })
        }

        // 7. Execute action based on type
        let result: any = null
        const actionData = pendingAction.action_data as Record<string, any>

        switch (pendingAction.action_type) {
            case 'add_student':
                const { data: newStudent, error: studentError } = await supabaseAdmin
                    .from('students')
                    .insert({
                        ...actionData,
                        school_id: membership.school_id
                    })
                    .select()
                    .single()

                if (studentError) throw studentError
                result = { message: 'Student added successfully', student: newStudent }
                break

            case 'update_student':
                const { student_id, ...updateData } = actionData
                const { error: updateError } = await supabaseAdmin
                    .from('students')
                    .update(updateData)
                    .eq('id', student_id)

                if (updateError) throw updateError
                result = { message: 'Student updated successfully' }
                break

            case 'add_payment':
                const { data: newPayment, error: paymentError } = await supabaseAdmin
                    .from('payments')
                    .insert({
                        ...actionData,
                        created_by: user.id
                    })
                    .select()
                    .single()

                if (paymentError) throw paymentError
                result = { message: 'Payment recorded successfully', payment: newPayment }
                break

            case 'add_expense':
                const { data: newExpense, error: expenseError } = await supabaseAdmin
                    .from('expenses')
                    .insert({
                        ...actionData,
                        created_by: user.id
                    })
                    .select()
                    .single()

                if (expenseError) throw expenseError
                result = { message: 'Expense added successfully', expense: newExpense }
                break

            case 'update_attendance':
                // Bulk update attendance
                const { class_id, date, attendance_records } = actionData
                for (const record of attendance_records) {
                    await supabaseAdmin
                        .from('attendance')
                        .upsert({
                            student_id: record.student_id,
                            class_id,
                            date,
                            status: record.status,
                            marked_by: user.id
                        }, { onConflict: 'student_id,class_id,date' })
                }
                result = { message: 'Attendance updated successfully' }
                break

            default:
                return new Response(JSON.stringify({ error: `Unknown action type: ${pendingAction.action_type}` }), {
                    status: 400,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                })
        }

        // 8. Mark action as confirmed
        await supabaseAdmin
            .from('ai_pending_writes')
            .update({
                confirmed: true,
                executed_at: new Date().toISOString()
            })
            .eq('id', action_id)

        // 9. Log to audit
        await supabaseAdmin
            .from('ai_audit_logs')
            .insert({
                user_id: user.id,
                school_id: membership.school_id,
                query: `Confirmed action: ${pendingAction.action_type}`,
                response: JSON.stringify(result),
                action_type: 'write_confirmed'
            })

        // 10. Return success
        return new Response(JSON.stringify(result), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })

    } catch (error: unknown) {
        console.error('AI Write Error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(JSON.stringify({
            error: 'Failed to execute action',
            details: errorMessage
        }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        })
    }
})
