
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import path from 'path';

// Load environment variables from .env file
config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function authenticate() {
    const { error } = await supabase.auth.signInWithPassword({
        email: 'funtimefact@gmail.com',
        password: '123456'
    });

    if (error) {
        console.error('Authentication failed:', error.message);
        process.exit(1);
    }
    console.log('Authenticated successfully');
}

async function benchmarkRPC(rpcName: string, iterations: number = 5) {
    console.log(`\nBenchmarking ${rpcName} (${iterations} iterations)...`);
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        const { error } = await supabase.rpc(rpcName as any);
        const end = performance.now();

        if (error) {
            console.error(`Error calling ${rpcName}:`, error);
            continue;
        }

        const duration = end - start;
        times.push(duration);
        console.log(`  Iteration ${i + 1}: ${duration.toFixed(2)}ms`);
    }

    if (times.length === 0) return { avg: 0, min: 0, max: 0 };

    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);

    console.log(`\n  Results for ${rpcName}:`);
    console.log(`  Average: ${avg.toFixed(2)}ms`);
    console.log(`  Min: ${min.toFixed(2)}ms`);
    console.log(`  Max: ${max.toFixed(2)}ms`);

    return { avg, min, max };
}

async function runBenchmarks() {
    await authenticate();

    console.log('\n========================================');
    console.log('       BASELINE RPC BENCHMARK');
    console.log('========================================');

    const dashboardResults = await benchmarkRPC('get_dashboard_summary');
    const reportResults = await benchmarkRPC('get_report_summary');

    console.log('\n========================================');
    console.log('              SUMMARY');
    console.log('========================================');
    console.log(`get_dashboard_summary: ${dashboardResults.avg.toFixed(2)}ms avg`);
    console.log(`get_report_summary: ${reportResults.avg.toFixed(2)}ms avg`);
}

runBenchmarks();
