import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface AIMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

export interface AISession {
    id: string;
    title: string;
    last_updated: Date;
}

interface UseAIReturn {
    messages: AIMessage[];
    sessions: AISession[];
    currentSessionId: string | null;
    isLoading: boolean;
    error: string | null;
    sendMessage: (message: string) => Promise<void>;
    createNewSession: () => void;
    switchSession: (sessionId: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>; // Optional
}

export function useAI(): UseAIReturn {
    const [messages, setMessages] = useState<AIMessage[]>([]);
    const [sessions, setSessions] = useState<AISession[]>([]);
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Load sessions on mount
    useEffect(() => {
        loadSessions();
    }, []);

    const loadSessions = async () => {
        try {
            const { data: { session: authSession } } = await supabase.auth.getSession();
            if (!authSession) return;

            // Fetch recent 'ai_memories' rows as sessions
            const { data, error } = await (supabase as any)
                .from('ai_memories')
                .select('id, summary, updated_at, messages')
                .eq('user_id', authSession.user.id)
                .order('updated_at', { ascending: false });

            if (error) throw error;

            const loadedSessions: AISession[] = (data || []).map((row: any) => ({
                id: row.id,
                title: row.summary || (Array.isArray(row.messages) && row.messages[0]?.content?.substring(0, 30) + '...') || 'New Chat',
                last_updated: new Date(row.updated_at)
            }));

            setSessions(loadedSessions);
        } catch (err) {
            console.error('Failed to load sessions:', err);
        }
    };

    const createNewSession = useCallback(() => {
        setCurrentSessionId(null);
        setMessages([]);
        setError(null);
    }, []);

    const switchSession = useCallback(async (sessionId: string) => {
        setIsLoading(true);
        setError(null);
        setCurrentSessionId(sessionId);

        try {
            const { data, error } = await (supabase as any)
                .from('ai_memories')
                .select('messages')
                .eq('id', sessionId)
                .single();

            if (error) throw error;

            const loadedMessages = (data?.messages || []).map((m: any) => ({
                ...m,
                timestamp: new Date(m.timestamp || Date.now())
            }));

            setMessages(loadedMessages);
        } catch (err: any) {
            console.error('Load Error:', err);
            setError('Failed to load conversation');
        } finally {
            setIsLoading(false);
        }
    }, []);

    const deleteSession = useCallback(async (sessionId: string) => {
        try {
            await (supabase as any).from('ai_memories').delete().eq('id', sessionId);
            setSessions(prev => prev.filter(s => s.id !== sessionId));
            if (currentSessionId === sessionId) {
                createNewSession();
            }
        } catch (err) {
            console.error('Delete Error:', err);
        }
    }, [currentSessionId, createNewSession]);

    const sendMessage = useCallback(async (message: string) => {
        if (!message.trim()) return;

        setIsLoading(true);
        setError(null);

        // Optimistic UI
        const userMessage: AIMessage = {
            role: 'user',
            content: message,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);

        // Thinking Delay Logic (Min 300ms)
        const startTime = Date.now();

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) throw new Error('Not authenticated');

            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-query`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message,
                        session_id: currentSessionId // Send current or null
                    })
                }
            );

            // Enforce min delay of 500ms for "Thinking"
            const elapsed = Date.now() - startTime;
            if (elapsed < 500) {
                await new Promise(resolve => setTimeout(resolve, 500 - elapsed));
            }

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'AI request failed');
            }

            const data = await response.json();

            // If new session started, update ID
            if (data.session_id && data.session_id !== currentSessionId) {
                setCurrentSessionId(data.session_id);
                // Also Refresh Session List
                loadSessions();
            }

            const assistantMessage: AIMessage = {
                role: 'assistant',
                content: data.message,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, assistantMessage]);

            // Update Session Title in list if needed (lazy refresh done above)

        } catch (err: any) {
            setError(err.message || 'Failed to get AI response');
            console.error('AI Error:', err);
        } finally {
            setIsLoading(false);
        }
    }, [currentSessionId]);

    return {
        messages,
        sessions,
        currentSessionId,
        isLoading,
        error,
        sendMessage,
        createNewSession,
        switchSession,
        deleteSession
    };
}
