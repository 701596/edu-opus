/**
 * E2E Invite Flow Test Suite
 * 
 * Comprehensive end-to-end tests for the secure invite system.
 * Run with: npx tsx scripts/test_e2e_invite.ts
 */

import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL!;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

// =============================================
// Test Configuration
// =============================================

const ADMIN_EMAIL = 'funtimefact@gmail.com';
const ADMIN_PASSWORD = '123456';
// Use unique email per test run to avoid conflicts with existing users
const TEST_USER_EMAIL = `testuser+${Date.now()}@example.com`;
const TEST_USER_PASSWORD = 'TempPass123!';

// =============================================
// Test Results
// =============================================

interface TestResult {
    name: string;
    passed: boolean;
    message: string;
    details?: unknown;
}

const results: TestResult[] = [];

function log(msg: string) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function logTest(name: string, passed: boolean, message: string, details?: unknown) {
    const icon = passed ? '✓' : '✗';
    console.log(`\n${icon} ${name}`);
    console.log(`  ${message}`);
    if (details) console.log(`  Details:`, JSON.stringify(details, null, 2));
    results.push({ name, passed, message, details });
}

// =============================================
// Test A: Admin Login & Create Invite
// =============================================

async function testA_AdminLoginAndCreateInvite(supabase: SupabaseClient): Promise<{
    token: string;
    securityCode: string;
    inviteId: string;
    schoolId: string;
} | null> {
    log('\n========= TEST A: Admin Login & Create Invite =========\n');

    // A1: Login as admin
    log('A1: Logging in as admin...');
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });

    if (authError || !authData.session) {
        logTest('A1: Admin Login', false, `Failed: ${authError?.message}`);
        return null;
    }
    logTest('A1: Admin Login', true, `Logged in as ${authData.user?.email}`);

    // A2: Get school where user is PRINCIPAL (not just any school)
    log('A2: Fetching school where user is principal...');
    const { data: userRoles, error: rolesError } = await (supabase.rpc as Function)(
        'get_user_roles'
    );

    if (rolesError) {
        logTest('A2: Fetch Principal School', false, `Failed: ${rolesError.message}`);
        return null;
    }

    // Find a school where user is principal
    const principalRole = userRoles?.find((r: { role: string }) => r.role === 'principal');
    if (!principalRole) {
        logTest('A2: Fetch Principal School', false, 'User is not a principal of any school');
        return null;
    }

    const school = { id: principalRole.school_id, name: principalRole.school_name };
    logTest('A2: Fetch Principal School', true, `Using school: ${school.name} (as principal)`, { id: school.id });

    // A3: Create invite via RPC
    log('A3: Creating invite via create_invite_secure RPC...');
    const { data: inviteResult, error: inviteError } = await (supabase.rpc as Function)(
        'create_invite_secure',
        {
            p_school_id: school.id,
            p_email: TEST_USER_EMAIL,
            p_role: 'teacher',
            p_expires_hours: 48,
        }
    );

    if (inviteError) {
        logTest('A3: Create Invite', false, `RPC Error: ${inviteError.message}`);
        return null;
    }

    if (inviteResult.status !== 'SUCCESS') {
        logTest('A3: Create Invite', false, `Status: ${inviteResult.status} - ${inviteResult.message}`);
        return null;
    }

    // TEST ONLY - DO NOT LOG IN PRODUCTION
    console.log('\n  ⚠️  TEST ONLY - SECURITY CODE (remove before prod):', inviteResult.security_code);

    logTest('A3: Create Invite', true, 'Invite created successfully', {
        invite_id: inviteResult.invite_id,
        token: inviteResult.token.substring(0, 16) + '...',
        expires_at: inviteResult.expires_at,
    });

    // A4: Verify DB state
    log('A4: Verifying invite in database...');
    const { data: dbInvite, error: dbError } = await supabase
        .from('school_invites')
        .select('id, email, role, status, token, security_code, created_at')
        .eq('id', inviteResult.invite_id)
        .single();

    if (dbError || !dbInvite) {
        logTest('A4: DB Verification', false, `Failed: ${dbError?.message || 'Invite not found'}`);
        return null;
    }

    const dbPassed = dbInvite.status === 'pending' &&
        dbInvite.email === TEST_USER_EMAIL.toLowerCase() &&
        dbInvite.role === 'teacher' &&
        dbInvite.security_code !== null;

    logTest('A4: DB Verification', dbPassed,
        `status=${dbInvite.status}, email=${dbInvite.email}, role=${dbInvite.role}`,
        { id: dbInvite.id, created_at: dbInvite.created_at }
    );

    if (!dbPassed) return null;

    return {
        token: inviteResult.token,
        securityCode: inviteResult.security_code,
        inviteId: inviteResult.invite_id,
        schoolId: school.id,
    };
}

