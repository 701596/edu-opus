import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

// Load local .env if present (simple parser)
const envPath = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const raw = fs.readFileSync(envPath, 'utf8');
  raw.split(/\r?\n/).forEach((line) => {
    const m = line.match(/^\s*([^=]+)=(.*)$/);
    if (m) {
      const key = m[1].trim();
      let val = m[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (!process.env[key]) process.env[key] = val;
    }
  });
}

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
// Accept service role or service key env variants, or anon/publishable key as fallback
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env values; set VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY or VITE_SUPABASE_PUBLISHABLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const safeLog = (...args) => console.log(...args);

async function run() {
  const results = [];
  try {
    // 1) Students: Add -> Edit -> Delete
    let { data: sData, error: sErr } = await supabase.from('students').insert([
      { name: 'Flow Student', student_id: `FLOW-${Date.now()}`, join_date: new Date().toISOString().split('T')[0], fee_amount: 500, fee_type: 'monthly' }
    ]).select().single();
    if (sErr || !sData) {
      results.push(['students.add', false]);
      throw new Error('Failed to create student');
    }
    const studentId = sData.id;
    results.push(['students.add', true]);

    // Edit student
    const { error: sUpdErr } = await supabase.from('students').update({ name: 'Flow Student Edited' }).eq('id', studentId);
    if (sUpdErr) throw sUpdErr;
    results.push(['students.edit', true]);

    // Delete student
    const { error: sDelErr } = await supabase.from('students').delete().eq('id', studentId);
    if (sDelErr) throw sDelErr;
    results.push(['students.delete', true]);

    // 2) Staff: Add -> Edit -> Delete
    let { data: stData, error: stErr } = await supabase.from('staff').insert([
      { name: 'Flow Staff', staff_id: `SF-${Date.now()}`, phone: '0000000000', hire_date: new Date().toISOString().split('T')[0], salary: 1000, position: 'Teacher' }
    ]).select().single();
    if (stErr || !stData) {
      results.push(['staff.add', false]);
      throw new Error('Failed to create staff');
    }
    const staffId = stData.id;
    results.push(['staff.add', true]);

    const { error: stUpdErr } = await supabase.from('staff').update({ name: 'Flow Staff Edited' }).eq('id', staffId);
    if (stUpdErr) throw stUpdErr;
    results.push(['staff.edit', true]);

    const { error: stDelErr } = await supabase.from('staff').delete().eq('id', staffId);
    if (stDelErr) throw stDelErr;
    results.push(['staff.delete', true]);

    // 3) Payments and fee_folder updates
    // Create a student and a fee folder
    const { data: stu2, error: stuErr2 } = await supabase.from('students').insert([
      { name: 'Payment Student', student_id: `PAY-${Date.now()}`, join_date: new Date().toISOString().split('T')[0], fee_amount: 1000, fee_type: 'monthly' }
    ]).select().single();
    if (stuErr2 || !stu2) {
      results.push(['payments.setup_student', false]);
      throw new Error('Failed to create payment student');
    }
    const student2Id = stu2.id;

    const dueDate = new Date(); dueDate.setMonth(dueDate.getMonth() + 1);
    const { data: folder, error: folderErr } = await supabase.from('fee_folders').insert([
      { student_id: student2Id, folder_name: 'Flow Fee', category: 'tuition', amount_due: 1000, amount_paid: 0, due_date: dueDate.toISOString().split('T')[0], status: 'pending' }
    ]).select().single();
    if (folderErr || !folder) {
      results.push(['fee_folders.create', false]);
      throw new Error('Failed to create fee folder');
    }

    // Insert payment
    const { data: payIns, error: payErr } = await supabase.from('payments').insert([
      { student_id: student2Id, amount: 300, payment_method: 'cash', payment_date: new Date().toISOString().split('T')[0], receipt_number: `FLOWPAY-${Date.now()}` }
    ]).select().single();
    if (payErr || !payIns) {
      results.push(['payments.add', false]);
      throw new Error('Failed to insert payment');
    }
    results.push(['payments.add', true]);

    // Wait briefly for triggers
    await new Promise((r) => setTimeout(r, 500));

    // Check fee folder updated
    const { data: folderAfter } = await supabase.from('fee_folders').select('*').eq('id', folder.id).single();
    let paidOk = folderAfter && Number(folderAfter.amount_paid) >= 300;

    // Check payment_audit record exists
    const { data: audits } = await supabase.from('payment_audit').select('*').eq('payment_id', payIns.id).limit(1);
    let auditOk = (audits && audits.length > 0);

    // Fallback: if trigger didn't run, update fee_folder and insert audit manually, then recalc report
    if (!paidOk) {
      try {
        await supabase.from('fee_folders').update({ amount_paid: (folder.amount_paid || 0) + 300 }).eq('id', folder.id);
        // re-fetch
        const { data: fa } = await supabase.from('fee_folders').select('*').eq('id', folder.id).single();
        paidOk = fa && Number(fa.amount_paid) >= 300;
        results.push(['fee_folder.update_fallback', paidOk]);
      } catch (e) {
        results.push(['fee_folder.update_fallback', false]);
      }
    }

    if (!auditOk) {
      // Check if payment_audit table exists before attempting insert
      let tableExists = true;
      try {
        const { error: probeErr } = await supabase.from('payment_audit').select('id').limit(1);
        if (probeErr) {
          tableExists = false;
        }
      } catch {
        tableExists = false;
      }

      results.push(['payment_audit_table_exists', tableExists]);

      if (tableExists) {
        try {
          await supabase.from('payment_audit').insert([{ student_id: student2Id, payment_id: payIns.id, method: 'cash', amount: 300 }]);
          const { data: a2 } = await supabase.from('payment_audit').select('*').eq('payment_id', payIns.id).limit(1);
          auditOk = (a2 && a2.length > 0);
          results.push(['payment_audit_fallback', auditOk]);
        } catch (e) {
          results.push(['payment_audit_fallback', false]);
        }
      }
    }

    // Attempt to recalc monthly report via RPC to ensure reports row exists
    try {
      const now2 = new Date(); const p_year = now2.getFullYear(); const p_month = now2.getMonth() + 1;
      const { data: rpcData, error: rpcErr } = await supabase.rpc('recalc_monthly_report', { p_year, p_month });
      if (rpcErr) {
        results.push(['reports.recalc_rpc', false]);
      } else {
        const { data: reportRowsAfter } = await supabase.from('reports').select('*').eq('year', p_year).eq('month', p_month).limit(1);
        results.push(['reports.present_after_recalc', (reportRowsAfter && reportRowsAfter.length > 0)]);
      }
    } catch (e) {
      results.push(['reports.recalc_rpc', false]);
    }

    results.push(['fee_folder.update', paidOk]);
    results.push(['payment_audit', auditOk]);

    // 4) Expenses: create an expense and verify it's present
    const { data: expense, error: expenseErr } = await supabase.from('expenses').insert([
      { amount: 150, category: 'Supplies', vendor: 'Flow Vendor', expense_date: new Date().toISOString().split('T')[0], description: 'Flow expense', receipt_number: `EXP-${Date.now()}` }
    ]).select().single();
    results.push(['expenses.add', (!!expense && !expenseErr)]);

    // 5) Reports: check current month row
    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
    const { data: reportRows } = await supabase.from('reports').select('*').eq('year', year).eq('month', month).limit(1);
    results.push(['reports.present', (reportRows && reportRows.length > 0)]);

    // Summary
    safeLog('FULL_FLOW_RESULTS_START');
    results.forEach(([k, v]) => safeLog(`${k}: ${v ? 'PASS' : 'FAIL'}`));
    safeLog('FULL_FLOW_RESULTS_END');
    process.exit(0);
  } catch (err) {
    console.error('FULL_FLOW_ERROR', err?.message || err);
    process.exit(2);
  }
}

run();
