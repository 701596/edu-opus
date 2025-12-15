/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AXIOM INTENT CLASSIFIER
 * Rule-based query classification for anti-hallucination architecture
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type QueryCategory = 'DATA_QUERY' | 'STRATEGY' | 'COMMUNICATION' | 'WRITE_REQUEST' | 'NAVIGATOR' | 'GENERAL' | 'GREETING';
export type DataDomain = 'STUDENTS' | 'ATTENDANCE' | 'FEES' | 'STAFF' | 'CLASSES' | 'QUICK_STATS' | 'UNKNOWN';

export interface ExtractedParams {
    class_id?: string;
    class_name?: string;
    status?: string;
    date_from?: string;
    date_to?: string;
    month?: string;
    year?: string;
    department?: string;
    role?: string;
    student_name?: string;
    is_wildcard?: boolean; // true if "all", "everyone", "entire school" detected
}

export interface QueryIntent {
    category: QueryCategory;
    domain: DataDomain; // Primary domain
    required_domains: DataDomain[]; // List of all needed domains
    params: ExtractedParams;
    requires_data: boolean;
    requires_confirmation: boolean;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    raw_query: string;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CLASSIFICATION RULES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// Category detection patterns (order matters - first match wins)
const CATEGORY_PATTERNS: { category: QueryCategory; patterns: RegExp[]; requires_data: boolean; requires_confirmation: boolean }[] = [
    {
        category: 'NAVIGATOR',
        patterns: [
            /\b(where|how) (can|do) (i|we) (find|see|view|check|access|add|create)\b/i,
            /\b(show|tell) me (where|how) to\b/i,
            /\bnavigate to\b/i,
            /\bhelp me find\b/i,
            /\bpath to\b/i,
            /\blocation of\b/i,
            /\bwhere\s*is\b/i,
            /\bwhich button\b/i,
        ],
        requires_data: false,
        requires_confirmation: false,
    },
    {
        category: 'WRITE_REQUEST',
        patterns: [
            /\b(add|create|insert|new|register)\b/i,
            /\b(update|edit|modify|change|correct)\b/i,
            /\b(delete|remove|cancel|drop)\b/i,
            /\bmark\b.*\b(attendance|present|absent)/i,
            /\brecord\b.*\b(payment|expense|fee)/i,
        ],
        requires_data: true, // Needs data to verify what to edit
        requires_confirmation: true,
    },
    {
        category: 'DATA_QUERY',
        patterns: [
            /\b(how many|count|total|number of)\b/i,
            /\b(list|show|display|get|fetch|give me)\b/i,
            /\b(what is|what's|what are)\b/i,
            /\b(report|summary|overview|breakdown|stats)\b/i,
            /\b(pending|collected|due|remaining|outstanding)\b/i,
            /\b(attendance|present|absent|profit|margin|revenue|expense)\b/i,
            /\b(enrolled|admitted|active)\b/i,
        ],
        requires_data: true,
        requires_confirmation: false,
    },
    {
        category: 'STRATEGY',
        patterns: [
            /\b(how (can|do|should) (we|I)|suggest|recommend|advise)\b/i,
            /\b(improve|increase|decrease|reduce|cut|optimize)\b/i,
            /\b(plan|strategy|approach|solution)\b/i,
            /\b(analyze|assess|evaluate)\b/i,
        ],
        requires_data: true, // Often needs data context
        requires_confirmation: false,
    },
    {
        category: 'COMMUNICATION',
        patterns: [
            /\b(write|draft|compose|create)\b.*\b(email|letter|notice|circular|message|announcement)/i,
            /\b(send|notify|inform)\b/i,
        ],
        requires_data: false, // Usually just template generation
        requires_confirmation: false,
    },
    {
        category: 'GREETING',
        patterns: [
            /^\s*(hi+|hello|hey|greetings|good morning|good afternoon|good evening)\s*$/i,
        ],
        requires_data: false,
        requires_confirmation: false,
    },
];

// Domain detection patterns
const DOMAIN_PATTERNS: { domain: DataDomain; patterns: RegExp[] }[] = [
    {
        domain: 'STUDENTS',
        patterns: [/\bstudents?/i, /\benroll/i, /\badmission/i, /\bclass\s*\d+/i, /\bgrade\s*\d+/i, /\bnursery|lkg|ukg|kindergarten/i],
    },
    {
        domain: 'ATTENDANCE',
        patterns: [/\battendance/i, /\bpresent\b/i, /\babsent\b/i, /\bleave\b/i, /\babsentee/i],
    },
    {
        domain: 'FEES',
        patterns: [/\bfees?/i, /\bpayments?/i, /\bcollected/i, /\bdues?/i, /\bremaining\b/i, /\boutstanding/i, /₹|\brupee|\binr/i, /\brevenue/i, /\bprofit/i],
    },
    {
        domain: 'STAFF',
        patterns: [/\bstaff\b/i, /\bteachers?/i, /\bemployees?/i, /\bsalary/i, /\bpayroll/i, /\bhr\b/i],
    },
    {
        domain: 'CLASSES',
        patterns: [/\bclass(?:es)?\b(?!\s*\d)/i, /\bsections?/i, /\bsubjects?/i, /\btimetables?/i],
    },
    {
        domain: 'QUICK_STATS',
        patterns: [/\bprofit\b/i, /\bmargin\b/i, /\bfinancials?\b/i, /\boverview\b/i, /\bdashboard\b/i, /\bsummary\b/i],
    },
];

// Wildcard detection (school-wide queries)
const WILDCARD_PATTERNS = [
    /\ball\s*(students?|staff|teachers?|employees?|classes|fees|payments)/i,
    /\bentire\s*school/i,
    /\beveryone/i,
    /\bschool[\s-]wide/i,
    /\bfull\s*(list|report|dump)/i,
    /\bshow\s*everything/i,
];

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARAMETER EXTRACTION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function extractParams(query: string): ExtractedParams {
    const params: ExtractedParams = {};
    const lowerQuery = query.toLowerCase();

    // Class/Grade extraction
    const classMatch = query.match(/\b(?:class|grade)\s*(\d+|nursery|lkg|ukg|kg)/i);
    if (classMatch) {
        params.class_name = classMatch[1].toUpperCase();
    }

    // Status extraction
    if (/\bpending\b/i.test(query)) params.status = 'pending';
    if (/\bcollected\b/i.test(query)) params.status = 'collected';
    if (/\bactive\b/i.test(query)) params.status = 'active';
    if (/\binactive\b/i.test(query)) params.status = 'inactive';

    // Date extraction
    const today = new Date();
    if (/\btoday\b/i.test(query)) {
        params.date_from = today.toISOString().split('T')[0];
        params.date_to = params.date_from;
    } else if (/\bthis\s*week\b/i.test(query)) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        params.date_from = weekStart.toISOString().split('T')[0];
        params.date_to = today.toISOString().split('T')[0];
    } else if (/\bthis\s*month\b/i.test(query)) {
        params.month = String(today.getMonth() + 1).padStart(2, '0');
        params.year = String(today.getFullYear());
    }
    if (/\blast\s*month\b/i.test(query)) {
        const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        params.month = String(lastMonth.getMonth() + 1).padStart(2, '0');
        params.year = String(lastMonth.getFullYear());
    }

    // Wildcard detection
    params.is_wildcard = WILDCARD_PATTERNS.some(pattern => pattern.test(query));

    return params;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MAIN CLASSIFIER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export function classifyIntent(query: string): QueryIntent {
    const trimmedQuery = query.trim();

    // 1. Classify category
    let category: QueryCategory = 'GENERAL';
    let requires_data = false;
    let requires_confirmation = false;
    let categoryConfidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';

    for (const rule of CATEGORY_PATTERNS) {
        if (rule.patterns.some(p => p.test(trimmedQuery))) {
            category = rule.category;
            requires_data = rule.requires_data;
            requires_confirmation = rule.requires_confirmation;
            categoryConfidence = 'HIGH';
            break;
        }
    }

    // 2. Identify ALL required domains
    const required_domains: DataDomain[] = [];
    let primaryDomain: DataDomain = 'UNKNOWN';
    let maxMatches = 0;

    for (const rule of DOMAIN_PATTERNS) {
        const matches = rule.patterns.filter(p => p.test(trimmedQuery)).length;
        if (matches > 0) {
            required_domains.push(rule.domain);
            if (matches > maxMatches) {
                maxMatches = matches;
                primaryDomain = rule.domain;
            }
        }
    }

    // Special logic for profit/margin queries (needs fees + expenses usually, or quick stats)
    if (/\b(profit|margin|revenue|financials)\b/i.test(trimmedQuery)) {
        if (!required_domains.includes('QUICK_STATS')) required_domains.push('QUICK_STATS');
        primaryDomain = 'QUICK_STATS';
    }

    // 3. Extract parameters
    const params = extractParams(trimmedQuery);

    // 4. Compute overall confidence
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (categoryConfidence === 'HIGH' && required_domains.length > 0) {
        confidence = 'HIGH';
    } else if (categoryConfidence === 'HIGH' || required_domains.length > 0) {
        confidence = 'MEDIUM';
    }

    // If NAVIGATOR mode, we don't need data
    if (category === 'NAVIGATOR') {
        requires_data = false;
    }

    return {
        category,
        domain: primaryDomain,
        required_domains,
        params,
        requires_data: requires_data && required_domains.length > 0,
        requires_confirmation,
        confidence,
        raw_query: trimmedQuery,
    };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDATION HELPERS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Check if a query requires backend data before LLM can respond
 */
export function requiresBackendData(intent: QueryIntent): boolean {
    return intent.requires_data && intent.category === 'DATA_QUERY';
}

/**
 * Check if a wildcard query was detected (needs explicit confirmation)
 */
export function isWildcardQuery(intent: QueryIntent): boolean {
    return intent.params.is_wildcard === true;
}

/**
 * Get the appropriate RPC function name for a query
 */
export function getDataFetcherName(intent: QueryIntent): string | null {
    if (!intent.requires_data) return null;

    switch (intent.domain) {
        case 'STUDENTS':
            return 'get_students_scoped';
        case 'ATTENDANCE':
            return 'get_attendance_scoped';
        case 'FEES':
            return 'get_fees_scoped';
        case 'STAFF':
            return 'get_staff_scoped';
        case 'CLASSES':
            return 'get_classes_scoped';
        default:
            return null;
    }
}

/**
 * Generate the hard stop message when data is missing
 */
export function getHardStopMessage(intent: QueryIntent): string {
    const domainLabel = intent.domain.toLowerCase().replace('_', ' ');
    return `I cannot verify this. No ${domainLabel} data exists for this query.`;
}
