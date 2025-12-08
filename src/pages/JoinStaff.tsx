/**
 * Join Staff Page (/join)
 * 
 * Handles staff invitation acceptance flow:
 * 1. Reads token from URL query parameter
 * 2. Validates invite token
 * 3. If not logged in → prompt to login/signup with Google
 * 4. If logged in → accept invite → redirect to dashboard
 */

import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, School, LogIn, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

// =============================================
// Types
// =============================================

interface InviteDetails {
  id: string;
  email: string;
  role: string;
  school_name: string;
  school_id: string;
  expires_at: string;
  is_valid: boolean;
}

// =============================================
// Component
// =============================================

export default function JoinStaff() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  // Fetch invite details on mount
  useEffect(() => {
    async function fetchInvite() {
      if (!token) {
        setError('Invalid invite link. No token provided.');
        setIsLoading(false);
        return;
      }

      try {
        console.log('Fetching staff invite with token:', token);

        // Query staff_invites directly (RLS allows select if user is owner, but we need public access)
        // We'll use the edge function to validate
        const { data: session } = await supabase.auth.getSession();
        
        // Use edge function to get invite details (bypasses RLS)
        const response = await fetch(
          `https://fhrskehzyvaqrgfyqopg.supabase.co/functions/v1/accept-staff-invite`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': session?.session?.access_token 
                ? `Bearer ${session.session.access_token}` 
                : `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZocnNrZWh6eXZhcXJnZnlxb3BnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkyMjA4ODgsImV4cCI6MjA3NDc5Njg4OH0.6J4sqB33uIu-Cpk5AuN3KxT4TShjZAD8VYwXQHeHBcA'}`,
            },
            body: JSON.stringify({ token, validate_only: true }),
          }
        );

        // For now, we'll show a generic invite page since fetching details requires auth
        // The actual validation happens when accepting
        setInvite({
          id: '',
          email: '',
          role: '',
          school_name: 'Your School',
          school_id: '',
          expires_at: '',
          is_valid: true,
        });
        
      } catch (err) {
        console.error('Fetch error:', err);
        // Still show the page, validation will happen on accept
        setInvite({
          id: '',
          email: '',
          role: '',
          school_name: 'Your School',
          school_id: '',
          expires_at: '',
          is_valid: true,
        });
      }
      setIsLoading(false);
    }

    fetchInvite();
  }, [token]);

  // Accept invite when user is authenticated
  const handleAccept = async () => {
    if (!token || !user) return;

    setIsAccepting(true);
    setError(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      
      if (!session?.session?.access_token) {
        setError('Session expired. Please log in again.');
        setIsAccepting(false);
        return;
      }

      console.log('Accepting invite...');
      
      const response = await fetch(
        `https://fhrskehzyvaqrgfyqopg.supabase.co/functions/v1/accept-staff-invite`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.session.access_token}`,
          },
          body: JSON.stringify({ token }),
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to accept invite');
      }

      console.log('Invite accepted:', data);
      setSuccess(true);
      setSuccessMessage(data.message || 'Welcome to the team!');

      // Redirect to dashboard after 2 seconds
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
      
    } catch (err: any) {
      console.error('Accept error:', err);
      setError(err.message || 'Failed to accept invite. Please try again.');
      setIsAccepting(false);
    }
  };

  // Handle Google login
  const handleGoogleLogin = async () => {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/join?token=${token}`,
        },
      });
      
      if (error) throw error;
    } catch (err: any) {
      console.error('Google login error:', err);
      setError('Failed to start Google login. Please try again.');
    }
  };

  // Handle email login redirect
  const handleEmailLogin = () => {
    // Store token in sessionStorage to retrieve after login
    if (token) {
      sessionStorage.setItem('pending_staff_invite', token);
    }
    navigate('/auth');
  };

  // Auto-accept if user is logged in and we have a token
  useEffect(() => {
    if (user && token && !isLoading && !success && !isAccepting && invite?.is_valid) {
      handleAccept();
    }
  }, [user, token, isLoading, success, isAccepting, invite]);

  // Get role display info
  const getRoleInfo = (role: string) => {
    const roles: Record<string, { label: string; color: string; desc: string }> = {
      principal: { label: 'Principal', color: 'bg-purple-500', desc: 'Full administrative access' },
      accountant: { label: 'Accountant', color: 'bg-blue-500', desc: 'Finance management' },
      manager: { label: 'Manager', color: 'bg-indigo-500', desc: 'Team management' },
      teacher: { label: 'Teacher', color: 'bg-orange-500', desc: 'Class and attendance access' },
    };
    return roles[role] || { label: role || 'Staff', color: 'bg-gray-500', desc: 'Team member' };
  };

  // Loading state
  if (isLoading || authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-accent/10">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading invite...</p>
        </div>
      </div>
    );
  }

  // No token error
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-destructive/5 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            <CardTitle>Invalid Invite Link</CardTitle>
            <CardDescription>No invite token was provided in the URL.</CardDescription>
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
    const roleInfo = getRoleInfo(invite?.role || '');
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-primary/10 p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            <CardTitle>Welcome to the Team!</CardTitle>
            <CardDescription>{successMessage}</CardDescription>
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
              <span className="font-semibold">{invite?.school_name || 'Your School'}</span>
            </div>
            {roleInfo && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Your Role</span>
                <Badge className={roleInfo.color}>{roleInfo.label}</Badge>
              </div>
            )}
          </div>

          {/* Error Alert */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          {user ? (
            // User is logged in - show accepting state or accept button
            <div className="space-y-3">
              <p className="text-center text-sm text-muted-foreground">
                Logged in as <strong>{user.email}</strong>
              </p>
              {isAccepting ? (
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span>Joining team...</span>
                </div>
              ) : (
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleAccept}
                  disabled={isAccepting}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Accept Invitation
                </Button>
              )}
            </div>
          ) : (
            // User is not logged in - show login options
            <div className="space-y-4">
              <Alert>
                <LogIn className="h-4 w-4" />
                <AlertTitle>Login Required</AlertTitle>
                <AlertDescription>
                  Please log in or create an account to accept this invitation.
                </AlertDescription>
              </Alert>

              <div className="space-y-3">
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleGoogleLogin}
                  variant="outline"
                >
                  <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Continue with Google
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">or</span>
                  </div>
                </div>

                <Button
                  className="w-full"
                  variant="secondary"
                  onClick={handleEmailLogin}
                >
                  <LogIn className="mr-2 h-4 w-4" />
                  Login with Email
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
