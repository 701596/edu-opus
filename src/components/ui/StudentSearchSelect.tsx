import React, { useState, useCallback, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { Search, Loader2, User } from 'lucide-react';

interface StudentOption {
    id: string;
    name: string;
}

interface StudentSearchSelectProps {
    value: string;
    onChange: (studentId: string, studentName?: string) => void;
    placeholder?: string;
    disabled?: boolean;
}

export function StudentSearchSelect({
    value,
    onChange,
    placeholder = "Search students...",
    disabled = false
}: StudentSearchSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [options, setOptions] = useState<StudentOption[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedName, setSelectedName] = useState<string>('');

    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const debounceRef = useRef<NodeJS.Timeout>();

    // Load selected student name on mount if value exists
    useEffect(() => {
        if (value && !selectedName) {
            supabase
                .from('students')
                .select('id, name')
                .eq('id', value)
                .single()
                .then(({ data }) => {
                    if (data) setSelectedName(data.name);
                });
        }
    }, [value, selectedName]);

    // Debounced search
    const handleSearch = useCallback(async (query: string) => {
        if (debounceRef.current) clearTimeout(debounceRef.current);

        if (query.length < 1) {
            setOptions([]);
            return;
        }

        debounceRef.current = setTimeout(async () => {
            setIsLoading(true);
            try {
                // ONLY fetch id + name, LIMIT 20, no joins
                const { data, error } = await supabase
                    .from('students')
                    .select('id, name')
                    .ilike('name', `%${query}%`)
                    .limit(20)
                    .order('name');

                if (error) throw error;
                setOptions(data || []);
            } catch (err) {
                console.error('Student search error:', err);
                setOptions([]);
            } finally {
                setIsLoading(false);
            }
        }, 300); // 300ms debounce
    }, []);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const query = e.target.value;
        setSearchQuery(query);
        setIsOpen(true);
        handleSearch(query);
    };

    const handleSelect = (student: StudentOption) => {
        setSelectedName(student.name);
        setSearchQuery('');
        setIsOpen(false);
        onChange(student.id, student.name);
    };

    const handleFocus = () => {
        setIsOpen(true);
        if (searchQuery) handleSearch(searchQuery);
    };

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div ref={containerRef} className="relative w-full">
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                    ref={inputRef}
                    type="text"
                    value={isOpen ? searchQuery : selectedName}
                    onChange={handleInputChange}
                    onFocus={handleFocus}
                    placeholder={selectedName || placeholder}
                    disabled={disabled}
                    className="pl-10 pr-10"
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
                )}
            </div>

            {isOpen && (
                <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-hidden">
                    <ScrollArea className="max-h-60">
                        {options.length === 0 && !isLoading && searchQuery.length > 0 && (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                                No students found
                            </div>
                        )}
                        {options.length === 0 && !isLoading && searchQuery.length === 0 && (
                            <div className="p-3 text-sm text-muted-foreground text-center">
                                Start typing to search...
                            </div>
                        )}
                        {options.map((student) => (
                            <div
                                key={student.id}
                                onClick={() => handleSelect(student)}
                                className={cn(
                                    "flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-accent transition-colors",
                                    value === student.id && "bg-accent"
                                )}
                            >
                                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm truncate">{student.name}</span>
                            </div>
                        ))}
                    </ScrollArea>
                </div>
            )}
        </div>
    );
}
