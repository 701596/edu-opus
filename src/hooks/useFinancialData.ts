import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DerivedFeeData {
    total_expected: number;
    total_paid: number;
    total_remaining: number;
    students: Array<{
        id: string;
        name: string;
        expected_fee: number;
        paid_fee: number;
        remaining_fee: number;
    }>;
}

export interface DerivedSalaryData {
    total_expected: number;
    total_paid: number;
    total_remaining: number;
}

export interface FinancialData {
    school_id?: string;
    server_date: string;
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
 * Hook to fetch time-based derived financial data from the server.
 * All calculations use the server date, not static stored values.
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

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/financial-calc`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to fetch financial data');
            }

            const result = await response.json();
            setData(result);
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
