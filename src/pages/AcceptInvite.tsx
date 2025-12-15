/**
 * Accept Invite Page
 * 
 * Secure invitation acceptance flow:
 * 1. Validates invite token from URL
 * 2. If logged in → show code input → accept invite → redirect by role
 * 3. If not logged in → show auth flow → then accept
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, School, LogIn, Shield, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/contexts/RoleContext';

// =============================================
// Types
// =============================================

type AcceptStatus =
    | 'SUCCESS'
    | 'INVALID_TOKEN'
    | 'INVALID_CODE'
    | 'EXPIRED'
    | 'ALREADY_ACCEPTED'
    | 'NOT_AUTHENTICATED'
    | 'ERROR';

interface AcceptInviteResponse {
    status: AcceptStatus;
    message?: string;
    role?: UserRole;
    school_id?: string;
    school_name?: string;
}

interface InviteDetails {
    id: string;
    email: string;
    role: UserRole;
    school_name: string;
    school_id: string;
    expires_at: string;
    is_valid: boolean;
}

// =============================================
// Component
// =============================================

export default function AcceptInvite() {
    const { token } = useParams<{ token: string }>();
    const [searchParams] = useSearchParams();
    const tokenFromQuery = searchParams.get('token');
    const inviteToken = token || tokenFromQuery;

    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAccepting, setIsAccepting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [errorStatus, setErrorStatus] = useState<AcceptStatus | null>(null);
    const [success, setSuccess] = useState(false);
    const [securityCode, setSecurityCode] = useState('');
    const [acceptedRole, setAcceptedRole] = useState<UserRole | null>(null);
    const [acceptedSchoolId, setAcceptedSchoolId] = useState<string | null>(null);

    // =============================================
    // Fetch Invite Details
    // =============================================
    useEffect(() => {
        async function fetchInvite() {
            if (!inviteToken) {
                setError('Invalid invite link - no token provided');
                setIsLoading(false);
                return;
            }

            try {
                // Look up invite from invitations table
                const { data, error: queryError } = await supabase
                    .from('invitations')
                    .select(`
                        id,
                        email,
                        role,
                        school_id,
                        expires_at,
                        used_at,
                        schools!inner(name)
                    `)
                    .eq('token', inviteToken)
                    .single();

                if (queryError || !data) {
                    console.error('Invite lookup error:', queryError);
                    setError('This invite link is invalid or has expired');
                    setErrorStatus('INVALID_TOKEN');
                    setIsLoading(false);
                    return;
                }

                const isExpired = new Date(data.expires_at) < new Date();
                const isUsed = !!data.used_at;

                if (isExpired) {
                    setError('This invite has expired');
                    setErrorStatus('EXPIRED');
                    setIsLoading(false);
                    return;
                }

                if (isUsed) {
                    setError('This invite has already been used');
                    setErrorStatus('ALREADY_ACCEPTED');
                    setIsLoading(false);
                    return;
                }

                setInvite({
                    id: data.id,
                    email: data.email,
                    role: data.role as UserRole,
                    school_id: data.school_id,
                    school_name: (data.schools as any)?.name || 'Unknown School',
                    expires_at: data.expires_at,
                    is_valid: true
                });
            } catch (err) {
                console.error('Fetch error:', err);
                setError('Failed to load invite details');
            }
            setIsLoading(false);
        }

        fetchInvite();
    }, [inviteToken]);

    // =============================================
    // Accept Invite Handler
    // =============================================
    const handleAcceptInvite = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!inviteToken || !user || !invite) return;

        setIsAccepting(true);
        setError(null);
        setErrorStatus(null);

        try {
            // Call accept edge function
            const { data: { session } } = await supabase.auth.getSession();
            
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/accept-staff-invite`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        invite_token: inviteToken
                    })
                }
            );

            const result = await response.json();

            if (!response.ok) {
                setError(result.error || 'Failed to accept invite');
                setIsAccepting(false);
                return;
            }

            setSuccess(true);
            setAcceptedRole(invite.role);
            setAcceptedSchoolId(invite.school_id);

            // Redirect after brief delay
            setTimeout(() => {
                const redirectPath = getRedirectPath(invite.role, invite.school_id);
                navigate(redirectPath);
            }, 2000);
        } catch (err) {
            console.error('Accept error:', err);
            setError('Failed to accept invite. Please try again.');
            setIsAccepting(false);
        }
    };

    // =============================================
    // Helper Functions
    // =============================================

    const getRedirectPath = (role?: UserRole, schoolId?: string): string => {
        if (!schoolId) return '/dashboard';

        switch (role) {
            case 'teacher':
                return `/attendance`;
            case 'accountant':
            case 'cashier':
                return `/payments`;
            case 'principal':
                return `/dashboard`;
            default:
                return `/dashboard`;
        }
    };

    const getErrorMessage = (status: AcceptStatus, message?: string): string => {
        switch (status) {
            case 'INVALID_TOKEN':
                return 'This invite link is invalid or does not exist.';
            case 'INVALID_CODE':
                return 'The security code is incorrect. Please check and try again.';
            case 'EXPIRED':
                return 'This invite has expired. Please request a new one from your administrator.';
            case 'ALREADY_ACCEPTED':
                return 'This invite has already been used.';
            case 'NOT_AUTHENTICATED':
                return 'Please log in to accept this invite.';
            default:
                return message || 'An error occurred. Please try again.';
        }
    };

    const getRoleInfo = (role: UserRole) => {
        switch (role) {
            case 'principal':
                return { label: 'Principal', color: 'bg-purple-500', desc: 'Full administrative access' };
            case 'accountant':
                return { label: 'Accountant', color: 'bg-blue-500', desc: 'Finance and student management' };
            case 'cashier':
                return { label: 'Cashier', color: 'bg-green-500', desc: 'Fee collection access' };
            case 'teacher':
                return { label: 'Teacher', color: 'bg-orange-500', desc: 'Attendance marking access' };
            default:
                return { label: role, color: 'bg-gray-500', desc: '' };
        }
    };

    // =============================================
    // Render States
    // =============================================

    // Loading state
    if (isLoading || authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/10">
                <div className="text-center">
                    <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
                    <p className="text-muted-foreground">Loading invite details...</p>
                </div>
            </div>
        );
    }

    // Error state (no invite found)
    if (error && !invite) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
                        <CardTitle>Invalid Invite</CardTitle>
                        <CardDescription>{error}</CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <Link to="/auth">
                            <Button>Go to Login</Button>
                        </Link>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Success state
    if (success) {
        const roleInfo = getRoleInfo(acceptedRole || 'teacher');
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4">
                <Card className="max-w-md w-full">
                    <CardHeader className="text-center">
                        <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
                        <CardTitle>Welcome to {invite?.school_name}!</CardTitle>
                        <CardDescription>
                            You've joined as <Badge className={roleInfo.color}>{roleInfo.label}</Badge>
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <p className="text-muted-foreground mb-4">Redirecting to your dashboard...</p>
                        <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Main invite view
    const roleInfo = invite ? getRoleInfo(invite.role) : null;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/5 p-4">
            <Card className="max-w-md w-full">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-4 p-4 bg-primary/10 rounded-full w-fit">
                        <School className="h-12 w-12 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">You're Invited!</CardTitle>
                    <CardDescription>
                        You've been invited to join a school team
                    </CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Invite Details */}
                    <div className="space-y-4 bg-accent/50 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">School</span>
                            <span className="font-semibold">{invite?.school_name}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Your Role</span>
                            {roleInfo && (
                                <Badge className={roleInfo.color}>{roleInfo.label}</Badge>
                            )}
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-muted-foreground">Access</span>
                            <span className="text-sm">{roleInfo?.desc}</span>
                        </div>
                    </div>

                    {/* Error Alert */}
                    {error && (
                        <Alert variant={errorStatus === 'INVALID_CODE' ? 'default' : 'destructive'}>
                            <AlertTriangle className="h-4 w-4" />
                            <AlertTitle>
                                {errorStatus === 'INVALID_CODE' ? 'Incorrect Code' : 'Error'}
                            </AlertTitle>
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    {/* User not logged in */}
                    {!user ? (
                        <div className="space-y-4">
                            <Alert>
                                <Shield className="h-4 w-4" />
                                <AlertTitle>Authentication Required</AlertTitle>
                                <AlertDescription>
                                    Please log in or create an account to accept this invitation.
                                </AlertDescription>
                            </Alert>
                            <div className="flex gap-2">
                                <Link to={`/auth?redirect=/invite/${inviteToken}`} className="flex-1">
                                    <Button className="w-full">
                                        <LogIn className="mr-2 h-4 w-4" />
                                        Log In
                                    </Button>
                                </Link>
                            </div>
                        </div>
                    ) : (
                        /* User is logged in - show accept button */
                        <form onSubmit={handleAcceptInvite} className="space-y-4">
                            <Alert>
                                <Shield className="h-4 w-4" />
                                <AlertTitle>Ready to Join</AlertTitle>
                                <AlertDescription>
                                    Click below to accept this invitation and join the school.
                                </AlertDescription>
                            </Alert>

                            <Button
                                type="submit"
                                className="w-full"
                                size="lg"
                                disabled={isAccepting}
                            >
                                {isAccepting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Joining...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Accept Invitation
                                    </>
                                )}
                            </Button>

                            <p className="text-center text-xs text-muted-foreground">
                                Logged in as <strong>{user.email}</strong>
                            </p>
                        </form>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
