import { createClient } from '@supabase/supabase-js';
// Hardcoded for simplicity since I can't easily load .env in this context without dotenv package
const supabaseUrl = 'https://fhrskehzyvaqrgfyqopg.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZocnNrZWh6eXZhcXJnZnlxb3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMjA4ODgsImV4cCI6MjA3NDc5Njg4OH0.6J4sqB33uIu-Cpk5AuN3KxT4TShjZAD8VYwXQHeHBcA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function createTestUser() {
    const email = 'user@eduopus.com';
    const password = 'password123';

    console.log(`Attempting to sign up user: ${email}`);

    const { data, error } = await supabase.auth.signUp({
        email,
        password,
    });

    if (error) {
        console.error('Error creating user:', error.message);
        // If user already exists, try signing in
        console.log('Attempting to sign in...');
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
            email,
            password,
        });

        if (signInError) {
            console.error('Error signing in:', signInError.message);
            process.exit(1);
        } else {
            console.log('User signed in successfully:', signInData.user?.id);
        }
    } else {
        console.log('User created successfully:', data.user?.id);
    }
}

createTestUser();
