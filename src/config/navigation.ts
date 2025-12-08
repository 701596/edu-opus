/**
 * Role-Aware Navigation Configuration
 * 
 * Defines navigation items based on user roles.
 */

import {
    Home,
    Users,
    UserCog,
    CreditCard,
    Receipt,
    Calendar,
    BarChart,
    Settings,
    BookOpen,
    ClipboardList,
    type LucideIcon,
} from 'lucide-react';
import { UserRole } from '@/contexts/RoleContext';

// =============================================
// Types
// =============================================

export interface NavItem {
    path: string;
    icon: LucideIcon;
    label: string;
    badge?: string;
}

// =============================================
// Navigation by Role
// =============================================

export const NAV_ITEMS: Record<UserRole, NavItem[]> = {
    // Principal: Full access
    principal: [
        { path: '/dashboard', icon: Home, label: 'Dashboard' },
        { path: '/students', icon: Users, label: 'Students' },
        { path: '/staff', icon: UserCog, label: 'Staff' },
        { path: '/payments', icon: CreditCard, label: 'Payments' },
        { path: '/expenses', icon: Receipt, label: 'Expenses' },
        { path: '/attendance', icon: Calendar, label: 'Attendance' },
        { path: '/reports', icon: BarChart, label: 'Reports' },
        { path: '/remaining-fees', icon: ClipboardList, label: 'Remaining Fees' },
        { path: '/admin', icon: Settings, label: 'Admin' },
    ],

    // Accountant: Finance + Students (edit)
    accountant: [
        { path: '/dashboard', icon: Home, label: 'Dashboard' },
        { path: '/students', icon: Users, label: 'Students' },
        { path: '/payments', icon: CreditCard, label: 'Payments' },
        { path: '/expenses', icon: Receipt, label: 'Expenses' },
        { path: '/reports', icon: BarChart, label: 'Reports' },
        { path: '/remaining-fees', icon: ClipboardList, label: 'Remaining Fees' },
    ],

    // Cashier: Fee collection only
    cashier: [
        { path: '/payments', icon: CreditCard, label: 'Collect Fees' },
        { path: '/students', icon: Users, label: 'Students' }, // View only
        { path: '/remaining-fees', icon: ClipboardList, label: 'Pending Fees' },
    ],

    // Teacher: Attendance only
    teacher: [
        { path: '/attendance', icon: Calendar, label: 'Attendance' },
        { path: '/my-classes', icon: BookOpen, label: 'My Classes' },
    ],
};

// =============================================
// Route Protection Matrix
// =============================================

export const ROUTE_ACCESS: Record<string, UserRole[]> = {
    '/dashboard': ['principal', 'accountant'],
    '/students': ['principal', 'accountant', 'cashier', 'teacher'],
    '/staff': ['principal'],
    '/payments': ['principal', 'accountant', 'cashier'],
    '/expenses': ['principal', 'accountant'],
    '/attendance': ['principal', 'teacher'],
    '/my-classes': ['teacher'],
    '/reports': ['principal', 'accountant'],
    '/remaining-fees': ['principal', 'accountant', 'cashier'],
    '/admin': ['principal'],
    '/admin/rate-limits': ['principal'],
    '/admin/invites': ['principal'],
    '/admin/audit': ['principal'],
};

// =============================================
// Helper Functions
// =============================================

export function getNavItems(role: UserRole | null): NavItem[] {
    if (!role) return [];
    return NAV_ITEMS[role] || [];
}

export function canAccessRoute(path: string, role: UserRole | null): boolean {
    if (!role) return false;

    // Find matching route pattern
    const exactMatch = ROUTE_ACCESS[path];
    if (exactMatch) {
        return exactMatch.includes(role);
    }

    // Check prefix matches (e.g., /admin/*)
    const prefixMatch = Object.entries(ROUTE_ACCESS).find(([route]) =>
        path.startsWith(route + '/')
    );
    if (prefixMatch) {
        return prefixMatch[1].includes(role);
    }

    // Default: deny access
    return false;
}

export function getDefaultRoute(role: UserRole | null): string {
    switch (role) {
        case 'principal':
        case 'accountant':
            return '/dashboard';
        case 'cashier':
            return '/payments';
        case 'teacher':
            return '/attendance';
        default:
            return '/';
    }
}
