/**
 * useAIWrite Hook
 * Handles AI write confirmations and executions
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { PendingAction } from '@/components/ai/AIConfirmModal';

interface UseAIWriteReturn {
    pendingAction: PendingAction | null;
    isConfirmOpen: boolean;
    isExecuting: boolean;
    createPendingAction: (action: Omit<PendingAction, 'id' | 'expires_at'>) => Promise<PendingAction | null>;
    confirmAction: (actionId: string) => Promise<boolean>;
    cancelAction: () => void;
    showConfirmModal: (action: PendingAction) => void;
}

export function useAIWrite(): UseAIWriteReturn {
    const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
    const [isConfirmOpen, setIsConfirmOpen] = useState(false);
    const [isExecuting, setIsExecuting] = useState(false);
    const { toast } = useToast();

    // Create a new pending action
    const createPendingAction = useCallback(async (
        action: Omit<PendingAction, 'id' | 'expires_at'>
    ): Promise<PendingAction | null> => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                toast({
                    title: 'Error',
                    description: 'Not authenticated',
                    variant: 'destructive'
                });
                return null;
            }

            // Get user's school
            const { data: membership } = await supabase
                .from('school_members')
                .select('school_id')
                .eq('user_id', session.user.id)
                .eq('role', 'principal')
                .single();

            if (!membership) {
                toast({
                    title: 'Error',
                    description: 'Only principals can perform write actions',
                    variant: 'destructive'
                });
                return null;
            }

            // Insert pending action
            const { data, error } = await (supabase as any)
                .from('ai_pending_writes')
                .insert({
                    user_id: session.user.id,
                    school_id: membership.school_id,
                    action_type: action.action_type,
                    action_summary: action.action_summary,
                    action_data: action.action_data,
                    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString() // 5 minutes
                })
                .select()
                .single();

            if (error) throw error;

            // Show confirmation modal
            const newAction: PendingAction = data as PendingAction;
            setPendingAction(newAction);
            setIsConfirmOpen(true);

            return newAction;
        } catch (error: any) {
            console.error('Create pending action error:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to create action',
                variant: 'destructive'
            });
            return null;
        }
    }, [toast]);

    // Confirm and execute action
    const confirmAction = useCallback(async (actionId: string): Promise<boolean> => {
        setIsExecuting(true);
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fhrskehzyvaqrgfyqopg.supabase.co';
            const response = await fetch(
                `${supabaseUrl}/functions/v1/ai-write-confirmed`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ action_id: actionId })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Execution failed');
            }

            const result = await response.json();

            toast({
                title: 'Success',
                description: result.message || 'Action completed successfully'
            });

            setIsConfirmOpen(false);
            setPendingAction(null);
            return true;

        } catch (error: any) {
            console.error('Confirm action error:', error);
            toast({
                title: 'Error',
                description: error.message || 'Failed to execute action',
                variant: 'destructive'
            });
            return false;
        } finally {
            setIsExecuting(false);
        }
    }, [toast]);

    // Cancel action
    const cancelAction = useCallback(() => {
        setIsConfirmOpen(false);
        setPendingAction(null);
    }, []);

    // Show modal with existing action
    const showConfirmModal = useCallback((action: PendingAction) => {
        setPendingAction(action);
        setIsConfirmOpen(true);
    }, []);

    return {
        pendingAction,
        isConfirmOpen,
        isExecuting,
        createPendingAction,
        confirmAction,
        cancelAction,
        showConfirmModal
    };
}
