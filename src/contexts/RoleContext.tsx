/**
 * Role Context Provider
 * 
 * Provides user role information throughout the app.
 * Replaces simple user_id check with school-aware RBAC.
 */

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { User } from '@supabase/supabase-js';

// =============================================
// Types
// =============================================

export type UserRole = 'principal' | 'accountant' | 'cashier' | 'teacher';

export interface SchoolMembership {
    school_id: string;
    school_name: string;
    role: UserRole;
}

export interface RoleContextValue {
    isLoading: boolean;
    memberships: SchoolMembership[];
    currentSchool: SchoolMembership | null;
    setCurrentSchool: (school: SchoolMembership) => void;
    role: UserRole | null;
    isPrincipal: boolean;
    isAccountant: boolean;
    isCashier: boolean;
    isTeacher: boolean;
    canManageStudents: boolean;
    canCollectFees: boolean;
    canViewReports: boolean;
    canMarkAttendance: boolean;
    canManageStaff: boolean;
    canInviteMembers: boolean;
    hasSchool: boolean;
    refreshRoles: () => Promise<void>;
}

// =============================================
// Context
// =============================================

const RoleContext = createContext<RoleContextValue | undefined>(undefined);

// =============================================
// Provider
// =============================================

interface RoleProviderProps {
    children: ReactNode;
}

export function RoleProvider({ children }: RoleProviderProps) {
    const { user, loading: authLoading } = useAuth();
    const [isLoading, setIsLoading] = useState(true);
    const [memberships, setMemberships] = useState<SchoolMembership[]>([]);
    const [currentSchool, setCurrentSchoolState] = useState<SchoolMembership | null>(null);

    // Fetch user's school memberships
    const fetchMemberships = async () => {
        if (!user) {
            setMemberships([]);
            setCurrentSchoolState(null);
            setIsLoading(false);
            return;
        }

        try {
            const { data, error } = await supabase.rpc('get_user_roles' as any);

            if (error) {
                console.error('Failed to fetch roles:', error);
                // Fallback: user might not have RBAC set up yet
                setMemberships([]);
            } else if (data && Array.isArray(data)) {
                const schools = data.map((d: any) => ({
                    school_id: d.school_id,
                    school_name: d.school_name,
                    role: d.role as UserRole,
                }));
                setMemberships(schools);

                if (schools.length > 0 && !currentSchool) {
                    const saved = localStorage.getItem('currentSchoolId');
                    const savedSchool = schools.find((s: SchoolMembership) => s.school_id === saved);
                    const targetSchool = savedSchool || schools[0];
                    setCurrentSchoolState(targetSchool);

                    // Log login (once per session per school)
                    const sessionKey = `login_logged_${targetSchool.school_id}_${new Date().toDateString()}`;
                    if (!sessionStorage.getItem(sessionKey)) {
                        supabase.rpc('log_login' as any, {
                            p_school_id: targetSchool.school_id,
                            p_role: targetSchool.role
                        }).then(({ error }) => {
                            if (!error) sessionStorage.setItem(sessionKey, 'true');
                        });
                    }
                }
            }
        } catch (e) {
            console.error('Role fetch error:', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading) {
            fetchMemberships();
        }
    }, [user, authLoading]);

    // Set current school
    const setCurrentSchool = (school: SchoolMembership) => {
        setCurrentSchoolState(school);
        localStorage.setItem('currentSchoolId', school.school_id);
    };

    // Derive permissions
    const role = currentSchool?.role || null;
    const isPrincipal = role === 'principal';
    const isAccountant = role === 'accountant';
    const isCashier = role === 'cashier';
    const isTeacher = role === 'teacher';

    const value: RoleContextValue = {
        isLoading: isLoading || authLoading,
        memberships,
        currentSchool,
        setCurrentSchool,
        role,
        isPrincipal,
        isAccountant,
        isCashier,
        isTeacher,
        // Derived permissions
        canManageStudents: isPrincipal || isAccountant,
        canCollectFees: isPrincipal || isAccountant || isCashier,
        canViewReports: isPrincipal || isAccountant,
        canMarkAttendance: isPrincipal || isTeacher,
        canManageStaff: isPrincipal,
        canInviteMembers: isPrincipal,
        hasSchool: memberships.length > 0,
        refreshRoles: fetchMemberships,
    };

    return (
        <RoleContext.Provider value={value}>
            {children}
        </RoleContext.Provider>
    );
}

// =============================================
// Hook
// =============================================

export function useRole() {
    const context = useContext(RoleContext);
    if (!context) {
        throw new Error('useRole must be used within a RoleProvider');
    }
    return context;
}

// =============================================
// Permission Guards
// =============================================

export function RequireRole({
    roles,
    children,
    fallback = null
}: {
    roles: UserRole[];
    children: ReactNode;
    fallback?: ReactNode;
}) {
    const { role, isLoading } = useRole();

    if (isLoading) {
        return null;
    }

    if (!role || !roles.includes(role)) {
        return <>{fallback}</>;
    }

    return <>{children}</>;
}

export function RequirePrincipal({ children }: { children: ReactNode }) {
    return <RequireRole roles={['principal']}>{children}</RequireRole>;
}

export function RequireFinance({ children }: { children: ReactNode }) {
    return <RequireRole roles={['principal', 'accountant', 'cashier']}>{children}</RequireRole>;
}

export function RequireTeacher({ children }: { children: ReactNode }) {
    return <RequireRole roles={['principal', 'teacher']}>{children}</RequireRole>;
}
