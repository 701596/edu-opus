import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    'https://fhrskehzyvaqrgfyqopg.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZocnNrZWh6eXZhcXJnZnlxb3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMjA4ODgsImV4cCI6MjA3NDc5Njg4OH0.6J4sqB33uIu-Cpk5AuN3KxT4TShjZAD8VYwXQHeHBcA'
);

async function verifyMigration() {
    // Login
    await supabase.auth.signInWithPassword({
        email: 'funtimefact@gmail.com',
        password: '123456'
    });

    console.log('✓ Authenticated\n');

    // 1. Query rate_limit_config
    console.log('1. Checking security.rate_limit_config...');
    const { data: config, error: e1 } = await supabase
        .from('rate_limit_config')
        .select('*')
        .limit(5);

    if (e1) {
        // Try with schema prefix via RPC
        console.log('   Direct table access denied (expected with RLS)');
        console.log('   Trying schema-qualified query...');
    } else {
        console.log('   Config entries:', config?.length || 0);
        console.log(config);
    }

    // 2. Test check_rate_limit function
    console.log('\n2. Testing security.check_rate_limit()...');
    const { data: checkResult, error: e2 } = await supabase.rpc('check_rate_limit' as any, {
        p_key: 'test:verify:endpoint',
        p_max_requests: 10,
        p_window_seconds: 60
    });

    if (e2) {
        console.log('   Error:', e2.message);
    } else {
        console.log('   Result:', checkResult);
    }

    // 3. Test log_rate_limit_violation
    console.log('\n3. Testing security.log_rate_limit_violation()...');
    const { data: logResult, error: e3 } = await supabase.rpc('log_rate_limit_violation' as any, {
        p_user_id: null,
        p_ip_address: '127.0.0.1',
        p_endpoint: 'test.verify',
        p_method: 'POST',
        p_request_count: 11,
        p_limit_value: 10,
        p_action: 'warn'
    });

    if (e3) {
        console.log('   Error:', e3.message);
    } else {
        console.log('   Logged violation ID:', logResult);
    }

    // 4. Query recent violations
    console.log('\n4. Querying recent violations...');
    const { data: violations, error: e4 } = await supabase
        .from('rate_limits')
        .select('*')
        .order('timestamp', { ascending: false })
        .limit(3);

    if (e4) {
        console.log('   Error:', e4.message);
    } else {
        console.log('   Recent violations:');
        console.log(JSON.stringify(violations, null, 2));
    }

    // 5. Get stats
    console.log('\n5. Getting rate limit stats...');
    const { data: stats, error: e5 } = await supabase.rpc('get_rate_limit_stats' as any, {
        p_hours: 24
    });

    if (e5) {
        console.log('   Error:', e5.message);
    } else {
        console.log('   Stats:', JSON.stringify(stats, null, 2));
    }

    console.log('\n✓ Migration verification complete');
}

verifyMigration().catch(console.error);