// =============================================
// Test B: Invalid Code Rejection
// =============================================

async function testB_InvalidCodeRejection(supabase: SupabaseClient, token: string): Promise<boolean> {
    log('\n========= TEST B: Invalid Code Rejection =========\n');

    // First, sign in as the test user (create if needed)
    log('B0: Signing in/up as test user...');

    // Try to sign in first
    let { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
    });

    if (signInError) {
        // User doesn't exist, create them
        log('  User not found, creating account...');
        const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD,
        });

        if (signUpError) {
            logTest('B0: Test User Setup', false, `Failed to create: ${signUpError.message}`);
            return false;
        }

        // Sign in after signup
        const { error: reSignInError } = await supabase.auth.signInWithPassword({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD,
        });

        if (reSignInError) {
            logTest('B0: Test User Setup', false, `Failed to sign in: ${reSignInError.message}`);
            return false;
        }

        logTest('B0: Test User Setup', true, `Created and signed in as ${TEST_USER_EMAIL}`);
    } else {
        logTest('B0: Test User Setup', true, `Signed in as ${TEST_USER_EMAIL}`);
    }

    // B1: Try to accept with wrong code
    log('B1: Attempting accept with WRONG code (000000)...');
    const { data: wrongCodeResult, error: wrongCodeError } = await (supabase.rpc as Function)(
        'accept_invite_by_code',
        { p_token: token, p_code: '000000' }
    );

    if (wrongCodeError) {
        logTest('B1: Wrong Code Rejection', false, `RPC Error: ${wrongCodeError.message}`);
        return false;
    }

    const passed = wrongCodeResult.status === 'INVALID_CODE';
    logTest('B1: Wrong Code Rejection', passed,
        `Expected INVALID_CODE, got ${wrongCodeResult.status}: ${wrongCodeResult.message}`,
        wrongCodeResult
    );

    return passed;
}

// =============================================
// Test C: Accept with Correct Code
// =============================================

async function testC_AcceptWithCorrectCode(
    supabase: SupabaseClient,
    token: string,
    securityCode: string,
    inviteId: string,
    schoolId: string
): Promise<boolean> {
    log('\n========= TEST C: Accept with Correct Code =========\n');

    // Make sure we're signed in as test user
    log('C0: Ensuring signed in as test user...');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.email !== TEST_USER_EMAIL) {
        await supabase.auth.signInWithPassword({
            email: TEST_USER_EMAIL,
            password: TEST_USER_PASSWORD,
        });
    }

    // C1: Accept with correct code
    log('C1: Accepting invite with CORRECT code...');
    const { data: acceptResult, error: acceptError } = await (supabase.rpc as Function)(
        'accept_invite_by_code',
        { p_token: token, p_code: securityCode }
    );

    if (acceptError) {
        logTest('C1: Accept Invite', false, `RPC Error: ${acceptError.message}`);
        return false;
    }

    if (acceptResult.status !== 'SUCCESS') {
        logTest('C1: Accept Invite', false,
            `Expected SUCCESS, got ${acceptResult.status}: ${acceptResult.message}`,
            acceptResult
        );
        return false;
    }

    logTest('C1: Accept Invite', true,
        `Joined as ${acceptResult.role} in ${acceptResult.school_name}`,
        acceptResult
    );

    // C2: Verify invite status in DB
    log('C2: Verifying invite status in DB...');
    const { data: dbInvite } = await supabase
        .from('school_invites')
        .select('status, accepted_at, accepted_by')
        .eq('id', inviteId)
        .single();

    const inviteDbPassed = dbInvite?.status === 'accepted' &&
        dbInvite?.accepted_at !== null &&
        dbInvite?.accepted_by !== null;

    logTest('C2: Invite DB Status', inviteDbPassed,
        `status=${dbInvite?.status}, accepted_at=${dbInvite?.accepted_at}, accepted_by=${dbInvite?.accepted_by}`
    );

    // C3: Verify school_members row
    log('C3: Verifying school_members row...');
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    const { data: memberRow } = await supabase
        .from('school_members')
        .select('*')
        .eq('user_id', currentUser!.id)
        .eq('school_id', schoolId)
        .single();

    const memberDbPassed = memberRow !== null &&
        memberRow.role === 'teacher' &&
        memberRow.is_active === true;

    logTest('C3: Member DB Row', memberDbPassed,
        `role=${memberRow?.role}, is_active=${memberRow?.is_active}`,
        memberRow
    );

    return inviteDbPassed && memberDbPassed;
}

