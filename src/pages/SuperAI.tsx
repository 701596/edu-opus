import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAI } from '@/hooks/useAI';
import { useRole } from '@/contexts/RoleContext';
import { Navigate } from 'react-router-dom';
import { ThinkingIndicator } from '@/components/ai/ThinkingIndicator';
import {
    Sparkles,
    Send,
    Loader2,
    Trash2,
    History,
    Plus,
    MessageSquare
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export default function SuperAI() {
    const { isPrincipal, isLoading: roleLoading } = useRole();
    const {
        messages,
        sessions,
        currentSessionId,
        isLoading,
        error,
        sendMessage,
        createNewSession,
        switchSession,
        deleteSession
    } = useAI();

    const [inputValue, setInputValue] = useState('');
    const [showThinking, setShowThinking] = useState(false);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Redirect non-principals
    if (!roleLoading && !isPrincipal) {
        return <Navigate to="/dashboard" replace />;
    }

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, showThinking]);

    // Delayed Thinking Indicator
    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isLoading) {
            timer = setTimeout(() => setShowThinking(true), 300);
        } else {
            setShowThinking(false);
        }
        return () => clearTimeout(timer);
    }, [isLoading]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;
        const message = inputValue;
        setInputValue('');
        await sendMessage(message);
    };

    return (
        <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            {/* Sidebar (Conversations) */}
            <div className="w-80 border-r bg-white dark:bg-slate-900 flex flex-col shadow-sm z-10">
                <div className="p-4 border-b bg-white dark:bg-slate-900 shrink-0">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center shadow-md">
                            <Sparkles className="h-5 w-5 text-white" />
                        </div>
                        <div>
                            <h1 className="font-bold text-lg tracking-tight">EduOpus Advisor</h1>
                            <p className="text-xs text-muted-foreground font-medium">Strategic Intelligence</p>
                        </div>
                    </div>

                    <Button
                        className="w-full justify-start gap-2 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                        onClick={createNewSession}
                    >
                        <Plus className="h-4 w-4" /> New Conversation
                    </Button>
                </div>

                <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b">
                    <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your Conversations</h3>
                </div>

                <ScrollArea className="flex-1">
                    <div className="p-2 space-y-1">
                        {sessions.length === 0 && (
                            <p className="text-xs text-muted-foreground text-center py-8">No recent history</p>
                        )}
                        {sessions.map(session => (
                            <div
                                key={session.id}
                                className={cn(
                                    "group flex items-center justify-between p-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-all duration-200 border border-transparent",
                                    currentSessionId === session.id
                                        ? "bg-purple-50 border-purple-100 text-purple-700 shadow-sm"
                                        : "text-slate-600 dark:text-slate-400"
                                )}
                                onClick={() => switchSession(session.id)}
                            >
                                <div className="flex items-center gap-2 overflow-hidden">
                                    <MessageSquare className={cn(
                                        "h-4 w-4 shrink-0",
                                        currentSessionId === session.id ? "text-purple-600" : "text-slate-400"
                                    )} />
                                    <span className="truncate text-sm font-medium">{session.title}</span>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        deleteSession(session.id);
                                    }}
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                        ))}
                    </div>
                </ScrollArea>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col relative overflow-hidden">
                {/* Header */}
                <div className="border-b bg-white dark:bg-slate-900 p-4 shrink-0 shadow-sm z-10">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 px-3 py-1">
                                Principal Access
                            </Badge>
                            <span className="text-sm text-slate-500 flex items-center gap-2">
                                <History className="h-3 w-3" />
                                {format(new Date(), 'EEEE, MMMM do')}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <ScrollArea ref={scrollRef} className="flex-1 p-0">
                    <div className="max-w-4xl mx-auto w-full p-6 pb-20">
                        {messages.length === 0 ? (
                            <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-lg mx-auto opacity-80 animate-in fade-in zoom-in-95 duration-500">
                                <div className="h-24 w-24 rounded-3xl bg-gradient-to-br from-purple-100 to-indigo-100 flex items-center justify-center mb-8">
                                    <Sparkles className="h-12 w-12 text-purple-600" />
                                </div>
                                <h2 className="text-3xl font-bold mb-3 text-slate-800 dark:text-white tracking-tight">EduOpus Advisor</h2>
                                <p className="text-slate-500 text-lg mb-8 leading-relaxed">
                                    I am your strategic partner for school management.<br />
                                    Ready to analyze data, draft policies, or explore scenarios.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-8">
                                {messages.map((msg, idx) => (
                                    <div
                                        key={idx}
                                        className={cn(
                                            "flex w-full animate-in fade-in slide-in-from-bottom-2 duration-300",
                                            msg.role === 'user' ? 'justify-end' : 'justify-start'
                                        )}
                                    >
                                        <div className={cn(
                                            "flex flex-col max-w-[85%]",
                                            msg.role === 'user' ? "items-end" : "items-start"
                                        )}>
                                            <div
                                                className={cn(
                                                    "rounded-2xl px-6 py-4 shadow-sm text-[15px] leading-relaxed",
                                                    msg.role === 'user'
                                                        ? 'bg-purple-600 text-white rounded-br-sm'
                                                        : 'bg-white dark:bg-slate-800 border-slate-200 border text-slate-800 dark:text-slate-200 rounded-bl-sm'
                                                )}
                                            >
                                                <p className="whitespace-pre-wrap">{msg.content}</p>
                                            </div>
                                            <span className="text-[10px] text-slate-400 mt-2 px-1">
                                                {format(new Date(msg.timestamp), 'h:mm a')}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                                {showThinking && (
                                    <div className="flex justify-start animate-in fade-in duration-300">
                                        <ThinkingIndicator />
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </ScrollArea>

                {/* Error */}
                {error && (
                    <div className="absolute bottom-[88px] left-0 right-0 bg-red-50/90 backdrop-blur border-t border-red-200 p-2 text-center text-red-600 text-sm animate-in slide-in-from-bottom-5">
                        {error}
                    </div>
                )}

                {/* Input */}
                <div className="border-t bg-white dark:bg-slate-900 p-6 shrink-0 z-10">
                    <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative">
                        <div className="relative flex items-center shadow-lg rounded-2xl bg-white dark:bg-slate-800 ring-1 ring-slate-200 dark:ring-slate-700">
                            <Input
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Message EduOpus Advisor..."
                                disabled={isLoading}
                                className="flex-1 h-14 rounded-2xl border-0 bg-transparent px-6 text-base focus-visible:ring-0 shadow-none"
                            />
                            <div className="pr-2">
                                <Button
                                    type="submit"
                                    size="icon"
                                    disabled={!inputValue.trim() || isLoading}
                                    className="h-10 w-10 rounded-xl bg-purple-600 hover:bg-purple-700 transition-all hover:scale-105 active:scale-95"
                                >
                                    <Send className="h-5 w-5" />
                                </Button>
                            </div>
                        </div>
                        <p className="text-center text-[10px] text-slate-400 mt-3">
                            EduOpus Advisor keeps detailed context of your strategy.
                        </p>
                    </form>
                </div>
            </div>
        </div>
    );
}
