/**
 * RBAC Test Suite
 * 
 * Automated tests for role-based access control.
 * Run with: npx tsx scripts/test_rbac.ts
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// =============================================
// Test Results
// =============================================
interface TestResult {
    test: string;
    role: string;
    operation: string;
    expected: 'allow' | 'deny';
    actual: 'allow' | 'deny' | 'error';
    passed: boolean;
    error?: string;
}

const results: TestResult[] = [];

// =============================================
// Test Helpers
// =============================================

async function runTest(
    role: string,
    operation: string,
    fn: () => Promise<{ data: any; error: any }>,
    expected: 'allow' | 'deny'
): Promise<void> {
    try {
        const { data, error } = await fn();

        let actual: 'allow' | 'deny' | 'error';
        if (error) {
            // Check if it's a permission error
            if (error.code === 'PGRST301' || error.message?.includes('permission') || error.message?.includes('RLS')) {
                actual = 'deny';
            } else {
                actual = 'error';
            }
        } else {
            actual = 'allow';
        }

        results.push({
            test: `${role}: ${operation}`,
            role,
            operation,
            expected,
            actual,
            passed: actual === expected || (expected === 'deny' && actual === 'error'),
            error: error?.message,
        });
    } catch (e: any) {
        results.push({
            test: `${role}: ${operation}`,
            role,
            operation,
            expected,
            actual: 'error',
            passed: expected === 'deny',
            error: e.message,
        });
    }
}

// =============================================
// Tests
// =============================================

async function testPrincipalAccess() {
    console.log('\n=== Testing PRINCIPAL Access ===\n');

    // Login as principal
    const { error: authError } = await supabase.auth.signInWithPassword({
        email: 'funtimefact@gmail.com',
        password: '123456',
    });

    if (authError) {
        console.log('Auth failed:', authError.message);
        return;
    }

    // Get school
    const { data: schools } = await supabase.from('schools').select('id').limit(1);
    const schoolId = schools?.[0]?.id;

    if (!schoolId) {
        console.log('No school found - run backfill first');
        return;
    }

    // Test: View all students
    await runTest('principal', 'SELECT students', async () => {
        return supabase.from('students').select('*').limit(5);
    }, 'allow');

    // Test: Create student
    await runTest('principal', 'INSERT student', async () => {
        return supabase.from('students').insert({
            name: 'RBAC Test Student',
            school_id: schoolId,
        }).select();
    }, 'allow');

    // Test: View payments
    await runTest('principal', 'SELECT payments', async () => {
        return supabase.from('payments').select('*').limit(5);
    }, 'allow');

    // Test: Create expense
    await runTest('principal', 'INSERT expense', async () => {
        return supabase.from('expenses').insert({
            description: 'RBAC Test Expense',
            amount: 100,
            school_id: schoolId,
        }).select();
    }, 'allow');

    // Test: View staff
    await runTest('principal', 'SELECT staff', async () => {
        return supabase.from('staff').select('*').limit(5);
    }, 'allow');

    // Test: Invite member
    await runTest('principal', 'create_school_invite', async () => {
        return supabase.rpc('create_school_invite' as any, {
            p_school_id: schoolId,
            p_email: 'test@example.com',
            p_role: 'teacher',
        });
    }, 'allow');

    // Test: View audit logs
    await runTest('principal', 'SELECT audit_logs', async () => {
        return supabase.from('audit_logs').select('*').limit(5);
    }, 'allow');

    // Cleanup test data
    await supabase.from('students').delete().eq('name', 'RBAC Test Student');
    await supabase.from('expenses').delete().eq('description', 'RBAC Test Expense');
    await supabase.from('school_invites').delete().eq('email', 'test@example.com');
}

async function testRLSPenetration() {
    console.log('\n=== RLS Penetration Tests ===\n');

    // These tests verify that RLS blocks unauthorized access
    // In a real scenario, you'd test with different user accounts

    await runTest('anonymous', 'SELECT students (no auth)', async () => {
        // Create a fresh client without auth
        const anonClient = createClient(supabaseUrl, supabaseKey);
        return anonClient.from('students').select('*').limit(5);
    }, 'deny');

    await runTest('anonymous', 'INSERT payment (no auth)', async () => {
        const anonClient = createClient(supabaseUrl, supabaseKey);
        return anonClient.from('payments').insert({
            amount: 1000,
            student_id: '00000000-0000-0000-0000-000000000000',
        });
    }, 'deny');
}

// =============================================
// Main
// =============================================

async function runAllTests() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║              RBAC TEST SUITE                               ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    await testPrincipalAccess();
    await testRLSPenetration();

    // Summary
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    for (const r of results) {
        const icon = r.passed ? '✓' : '✗';
        const status = r.passed ? 'PASS' : 'FAIL';
        console.log(`${icon} ${status}: ${r.test}`);
        console.log(`      Expected: ${r.expected}, Actual: ${r.actual}`);
        if (!r.passed && r.error) {
            console.log(`      Error: ${r.error}`);
        }
        console.log();

        if (r.passed) passed++;
        else failed++;
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`TOTAL: ${passed}/${results.length} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        console.log('❌ Some tests failed. Review RLS policies.');
        process.exit(1);
    } else {
        console.log('✅ All tests passed!');
    }
}

runAllTests().catch(console.error);
