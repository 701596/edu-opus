import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

export const useInviteHandler = ({ refreshRoles }: { refreshRoles?: () => Promise<void> } = {}) => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const processedRef = useRef(false);

    useEffect(() => {
        const checkPendingInvite = async () => {
            // Prevent double-firing in strict mode or rapid re-renders
            if (!user || processedRef.current) return;

            const pendingInviteStr = localStorage.getItem('pending_invite');
            if (!pendingInviteStr) return;

            try {
                const pendingInvite = JSON.parse(pendingInviteStr);
                const { token, code } = pendingInvite;

                if (!token && !code) {
                    localStorage.removeItem('pending_invite');
                    return;
                }

                console.log('Found pending invite, accepting...', pendingInvite);
                processedRef.current = true; // Mark as processing

                const { data, error } = await supabase.rpc('accept_hybrid_invite' as any, {
                    p_token: token || null,
                    p_code: code || null
                });

                if (error) throw error;

                toast.success('Invitation accepted! Welcome to the school.');
                localStorage.removeItem('pending_invite');

                if (refreshRoles) {
                    await refreshRoles();
                    // Ideally, we'd navigate to dashboard but the context update might trigger re-renders
                    // that handle views. But to be safe:
                    window.location.href = '/dashboard';
                } else {
                    window.location.href = '/dashboard';
                }

            } catch (err: any) {
                console.error('Failed to accept invite:', err);
                toast.error(err.message || 'Failed to accept invitation');
                // Don't clear local storage immediately in case of network error, 
                // but maybe we should if it's "Invalid token"? 
                // For now, let's keep it until manual clear or success.
                if (err.message && err.message.includes('Invalid')) {
                    localStorage.removeItem('pending_invite');
                }
                processedRef.current = false; // Reset so they can try again if it was a transient error?
            }
        };

        checkPendingInvite();
    }, [user]);
};
