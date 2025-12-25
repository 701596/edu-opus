-- PHASE 2: PAYMENT RECONCILIATION TRIGGER
-- Single authoritative trigger for payment → student fee reconciliation
-- RULES:
-- 1. expected_fee = dynamically calculated from join_date + server date (live accrual)
-- 2. paid_fee = SUM(all payments)
-- 3. remaining_fee = expected_fee - paid_fee (can be negative for advanced)
-- 4. status = unpaid | partial | paid | advanced

-- ============================================
-- FUNCTION: reconcile_student_on_payment
-- ============================================
CREATE OR REPLACE FUNCTION reconcile_student_on_payment()
RETURNS TRIGGER AS $$
DECLARE
    v_student_id UUID;
    v_total_paid NUMERIC;
    v_expected_fee NUMERIC;
    v_remaining_fee NUMERIC;
    v_status TEXT;
    v_join_date DATE;
    v_fee_type TEXT;
    v_fee_amount NUMERIC;
    v_months_elapsed INT;
    v_today DATE := CURRENT_DATE;
BEGIN
    -- Determine which student to reconcile
    v_student_id := COALESCE(NEW.student_id, OLD.student_id);
    
    -- HARD GUARD: Error if student does not exist
    IF NOT EXISTS (SELECT 1 FROM students WHERE id = v_student_id) THEN
        RAISE EXCEPTION 'Payment reconciliation failed: Student % does not exist', v_student_id;
    END IF;
    
    -- 1. Get student fee data
    SELECT join_date, fee_type, fee_amount
    INTO v_join_date, v_fee_type, v_fee_amount
    FROM students WHERE id = v_student_id;
    
    -- 2. Calculate expected_fee (LIVE ACCRUAL MODEL)
    -- This is dynamically recalculated from join_date and server date
    IF v_fee_type = 'monthly' AND v_join_date IS NOT NULL AND v_fee_amount IS NOT NULL THEN
        -- months_elapsed = (YEAR(today) - YEAR(join)) * 12 + (MONTH(today) - MONTH(join))
        v_months_elapsed := (EXTRACT(YEAR FROM v_today) - EXTRACT(YEAR FROM v_join_date))::INT * 12 
                          + (EXTRACT(MONTH FROM v_today) - EXTRACT(MONTH FROM v_join_date))::INT;
        
        -- If today's day < join day, subtract 1 month
        IF EXTRACT(DAY FROM v_today) < EXTRACT(DAY FROM v_join_date) THEN
            v_months_elapsed := v_months_elapsed - 1;
        END IF;
        
        -- Minimum 1 month elapsed
        v_months_elapsed := GREATEST(1, v_months_elapsed);
        
        v_expected_fee := v_fee_amount * v_months_elapsed;
        
    ELSIF (v_fee_type = 'annual' OR v_fee_type = 'annually') AND v_fee_amount IS NOT NULL THEN
        -- Annual fee: flat amount
        v_expected_fee := v_fee_amount;
    ELSE
        -- Invalid or missing data: expected_fee = 0
        v_expected_fee := 0;
    END IF;
    
    -- 3. Calculate total_paid (SUM of all payments for this student)
    SELECT COALESCE(SUM(amount), 0)
    INTO v_total_paid
    FROM payments WHERE student_id = v_student_id;
    
    -- 4. Calculate remaining_fee (can be NEGATIVE for advanced payments)
    v_remaining_fee := v_expected_fee - v_total_paid;
    
    -- 5. Derive status (STRICT RULES)
    IF v_total_paid = 0 THEN
        v_status := 'unpaid';
    ELSIF v_total_paid < v_expected_fee THEN
        v_status := 'partial';
    ELSIF v_total_paid = v_expected_fee THEN
        v_status := 'paid';
    ELSE
        v_status := 'advanced';
    END IF;
    
    -- 6. Update student record (derived columns only)
    UPDATE students SET
        paid_fee = v_total_paid,
        remaining_fee = v_remaining_fee,
        expected_fee = v_expected_fee,
        payment_status = v_status,
        updated_at = NOW()
    WHERE id = v_student_id;
    
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- TRIGGER: Attach to payments table
-- Fires AFTER INSERT, UPDATE, DELETE on payments
-- ============================================
DROP TRIGGER IF EXISTS tr_reconcile_student_on_payment ON payments;
CREATE TRIGGER tr_reconcile_student_on_payment
AFTER INSERT OR UPDATE OR DELETE ON payments
FOR EACH ROW
EXECUTE FUNCTION reconcile_student_on_payment();

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 'Payment reconciliation trigger created successfully' AS status;
