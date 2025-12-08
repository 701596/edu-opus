/**
 * Rate Limit Test Script
 * 
 * Tests rate limiting behavior with various scenarios.
 * Run with: npx tsx scripts/test_rate_limits.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables
config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing env vars');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Test configuration
const TESTS = {
    normalUser: {
        rpcCalls: 5, // Well under limit
        authAttempts: 2, // Well under limit
        paymentCreates: 20, // Well under limit
    },
    bruteforce: {
        authAttempts: 10, // Over limit (5/10min)
    },
    cashierBurst: {
        paymentCreates: 50, // Under limit (60/min)
        delayMs: 100, // Fast but normal
    },
};

interface TestResult {
    name: string;
    passed: boolean;
    details: string;
    latencies?: number[];
    p95?: number;
}

const results: TestResult[] = [];

async function authenticate() {
    const { error } = await supabase.auth.signInWithPassword({
        email: 'funtimefact@gmail.com',
        password: '123456'
    });
    if (error) {
        console.error('Auth failed:', error.message);
        process.exit(1);
    }
    console.log('✓ Authenticated\n');
}

// =============================================
// Test 1: Normal User Behavior
// =============================================
async function testNormalUser(): Promise<TestResult> {
    console.log('Test 1: Normal User Behavior\n');
    const latencies: number[] = [];
    let blocked = false;

    // Test RPC calls
    console.log('  Testing RPC calls...');
    for (let i = 0; i < TESTS.normalUser.rpcCalls; i++) {
        const start = performance.now();
        const { error } = await supabase.rpc('get_dashboard_summary' as any);
        const latency = performance.now() - start;
        latencies.push(latency);

        if (error?.code === 'RATE_LIMITED') {
            blocked = true;
            console.log(`    ✗ Blocked at call ${i + 1}`);
            break;
        }
        console.log(`    Call ${i + 1}: ${latency.toFixed(2)}ms`);
        await delay(500); // Half second between calls (normal behavior)
    }

    const p95 = percentile(latencies, 95);

    return {
        name: 'Normal User Behavior',
        passed: !blocked,
        details: blocked
            ? 'FAIL: Normal user was rate limited'
            : `PASS: ${TESTS.normalUser.rpcCalls} calls completed without blocking`,
        latencies,
        p95,
    };
}

// =============================================
// Test 2: Bruteforce Detection
// =============================================
async function testBruteforce(): Promise<TestResult> {
    console.log('\nTest 2: Bruteforce Detection\n');
    let blockedAt = -1;

    console.log('  Simulating rapid auth attempts...');
    for (let i = 0; i < TESTS.bruteforce.authAttempts; i++) {
        const { error } = await supabase.auth.signInWithPassword({
            email: 'test@invalid.com',
            password: 'wrongpassword',
        });

        // Check if rate limited (should happen around attempt 6)
        if (error?.message?.includes('Too many') || error?.message?.includes('rate')) {
            blockedAt = i + 1;
            console.log(`    ✓ Blocked at attempt ${blockedAt}`);
            break;
        }
        console.log(`    Attempt ${i + 1}: ${error?.message || 'succeeded'}`);
        await delay(100); // Very fast (abusive)
    }

    return {
        name: 'Bruteforce Detection',
        passed: blockedAt > 0 && blockedAt <= 7, // Should block around 5-7
        details: blockedAt > 0
            ? `PASS: Bruteforce blocked at attempt ${blockedAt}`
            : 'FAIL: Bruteforce was NOT blocked',
    };
}

// =============================================
// Test 3: Cashier Burst (Payments)
// =============================================
async function testCashierBurst(): Promise<TestResult> {
    console.log('\nTest 3: Cashier Burst (Payments)\n');
    const latencies: number[] = [];
    let blocked = false;

    const { data: student } = await supabase
        .from('students')
        .select('id')
        .limit(1)
        .single();

    if (!student) {
        return {
            name: 'Cashier Burst',
            passed: false,
            details: 'SKIP: No student found for test',
        };
    }

    console.log(`  Creating ${TESTS.cashierBurst.paymentCreates} payments rapidly...`);
    for (let i = 0; i < TESTS.cashierBurst.paymentCreates; i++) {
        const start = performance.now();
        const { error } = await supabase.from('payments').insert({
            student_id: student.id,
            amount: 100,
            payment_method: 'cash',
            payment_date: new Date().toISOString().split('T')[0],
            receipt_number: `TEST-BURST-${Date.now()}-${i}`,
            description: 'Rate limit test payment',
        });
        const latency = performance.now() - start;
        latencies.push(latency);

        if (error?.code === 'RATE_LIMITED' || error?.message?.includes('rate')) {
            blocked = true;
            console.log(`    ✗ Blocked at payment ${i + 1}`);
            break;
        }

        if (i % 10 === 0) {
            console.log(`    Payment ${i + 1}: ${latency.toFixed(2)}ms`);
        }
        await delay(TESTS.cashierBurst.delayMs);
    }

    // Cleanup test payments
    await supabase.from('payments').delete().ilike('receipt_number', 'TEST-BURST-%');

    const p95 = percentile(latencies, 95);

    return {
        name: 'Cashier Burst',
        passed: !blocked,
        details: blocked
            ? 'FAIL: Cashier burst was rate limited'
            : `PASS: ${TESTS.cashierBurst.paymentCreates} payments created without blocking`,
        latencies,
        p95,
    };
}

// =============================================
// Test 4: Performance Benchmark
// =============================================
async function testPerformance(): Promise<TestResult> {
    console.log('\nTest 4: Performance Benchmark (Payments Endpoint)\n');
    const latencies: number[] = [];

    console.log('  Measuring payment list latency (10 calls)...');
    for (let i = 0; i < 10; i++) {
        const start = performance.now();
        await supabase.from('payments').select('*').limit(20);
        const latency = performance.now() - start;
        latencies.push(latency);
        console.log(`    Call ${i + 1}: ${latency.toFixed(2)}ms`);
        await delay(200);
    }

    const p95 = percentile(latencies, 95);
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;

    return {
        name: 'Performance Benchmark',
        passed: p95 < 1000, // Sub-second requirement
        details: `P95: ${p95.toFixed(2)}ms, Avg: ${avg.toFixed(2)}ms`,
        latencies,
        p95,
    };
}

// =============================================
// Utilities
// =============================================

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function percentile(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
}

// =============================================
// Main
// =============================================

async function runTests() {
    console.log('╔════════════════════════════════════════╗');
    console.log('║      RATE LIMIT TEST SUITE             ║');
    console.log('╚════════════════════════════════════════╝\n');

    await authenticate();

    results.push(await testNormalUser());
    results.push(await testBruteforce());
    results.push(await testCashierBurst());
    results.push(await testPerformance());

    // Summary
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║              RESULTS                   ║');
    console.log('╚════════════════════════════════════════╝\n');

    let passed = 0;
    for (const result of results) {
        const status = result.passed ? '✓ PASS' : '✗ FAIL';
        console.log(`${status}: ${result.name}`);
        console.log(`       ${result.details}`);
        if (result.p95) {
            console.log(`       P95 Latency: ${result.p95.toFixed(2)}ms`);
        }
        console.log();
        if (result.passed) passed++;
    }

    console.log(`\nTotal: ${passed}/${results.length} tests passed`);

    if (passed === results.length) {
        console.log('\n✓ All tests passed! Rate limiting is working correctly.');
    } else {
        console.log('\n✗ Some tests failed. Review the results above.');
    }
}

runTests().catch(console.error);