// =============================================
// Test E: Reuse Link / Already Accepted
// =============================================

async function testE_ReuseLink(
    supabase: SupabaseClient,
    token: string,
    securityCode: string
): Promise<boolean> {
    log('\n========= TEST E: Reuse Link / Already Accepted =========\n');

    // E1: Try to reuse the same invite
    log('E1: Attempting to reuse accepted invite...');
    const { data: reuseResult, error: reuseError } = await (supabase.rpc as Function)(
        'accept_invite_by_code',
        { p_token: token, p_code: securityCode }
    );

    if (reuseError) {
        logTest('E1: Reuse Detection', false, `RPC Error: ${reuseError.message}`);
        return false;
    }

    const passed = reuseResult.status === 'ALREADY_ACCEPTED';
    logTest('E1: Reuse Detection', passed,
        `Expected ALREADY_ACCEPTED, got ${reuseResult.status}: ${reuseResult.message}`,
        reuseResult
    );

    return passed;
}

// =============================================
// Test F: Expiry Behavior
// =============================================

async function testF_ExpiryBehavior(supabase: SupabaseClient): Promise<boolean> {
    log('\n========= TEST F: Expiry Behavior =========\n');

    // Switch back to admin for creating expired invite
    log('F0: Switching to admin user...');
    await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });

    // F1: Get school
    const { data: schools } = await supabase.from('schools').select('id').limit(1);
    const schoolId = schools?.[0]?.id;

    // F2: Create an invite with 0 hours expiry (immediately expired)
    log('F1: Creating expired invite (0 hours)...');

    // We'll manually create an already-expired invite by inserting directly
    const { data: inviteResult, error: inviteError } = await (supabase.rpc as Function)(
        'create_invite_secure',
        {
            p_school_id: schoolId,
            p_email: 'ytdf186+expired@test.com',
            p_role: 'teacher',
            p_expires_hours: 0, // This should create an already-expired invite
        }
    );

    if (inviteError) {
        logTest('F1: Create Expired Invite', false, `RPC Error: ${inviteError.message}`);
        return false;
    }

    logTest('F1: Create Expired Invite', true, `Created invite with expires_at: ${inviteResult.expires_at}`);

    // F2: Switch to test user and try to accept
    log('F2: Switching to test user to accept expired invite...');
    await supabase.auth.signInWithPassword({
        email: TEST_USER_EMAIL,
        password: TEST_USER_PASSWORD,
    });

    // F3: Try to accept expired invite
    log('F3: Attempting to accept expired invite...');
    const { data: acceptResult, error: acceptError } = await (supabase.rpc as Function)(
        'accept_invite_by_code',
        { p_token: inviteResult.token, p_code: inviteResult.security_code }
    );

    if (acceptError) {
        logTest('F3: Expired Rejection', false, `RPC Error: ${acceptError.message}`);
        return false;
    }

    const passed = acceptResult.status === 'EXPIRED';
    logTest('F3: Expired Rejection', passed,
        `Expected EXPIRED, got ${acceptResult.status}: ${acceptResult.message}`,
        acceptResult
    );

    return passed;
}

