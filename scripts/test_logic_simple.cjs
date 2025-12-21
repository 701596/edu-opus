/**
 * Stand-alone Logic Test for Student Remaining Fee calculation
 */

const calculateLogic = (student, today) => {
    const { join_date, fee_type, fee_amount } = student;
    if (!join_date || typeof fee_amount !== 'number' || !fee_type) {
        return 0;
    }

    const join = new Date(join_date);
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDay = today.getDate();
    const joinYear = join.getFullYear();
    const joinMonth = join.getMonth();
    const joinDay = join.getDate();

    if (fee_type.toLowerCase() === 'monthly') {
        let monthsElapsed = (todayYear - joinYear) * 12 + (todayMonth - joinMonth);
        if (todayDay < joinDay) {
            monthsElapsed -= 1;
        }
        return Math.max(1, monthsElapsed) * fee_amount;
    } else if (fee_type.toLowerCase() === 'annually' || fee_type.toLowerCase() === 'annual') {
        return fee_amount;
    }
    return 0;
};

const testStudents = [
    {
        name: 'TC1: Normal Monthly (Join 4/20, Now 8/20)',
        fee_amount: 2,
        fee_type: 'monthly',
        join_date: '2025-04-20',
        today: '2025-08-20',
        expected_fee: 8
    },
    {
        name: 'TC2: Same Month Join (Join 8/20, Now 8/20)',
        fee_amount: 100,
        fee_type: 'monthly',
        join_date: '2025-08-20',
        today: '2025-08-20',
        expected_fee: 100
    },
    {
        name: 'TC3: Join Day > Current (Join 8/25, Now 8/20)',
        fee_amount: 100,
        fee_type: 'monthly',
        join_date: '2025-08-25',
        today: '2025-08-20',
        expected_fee: 100
    },
    {
        name: 'TC4: Annual Fee (Join 2020, Now 2025)',
        fee_amount: 5000,
        fee_type: 'annually',
        join_date: '2020-01-01',
        today: '2025-08-20',
        expected_fee: 5000
    },
    {
        name: 'TC5: Missing join_date',
        fee_amount: 100,
        fee_type: 'monthly',
        join_date: null,
        today: '2025-08-20',
        expected_fee: 0
    },
    {
        name: 'TC6: Day Before Anniversary (Join 4/20, Now 8/19)',
        fee_amount: 2,
        fee_type: 'monthly',
        join_date: '2025-04-20',
        today: '2025-08-19',
        expected_fee: 6 // (8-4) = 4. 19 < 20 -> 3. 3 * 2 = 6.
    }
];

console.log('🚀 Starting Stand-alone Logic Verification...\n');

let allPassed = true;
testStudents.forEach(tc => {
    const result = calculateLogic(tc, new Date(tc.today));
    const pass = result === tc.expected_fee;
    console.log(`${pass ? '✅' : '❌'} ${tc.name}`);
    console.log(`   Expected: ${tc.expected_fee}, Got: ${result}`);
    if (!pass) allPassed = false;
});

if (allPassed) {
    console.log('\n✨ ALL LOGIC TESTS PASSED');
    process.exit(0);
} else {
    console.error('\n⚠️ SOME TESTS FAILED');
    process.exit(1);
}
