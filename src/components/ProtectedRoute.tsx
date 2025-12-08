/**
 * Protected Route Component
 * 
 * Restricts access based on user roles.
 */

import { Navigate, useLocation } from 'react-router-dom';
import { useRole, UserRole } from '@/contexts/RoleContext';
import { canAccessRoute, getDefaultRoute } from '@/config/navigation';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Loader2, AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
    children: React.ReactNode;
    requiredRoles?: UserRole[];
}

export function ProtectedRoute({ children, requiredRoles }: ProtectedRouteProps) {
    const { role, isLoading, hasSchool } = useRole();
    const location = useLocation();

    // Show loading state
    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    const { signOut } = useAuth();

    // No school membership - show error instead of redirecting to deleted onboarding
    if (!hasSchool) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen space-y-4">
                <div className="p-4 rounded-full bg-destructive/10">
                    <AlertTriangle className="h-8 w-8 text-destructive" />
                </div>
                <h2 className="text-xl font-semibold">No School Assigned</h2>
                <p className="text-muted-foreground text-center max-w-md">
                    You are signed in but not associated with any school.
                </p>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => signOut()}>Sign Out</Button>
                </div>
            </div>
        );
    }

    // Check specific required roles
    if (requiredRoles && requiredRoles.length > 0) {
        if (!role || !requiredRoles.includes(role)) {
            return <Navigate to={getDefaultRoute(role)} replace />;
        }
    }

    // Check route access matrix
    if (!canAccessRoute(location.pathname, role)) {
        return <Navigate to={getDefaultRoute(role)} replace />;
    }

    return <>{children}</>;
}

/**
 * Principal-Only Route
 */
export function PrincipalRoute({ children }: { children: React.ReactNode }) {
    return (
        <ProtectedRoute requiredRoles={['principal']}>
            {children}
        </ProtectedRoute>
    );
}

/**
 * Finance Route (Principal, Accountant, Cashier)
 */
export function FinanceRoute({ children }: { children: React.ReactNode }) {
    return (
        <ProtectedRoute requiredRoles={['principal', 'accountant', 'cashier']}>
            {children}
        </ProtectedRoute>
    );
}

/**
 * Teacher Route (Principal, Teacher)
 */
export function TeacherRoute({ children }: { children: React.ReactNode }) {
    return (
        <ProtectedRoute requiredRoles={['principal', 'teacher']}>
            {children}
        </ProtectedRoute>
    );
}
