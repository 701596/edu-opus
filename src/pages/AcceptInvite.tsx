/**
 * Accept Staff Invite Page
 * 
 * Handles the magic link invite flow:
 * 1. User lands here after clicking magic link in email
 * 2. User is already authenticated via magic link
 * 3. Page fetches pending invite details
 * 4. User enters name and password
 * 5. On submit: updates user profile, accepts invite, redirects to dashboard
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';
import { Loader2, CheckCircle2, School, Shield, XCircle } from 'lucide-react';

// =============================================
// Types
// =============================================
interface InviteDetails {
    found: boolean;
    id?: string;
    school_id?: string;
    school_name?: string;
    role?: string;
    expires_at?: string;
}

// =============================================
// Component
// =============================================
const AcceptInvite = () => {
    const navigate = useNavigate();
    const { user, loading: authLoading } = useAuth();

    // State
    const [invite, setInvite] = useState<InviteDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Form state
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    // =============================================
    // Fetch invite on mount
    // =============================================
    useEffect(() => {
        const fetchInvite = async () => {
            if (authLoading) return;

            if (!user) {
                // User not authenticated - magic link may have failed
                setError('Please click the magic link in your email to continue.');
                setIsLoading(false);
                return;
            }

            try {
                // Call RPC to get pending invite
                const { data, error: rpcError } = await supabase.rpc('get_pending_invite' as any);

                if (rpcError) {
                    console.error('RPC error:', rpcError);
                    setError('Failed to fetch invite details.');
                    setIsLoading(false);
                    return;
                }

                const inviteData = data as InviteDetails;

                if (!inviteData?.found) {
                    setError('No pending invite found for your email. The invite may have expired or already been used.');
                    setIsLoading(false);
                    return;
                }

                setInvite(inviteData);

                // Pre-fill name from user metadata if available
                const fullName = user.user_metadata?.full_name || '';
                setName(fullName);

            } catch (err) {
                console.error('Error fetching invite:', err);
                setError('An unexpected error occurred.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchInvite();
    }, [user, authLoading]);

    // =============================================
    // Handle form submission
    // =============================================
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation
        if (!name.trim()) {
            toast.error('Please enter your name');
            return;
        }

        if (password.length < 6) {
            toast.error('Password must be at least 6 characters');
            return;
        }

        if (password !== confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }

        setIsSubmitting(true);

        try {
            // Step 1: Update user metadata (name)
            const { error: updateError } = await supabase.auth.updateUser({
                password,
                data: { full_name: name.trim() },
            });

            if (updateError) {
                throw new Error(updateError.message);
            }

            // Step 2: Accept invite (join school)
            const { data: acceptResult, error: acceptError } = await supabase.rpc('accept_staff_invite' as any);

            if (acceptError) {
                throw new Error(acceptError.message);
            }

            const result = acceptResult as { ok: boolean; error?: string; school_id?: string; school_name?: string; role?: string };

            if (!result.ok) {
                throw new Error(result.error || 'Failed to accept invite');
            }

            // Success!
            setSuccess(true);
            toast.success(`Welcome to ${result.school_name || 'the school'}!`);

            // Store school ID for immediate use
            if (result.school_id) {
                localStorage.setItem('currentSchoolId', result.school_id);
            }

            // Redirect to dashboard after brief delay
            setTimeout(() => {
                navigate('/dashboard');
            }, 1500);

        } catch (err: any) {
            console.error('Accept invite error:', err);
            toast.error(err.message || 'Failed to accept invite');
        } finally {
            setIsSubmitting(false);
        }
    };

    // =============================================
    // Role display helper
    // =============================================
    const getRoleInfo = (role: string) => {
        const roles: Record<string, { label: string; description: string; color: string }> = {
            teacher: {
                label: 'Teacher',
                description: 'Manage classes, attendance, and student records',
                color: 'text-blue-600'
            },
            finance: {
                label: 'Finance Staff',
                description: 'Manage payments, expenses, and financial reports',
                color: 'text-green-600'
            },
            admin: {
                label: 'Administrator',
                description: 'Full access to school management features',
                color: 'text-purple-600'
            },
        };
        return roles[role] || { label: role, description: 'Staff member', color: 'text-gray-600' };
    };

    // =============================================
    // Loading skeleton
    // =============================================
    if (isLoading || authLoading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="space-y-2">
                        <div className="h-8 w-48 bg-muted rounded animate-pulse" />
                        <div className="h-4 w-64 bg-muted rounded animate-pulse" />
                    </CardHeader>
                    <CardContent className="space-y-6">
                        <div className="space-y-2">
                            <div className="h-4 w-20 bg-muted rounded animate-pulse" />
                            <div className="h-10 w-full bg-muted rounded animate-pulse" />
                        </div>
                        <div className="space-y-2">
                            <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                            <div className="h-10 w-full bg-muted rounded animate-pulse" />
                        </div>
                        <div className="h-10 w-full bg-muted rounded animate-pulse" />
                    </CardContent>
                </Card>
            </div>
        );
    }

    // =============================================
    // Error state
    // =============================================
    if (error) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                            <XCircle className="w-6 h-6 text-destructive" />
                        </div>
                        <CardTitle>Unable to Process Invite</CardTitle>
                        <CardDescription>{error}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Button
                            onClick={() => navigate('/auth')}
                            className="w-full"
                            variant="outline"
                        >
                            Go to Login
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // =============================================
    // Success state
    // =============================================
    if (success) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
                <Card className="w-full max-w-md">
                    <CardHeader className="text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
                            <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <CardTitle>Welcome Aboard!</CardTitle>
                        <CardDescription>You've successfully joined {invite?.school_name}. Redirecting to dashboard...</CardDescription>
                    </CardHeader>
                </Card>
            </div>
        );
    }

    // =============================================
    // Main form
    // =============================================
    const roleInfo = invite?.role ? getRoleInfo(invite.role) : null;

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                        <School className="w-6 h-6 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">You're Invited!</CardTitle>
                    <CardDescription>Complete your account setup to join the team</CardDescription>
                </CardHeader>

                <CardContent className="space-y-6">
                    {/* Invite Details */}
                    <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-center gap-2">
                            <School className="w-4 h-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">School:</span>
                            <span className="font-medium">{invite?.school_name}</span>
                        </div>
                        {roleInfo && (
                            <div className="flex items-center gap-2">
                                <Shield className="w-4 h-4 text-muted-foreground" />
                                <span className="text-sm text-muted-foreground">Role:</span>
                                <span className={`font-medium ${roleInfo.color}`}>{roleInfo.label}</span>
                            </div>
                        )}
                        {roleInfo && (
                            <p className="text-xs text-muted-foreground pl-6">{roleInfo.description}</p>
                        )}
                    </div>

                    {/* Setup Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Your Name</Label>
                            <Input
                                id="name"
                                type="text"
                                placeholder="Enter your full name"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                required
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="password">Create Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Minimum 6 characters"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                                disabled={isSubmitting}
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                placeholder="Re-enter your password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                disabled={isSubmitting}
                            />
                        </div>

                        <Button
                            type="submit"
                            className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Joining...
                                </>
                            ) : (
                                'Join School'
                            )}
                        </Button>
                    </form>

                    <p className="text-xs text-center text-muted-foreground">
                        By joining, you agree to the school's policies and terms of use.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};

export default AcceptInvite;
