/**
 * Verified Context Formatter
 * Formats backend data into the VERIFIED CONTEXT section
 * with explicit NO DATA markers when empty
 */

export function formatVerifiedContext(
    domain: string,
    fetchedData: any | null,
    queryParams: Record<string, any>
): string {
    let context = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';
    context += 'VERIFIED DATA (Fresh from backend)\n';
    context += '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

    // If no data fetched
    if (!fetchedData || !fetchedData.data || (Array.isArray(fetchedData.data) && fetchedData.data.length === 0)) {
        context += `❌ ${domain.toUpperCase()}: NO RECORDS FOUND\n`;

        if (queryParams && Object.keys(queryParams).length > 0) {
            context += `\nQuery filters applied:\n`;
            for (const [key, value] of Object.entries(queryParams)) {
                if (value) context += `  • ${key}: ${value}\n`;
            }
        }

        context += '\n⚠️ The LLM MUST NOT fabricate, estimate, or infer data.\n';
        context += 'Response MUST state: "I cannot verify this. No data exists for this query."\n';

        return context;
    }

    // If data exists, format it
    const metadata = fetchedData.metadata || {};
    const reconciliation = fetchedData.reconciliation || {};
    const data = fetchedData.data;

    // Metadata
    context += `Dataset: ${metadata.dataset || domain}\n`;
    context += `Record Count: ${metadata.record_count || (Array.isArray(data) ? data.length : 0)}\n`;
    context += `Last Updated: ${metadata.last_updated || 'Unknown'}\n`;

    if (metadata.filters_applied && Object.keys(metadata.filters_applied).length > 0) {
        context += `\nFilters Applied:\n`;
        for (const [key, value] of Object.entries(metadata.filters_applied)) {
            if (value !== null && value !== undefined) {
                context += `  • ${key}: ${value}\n`;
            }
        }
    }

    context += '\n';

    // Data section
    context += `DATA:\n`;
    if (Array.isArray(data)) {
        // Format as table/list
        if (data.length <= 10) {
            // Show all records if <= 10
            context += JSON.stringify(data, null, 2);
        } else {
            // Summarize if > 10
            context += `Total: ${data.length} records\n`;
            context += `Sample (first 5):\n`;
            context += JSON.stringify(data.slice(0, 5), null, 2);
        }
    } else {
        context += JSON.stringify(data, null, 2);
    }

    context += '\n\n';

    // Reconciliation
    if (reconciliation && Object.keys(reconciliation).length > 0) {
        context += `RECONCILIATION:\n`;
        context += JSON.stringify(reconciliation, null, 2);

        if (reconciliation.is_valid === false) {
            context += '\n\n⚠️ WARNING: Data reconciliation FAILED. Discrepancy detected.\n';
            context += 'You MUST surface this inconsistency in your response.\n';
            if (reconciliation.discrepancy) {
                context += `Discrepancy amount: ${reconciliation.discrepancy}\n`;
            }
        }
    }

    context += '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n';

    return context;
}