// =============================================
// Test G: Audit Log Verification
// =============================================

async function testG_AuditLog(supabase: SupabaseClient, inviteId: string): Promise<boolean> {
    log('\n========= TEST G: Audit Log Verification =========\n');

    // Switch back to admin for RLS
    log('G0: Switching to admin user...');
    await supabase.auth.signInWithPassword({
        email: ADMIN_EMAIL,
        password: ADMIN_PASSWORD,
    });

    // G1: Query audit logs
    log('G1: Querying invite_audit table...');
    const { data: auditLogs, error: auditError } = await supabase
        .from('invite_audit')
        .select('id, action, actor_id, meta, created_at')
        .eq('invite_id', inviteId)
        .order('created_at', { ascending: true });

    if (auditError) {
        logTest('G1: Audit Log Query', false, `Query Error: ${auditError.message}`);
        return false;
    }

    console.log('\n  Audit Entries:');
    auditLogs?.forEach((log, i) => {
        console.log(`    ${i + 1}. ${log.action} at ${log.created_at}`);
        console.log(`       Meta: ${JSON.stringify(log.meta)}`);
    });

    const actions = auditLogs?.map(l => l.action) || [];
    const hasCreated = actions.includes('CREATED');
    const hasAccepted = actions.includes('ACCEPTED');
    const noSecurityCode = auditLogs?.every(l => !l.meta?.security_code);

    const passed = hasCreated && hasAccepted && noSecurityCode;
    logTest('G1: Audit Log Verification', passed,
        `CREATED: ${hasCreated}, ACCEPTED: ${hasAccepted}, No security_code in meta: ${noSecurityCode}`,
        { actions, count: auditLogs?.length }
    );

    return passed;
}

// =============================================
// Main Test Runner
// =============================================

async function main() {
    console.log('╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║         E2E INVITE FLOW TEST SUITE                                ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝');

    const supabase = createClient(supabaseUrl, supabaseKey);

    try {
        // Test A: Admin Login & Create Invite
        const inviteData = await testA_AdminLoginAndCreateInvite(supabase);
        if (!inviteData) {
            console.error('\n❌ Test A failed - cannot continue');
            return printSummary();
        }

        // Test B: Invalid Code Rejection
        await testB_InvalidCodeRejection(supabase, inviteData.token);

        // Test C: Accept with Correct Code
        const testCPassed = await testC_AcceptWithCorrectCode(
            supabase,
            inviteData.token,
            inviteData.securityCode,
            inviteData.inviteId,
            inviteData.schoolId
        );

        // Test E: Reuse Link (only if C passed)
        if (testCPassed) {
            await testE_ReuseLink(supabase, inviteData.token, inviteData.securityCode);
        }

        // Test F: Expiry Behavior
        await testF_ExpiryBehavior(supabase);

        // Test G: Audit Log Verification
        await testG_AuditLog(supabase, inviteData.inviteId);

    } catch (error) {
        console.error('\n❌ Test execution error:', error);
    }

    // Print summary
    printSummary();

    // Cleanup
    await supabase.auth.signOut();
}

function printSummary() {
    console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
    console.log('║                         TEST RESULTS                              ║');
    console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

    let passed = 0;
    let failed = 0;

    for (const r of results) {
        const icon = r.passed ? '✓' : '✗';
        console.log(`${icon} ${r.name}: ${r.passed ? 'PASS' : 'FAIL'}`);
        if (r.passed) passed++;
        else failed++;
    }

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log(`TOTAL: ${passed}/${results.length} passed, ${failed} failed`);
    console.log('═══════════════════════════════════════════════════════════════════\n');

    if (failed > 0) {
        console.log('❌ SOME TESTS FAILED');
        process.exit(1);
    } else {
        console.log('✅ ALL TESTS GREEN');
    }
}

main().catch(console.error);
