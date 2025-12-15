/**
 * AI Chat Box Component
 * Floating chat interface for principal dashboard
 */

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAI } from '@/hooks/useAI';
import { useRole } from '@/contexts/RoleContext';
import {
    MessageSquare,
    X,
    Send,
    Loader2,
    Sparkles,
    Minimize2,
    Maximize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

export function AIChatBox() {
    const { isPrincipal } = useRole();
    const { messages, isLoading, error, sendMessage, clearMessages } = useAI();
    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Only show for principals
    if (!isPrincipal) return null;

    // Auto-scroll to bottom on new messages
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    // Focus input when opened
    useEffect(() => {
        if (isOpen && inputRef.current) {
            inputRef.current.focus();
        }
    }, [isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;

        const message = inputValue;
        setInputValue('');
        await sendMessage(message);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit(e);
        }
    };

    return (
        <>
            {/* Floating Button */}
            {!isOpen && (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 z-50"
                    size="icon"
                >
                    <Sparkles className="h-6 w-6 text-white" />
                </Button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <Card className={cn(
                    "fixed z-50 shadow-2xl border-0 transition-all duration-300",
                    isExpanded
                        ? "inset-4 rounded-2xl"
                        : "bottom-6 right-6 w-96 h-[500px] rounded-2xl"
                )}>
                    {/* Header */}
                    <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-t-2xl p-4">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Sparkles className="h-5 w-5" />
                                <CardTitle className="text-lg font-semibold">EduOpus AI</CardTitle>
                                <Badge variant="secondary" className="text-xs bg-white/20 text-white">
                                    Principal Only
                                </Badge>
                            </div>
                            <div className="flex items-center gap-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white hover:bg-white/20"
                                    onClick={() => setIsExpanded(!isExpanded)}
                                >
                                    {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white hover:bg-white/20"
                                    onClick={() => setIsOpen(false)}
                                >
                                    <X className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardHeader>

                    {/* Messages */}
                    <CardContent className="flex flex-col h-[calc(100%-140px)] p-0">
                        <ScrollArea ref={scrollRef} className="flex-1 p-4">
                            {messages.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground">
                                    <Sparkles className="h-12 w-12 mb-4 text-purple-500" />
                                    <p className="font-medium">How can I help you today?</p>
                                    <p className="text-sm mt-2">
                                        Ask about students, attendance, fees, staff, or any school data.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {messages.map((msg, idx) => (
                                        <div
                                            key={idx}
                                            className={cn(
                                                "flex",
                                                msg.role === 'user' ? 'justify-end' : 'justify-start'
                                            )}
                                        >
                                            <div
                                                className={cn(
                                                    "max-w-[80%] rounded-2xl px-4 py-2",
                                                    msg.role === 'user'
                                                        ? 'bg-purple-600 text-white rounded-br-sm'
                                                        : 'bg-muted rounded-bl-sm'
                                                )}
                                            >
                                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                                            </div>
                                        </div>
                                    ))}
                                    {isLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-muted rounded-2xl px-4 py-3">
                                                <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}
                        </ScrollArea>

                        {/* Error Message */}
                        {error && (
                            <div className="px-4 py-2 bg-red-50 text-red-600 text-sm">
                                {error}
                            </div>
                        )}

                        {/* Input */}
                        <form onSubmit={handleSubmit} className="p-4 border-t">
                            <div className="flex gap-2">
                                <Input
                                    ref={inputRef}
                                    value={inputValue}
                                    onChange={(e) => setInputValue(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    placeholder="Ask anything about your school..."
                                    disabled={isLoading}
                                    className="flex-1 rounded-full"
                                />
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!inputValue.trim() || isLoading}
                                    className="rounded-full bg-purple-600 hover:bg-purple-700"
                                >
                                    <Send className="h-4 w-4" />
                                </Button>
                            </div>
                        </form>
                    </CardContent>
                </Card>
            )}
        </>
    );
}
