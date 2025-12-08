
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

const ACCESS_TOKEN = "eyJhbGciOiJIUzI1NiIsImtpZCI6IjBkYk5DUjNWQm0rV3FRd2EiLCJ0eXAiOiJKV1QifQ.eyJpc3MiOiJodHRwczovL2ZocnNrZWh6eXZhcXJnZnlxb3BnLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJhOGJlOTIyNy03ZGM4LTQyNjgtYTYyMi00OTQxN2JmZDhjYmEiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzY0OTE4MTkxLCJpYXQiOjE3NjQ5MTQ1OTEsImVtYWlsIjoiZnVudGltZWZhY3RAZ21haWwuY29tIiwicGhvbmUiOiIiLCJhcHBfbWV0YWRhdGEiOnsicHJvdmlkZXIiOiJlbWFpbCIsInByb3ZpZGVycyI6WyJlbWFpbCJdfSwidXNlcl9tZXRhZGF0YSI6eyJlbWFpbCI6ImZ1bnRpbWVmYWN0QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmdWxsX25hbWUiOiJzY2hvb2wgZmluYW5jZXMiLCJwaG9uZV92ZXJpZmllZCI6ZmFsc2UsInN1iI6ImE4YmU5MjI3LTdkYzgtNDI2OC1hNjIyLTQ5NDE3YmZkOGNiYSJ9LCJyb2xlIjoiYXV0aGVudGljYXRlZCIsImFhbCI6ImFhbDEiLCJhbXIiOlt7Im1ldGhvZCI6InBhc3N3b3JkIiwidGltZXN0YW1wIjoxNzY0OTE0NTkxfV0sInNlc3Npb25faWQiOiJiODgyZDUwOC02OTZiLTQzNDktOGQxMC0yOTFjNjRhNjAxNjIiLCJpc19hbm9ueW1vdXMiOmZhbHNlfQ.rho1gQi75oh7fK_PART2UTPJZ5PPRemSa2sI6Pgl9o8";

async function testFetch() {
    const url = `${supabaseUrl}/rest/v1/rpc/get_dashboard_summary`;
    console.log(`Fetching ${url}...`);

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Error: ${response.status} ${response.statusText}`);
            console.error(text);
            return;
        }

        const data = await response.json();
        console.log('Success!');
        console.log(JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Fetch error:', error);
    }
}

testFetch();
