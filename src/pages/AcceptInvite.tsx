/**
 * Accept Invite Page
 * 
 * Handles invitation acceptance flow:
 * 1. Validates invite token
 * 2. Shows invite details (school, role)
 * 3. If logged in → accept invite → redirect to role dashboard
 * 4. If not logged in → show signup/login options
 */

import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, School, UserPlus, LogIn, Shield } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { UserRole } from '@/contexts/RoleContext';
import { getDefaultRoute } from '@/config/navigation';

// =============================================
// Types
// =============================================

interface InviteDetails {
    id: string;
    email: string;
    role: UserRole;
    school_name: string;
    school_id: string;
    expires_at: string;
    created_at: string;
    is_valid: boolean;
}

// =============================================
// Component
// =============================================

export default function AcceptInvite() {
    const { token } = useParams<{ token: string }>();
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isAccepting, setIsAccepting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState(false);

    // Fetch invite details
    useEffect(() => {
        async function fetchInvite() {
            if (!token) {
                setError('Invalid invite link');
                setIsLoading(false);
                return;
            }

            try {
                console.log('Fetching invite with token:', token);

                // Call RPC to get invite details
                const { data, error: rpcError } = await supabase.rpc('get_invite_by_token' as any, {
                    p_token: token,
                });

                console.log('RPC response:', { data, error: rpcError });

                if (rpcError) {
                    console.error('RPC error:', rpcError);
                    setError(`RPC Error: ${rpcError.message}`);
                    setIsLoading(false);
                    return;
                }

                if (!data) {
                    setError('This invite link is invalid or has expired');
                    setIsLoading(false);
                    return;
                }

                setInvite(data);
            } catch (err) {
                console.error('Fetch error:', err);
                setError('Failed to load invite details');
            }
            setIsLoading(false);
        }

        fetchInvite();
    }, [token]);

    // Accept invite
    const handleAccept = async () => {
        if (!token || !user) return;

        setIsAccepting(true);
        setError(null);

        try {
            // Pass explicit user.id to match our new RPC logic
            const { data, error: acceptError } = await supabase.rpc('accept_school_invite' as any, {
                p_token: token,
                p_user_id: user.id
            });

            if (acceptError) {
                // Check for "Zombie Session" (Client has cookie, but DB deleted user)
                if (acceptError.message.includes('User not found') || acceptError.message.includes('User ID missing')) {
                    console.warn('Stale session detected. Signing out...');
                    await supabase.auth.signOut();
                    // Force reload to clear state and show login form
                    window.location.reload();
                    return;
                }

                setError(acceptError.message || 'Failed to accept invite');
                setIsAccepting(false);
                return;
            }

            setSuccess(true);

            // Redirect to role-specific page after 2 seconds
            setTimeout(() => {
                const defaultRoute = getDefaultRoute(invite?.role || null);
                navigate(defaultRoute);
            }, 2000);
        } catch (err: any) {
            console.error('Accept error:', err);
            // Handle unexpected errors similarly if they look like auth issues
            if (err.message && (err.message.includes('User not found') || err.message.includes('auth'))) {
                await supabase.auth.signOut();
                window.location.reload();
                return;
            }
            setError('Failed to accept invite');
            setIsAccepting(false);
        }
    };

    // Get role display info
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

    // Handle Join with Code (Auto Signup/Login)
    const handleJoinWithCode = async (code: string) => {
        if (!invite || !token) return;

        setIsAccepting(true);
        setError(null);

        // Define userId in outer scope for catch block access
        let userId: string | undefined;

        try {
            // 1. Force cleanup of any stale sessions first
            const { error: signOutError } = await supabase.auth.signOut();
            if (signOutError) console.warn('Sign out warn:', signOutError);

            // 2. Try to Login first (case: user exists)
            console.log('Attempting login with code...');
            const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
                email: invite.email,
                password: code
            });

            if (!signInError && signInData.user) {
                console.log('Login successful', signInData.user.id);
                userId = signInData.user.id;
            } else {
                console.log('Login failed', signInError?.message);

                // 2b. Try Sign Up (case: new user)
                console.log('Attempting signup...');
                const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
                    email: invite.email,
                    password: code,
                    options: {
                        data: { full_name: invite.role }
                    }
                });

                if (signUpError) {
                    console.error('Signup failed:', signUpError);
                    if (signUpError.message.includes('already registered')) {
                        throw new Error('Invalid Security Code. If you already have an account, please check the code.');
                    }
                    throw new Error(signUpError.message || 'Failed to create account or log in.');
                }

                if (signUpData.user) {
                    console.log('Signup successful', signUpData.user.id);
                    userId = signUpData.user.id;
                }
            }

            // 3. Authenticated! Now accept invite
            // We must have a userId by now.
            if (!userId) {
                // Try one last fetch
                const { data } = await supabase.auth.getUser();
                userId = data.user?.id;
            }

            if (!userId) {
                // This is the critical check. If we are here, Auth failed silently.
                throw new Error('Authentication Internal Error: Failed to obtain User ID after login/signup.');
            }

            console.log('Authenticated. Accepting invite...', userId);

            // 4. Call RPC with explicit ID
            const { error: acceptError } = await supabase.rpc('accept_school_invite' as any, {
                p_token: token,
                p_user_id: userId
            });

            if (acceptError) throw acceptError;

            // Explicitly set success to update UI
            setSuccess(true);
            setError(null);

            // Note: navigate will happen in setTimeout below
        } catch (err: any) {
            console.error('Join error:', err);

            // Handle Zombie Sessions in Join Flow too
            if (err.message && (err.message.includes('User not found') || err.message.includes('User ID missing') || err.message.includes('auth'))) {
                console.warn('Zombie session detected in Join flow.');
                // Do NOT reload automatically. Show error and let user decide.
                // We display the userId captured from our local scope variable
                setError(`System Error: The account created (ID: ${userId}) cannot be found by the database. User ID from Auth: ${userId || 'undefined'}. Error: ${err.message}`);
                setIsAccepting(false);
                return;
            }

            setError(err.message || 'Invalid Security Code. Please check and try again.');
            setIsAccepting(false);
        }
    };

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

    // Error state
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
        const roleInfo = getRoleInfo(invite?.role || 'teacher');
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

                    {error && (
                        <Alert variant="destructive">
                            <AlertTitle>Error</AlertTitle>
                            <AlertDescription className="flex flex-col gap-2">
                                <span>{error}</span>
                                {(error.includes('System Error') || error.includes('User not found')) && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={async () => {
                                            await supabase.auth.signOut();
                                            window.location.reload();
                                        }}
                                        className="w-full mt-2 bg-white text-destructive hover:bg-gray-100"
                                    >
                                        Reset Session & Try Again
                                    </Button>
                                )}
                            </AlertDescription>
                        </Alert>
                    )}

                    {/* Action Buttons */}
                    {user ? (
                        // User is logged in - show accept button
                        <div className="space-y-3">
                            <p className="text-center text-sm text-muted-foreground">
                                Logged in as <strong>{user.email}</strong>
                            </p>
                            <Button
                                className="w-full"
                                size="lg"
                                onClick={handleAccept}
                                disabled={isAccepting}
                            >
                                {isAccepting ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Accepting...
                                    </>
                                ) : (
                                    <>
                                        <CheckCircle className="mr-2 h-4 w-4" />
                                        Accept Invitation
                                    </>
                                )}
                            </Button>
                            <p className="text-center text-xs text-muted-foreground">
                                By accepting, you'll join {invite?.school_name} as {roleInfo?.label}
                            </p>
                        </div>
                    ) : (
                        // User is not logged in - Security Code Flow
                        <div className="space-y-4">
                            <Alert>
                                <Shield className="h-4 w-4" />
                                <AlertTitle>Setup Your Account</AlertTitle>
                                <AlertDescription>
                                    Enter the 6-character security code provided by your administrator to join.
                                </AlertDescription>
                            </Alert>

                            <div className="space-y-3">
                                <form onSubmit={(e) => {
                                    e.preventDefault();
                                    handleJoinWithCode(new FormData(e.currentTarget).get('code') as string);
                                }} className="space-y-3">
                                    <div className="space-y-2">
                                        <Label htmlFor="code">Security Code</Label>
                                        <Input
                                            id="code"
                                            name="code"
                                            placeholder="e.g. A1B2C3"
                                            className="text-center font-mono text-lg tracking-widest uppercase"
                                            maxLength={6}
                                            required
                                        />
                                    </div>
                                    <Button
                                        type="submit"
                                        className="w-full"
                                        disabled={isAccepting}
                                    >
                                        {isAccepting ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            <>
                                                <LogIn className="mr-2 h-4 w-4" />
                                                Join School
                                            </>
                                        )}
                                    </Button>
                                </form>

                                <p className="text-center text-xs text-muted-foreground">
                                    This code serves as your initial password.
                                </p>

                                <div className="text-center border-t pt-2">
                                    <Link to="/auth" className="text-xs text-primary hover:underline">
                                        Already have an account? Log in here
                                    </Link>
                                </div>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
