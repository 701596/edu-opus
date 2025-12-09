/**
 * Invite Flow Test Suite
 * 
 * Tests for the secure invite system.
 * Run with: npx tsx scripts/test_invite_flow.ts
 * 
 * Prerequisites:
 * - Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in .env
 * - Have a principal user to log in with
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

// =============================================
// Test Configuration
// =============================================

interface TestConfig {
    principalEmail: string;
    principalPassword: string;
    testEmail: string;
    testRole: string;
}

const TEST_CONFIG: TestConfig = {
    principalEmail: 'funtimefact@gmail.com', // Update with your principal email
    principalPassword: '123456', // Update with your principal password
    testEmail: `test-invite-${Date.now()}@example.com`,
    testRole: 'teacher',
};

// =============================================
// Test Results
// =============================================

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    duration: number;
}

const results: TestResult[] = [];

// =============================================
// Test Helpers
// =============================================

async function runTest(
    name: string,
    fn: () => Promise<{ passed: boolean; message: string }>
): Promise<void> {
    const start = Date.now();
    try {
        const result = await fn();
        results.push({
            name,
            passed: result.passed,
            message: result.message,
            duration: Date.now() - start,
        });
    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        results.push({
            name,
            passed: false,
            message: `Exception: ${errorMessage}`,
            duration: Date.now() - start,
        });
    }
}

// =============================================
// Test Cases
// =============================================

async function testCreateInvite(
    supabase: SupabaseClient,
    schoolId: string,
    accessToken: string
): Promise<{ inviteId: string; token: string; securityCode: string }> {
    console.log('\n--- Testing: Create Invite ---');

    const response = await fetch(
        `${supabaseUrl}/functions/v1/create-staff-invite`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                school_id: schoolId,
                email: TEST_CONFIG.testEmail,
                role: TEST_CONFIG.testRole,
                expires_in_hours: 1,
            }),
        }
    );

    const result = await response.json();
    console.log('Create invite result:', JSON.stringify(result, null, 2));

    if (result.status !== 'SUCCESS') {
        throw new Error(`Create invite failed: ${result.message}`);
    }

    return {
        inviteId: result.invite_id,
        token: result.token,
        securityCode: result.security_code,
    };
}

async function testAcceptWithWrongCode(
    accessToken: string,
    inviteToken: string
): Promise<void> {
    console.log('\n--- Testing: Accept with Wrong Code ---');

    const response = await fetch(
        `${supabaseUrl}/functions/v1/accept-staff-invite`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                token: inviteToken,
                code: 'WRONG1',
            }),
        }
    );

    const result = await response.json();
    console.log('Wrong code result:', JSON.stringify(result, null, 2));

    await runTest('Accept with wrong code returns INVALID_CODE', async () => {
        return {
            passed: result.status === 'INVALID_CODE',
            message: `Expected INVALID_CODE, got ${result.status}`,
        };
    });
}

async function testAcceptWithCorrectCode(
    accessToken: string,
    inviteToken: string,
    securityCode: string
): Promise<void> {
    console.log('\n--- Testing: Accept with Correct Code ---');

    const response = await fetch(
        `${supabaseUrl}/functions/v1/accept-staff-invite`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                token: inviteToken,
                code: securityCode,
            }),
        }
    );

    const result = await response.json();
    console.log('Correct code result:', JSON.stringify(result, null, 2));

    await runTest('Accept with correct code returns SUCCESS', async () => {
        return {
            passed: result.status === 'SUCCESS',
            message: result.status === 'SUCCESS'
                ? `Joined as ${result.role} in ${result.school_name}`
                : `Expected SUCCESS, got ${result.status}: ${result.message}`,
        };
    });
}

async function testReusedInvite(
    accessToken: string,
    inviteToken: string,
    securityCode: string
): Promise<void> {
    console.log('\n--- Testing: Reuse Already Accepted Invite ---');

    const response = await fetch(
        `${supabaseUrl}/functions/v1/accept-staff-invite`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                token: inviteToken,
                code: securityCode,
            }),
        }
    );

    const result = await response.json();
    console.log('Reuse invite result:', JSON.stringify(result, null, 2));

    await runTest('Reusing accepted invite returns ALREADY_ACCEPTED', async () => {
        return {
            passed: result.status === 'ALREADY_ACCEPTED',
            message: `Expected ALREADY_ACCEPTED, got ${result.status}`,
        };
    });
}

async function testInvalidToken(accessToken: string): Promise<void> {
    console.log('\n--- Testing: Invalid Token ---');

    const response = await fetch(
        `${supabaseUrl}/functions/v1/accept-staff-invite`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({
                token: 'invalid-token-that-does-not-exist',
                code: 'ABC123',
            }),
        }
    );

    const result = await response.json();
    console.log('Invalid token result:', JSON.stringify(result, null, 2));

    await runTest('Invalid token returns INVALID_TOKEN', async () => {
        return {
            passed: result.status === 'INVALID_TOKEN',
            message: `Expected INVALID_TOKEN, got ${result.status}`,
        };
    });
}

async function testVerifyDatabaseState(
    supabase: SupabaseClient,
    inviteId: string,
    schoolId: string
): Promise<void> {
    console.log('\n--- Testing: Verify Database State ---');

    // Check invite status
    const { data: invite, error: inviteError } = await supabase
        .from('school_invites')
        .select('status, accepted_at, accepted_by')
        .eq('id', inviteId)
        .single();

    if (inviteError) {
        console.error('Could not fetch invite:', inviteError);
    }

    await runTest('Invite status updated to accepted', async () => {
        return {
            passed: invite?.status === 'accepted' && invite?.accepted_at !== null,
            message: invite
                ? `Status: ${invite.status}, Accepted: ${invite.accepted_at}`
                : 'Could not verify invite',
        };
    });

    // Check audit log
    const { data: audit, error: auditError } = await supabase
        .from('invite_audit')
        .select('action, meta')
        .eq('invite_id', inviteId)
        .order('created_at', { ascending: false });

    if (auditError) {
        console.error('Could not fetch audit:', auditError);
    }

    await runTest('Audit log contains CREATED and ACCEPTED entries', async () => {
        const actions = audit?.map((a: { action: string }) => a.action) || [];
        const hasCreated = actions.includes('CREATED');
        const hasAccepted = actions.includes('ACCEPTED');
        return {
            passed: hasCreated && hasAccepted,
            message: `Actions found: ${actions.join(', ')}`,
        };
    });
}

// =============================================
// Main Test Runner
// =============================================

async function main() {
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║            INVITE FLOW TEST SUITE                          ║');
    console.log('╚════════════════════════════════════════════════════════════╝');

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Login as principal
    console.log('\n--- Logging in as principal ---');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: TEST_CONFIG.principalEmail,
        password: TEST_CONFIG.principalPassword,
    });

    if (authError || !authData.session) {
        console.error('❌ Failed to login:', authError?.message);
        process.exit(1);
    }

    const accessToken = authData.session.access_token;
    console.log('✓ Logged in as:', authData.user?.email);

    // Get school
    const { data: schools } = await supabase.from('schools').select('id, name').limit(1);
    const school = schools?.[0];

    if (!school) {
        console.error('❌ No school found for this user');
        process.exit(1);
    }

    console.log('✓ Using school:', school.name);

    try {
        // Test 1: Create invite
        const { inviteId, token, securityCode } = await testCreateInvite(
            supabase,
            school.id,
            accessToken
        );

        await runTest('Create invite returns token and security_code', async () => ({
            passed: !!token && !!securityCode && securityCode.length === 6,
            message: `Token: ${token?.substring(0, 8)}..., Code: ${securityCode}`,
        }));

        // Test 2: Accept with wrong code
        await testAcceptWithWrongCode(accessToken, token);

        // Test 3: Accept with correct code
        await testAcceptWithCorrectCode(accessToken, token, securityCode);

        // Test 4: Reuse invite
        await testReusedInvite(accessToken, token, securityCode);

        // Test 5: Invalid token
        await testInvalidToken(accessToken);

        // Test 6: Verify database state
        await testVerifyDatabaseState(supabase, inviteId, school.id);

    } catch (error) {
        console.error('Test execution error:', error);
    }

    // Print results
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║                    TEST RESULTS                            ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    for (const r of results) {
        const icon = r.passed ? '✓' : '✗';
        const status = r.passed ? 'PASS' : 'FAIL';
        console.log(`${icon} ${status}: ${r.name} (${r.duration}ms)`);
        console.log(`      ${r.message}`);
        console.log();

        if (r.passed) passed++;
        else failed++;
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`TOTAL: ${passed}/${results.length} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        console.log('❌ Some tests failed.');
        process.exit(1);
    } else {
        console.log('✅ All tests passed!');
    }

    // Cleanup: Sign out
    await supabase.auth.signOut();
}

main().catch(console.error);
