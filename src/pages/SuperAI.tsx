/**
 * SuperAI Page
 * Fullscreen AI assistant interface for principals
 */

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
import {
    Sparkles,
    Send,
    Loader2,
    GraduationCap,
    Users,
    Calendar,
    DollarSign,
    BarChart3,
    Trash2,
    History
} from 'lucide-react';
import { cn } from '@/lib/utils';

const QUICK_PROMPTS = [
    {
        icon: GraduationCap, label: 'Students', prompts: [
            "How many students are enrolled?",
            "Show me students with low attendance",
            "Which class has the most students?"
        ]
    },
    {
        icon: Users, label: 'Staff', prompts: [
            "List all teachers",
            "Who hasn't logged in this week?",
            "Show staff attendance summary"
        ]
    },
    {
        icon: Calendar, label: 'Attendance', prompts: [
            "What's today's attendance rate?",
            "Compare attendance between classes",
            "Which students are frequently absent?"
        ]
    },
    {
        icon: DollarSign, label: 'Finance', prompts: [
            "Show total fees collected this month",
            "Which students have pending fees?",
            "Monthly expense breakdown"
        ]
    },
    {
        icon: BarChart3, label: 'Reports', prompts: [
            "Generate a weekly summary",
            "Compare this month vs last month",
            "Highlight any concerning trends"
        ]
    }
];

export default function SuperAI() {
    const { isPrincipal, isLoading: roleLoading } = useRole();
    const { messages, isLoading, error, sendMessage, clearMessages } = useAI();
    const [inputValue, setInputValue] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
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
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inputValue.trim() || isLoading) return;
        const message = inputValue;
        setInputValue('');
        await sendMessage(message);
    };

    const handleQuickPrompt = async (prompt: string) => {
        await sendMessage(prompt);
    };

    return (
        <div className="flex h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800">
            {/* Sidebar */}
            <div className="w-80 border-r bg-white dark:bg-slate-900 p-4 flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                    <div className="h-10 w-10 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center">
                        <Sparkles className="h-5 w-5 text-white" />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg">EduOpus AI</h1>
                        <p className="text-xs text-muted-foreground">Your School Intelligence</p>
                    </div>
                </div>

                {/* Quick Prompts */}
                <div className="flex-1 space-y-4">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                        Quick Actions
                    </p>
                    {QUICK_PROMPTS.map((category) => (
                        <div key={category.label} className="space-y-2">
                            <button
                                onClick={() => setSelectedCategory(
                                    selectedCategory === category.label ? null : category.label
                                )}
                                className="flex items-center gap-2 w-full p-2 rounded-lg hover:bg-muted transition-colors"
                            >
                                <category.icon className="h-4 w-4 text-purple-600" />
                                <span className="text-sm font-medium">{category.label}</span>
                            </button>
                            {selectedCategory === category.label && (
                                <div className="ml-6 space-y-1">
                                    {category.prompts.map((prompt) => (
                                        <button
                                            key={prompt}
                                            onClick={() => handleQuickPrompt(prompt)}
                                            disabled={isLoading}
                                            className="text-xs text-left w-full p-2 rounded hover:bg-purple-50 dark:hover:bg-purple-900/20 text-muted-foreground hover:text-purple-600 transition-colors"
                                        >
                                            {prompt}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>

                {/* Clear History */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearMessages}
                    className="mt-4 w-full justify-start text-muted-foreground"
                >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Clear Conversation
                </Button>
            </div>

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col">
                {/* Header */}
                <div className="border-b bg-white dark:bg-slate-900 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300">
                                Principal Access
                            </Badge>
                            <span className="text-sm text-muted-foreground">
                                {messages.length} messages this session
                            </span>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                <ScrollArea ref={scrollRef} className="flex-1 p-6">
                    {messages.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-center max-w-lg mx-auto">
                            <div className="h-20 w-20 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center mb-6">
                                <Sparkles className="h-10 w-10 text-white" />
                            </div>
                            <h2 className="text-2xl font-bold mb-2">Welcome, Principal!</h2>
                            <p className="text-muted-foreground mb-6">
                                I can help you analyze school data, generate reports, and find insights.
                                Ask me anything about students, staff, attendance, or finances.
                            </p>
                            <div className="grid grid-cols-2 gap-2 w-full">
                                {["How's attendance this week?", "Show fee collection status"].map((prompt) => (
                                    <Button
                                        key={prompt}
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleQuickPrompt(prompt)}
                                        disabled={isLoading}
                                        className="text-xs"
                                    >
                                        {prompt}
                                    </Button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto space-y-6">
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
                                            "max-w-[85%] rounded-2xl px-5 py-3",
                                            msg.role === 'user'
                                                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white'
                                                : 'bg-white dark:bg-slate-800 border shadow-sm'
                                        )}
                                    >
                                        <p className="whitespace-pre-wrap">{msg.content}</p>
                                    </div>
                                </div>
                            ))}
                            {isLoading && (
                                <div className="flex justify-start">
                                    <div className="bg-white dark:bg-slate-800 border shadow-sm rounded-2xl px-5 py-3">
                                        <Loader2 className="h-5 w-5 animate-spin text-purple-600" />
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </ScrollArea>

                {/* Error */}
                {error && (
                    <div className="px-6 py-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
                        {error}
                    </div>
                )}

                {/* Input */}
                <div className="border-t bg-white dark:bg-slate-900 p-4">
                    <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
                        <div className="flex gap-3">
                            <Input
                                ref={inputRef}
                                value={inputValue}
                                onChange={(e) => setInputValue(e.target.value)}
                                placeholder="Ask about students, attendance, fees, staff..."
                                disabled={isLoading}
                                className="flex-1 h-12 rounded-xl text-base"
                            />
                            <Button
                                type="submit"
                                size="lg"
                                disabled={!inputValue.trim() || isLoading}
                                className="h-12 px-6 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700"
                            >
                                <Send className="h-5 w-5" />
                            </Button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
}
