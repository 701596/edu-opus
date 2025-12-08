
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

async function cleanupData() {
    await authenticate();
    console.log('Starting cleanup of stress data...');

    // First find stress students
    const { data: students, error: fetchError } = await supabase
        .from('students')
        .select('id')
        .ilike('student_id', 'STRESS-%');

    if (fetchError || !students) {
        console.error('Error fetching stress students:', fetchError);
        return;
    }

    if (students.length === 0) {
        console.log('No stress data found.');
        return;
    }

    const studentIds = students.map(s => s.id);
    console.log(`Found ${students.length} stress students. Deleting payments...`);

    // Delete payments in batches
    const BATCH_SIZE = 500;
    for (let i = 0; i < studentIds.length; i += BATCH_SIZE) {
        const batchIds = studentIds.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('payments')
            .delete()
            .in('student_id', batchIds);

        if (error) {
            console.error('Error deleting payments:', error);
            return;
        }
        console.log(`Deleted payments for students ${i} to ${i + batchIds.length}`);
    }

    console.log('Deleting stress students...');

    const { error: deleteError } = await supabase
        .from('students')
        .delete()
        .ilike('student_id', 'STRESS-%');

    if (deleteError) {
        console.error('Error deleting students:', deleteError);
        return;
    }

    console.log('Cleanup complete.');
}

cleanupData();
