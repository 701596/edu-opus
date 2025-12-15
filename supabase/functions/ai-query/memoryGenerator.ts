/**
 * MEMORY GENERATOR
 * Handles conversation context and summary generation.
 */

export function generateMemorySummary(messages: any[]): string {
    if (!messages || messages.length === 0) {
        return "No prior session context. Treat as new interaction.";
    }

    // In a full implementation, this would retrieval from a vector store or a pre-computed summary.
    // For session-level memory, we instruct the model to derive context from the thread.
    return `SESSION CONTEXT INSTRUCTIONS:
- Analyze [CONVERSATION THREAD] for:
  1. User Role (Principal/Admin)
  2. Active Problem Domain (e.g., Fees, Discipline)
  3. Tone Preference (Direct vs Formal)
- Maintain continuity based on these derived factors.
- Do not repeat previously explained concepts unless asked.`;
}

export function formatConversationThread(messages: any[], maxTurns: number = 10): string {
    if (!messages || messages.length === 0) return "No recent messages.";

    return messages
        .slice(-maxTurns)
        .map(m => {
            const role = m.role === 'user' ? 'PRINCIPAL' : 'ADVISOR';
            // Truncate very long messages to save tokens if needed, but for now exact history is better
            return `[${role}]: ${m.content}`;
        })
        .join('\n\n');
}
