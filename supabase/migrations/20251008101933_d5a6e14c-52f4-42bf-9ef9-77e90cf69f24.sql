-- =============================================
-- UPDATE EXISTING STUDENTS' TOTAL AND REMAINING FEES
-- =============================================

-- Update total_fee for all existing students based on fee_type
UPDATE public.students
SET total_fee = CASE 
  WHEN fee_type = 'monthly' THEN fee_amount * 12
  WHEN fee_type = 'annually' THEN fee_amount
  ELSE fee_amount
END
WHERE total_fee IS NULL OR total_fee = 0 OR total_fee != CASE 
  WHEN fee_type = 'monthly' THEN fee_amount * 12
  WHEN fee_type = 'annually' THEN fee_amount
  ELSE fee_amount
END;

-- Recalculate remaining_fee for all students based on their payments
DO $$
DECLARE
  student_record RECORD;
  v_total_paid NUMERIC;
BEGIN
  FOR student_record IN SELECT id, total_fee FROM public.students
  LOOP
    -- Calculate total paid for this student
    SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.payments
    WHERE student_id = student_record.id;
    
    -- Update student's remaining fee and payment status
    UPDATE public.students
    SET 
      remaining_fee = COALESCE(student_record.total_fee, 0) - v_total_paid,
      payment_status = CASE 
        WHEN (COALESCE(student_record.total_fee, 0) - v_total_paid) <= 0 THEN 'paid'
        WHEN v_total_paid > 0 THEN 'partial'
        ELSE 'pending'
      END,
      updated_at = now()
    WHERE id = student_record.id;
  END LOOP;
END $$;