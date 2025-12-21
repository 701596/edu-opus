import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * EDGE FUNCTION: calculate-remaining-fees
 * 
 * MANDATORY DYNAMIC CALCULATION - NO STORED VALUES
 * 
 * For every student, this function calculates:
 * - expected_fee: from join_date + fee_type + server date
 * - total_paid: SUM of all payments for this student
 * - remaining_fee: expected_fee - total_paid (can be negative for advanced)
 * - status: pending | partial | paid | advanced
 * 
 * This calculation runs on EVERY request. Pagination does not affect correctness.
 * Triggers are optional for analytics - this function is the source of truth.
 */
serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
        const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

        if (!supabaseUrl || !supabaseServiceRoleKey) {
            throw new Error('Missing environment variables')
        }

        const supabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey)

        // Auth check
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) {
            throw new Error('Unauthorized: Missing Authorization header')
        }

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)

        if (authError || !user) {
            throw new Error('Unauthorized: Invalid token')
        }

        const user_id = user.id

        // SERVER DATE - single source of truth for time
        const today = new Date()
        const todayYear = today.getFullYear()
        const todayMonth = today.getMonth() // 0-indexed
        const todayDay = today.getDate()

        // STEP 1: Fetch all students with their base fee data (NOT stored remaining_fee)
        const { data: students, error: studentError } = await supabaseClient
            .from('students')
            .select('id, name, join_date, fee_type, fee_amount')
            .eq('user_id', user_id)
            .eq('is_archived', false)

        if (studentError) {
            throw new Error(`Failed to fetch students: ${studentError.message}`)
        }

        if (!students || students.length === 0) {
            return new Response(JSON.stringify({
                students: [],
                total_student_outstanding: 0
            }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            })
        }

        // STEP 2: Fetch ONLY school_fee payments grouped by student_id
        // CRITICAL: Other payment categories (exam, library, etc.) do NOT affect student tuition remaining
        const studentIds = students.map(s => s.id)
        const { data: payments, error: paymentError } = await supabaseClient
            .from('payments')
            .select('student_id, amount, category')
            .in('student_id', studentIds)
            .eq('category', 'school_fee')  // ONLY school_fee payments count toward tuition

        if (paymentError) {
            console.error('Payment fetch error:', paymentError)
            // Continue with 0 payments - don't fail the whole request
        }

        // Build payment totals map: student_id -> total_paid (school_fee only)
        const paymentTotals = new Map<string, number>()
        if (payments) {
            for (const p of payments) {
                const current = paymentTotals.get(p.student_id) || 0
                paymentTotals.set(p.student_id, current + Number(p.amount || 0))
            }
        }


        // STEP 3: Calculate for EVERY student dynamically
        let totalOutstanding = 0
        const resultStudents = students.map(student => {
            const { id, name, join_date, fee_type, fee_amount } = student

            // Calculate expected_fee from join_date + server date
            let expected_fee = 0

            if (join_date && fee_amount) {
                const joinDate = new Date(join_date)
                const joinYear = joinDate.getFullYear()
                const joinMonth = joinDate.getMonth()
                const joinDay = joinDate.getDate()

                const typeLower = (fee_type || '').toLowerCase()

                if (typeLower === 'monthly') {
                    // INCLUSIVE CALENDAR MONTHS
                    // If student joins on any day of a month, that month counts as month 1
                    // Formula: (year_diff * 12) + (month_diff) + 1
                    // Example: Join April, Today December = (0*12) + (11-3) + 1 = 9 months
                    const monthsElapsed = (todayYear - joinYear) * 12 + (todayMonth - joinMonth) + 1

                    expected_fee = monthsElapsed * Number(fee_amount)
                } else if (typeLower === 'annual' || typeLower === 'annually') {
                    expected_fee = Number(fee_amount)
                }

            }

            // Get total_paid from payments (dynamically calculated)
            const total_paid = paymentTotals.get(id) || 0

            // Calculate remaining_fee (can be negative for advanced payments)
            const remaining_fee = expected_fee - total_paid

            // Derive status (pending instead of unpaid)
            let status: string
            if (total_paid === 0) {
                status = 'pending'
            } else if (total_paid < expected_fee) {
                status = 'partial'
            } else if (total_paid === expected_fee) {
                status = 'paid'
            } else {
                status = 'advanced'
            }

            // Accumulate total outstanding (only positive values)
            totalOutstanding += Math.max(0, remaining_fee)

            return {
                student_id: id,
                name: name || '',
                expected_fee,
                total_paid,
                remaining_fee,
                status
            }
        })

        return new Response(JSON.stringify({
            students: resultStudents,
            total_student_outstanding: totalOutstanding
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })

    } catch (error: any) {
        console.error('[calculate-remaining-fees] Error:', error)
        return new Response(JSON.stringify({
            students: [],
            total_student_outstanding: 0,
            error: error.message
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
        })
    }
})


