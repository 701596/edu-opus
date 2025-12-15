-- =============================================
-- MIGRATION: Seed Default Classes
-- Description: 
-- Inserts Nursery, L.K.G., U.K.G., and Grade 1-12 for all schools 
-- that don't have them yet.
-- =============================================

DO $$
DECLARE
    r_school RECORD;
    v_classes text[] := ARRAY[
        'Nursery', 'L.K.G.', 'U.K.G.', 
        'Grade 1', 'Grade 2', 'Grade 3', 'Grade 4', 'Grade 5', 
        'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 
        'Grade 11', 'Grade 12'
    ];
    v_class_name text;
BEGIN
    FOR r_school IN SELECT id FROM schools LOOP
        FOREACH v_class_name IN ARRAY v_classes LOOP
            INSERT INTO public.classes (school_id, name, grade)
            SELECT r_school.id, v_class_name, v_class_name
            WHERE NOT EXISTS (
                SELECT 1 FROM public.classes 
                WHERE school_id = r_school.id AND (name = v_class_name OR grade = v_class_name)
            );
        END LOOP;
    END LOOP;
END $$;
