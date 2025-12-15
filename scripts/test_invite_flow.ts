
// scripts/test_invite_flow.ts
// Usage: npx ts-node scripts/test_invite_flow.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY!;
// Note: You need a service role key to clean up or setup mocks if needed, 
// but this test assumes running as a User and Admin.

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
    console.log('--- STARTING HYBRID INVITE TESTS ---');

    // Prerequisite: You must be logged in as a School Admin in the browser or have credentials here.
    // For this script, we'll assume we are testing the Public RPCs primarily or need to mock auth.

    // 1. Test Verification of Invalid Token
    console.log('1. Testing Invalid Token Verification...');
    const { data: invalidData, error: invalidError } = await supabase.rpc('verify_hybrid_invite', {
        p_token: 'invalid-token-123'
    });

    if (invalidData && invalidData.valid === false) {
        console.log('✅ Invalid token correctly rejected.');
    } else {
        console.error('❌ Failed: Invalid token accepted or error.', invalidData, invalidError);
    }

    // 2. Test Verification of Invalid Code
    console.log('2. Testing Invalid Code Verification...');
    const { data: invalidCodeData } = await supabase.rpc('verify_hybrid_invite', {
        p_code: 'BAD-CODE'
    });

    if (invalidCodeData && invalidCodeData.valid === false) {
        console.log('✅ Invalid code correctly rejected.');
    } else {
        console.error('❌ Failed: Invalid code accepted.', invalidCodeData);
    }

    console.log('--- TESTS COMPLETED (Partial) ---');
    console.log('Note: Full E2E requires an authenticated Admin user to Create invites first.');
    console.log('Please verify "Create Invite" manually in UI, then use the generated token/code here if debugging.');
}

runTests().catch(console.error);
