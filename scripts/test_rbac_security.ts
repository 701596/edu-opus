/**
 * Comprehensive RBAC Security Test Suite
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

interface TestResult {
    test: string;
    role: string;
    expected: string;
    actual: string;
    passed: boolean;
    latency?: number;
    error?: string;
}

const results: TestResult[] = [];

const TEST_USERS = {
    principal: { email: 'funtimefact@gmail.com', password: '123456' },
};

async function testRoleAccess(email: string, password: string, role: string) {
    const client = createClient(supabaseUrl, supabaseKey);

    console.log(`\n=== Testing ${role.toUpperCase()} Role ===\n`);

    const start = Date.now();
    const { error: authError } = await client.auth.signInWithPassword({ email, password });

    if (authError) {
        console.error(`❌ Login failed: ${authError.message}`);
        return;
    }

    console.log(`✅ Login successful (${Date.now() - start}ms)`);

    // Test 1: Get roles
    const r1Start = Date.now();
    const { data: roles, error: r1Err } = await client.rpc('get_user_roles' as any);
    results.push({
        test: `${role}: get_user_roles`,
        role,
        expected: 'success',
        actual: r1Err ? 'error' : 'success',
        passed: !r1Err,
        latency: Date.now() - r1Start,
        error: r1Err?.message,
    });

    if (roles) console.log('User roles:', roles);

    // Test 2: SELECT students
    const r2Start = Date.now();
    const { error: r2Err } = await client.from('students').select('*').limit(5);
    results.push({
        test: `${role}: SELECT students`,
        role,
        expected: 'success',
        actual: r2Err ? 'error' : 'success',
        passed: !r2Err,
        latency: Date.now() - r2Start,
        error: r2Err?.message,
    });

    // Test 3: SELECT payments
    const r3Start = Date.now();
    const { error: r3Err } = await client.from('payments').select('*').limit(5);
    results.push({
        test: `${role}: SELECT payments`,
        role,
        expected: 'success',
        actual: r3Err ? 'error' : 'success',
        passed: !r3Err,
        latency: Date.now() - r3Start,
        error: r3Err?.message,
    });

    // Test 4: SELECT school_members
    const r4Start = Date.now();
    const { error: r4Err } = await (client as any).from('school_members').select('*');
    results.push({
        test: `${role}: SELECT school_members`,
        role,
        expected: 'success',
        actual: r4Err ? 'error' : 'success',
        passed: !r4Err,
        latency: Date.now() - r4Start,
        error: r4Err?.message,
    });

    // Test 5: INSERT student  
    const r5Start = Date.now();
    const { error: r5Err } = await client.from('students').insert({
        name: `Test Student ${role}`,
        grade: 'Grade 1',
        school_id: roles?.[0]?.school_id,
    });
    results.push({
        test: `${role}: INSERT student`,
        role,
        expected: 'success',
        actual: r5Err ? 'deny' : 'success',
        passed: !r5Err,
        latency: Date.now() - r5Start,
        error: r5Err?.message,
    });

    // Cleanup
    if (!r5Err) {
        await client.from('students').delete().eq('name', `Test Student ${role}`);
    }

    await client.auth.signOut();
}

async function runTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║           RBAC SECURITY TEST SUITE                        ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    await testRoleAccess(TEST_USERS.principal.email, TEST_USERS.principal.password, 'principal');

    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    for (const r of results) {
        const icon = r.passed ? '✓' : '✗';
        console.log(`${icon} ${r.passed ? 'PASS' : 'FAIL'}: ${r.test} (${r.latency}ms)`);
        if (!r.passed && r.error) console.log(`      Error: ${r.error}`);
        r.passed ? passed++ : failed++;
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log(`TOTAL: ${passed}/${results.length} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    const latencies = results.filter(r => r.latency).map(r => r.latency!);
    if (latencies.length > 0) {
        const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
        console.log(`\nAverage latency: ${avg.toFixed(2)}ms`);
        console.log(`Min: ${Math.min(...latencies)}ms | Max: ${Math.max(...latencies)}ms`);
        console.log(avg > 500 ? '\n⚠️  WARNING: Average latency > 500ms' : '\n✅ Performance OK (<500ms)');
    }
}

runTests().catch(console.error);
