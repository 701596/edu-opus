-- =============================================
-- QUICK SETUP: Add Sample Classes for Attendance Testing
-- Run this in Supabase SQL Editor
-- =============================================

-- Get your school_id first
DO $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
BEGIN
  -- Get the first school
  SELECT id INTO v_school_id FROM schools LIMIT 1;
  
  -- Get the principal's user_id
  SELECT user_id INTO v_user_id FROM school_members WHERE school_id = v_school_id AND role = 'principal' LIMIT 1;
  
  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'No school found! Run the backfill migration first.';
  END IF;

  -- Create sample classes
  INSERT INTO classes (school_id, name, grade, teacher_id, is_active)
  VALUES 
    (v_school_id, 'Class 1A', 'Grade 1', v_user_id, true),
    (v_school_id, 'Class 5A', 'Grade 5', v_user_id, true),
    (v_school_id, 'Class 10B', 'Grade 10', v_user_id, true)
  ON CONFLICT DO NOTHING;
  
  RAISE NOTICE 'Created sample classes for school %', v_school_id;
END$$;

-- Verify
SELECT c.id, c.name, c.grade, c.is_active, s.name as school_name
FROM classes c
JOIN schools s ON s.id = c.school_id;
