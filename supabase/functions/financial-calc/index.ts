import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * DERIVED FINANCIAL CALCULATIONS (TENANT-SCOPED)
 * 
 * CANONICAL METRIC: "Remaining Fee" = Expected Fee - Paid Fee
 * - "Outstanding Fee" is an alias for Remaining Fee
 * - All calculations are filtered by school_id (tenant isolation)
 * 
 * Formula:
 * months_elapsed = calendar months since join_date (including current month)
 * expected_fee = months_elapsed × fee_amount
 * paid_fee = SUM(payments.amount) for student within school
 * remaining_fee = expected_fee - paid_fee
 */

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const authHeader = req.headers.get('Authorization')
        if (!authHeader) return new Response('Missing auth', { status: 401, headers: corsHeaders })

        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL')!,
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        )

        const token = authHeader.replace('Bearer ', '')
        const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)
        if (userError || !user) return new Response('Invalid token', { status: 401, headers: corsHeaders })

        // ========== TENANT ISOLATION: Get user's school_id ==========
        // First try school_members (new multi-tenant model)
        const { data: membership, error: memberError } = await supabaseAdmin
            .from('school_members')
            .select('school_id')
            .eq('user_id', user.id)
            .eq('is_active', true)
            .limit(1)
            .maybeSingle()

        if (memberError) {
            console.error('Membership lookup error:', memberError)
        }

        const schoolId = membership?.school_id
        const userId = user.id
        const serverDate = new Date()
        const serverYear = serverDate.getFullYear()
        const serverMonth = serverDate.getMonth() + 1 // 1-indexed

        // Log for debugging
        console.log('Financial Calc:', { schoolId, userId, serverDate: serverDate.toISOString() })

        // ========== STUDENTS (SCOPED BY SCHOOL OR USER) ==========
        // Fetch BOTH derived inputs AND static columns for fallback
        // Use school_id if available, otherwise fallback to user_id
        let studentsQuery = supabaseAdmin
            .from('students')
            .select('id, name, fee_amount, fee_type, join_date, enrollment_date, remaining_fee, expected_fee, paid_fee, total_fee')
            .eq('is_archived', false)

        if (schoolId) {
            // Use inclusive filtering: Match School ID OR User ID
            // This ensures legacy students (with only user_id) are included even if the user has joined a school
            studentsQuery = studentsQuery.or(`school_id.eq.${schoolId},user_id.eq.${userId}`)
        } else {
            // Fallback to user_id for legacy data
            studentsQuery = studentsQuery.eq('user_id', userId)
        }

        const { data: students, error: studentsError } = await studentsQuery

        // Get student IDs for scoped payment lookup
        const studentIds = (students || []).map((s: { id: string }) => s.id)
        const paymentTotals: Record<string, number> = {}

        // ========== PAYMENTS (BATCHED) ==========
        // Batch requests to avoid URL length limits (Supabase/PostgREST issue with many IDs)
        const BATCH_SIZE = 30
        for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
            const batch = studentIds.slice(i, i + BATCH_SIZE)
            if (batch.length === 0) continue

            const { data: paymentData, error: paymentsError } = await supabaseAdmin
                .from('payments')
                .select('student_id, amount')
                .in('student_id', batch)

            if (paymentsError) {
                console.error('Payment fetch error:', paymentsError)
                continue // Log and continue to best effort
            }

            // Aggregate payments
            for (const p of (paymentData || [])) {
                paymentTotals[p.student_id] = (paymentTotals[p.student_id] || 0) + Number(p.amount || 0)
            }
        }

        // Calculate derived values for each student
        let totalExpectedFee = 0
        let totalPaidFee = 0
        let totalRemainingFee = 0
        const studentBreakdown: Array<{
            id: string
            name: string
            expected_fee: number
            paid_fee: number
            remaining_fee: number
        }> = []

        for (const student of (students || [])) {
            const feeAmount = Number(student.fee_amount || 0)
            const feeType = student.fee_type || 'monthly'
            const joinDate = student.join_date || student.enrollment_date

            // Static values from database (existing source of truth)
            const staticExpectedFee = Number((student as any).expected_fee || (student as any).total_fee || 0)
            const staticPaidFee = Number((student as any).paid_fee || 0)
            const staticRemainingFee = Number((student as any).remaining_fee || 0)

            let derivedExpectedFee = 0

            // Try derived calculation if we have the required data
            if (joinDate && feeAmount > 0) {
                const joinDateObj = new Date(joinDate)
                const joinYear = joinDateObj.getFullYear()
                const joinMonth = joinDateObj.getMonth() + 1

                if (feeType === 'monthly') {
                    const monthsElapsed = (serverYear - joinYear) * 12 + (serverMonth - joinMonth) + 1
                    derivedExpectedFee = Math.max(0, monthsElapsed) * feeAmount
                } else if (feeType === 'yearly' || feeType === 'annually') {
                    const yearsElapsed = serverYear - joinYear + 1
                    derivedExpectedFee = Math.max(0, yearsElapsed) * feeAmount
                } else if (feeType === 'one-time') {
                    derivedExpectedFee = feeAmount
                }
            }

            // Use static values as PRIMARY source, derived as SECONDARY
            // This ensures existing production data works while new data uses derived
            const paidFee = paymentTotals[student.id] || staticPaidFee
            const expectedFee = derivedExpectedFee > 0 ? derivedExpectedFee : staticExpectedFee
            // ALWAYS calculate remaining as Expected - Paid
            // This ensures consistency regardless of source
            const remainingFee = Math.max(0, expectedFee - paidFee)

            totalExpectedFee += expectedFee
            totalPaidFee += paidFee
            totalRemainingFee += remainingFee

            // Only include students with remaining fees in breakdown
            if (remainingFee > 0) {
                studentBreakdown.push({
                    id: student.id,
                    name: student.name,
                    expected_fee: expectedFee,
                    paid_fee: paidFee,
                    remaining_fee: remainingFee
                })
            }
        }

        // ========== STAFF (SCOPED BY SCHOOL OR USER) ==========
        let staffQuery = supabaseAdmin
            .from('staff')
            .select('id, name, salary, salary_type, join_date, hire_date')
            .eq('is_archived', false)

        if (schoolId) {
            staffQuery = staffQuery.or(`school_id.eq.${schoolId},user_id.eq.${userId}`)
        } else {
            staffQuery = staffQuery.eq('user_id', userId)
        }

        const { data: staff, error: staffError } = await staffQuery

        if (staffError) throw staffError

        const staffIds = (staff || []).map((s: { id: string }) => s.id)

        // ========== SALARIES (SCOPED BY STAFF IDS) ==========
        let salaries: { staff_id: string; net_amount: number }[] = []
        if (staffIds.length > 0) {
            const { data: salaryData, error: salariesError } = await supabaseAdmin
                .from('salaries')
                .select('staff_id, net_amount')
                .in('staff_id', staffIds)

            if (salariesError) throw salariesError
            salaries = salaryData || []
        }

        const salaryTotals: Record<string, number> = {}
        for (const s of salaries) {
            salaryTotals[s.staff_id] = (salaryTotals[s.staff_id] || 0) + Number(s.net_amount || 0)
        }

        let totalExpectedSalary = 0
        let totalPaidSalary = 0

        for (const member of (staff || [])) {
            const salary = Number(member.salary || 0)
            const salaryType = member.salary_type || 'monthly'
            const joinDate = member.join_date || member.hire_date

            let expectedSalary = 0

            if (joinDate && salary > 0) {
                const joinDateObj = new Date(joinDate)
                const joinYear = joinDateObj.getFullYear()
                const joinMonth = joinDateObj.getMonth() + 1

                if (salaryType === 'monthly') {
                    const monthsElapsed = (serverYear - joinYear) * 12 + (serverMonth - joinMonth) + 1
                    expectedSalary = Math.max(0, monthsElapsed) * salary
                } else if (salaryType === 'yearly') {
                    const yearsElapsed = serverYear - joinYear + 1
                    expectedSalary = Math.max(0, yearsElapsed) * salary
                }
            }

            const paidSalary = salaryTotals[member.id] || 0
            totalExpectedSalary += expectedSalary
            totalPaidSalary += paidSalary
        }

        return new Response(JSON.stringify({
            school_id: schoolId,
            server_date: serverDate.toISOString(),
            fees: {
                total_expected: totalExpectedFee,
                total_paid: totalPaidFee,
                total_remaining: totalRemainingFee,
                // Return ALL students with remaining fees (sorted by amount desc)
                students: studentBreakdown
                    .filter(s => s.remaining_fee > 0)
                    .sort((a, b) => b.remaining_fee - a.remaining_fee)
            },
            salaries: {
                total_expected: totalExpectedSalary,
                total_paid: totalPaidSalary,
                total_remaining: totalExpectedSalary - totalPaidSalary
            }
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

    } catch (error: any) {
        console.error('Financial Calc Error:', error)
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders })
    }
})
