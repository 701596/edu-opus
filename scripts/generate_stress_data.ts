
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

const BATCH_SIZE = 500;
const TOTAL_STUDENTS = 10000;
const PAYMENTS_PER_STUDENT = 5;

function generateStudent(index: number, userId: string) {
    return {
        student_id: `STRESS-${index}`,
        name: `Stress Student ${index}`,
        class: 'Grade 10',
        fee_amount: 5000,
        fee_type: 'monthly',
        guardian_name: `Guardian ${index}`,
        guardian_phone: '1234567890',
        join_date: new Date().toISOString().split('T')[0],
        email: `stress${index}@example.com`,
        phone: '0987654321',
        address: '123 Stress St',
        date_of_birth: '2008-01-01',
        enrollment_date: new Date().toISOString().split('T')[0],
        metadata: { is_stress_test: true },
        user_id: userId
    };
}

function generatePayment(studentId: string, index: number, userId: string) {
    return {
        student_id: studentId,
        amount: 1000,
        payment_method: 'cash',
        payment_date: new Date().toISOString().split('T')[0],
        receipt_number: `REC-STRESS-${Date.now()}-${index}`,
        description: 'Stress Test Payment',
        user_id: userId
    };
}

async function generateData() {
    await authenticate();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.error('No user found after auth');
        return;
    }
    const userId = user.id;

    console.log('Starting stress data generation...');
    const startTime = performance.now();

    // Generate Students
    for (let i = 0; i < TOTAL_STUDENTS; i += BATCH_SIZE) {
        const batch = [];
        for (let j = 0; j < BATCH_SIZE && i + j < TOTAL_STUDENTS; j++) {
            batch.push(generateStudent(i + j, userId));
        }

        const { error } = await supabase.from('students').insert(batch);
        if (error) {
            console.error('Error inserting students batch:', error);
            return;
        }
        console.log(`Inserted students ${i} to ${i + batch.length}`);
    }

    console.log('Fetching student UUIDs...');
    const { data: students, error: fetchError } = await supabase
        .from('students')
        .select('id')
        .ilike('student_id', 'STRESS-%');

    if (fetchError || !students) {
        console.error('Error fetching student IDs:', fetchError);
        return;
    }

    console.log(`Fetched ${students.length} stress students. Generating payments...`);

    // Generate Payments
    let paymentCount = 0;
    let paymentBatch: any[] = [];

    for (const student of students) {
        for (let k = 0; k < PAYMENTS_PER_STUDENT; k++) {
            paymentBatch.push(generatePayment(student.id, paymentCount, userId));
            paymentCount++;

            if (paymentBatch.length >= BATCH_SIZE) {
                const { error } = await supabase.from('payments').insert(paymentBatch);
                if (error) {
                    console.error('Error inserting payments batch:', error);
                    return;
                }
                console.log(`Inserted payments ${paymentCount - BATCH_SIZE} to ${paymentCount}`);
                paymentBatch = [];
            }
        }
    }

    // Insert remaining payments
    if (paymentBatch.length > 0) {
        const { error } = await supabase.from('payments').insert(paymentBatch);
        if (error) console.error('Error inserting remaining payments:', error);
        else console.log(`Inserted remaining ${paymentBatch.length} payments.`);
    }

    const endTime = performance.now();
    console.log(`\nStress test data generation complete in ${((endTime - startTime) / 1000).toFixed(2)}s`);
    console.log(`Total: ${TOTAL_STUDENTS} students, ${paymentCount} payments`);
}

generateData();
