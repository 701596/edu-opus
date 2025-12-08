# 🔧 Quick Fix: Receipt Number Auto-Generation

## Problem
Payment inserts were failing with:
```
null value in column "receipt_number" violates not-null constraint
```

## Root Cause
The `payments` and `expenses` tables have `receipt_number` as NOT NULL, but:
- No default value
- No trigger to auto-generate
- Frontend doesn't provide it

## Solution
Created migration `20251204160500_fix_receipt_number_generation.sql` that:

1. ✅ Makes `receipt_number` nullable temporarily
2. ✅ Creates trigger to auto-generate receipt numbers
3. ✅ Backfills existing NULL values
4. ✅ Makes `receipt_number` NOT NULL again

---

## Auto-Generated Format

**Payments**: `PAY-20251204-0001`, `PAY-20251204-0002`, ...  
**Expenses**: `EXP-20251204-0001`, `EXP-20251204-0002`, ...

Format: `PREFIX-YYYYMMDD-XXXX` (sequential per user per day)

---

## How to Apply

1. **Open Supabase SQL Editor**
2. **Copy migration**: `20251204160500_fix_receipt_number_generation.sql`
3. **Execute**
4. **Test**: Try adding a payment (should work now!)

---

## Verification

After migration, run:
```sql
-- Test insert (should succeed)
INSERT INTO public.payments (student_id, amount, payment_date, payment_method, user_id)
SELECT id, 100, CURRENT_DATE, 'cash', auth.uid() FROM public.students LIMIT 1;

-- Check receipt number was generated
SELECT receipt_number FROM public.payments ORDER BY created_at DESC LIMIT 1;
-- Expected: PAY-20251204-0001 (or similar)
```

---

**Status**: Ready to apply  
**File**: `supabase/migrations/20251204160500_fix_receipt_number_generation.sql`
