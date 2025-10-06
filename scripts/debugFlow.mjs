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
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase env'); process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  try {
    const { data: payments } = await supabase.from('payments').select('*').like('receipt_number', 'FLOWPAY-%').order('created_at', { ascending: false }).limit(10);
    console.log('payments found:', (payments || []).length);
    (payments || []).forEach(p => console.log({ id: p.id, student_id: p.student_id, amount: p.amount, payment_date: p.payment_date, receipt: p.receipt_number }));

    const { data: feeFolders } = await supabase.from('fee_folders').select('*').order('created_at', { ascending: false }).limit(20);
    console.log('recent fee_folders count:', (feeFolders || []).length);
    (feeFolders || []).slice(0,5).forEach(f => console.log({ id: f.id, student_id: f.student_id, amount_due: f.amount_due, amount_paid: f.amount_paid, status: f.status }));

    const { data: audits } = await supabase.from('payment_audit').select('*').order('created_at', { ascending: false }).limit(20);
    console.log('recent audits count:', (audits || []).length);
    (audits || []).slice(0,5).forEach(a => console.log({ id: a.id, payment_id: a.payment_id, student_id: a.student_id, method: a.method, amount: a.amount }));

    const now = new Date(); const year = now.getFullYear(); const month = now.getMonth() + 1;
    const { data: reports } = await supabase.from('reports').select('*').eq('year', year).eq('month', month).limit(5);
    console.log('reports this month:', (reports || []).length);
    (reports || []).forEach(r => console.log({ id: r.id, year: r.year, month: r.month, income: r.total_income, expenses: r.total_expenses }));

    const { data: ex } = await supabase.from('expenses').select('*').like('receipt_number', 'EXP-%').order('created_at', { ascending: false }).limit(10);
    console.log('expenses with EXP- receipt count:', (ex || []).length);
    (ex || []).slice(0,5).forEach(e => console.log({ id: e.id, amount: e.amount, category: e.category }));

  } catch (err) {
    console.error('debugFlow error', err?.message || err);
    process.exit(1);
  }
}

run();
