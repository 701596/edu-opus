import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';

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
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing Supabase env'); process.exit(1); }
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  try {
    // Try inserting an audit (using a known payment id if one exists)
    const { data: payments } = await supabase.from('payments').select('id, student_id').order('created_at', { ascending: false }).limit(1);
    const lastPayment = payments && payments[0];
    if (!lastPayment) { console.log('No payments found to test audit insert'); } else {
      const auditRow = { student_id: lastPayment.student_id, payment_id: lastPayment.id, method: 'debug', amount: 1 };
      const { data, error } = await supabase.from('payment_audit').insert([auditRow]);
      console.log('payment_audit insert result:', { data: !!data, error: error ? { message: error.message, details: error.details } : null });
    }

    // Try inserting an expense
    const expenseRow = { amount: 12, category: 'Debug', expense_date: new Date().toISOString().split('T')[0], description: 'debug', receipt_number: `DBG-${Date.now()}` };
    const { data: exData, error: exErr } = await supabase.from('expenses').insert([expenseRow]);
    console.log('expense insert result:', { data: !!exData, error: exErr ? { message: exErr.message, details: exErr.details } : null });

    // Try calling recalc_monthly_report RPC
    const now = new Date(); const p_year = now.getFullYear(); const p_month = now.getMonth() + 1;
    const { data: rpcData, error: rpcErr } = await supabase.rpc('recalc_monthly_report', { p_year, p_month });
    console.log('rpc recalc_monthly_report result:', { data: !!rpcData, error: rpcErr ? { message: rpcErr.message, details: rpcErr.details } : null });

  } catch (err) {
    console.error('debugActions error', err?.message || err);
    process.exit(1);
  }
}

run();
