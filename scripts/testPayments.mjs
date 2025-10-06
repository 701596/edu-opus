import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load local .env for script execution
dotenv.config();

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Please set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY in your environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  try {
    // pick a student - create a temporary student if none exist
    let { data: students } = await supabase.from('students').select('*').limit(1);
    let student = students && students[0];

    if (!student) {
      const { data: newStudent, error: sErr } = await supabase.from('students').insert([
        {
          name: 'Test Student',
          student_id: `STU-${Date.now()}`,
          join_date: new Date().toISOString().split('T')[0],
          fee_amount: 1000,
          fee_type: 'monthly'
        }
      ]).select().single();
      if (sErr) throw sErr;
      student = newStudent;
      console.log('Created test student', student.id);
    } else {
      console.log('Using existing student', student.id);
    }

    // Ensure a fee_folder exists
    let { data: folders } = await supabase.from('fee_folders').select('*').eq('student_id', student.id).limit(1);
    let folder = folders && folders[0];
    if (!folder) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + 1);
      const { data: f, error: fErr } = await supabase.from('fee_folders').insert([
        {
          student_id: student.id,
          folder_name: 'Test Fee Folder',
          amount_due: 1000,
          amount_paid: 0,
          due_date: dueDate.toISOString().split('T')[0],
          status: 'pending'
        }
      ]).select().single();
      if (fErr) throw fErr;
      folder = f;
      console.log('Created fee folder', folder.id);
    } else {
      console.log('Using existing fee folder', folder.id);
    }

    // Insert a payment of 200
    const paymentPayload = {
      student_id: student.id,
      amount: 200,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      receipt_number: `TEST-${Date.now()}`
    };

    const { data: paymentsInsert, error: payErr } = await supabase.from('payments').insert([paymentPayload]).select().single();
    if (payErr) throw payErr;
    console.log('Inserted payment', paymentsInsert.id);

    // Wait a moment for DB triggers to run (if necessary)
    await new Promise((r) => setTimeout(r, 800));

    // Check fee_folder updated
    const { data: updatedFolder } = await supabase.from('fee_folders').select('*').eq('id', folder.id).single();
    console.log('Fee folder after payment:', { amount_due: updatedFolder.amount_due, amount_paid: updatedFolder.amount_paid, status: updatedFolder.status });

    // Check payment_audit inserted
    const { data: audits } = await supabase.from('payment_audit').select('*').eq('payment_id', paymentsInsert.id).limit(1);
    if (audits && audits.length > 0) {
      console.log('Found audit record:', audits[0].id);
    } else {
      console.warn('No audit record found for payment - check triggers or insert logic');
    }

    // Check reports for current month
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const { data: reports } = await supabase.from('reports').select('*').eq('year', year).eq('month', month).limit(1);
    if (reports && reports.length > 0) {
      console.log('Report row found for current month:', reports[0].id);
    } else {
      console.warn('No report row found for current month - ensure recalc_monthly_report triggered or run it manually');
    }

    console.log('TestPayments finished');
  } catch (err) {
    console.error('TestPayments error', err);
    process.exit(1);
  }
}

run();
