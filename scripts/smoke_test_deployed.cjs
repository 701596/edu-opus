/**
 * Smoke Test for deployed calculate-remaining-fees Edge Function
 */

const URL = "https://fhrskehzyvaqrgfyqopg.supabase.co/functions/v1/calculate-remaining-fees";
const KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZocnNrZWh6eXZhcXJnZnlxb3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMjA4ODgsImV4cCI6MjA3NDc5Njg4OH0.6J4sqB33uIu-Cpk5AuN3KxT4TShjZAD8VYwXQHeHBcA";

async function smokeTest() {
    console.log(`🚀 Calling: ${URL}`);
    try {
        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // school_id will be derived by the function from user membership
                // but we can pass a dummy one if needed for the smoke test
            })
        });

        console.log(`Status: ${response.status} ${response.statusText}`);
        const data = await response.json();
        console.log('Response Body:');
        console.log(JSON.stringify(data, null, 2));

        if (response.ok && data.students !== undefined) {
            console.log('\n✅ SMOKE TEST PASSED');
        } else {
            console.error('\n❌ SMOKE TEST FAILED');
        }
    } catch (error) {
        console.error('\n❌ ERROR DURING SMOKE TEST:');
        console.error(error);
    }
}

smokeTest();
