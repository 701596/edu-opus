import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Student fee data from the server.
 * All values are pre-calculated by the database trigger.
 * Frontend is READ-ONLY - no calculations here.
 */
export interface StudentFeeData {
    student_id: string;
    name: string;
    expected_fee: number;
    total_paid: number;
    remaining_fee: number;  // Can be negative for advanced payments
    status: 'unpaid' | 'partial' | 'paid' | 'advanced';
}

export interface DerivedFeeData {
    total_remaining: number;
    students: StudentFeeData[];
}

export interface DerivedSalaryData {
    total_expected: number;
    total_paid: number;
    total_remaining: number;
}

export interface FinancialData {
    fees: DerivedFeeData;
    salaries: DerivedSalaryData;
}

interface UseFinancialDataReturn {
    data: FinancialData | null;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}

/**
 * Hook to fetch derived financial data from the server.
 * 
 * IMPORTANT: This hook is READ-ONLY.
 * All calculations are performed by the database trigger on payment changes.
 * The Edge Function simply reads and returns the pre-calculated values.
 */
export function useFinancialData(): UseFinancialDataReturn {
    const [data, setData] = useState<FinancialData | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setIsLoading(true);
            setError(null);

            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const { data: result, error: invokeError } = await supabase.functions.invoke('calculate-remaining-fees', {
                method: 'POST',
            });

            if (invokeError) {
                console.error('Function invocation error:', invokeError);
                throw new Error(invokeError.message || 'Failed to fetch financial data');
            }

            // Map the Edge Function response to our interface
            const mappedResult: FinancialData = {
                fees: {
                    total_remaining: result.total_student_outstanding ?? 0,
                    students: (result.students || []).map((s: any) => ({
                        student_id: s.student_id,
                        name: s.name ?? '',
                        expected_fee: s.expected_fee ?? 0,
                        total_paid: s.total_paid ?? 0,
                        remaining_fee: s.remaining_fee ?? 0,
                        status: s.status ?? 'unpaid'
                    }))
                },
                salaries: {
                    total_expected: 0,
                    total_paid: 0,
                    total_remaining: 0
                }
            };

            setData(mappedResult);
        } catch (err: any) {
            console.error('Financial data error:', err);
            setError(err.message || 'Failed to load financial data');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    return { data, isLoading, error, refresh };
}

