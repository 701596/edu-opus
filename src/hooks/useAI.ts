/**
 * AI Service Hook
 * Handles communication with the AI Edge Function
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface AIMessage {
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
}

interface UseAIReturn {
    messages: AIMessage[];
    isLoading: boolean;
    error: string | null;
    sendMessage: (message: string) => Promise<void>;
    clearMessages: () => void;
}

export function useAI(): UseAIReturn {
    const [messages, setMessages] = useState<AIMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMessage = useCallback(async (message: string) => {
        if (!message.trim()) return;

        setIsLoading(true);
        setError(null);

        // Add user message immediately
        const userMessage: AIMessage = {
            role: 'user',
            content: message,
            timestamp: new Date()
        };
        setMessages(prev => [...prev, userMessage]);

        try {
            // Get current session token
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                throw new Error('Not authenticated');
            }

            // Call Edge Function
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-query`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ message })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                console.error('AI Error Response:', errorData);
                // Show debug info if available
                if (errorData.debug) {
                    console.error('Debug info:', JSON.stringify(errorData.debug, null, 2));
                }
                throw new Error(errorData.error || 'AI request failed');
            }

            const data = await response.json();

            // Add assistant message
            const assistantMessage: AIMessage = {
                role: 'assistant',
                content: data.message,
                timestamp: new Date()
            };
            setMessages(prev => [...prev, assistantMessage]);

        } catch (err: any) {
            setError(err.message || 'Failed to get AI response');
            console.error('AI Error:', err);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        clearMessages
    };
}
