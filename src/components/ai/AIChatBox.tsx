import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useAI } from '@/hooks/useAI';
import { useRole } from '@/contexts/RoleContext';
import { ThinkingIndicator } from '@/components/ai/ThinkingIndicator';
import {
    MessageSquare,
    X,
    Send,
    Sparkles,
    Minimize2,
    Maximize2,
    Plus,
    History,
    Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

export function AIChatBox() {
    const { isPrincipal } = useRole();
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

    const [isOpen, setIsOpen] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);
    const [inputValue, setInputValue] = useState('');
    const [showSidebar, setShowSidebar] = useState(false);

    // Delayed Thinking Indicator Logic
    const [showThinking, setShowThinking] = useState(false);

    useEffect(() => {
        let timer: NodeJS.Timeout;
        if (isLoading) {
            // Trigger 300-500ms after user sends (300ms chosen)
            timer = setTimeout(() => {
                setShowThinking(true);
            }, 300);
        } else {
            // Disappear immediately when response arrives
            setShowThinking(false);
        }
        return () => clearTimeout(timer);
    }, [isLoading]);

    const scrollRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Only show for principals
    if (!isPrincipal) return null;

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, showThinking]);

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
                    className="fixed bottom-6 right-6 h-14 w-14 rounded-full shadow-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 z-50 transition-transform hover:scale-105"
                    size="icon"
                >
                    <Sparkles className="h-6 w-6 text-white" />
                </Button>
            )}

            {/* Chat Window */}
            {isOpen && (
                <Card className={cn(
                    "fixed z-50 shadow-2xl border-0 transition-all duration-300 flex flex-col overflow-hidden",
                    isExpanded
                        ? "inset-4 rounded-2xl"
                        : "bottom-6 right-6 w-[450px] h-[600px] rounded-2xl"
                )}>
                    {/* Header */}
                    <CardHeader className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white p-4 shrink-0">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-8 w-8 text-white hover:bg-white/20"
                                    onClick={() => setShowSidebar(!showSidebar)}
                                >
                                    <History className="h-5 w-5" />
                                </Button>
                                <span className="font-semibold text-lg">EduOpus Advisor</span>
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

                    {/* Main Content Area (Sidebar + Chat) */}
                    <div className="flex flex-1 overflow-hidden relative">

                        {/* Sidebar (Sessions) */}
                        <div className={cn(
                            "absolute inset-y-0 left-0 bg-slate-50 border-r w-64 transform transition-transform duration-300 z-20 flex flex-col",
                            showSidebar ? "translate-x-0" : "-translate-x-full"
                        )}>
                            <div className="p-4 border-b">
                                <Button
                                    className="w-full justify-start gap-2 bg-purple-600 hover:bg-purple-700 text-white"
                                    onClick={() => {
                                        createNewSession();
                                        setShowSidebar(false); // Mobile-friendly close
                                    }}
                                >
                                    <Plus className="h-4 w-4" /> New Conversation
                                </Button>
                            </div>
                            <div className="px-4 py-2 bg-slate-100 border-b">
                                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Your Conversations</h3>
                            </div>
                            <ScrollArea className="flex-1">
                                <div className="p-2 space-y-1">
                                    {sessions.length === 0 && (
                                        <p className="text-xs text-muted-foreground text-center py-4">No recent history</p>
                                    )}
                                    {sessions.map(session => (
                                        <div
                                            key={session.id}
                                            className={cn(
                                                "group flex items-center justify-between p-2 rounded-md hover:bg-slate-200 cursor-pointer text-sm animate-in fade-in slide-in-from-left-2 duration-200",
                                                currentSessionId === session.id ? "bg-purple-100 text-purple-700 font-medium" : "text-slate-600"
                                            )}
                                        >
                                            <span
                                                className="truncate flex-1"
                                                onClick={() => {
                                                    switchSession(session.id);
                                                    setShowSidebar(false);
                                                }}
                                            >
                                                {session.title}
                                            </span>
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

                        {/* Chat Messages */}
                        <CardContent className="flex flex-col flex-1 p-0 bg-white relative">
                            <ScrollArea ref={scrollRef} className="flex-1 p-4">
                                {messages.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground opacity-60">
                                        <Sparkles className="h-12 w-12 mb-4 text-purple-300" />
                                        <p className="font-medium text-lg text-slate-700">How can I advise you today?</p>
                                        <p className="text-sm mt-2 max-w-[250px]">
                                            Strategic planning, drafting, or platform navigation.
                                        </p>
                                    </div>
                                ) : (
                                    <div className="space-y-6 pb-4">
                                        {messages.map((msg, idx) => (
                                            <div
                                                key={idx}
                                                className={cn(
                                                    "flex w-full",
                                                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                                                )}
                                            >
                                                <div
                                                    className={cn(
                                                        "max-w-[85%] rounded-2xl px-5 py-3 shadow-sm",
                                                        msg.role === 'user'
                                                            ? 'bg-purple-600 text-white rounded-br-sm'
                                                            : 'bg-slate-100 text-slate-800 rounded-bl-sm border border-slate-200'
                                                    )}
                                                >
                                                    <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                                                        {msg.content}
                                                    </p>
                                                    <span className={cn(
                                                        "text-[10px] mt-1 block opacity-70",
                                                        msg.role === 'user' ? "text-purple-100" : "text-slate-400"
                                                    )}>
                                                        {format(new Date(msg.timestamp), 'h:mm a')}
                                                    </span>
                                                </div>
                                            </div>
                                        ))}
                                        {showThinking && (
                                            <div className="flex justify-start">
                                                <ThinkingIndicator />
                                            </div>
                                        )}
                                    </div>
                                )}
                            </ScrollArea>

                            {/* Error Message */}
                            {error && (
                                <div className="px-4 py-2 bg-red-50 text-red-600 text-xs text-center border-t border-red-100">
                                    {error}
                                </div>
                            )}

                            {/* Input Area */}
                            <form onSubmit={handleSubmit} className="p-4 bg-white border-t border-slate-100 shrink-0">
                                <div className="relative flex gap-2">
                                    <Input
                                        ref={inputRef}
                                        value={inputValue}
                                        onChange={(e) => setInputValue(e.target.value)}
                                        onKeyDown={handleKeyDown}
                                        placeholder="Type your strategy or question..."
                                        disabled={isLoading}
                                        className="flex-1 rounded-full pl-5 pr-12 shadow-sm border-slate-200 focus-visible:ring-purple-500"
                                    />
                                    <Button
                                        type="submit"
                                        size="icon"
                                        disabled={!inputValue.trim() || isLoading}
                                        className="absolute right-1 top-1 bottom-1 h-8 w-8 rounded-full bg-purple-600 hover:bg-purple-700 shadow-sm"
                                    >
                                        <Send className="h-4 w-4" />
                                    </Button>
                                </div>
                            </form>
                        </CardContent>
                    </div>
                </Card>
            )}
        </>
    );
}
