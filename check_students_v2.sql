SELECT 
    c.name as class_name, 
    COUNT(sc.student_id) as student_count 
FROM classes c
LEFT JOIN student_classes sc ON c.id = sc.class_id
GROUP BY c.id, c.name;
