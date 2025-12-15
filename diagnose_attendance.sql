-- DIAGNOSTIC SCRIPT
-- Run this to see if data actually exists in your database.

SELECT 'Total Classes' as metric, COUNT(*) as value FROM classes
UNION ALL
SELECT 'Total Students', COUNT(*) FROM students
UNION ALL
SELECT 'Total Assignments', COUNT(*) FROM student_classes;

-- Show breakdown of students per class
SELECT c.name as class_name, COUNT(sc.student_id) as enrolled_students
FROM classes c
LEFT JOIN student_classes sc ON c.id = sc.class_id
GROUP BY c.name
ORDER BY enrolled_students DESC;
