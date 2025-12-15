/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * AXIOM INTENT CLASSIFIER
 * Rule-based query classification for anti-hallucination architecture
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export type QueryCategory = 'DATA_QUERY' | 'STRATEGY' | 'COMMUNICATION' | 'WRITE_REQUEST' | 'GENERAL';
export type DataDomain = 'STUDENTS' | 'ATTENDANCE' | 'FEES' | 'STAFF' | 'CLASSES' | 'UNKNOWN';

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
    domain: DataDomain;
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
        category: 'WRITE_REQUEST',
        patterns: [
            /\b(add|create|insert|new)\b.*\b(student|staff|fee|payment|expense|class)/i,
            /\b(update|edit|modify|change)\b.*\b(student|staff|fee|payment|attendance)/i,
            /\b(delete|remove|cancel)\b.*\b(student|staff|fee|payment)/i,
            /\bmark\b.*\b(attendance|present|absent)/i,
            /\brecord\b.*\b(payment|expense|fee)/i,
        ],
        requires_data: true,
        requires_confirmation: true,
    },
    {
        category: 'DATA_QUERY',
        patterns: [
            /\b(how many|count|total|number of)\b/i,
            /\b(list|show|display|get|fetch)\b.*\b(all|students|staff|fees|payments|classes|attendance)/i,
            /\b(what is|what's|what are)\b.*\b(the|our)\b/i,
            /\b(report|summary|overview|breakdown)\b/i,
            /\b(pending|collected|due|remaining|outstanding)\b.*\b(fee|amount|payment)/i,
            /\b(attendance|present|absent)\b.*\b(rate|percentage|today|this week|this month)/i,
            /\b(enrolled|admitted|active)\b.*\b(students?)/i,
            /\bclass\s*\d+\b/i, // "Class 10", "class 5" etc.
            /\bgrade\s*\d+\b/i,
            /\bsalary|payroll|compensation/i,
        ],
        requires_data: true,
        requires_confirmation: false,
    },
    {
        category: 'STRATEGY',
        patterns: [
            /\b(how (can|do|should) (we|I)|suggest|recommend|advise)\b/i,
            /\b(improve|increase|decrease|reduce|cut|optimize)\b/i,
            /\b(plan|strategy|approach|solution)\b.*\b(for|to)\b/i,
            /\b(what (should|can) (we|I) do)\b/i,
            /\b(analyze|assess|evaluate)\b.*\b(situation|performance|trend)/i,
        ],
        requires_data: false, // Data is helpful but not mandatory
        requires_confirmation: false,
    },
    {
        category: 'COMMUNICATION',
        patterns: [
            /\b(write|draft|compose|create)\b.*\b(email|letter|notice|circular|message|announcement)/i,
            /\b(send|notify|inform)\b.*\b(parents?|staff|teachers?|students?)/i,
            /\b(prepare|make)\b.*\b(notice|circular|announcement)/i,
        ],
        requires_data: false,
        requires_confirmation: false,
    },
];

// Domain detection patterns
const DOMAIN_PATTERNS: { domain: DataDomain; patterns: RegExp[] }[] = [
    {
        domain: 'STUDENTS',
        patterns: [
            /\bstudent/i,
            /\benroll/i,
            /\badmission/i,
            /\bclass\s*\d+/i,
            /\bgrade\s*\d+/i,
            /\bnursery|lkg|ukg|kindergarten/i,
        ],
    },
    {
        domain: 'ATTENDANCE',
        patterns: [
            /\battendance/i,
            /\bpresent\b/i,
            /\babsent\b/i,
            /\bleave\b/i,
            /\babsentee/i,
        ],
    },
    {
        domain: 'FEES',
        patterns: [
            /\bfee/i,
            /\bpayment/i,
            /\bpending\b.*\b(amount|fee|due)/i,
            /\bcollect/i,
            /\bdue\b/i,
            /\bremaining\b.*\b(fee|amount)/i,
            /\boutstanding/i,
            /₹|\brupee|\binr\b|\bamount/i,
        ],
    },
    {
        domain: 'STAFF',
        patterns: [
            /\bstaff\b/i,
            /\bteacher/i,
            /\bemployee/i,
            /\bsalary/i,
            /\bpayroll/i,
            /\bhr\b/i,
        ],
    },
    {
        domain: 'CLASSES',
        patterns: [
            /\bclass(?:es)?\b(?!\s*\d)/i, // "classes" but not "class 10"
            /\bsection/i,
            /\bsubject/i,
            /\btimetable/i,
        ],
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
    if (/\bpresent\b/i.test(query)) params.status = 'present';
    if (/\babsent\b/i.test(query)) params.status = 'absent';

    // Date extraction
    const today = new Date();
    if (/\btoday\b/i.test(query)) {
        params.date_from = today.toISOString().split('T')[0];
        params.date_to = params.date_from;
    }
    if (/\bthis\s*week\b/i.test(query)) {
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - today.getDay());
        params.date_from = weekStart.toISOString().split('T')[0];
        params.date_to = today.toISOString().split('T')[0];
    }
    if (/\bthis\s*month\b/i.test(query)) {
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
        const matchCount = rule.patterns.filter(p => p.test(trimmedQuery)).length;
        if (matchCount > 0) {
            category = rule.category;
            requires_data = rule.requires_data;
            requires_confirmation = rule.requires_confirmation;
            categoryConfidence = matchCount >= 2 ? 'HIGH' : 'MEDIUM';
            break;
        }
    }

    // 2. Classify domain
    let domain: DataDomain = 'UNKNOWN';
    let domainMatchCount = 0;

    for (const rule of DOMAIN_PATTERNS) {
        const matchCount = rule.patterns.filter(p => p.test(trimmedQuery)).length;
        if (matchCount > domainMatchCount) {
            domain = rule.domain;
            domainMatchCount = matchCount;
        }
    }

    // 3. Extract parameters
    const params = extractParams(trimmedQuery);

    // 4. Compute overall confidence
    let confidence: 'HIGH' | 'MEDIUM' | 'LOW' = 'LOW';
    if (categoryConfidence === 'HIGH' && domain !== 'UNKNOWN') {
        confidence = 'HIGH';
    } else if (categoryConfidence === 'MEDIUM' || domain !== 'UNKNOWN') {
        confidence = 'MEDIUM';
    }

    return {
        category,
        domain,
        params,
        requires_data,
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
