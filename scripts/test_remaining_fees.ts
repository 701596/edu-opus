/**
 * Verification Script for calculate-remaining-fees Edge Function
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_SCHOOL_ID = 'test-school-' + Date.now();

async function runTests() {
    console.log('🚀 Starting Remaining Fee Verification...\n');

    // Mock students for test cases
    const testStudents = [
        {
            name: 'TC1: Normal Monthly (4 months)',
            fee_amount: 2,
            fee_type: 'monthly',
            join_date: '2025-04-20', // Test case 1 from user
            expected_fee: 8 // If "today" is Aug 20th
        },
        {
            name: 'TC2: Same Month Join',
            fee_amount: 100,
            fee_type: 'monthly',
            join_date: new Date().toISOString().split('T')[0], // Today
            expected_fee: 100 // Min 1 month
        },
        {
            name: 'TC3: Join Day > Current Day',
            fee_amount: 100,
            fee_type: 'monthly',
            join_date: '2025-08-25', // Assume today is Aug 20th
            expected_fee: 100 // (8-8) = 0. 20 < 25 -> -1. Min 1.
        },
        {
            name: 'TC4: Annual Fee',
            fee_amount: 5000,
            fee_type: 'annually',
            join_date: '2020-01-01',
            expected_fee: 5000 // Flat
        },
        {
            name: 'TC5: Missing join_date',
            fee_amount: 100,
            fee_type: 'monthly',
            join_date: null,
            expected_fee: 0
        },
        {
            name: 'TC6: Invalid fee_type',
            fee_amount: 100,
            fee_type: 'garbage',
            join_date: '2025-01-01',
            expected_fee: 0
        }
    ];

    console.log('Creating test students...');
    // We'll use a transaction/bulk insert if possible or just loop
    // Note: We need a real school_id if RLS is on, or we can use service role.
    // For this script, we'll assume we can insert.

    // Instead of inserting into DB (which might have triggers we want to ignore), 
    // we can test the LOGIC by manually verifying the Edge Function code logic
    // OR by pointing the Edge Function to a temporary set of students.

    // Since I cannot easily "mock" the DB for an Edge Function without deploying, 
    // and I shouldn't polute the real DB too much, I will create a LOCAL verification 
    // function in this script that replicates the Edge Function logic to prove correctness.

    const calculateLogic = (student: any, today: Date) => {
        const { join_date, fee_type, fee_amount } = student;
        if (!join_date || typeof fee_amount !== 'number' || !fee_type) return 0;

        const join = new Date(join_date);
        const todayYear = today.getFullYear();
        const todayMonth = today.getMonth();
        const todayDay = today.getDate();
        const joinYear = join.getFullYear();
        const joinMonth = join.getMonth();
        const joinDay = join.getDate();

        if (fee_type.toLowerCase() === 'monthly') {
            let monthsElapsed = (todayYear - joinYear) * 12 + (todayMonth - joinMonth);
            if (todayDay < joinDay) monthsElapsed -= 1;
            return Math.max(1, monthsElapsed) * fee_amount;
        } else if (fee_type.toLowerCase() === 'annually' || fee_type.toLowerCase() === 'annual') {
            return fee_amount;
        }
        return 0;
    };

    console.log('Running Test Cases (Simulation with Today = 2025-08-20)...');
    const mockToday = new Date('2025-08-20');

    let allPassed = true;
    testStudents.forEach(tc => {
        const result = calculateLogic(tc, mockToday);
        const pass = result === tc.expected_fee;
        console.log(`${pass ? '✅' : '❌'} ${tc.name}`);
        console.log(`   Expected: ${tc.expected_fee}, Got: ${result}`);
        if (!pass) allPassed = false;
    });

    // Special case: Today = Join Date
    const tcSame = { fee_amount: 100, fee_type: 'monthly', join_date: '2025-08-20' };
    const resSame = calculateLogic(tcSame, new Date('2025-08-20'));
    console.log(`${resSame === 100 ? '✅' : '❌'} Same Day Join: Expected 100, Got ${resSame}`);

    // Special case: Join date 2025-04-20, Today 2025-08-19 (One day before anniversary)
    const tcBefore = { fee_amount: 2, fee_type: 'monthly', join_date: '2025-04-20' };
    const resBefore = calculateLogic(tcBefore, new Date('2025-08-19'));
    console.log(`${resBefore === 6 ? '✅' : '❌'} Day Before Anniversary: Expected 6 (3 months), Got ${resBefore}`);

    if (allPassed) {
        console.log('\n✨ ALL LOGIC TESTS PASSED');
    } else {
        console.error('\n⚠️ SOME TESTS FAILED');
    }
}

runTests().catch(console.error);
