import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ArrowRight, CheckCircle2, School } from 'lucide-react';
import { toast } from 'sonner';

type InviteDetails = {
    valid: boolean;
    type?: 'email' | 'code';
    email?: string;
    role?: string;
    school_name?: string;
    school_id?: string;
};

const Join = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const tokenFromUrl = searchParams.get('token');

    const [loading, setLoading] = useState(false);
    const [step, setStep] = useState<'verify' | 'signup'>('verify');
    const [inviteDetails, setInviteDetails] = useState<InviteDetails | null>(null);

    // Form States
    const [code, setCode] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [fullName, setFullName] = useState('');

    // 1. Auto-Verify Token on Load
    useEffect(() => {
        if (tokenFromUrl) {
            verifyInvite(tokenFromUrl, null);
        }
    }, [tokenFromUrl]);

    const verifyInvite = async (token: string | null, codeInput: string | null) => {
        setLoading(true);
        try {
            const { data, error } = await supabase.rpc('verify_hybrid_invite' as any, {
                p_token: token,
                p_code: codeInput
            });

            if (error) throw error;

            const result = data as InviteDetails;
            if (result.valid) {
                setInviteDetails(result);
                if (result.email) setEmail(result.email);
                setStep('signup');
                toast.success(`Welcome to ${result.school_name}!`);
            } else {
                toast.error('Invalid or expired invitation.');
                setInviteDetails(null);
            }
        } catch (err: any) {
            toast.error(err.message || 'Verification failed');
        } finally {
            setLoading(false);
        }
    };

    const handleCodeSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) return;
        verifyInvite(null, code.trim());
    };

    // 2. Handle Already Logged In
    useEffect(() => {
        const checkAuth = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (session && inviteDetails?.valid) {
                // Store intent just in case, then let Layout handle it or do it here
                // Actually, better to just redirect to dashboard, Layout will pick it up
                // provided we store it first.

                const pendingInvite = {
                    token: tokenFromUrl || null,
                    code: code ? code : null
                };
                localStorage.setItem('pending_invite', JSON.stringify(pendingInvite));
                navigate('/dashboard');
            }
        };
        checkAuth();
    }, [inviteDetails, tokenFromUrl, code]); // Trigger when invite details are confirmed valid

    const handleSignup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!inviteDetails) return;
        setLoading(true);

        try {
            // 1. Store Invite Intent
            const pendingInvite = {
                token: tokenFromUrl || null,
                code: !tokenFromUrl && code ? code : null
            };
            localStorage.setItem('pending_invite', JSON.stringify(pendingInvite));

            // 2. Sign Up (Standard Flow)
            const { error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        full_name: fullName,
                    },
                    emailRedirectTo: window.location.origin,
                }
            });

            if (authError) throw authError;

            // 3. Success
            toast.success('We sent you a confirmation email. Please check your inbox!');
            setInviteDetails(null);
            setStep('verify');

        } catch (err: any) {
            console.error(err);
            toast.error(err.message || 'Signup failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (step === 'verify' && !tokenFromUrl) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Join Your School</CardTitle>
                        <CardDescription>Enter the invitation code provided by your administrator.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleCodeSubmit} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="code">Invitation Code</Label>
                                <Input
                                    id="code"
                                    placeholder="e.g. ABX9-FK24"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                                    className="font-mono uppercase tracking-widest text-center text-lg"
                                    maxLength={9}
                                    required
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'Verify Code'}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (step === 'signup' && inviteDetails) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <div className="mx-auto bg-primary/10 p-3 rounded-full mb-4">
                            <School className="w-8 h-8 text-primary" />
                        </div>
                        <CardTitle className="text-center">Join {inviteDetails.school_name}</CardTitle>
                        <CardDescription className="text-center">
                            You are joining as a <span className="font-semibold text-primary">{inviteDetails.role}</span>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleSignup} className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="name">Full Name</Label>
                                <Input
                                    id="name"
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    placeholder="John Doe"
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email">Email</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={email}
                                    // If standard email invite, secure it (readOnly)
                                    readOnly={!!inviteDetails.email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className={inviteDetails.email ? 'bg-muted' : ''}
                                    required
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="password">Create Password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Min. 6 characters"
                                    minLength={6}
                                    required
                                />
                            </div>

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Creating Account...
                                    </>
                                ) : (
                                    <>
                                        Complete Signup
                                        <ArrowRight className="ml-2 h-4 w-4" />
                                    </>
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
            </div>
        );
    }

    // Loading state for initial token check
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <div className="text-center space-y-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto" />
                <p className="text-muted-foreground">Verifying invitation...</p>
            </div>
        </div>
    );
};

export default Join;
