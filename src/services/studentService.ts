import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';

export type Student = Tables<'students'>;

export interface PaginationParams {
    page: number;
    pageSize: number;
}

export interface SearchParams {
    query: string;
}

export interface StudentQueryResult {
    data: Student[];
    count: number | null;
    error: Error | null;
}

// Explicit column selection to avoid fetching heavy search_vector
const STUDENT_COLUMNS = 'id, name, email, phone, address, date_of_birth, class, enrollment_date, payment_status, guardian_name, guardian_phone, created_at, updated_at, user_id, fee_amount, fee_type, join_date, metadata, student_id';

/**
 * Fetch paginated students ordered by created_at DESC (most recent first)
 * @param params - Pagination parameters { page, pageSize }
 * @returns Promise with students data, total count, and error
 */
export async function fetchPaginatedStudents(
    params: PaginationParams
): Promise<StudentQueryResult> {
    const { page, pageSize } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
        const { data, error, count } = await supabase
            .from('students')
            .select(STUDENT_COLUMNS, { count: 'exact' })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        return {
            data: (data || []) as unknown as Student[],
            count,
            error: null,
        };
    } catch (error) {
        console.error('Error fetching paginated students:', error);
        return {
            data: [],
            count: 0,
            error: error as Error,
        };
    }
}

/**
 * Search students using full-text search with pagination
 * @param searchQuery - Search query string
 * @param params - Pagination parameters { page, pageSize }
 * @returns Promise with students data, total count, and error
 */
export async function searchStudentsWithPagination(
    searchQuery: string,
    params: PaginationParams
): Promise<StudentQueryResult> {
    const { page, pageSize } = params;
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    try {
        // Convert search query to tsquery format
        const tsQuery = searchQuery
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .map(term => `${term}:*`)
            .join(' & ');

        const { data, error, count } = await supabase
            .from('students')
            .select(STUDENT_COLUMNS, { count: 'exact' })
            .textSearch('search_vector', tsQuery, {
                type: 'websearch',
                config: 'english',
            })
            .order('created_at', { ascending: false })
            .range(from, to);

        if (error) throw error;

        return {
            data: (data || []) as unknown as Student[],
            count,
            error: null,
        };
    } catch (error) {
        console.error('Error searching students:', error);
        return {
            data: [],
            count: 0,
            error: error as Error,
        };
    }
}

/**
 * Fetch all students with optional search (backward compatible)
 * @param searchQuery - Optional search query
 * @returns Promise with students array
 */
export async function fetchAllStudents(searchQuery?: string): Promise<Student[]> {
    try {
        let query = supabase
            .from('students')
            .select(STUDENT_COLUMNS)
            .order('created_at', { ascending: false });

        if (searchQuery && searchQuery.trim()) {
            const tsQuery = searchQuery
                .trim()
                .split(/\s+/)
                .filter(Boolean)
                .map(term => `${term}:*`)
                .join(' & ');

            query = query.textSearch('search_vector', tsQuery, {
                type: 'websearch',
                config: 'english',
            });
        }

        const { data, error } = await query;

        if (error) throw error;
        return (data || []) as unknown as Student[];
    } catch (error) {
        console.error('Error fetching all students:', error);
        return [];
    }
}

/**
 * Get total student count
 * @returns Promise with total count
 */
export async function getStudentCount(): Promise<number> {
    try {
        const { count, error } = await supabase
            .from('students')
            .select('*', { count: 'exact', head: true });

        if (error) throw error;
        return count || 0;
    } catch (error) {
        console.error('Error getting student count:', error);
        return 0;
    }
}
