import React, { useState, useEffect } from 'react';

export function ThinkingIndicator() {
    const [dots, setDots] = useState('.');

    useEffect(() => {
        const interval = setInterval(() => {
            setDots(prev => {
                if (prev === '...') return '.';
                return prev + '.';
            });
        }, 400);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="flex flex-col items-start space-y-1 py-2">
            <span className="text-sm font-medium text-muted-foreground animate-none">
                Thinking{dots}
            </span>
        </div>
    );
}
