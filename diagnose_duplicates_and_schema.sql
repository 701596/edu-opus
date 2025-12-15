-- check duplicates
SELECT name, count(*) 
FROM students 
GROUP BY name 
HAVING count(*) > 1;

-- check attendance columns
SELECT column_name 
FROM information_schema.columns 
WHERE table_name = 'attendance';

-- check if we have multiple attendance rows for same student/date
SELECT student_id, date, count(*)
FROM attendance
GROUP BY student_id, date
HAVING count(*) > 1;
