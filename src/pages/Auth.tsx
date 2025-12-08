import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BookOpen } from 'lucide-react';
import { z } from 'zod';
import { supabase } from '@/integrations/supabase/client';

const signInSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const signUpSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const Auth = () => {
  const { user, signIn, signUp, loading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Redirect if already authenticated
  if (!loading && user) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    };

    try {
      signInSchema.parse(data);
      await signIn(data.email, data.password);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrors({});
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    const data = {
      name: formData.get('name') as string,
      email: formData.get('email') as string,
      password: formData.get('password') as string,
    };

    try {
      signUpSchema.parse(data);
      await signUp(data.email, data.password, data.name);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors: Record<string, string> = {};
        error.errors.forEach((err) => {
          if (err.path[0]) {
            fieldErrors[err.path[0] as string] = err.message;
          }
        });
        setErrors(fieldErrors);
      }
    } finally {
      setIsLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <Card className="w-full max-w-md shadow-card border-0 bg-card/50 backdrop-blur-sm">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 bg-gradient-to-r from-primary to-primary-glow rounded-xl flex items-center justify-center">
            <BookOpen className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-foreground to-muted-foreground bg-clip-text">
              Student Management System
            </CardTitle>
            <CardDescription className="text-muted-foreground">
              Manage your educational institution with ease
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin" className="w-full">
            <TabsList className="grid w-full grid-cols-3 mb-6">
              <TabsTrigger value="member">Staff Login</TabsTrigger>
              <TabsTrigger value="signin">Admin Login</TabsTrigger>
              <TabsTrigger value="signup">Register School</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signin-email">Email</Label>
                  <Input
                    id="signin-email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    className={errors.email ? 'border-destructive' : ''}
                    required
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signin-password">Password</Label>
                  <Input
                    id="signin-password"
                    name="password"
                    type="password"
                    placeholder="Enter your password"
                    className={errors.password ? 'border-destructive' : ''}
                    required
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 transition-opacity"
                  disabled={isLoading}
                >
                  {isLoading ? 'Signing in...' : 'Sign In'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="member">
              <form onSubmit={async (e) => {
                e.preventDefault();
                setErrors({});
                setIsLoading(true);

                const formData = new FormData(e.currentTarget);
                const email = formData.get('email') as string;
                const code = (formData.get('code') as string).trim().toUpperCase();

                try {
                  // 0. Ensure no stale session exists
                  await supabase.auth.signOut();

                  // 1. Try to Sign In with Code as password
                  const { error: signInError } = await supabase.auth.signInWithPassword({
                    email,
                    password: code
                  });

                  if (signInError) {
                    // 2. If Sign In fails, try Sign Up (first time user)
                    const { error: signUpError } = await supabase.auth.signUp({
                      email,
                      password: code,
                      options: {
                        data: { name: 'Staff Member' } // Default name
                      }
                    });

                    if (signUpError) throw new Error('Invalid email or security code');
                  }

                  // 3. Accept Invite / Link Member
                  // We need to pass the user ID explicitly because the session might not be fully established
                  let userId = user?.id;

                  if (!userId) {
                    const { data } = await supabase.auth.getUser();
                    userId = data.user?.id;
                  }

                  if (!userId) {
                    throw new Error('Authentication successful but User ID not found. Please try logging in again.');
                  }

                  const { error: joinError } = await supabase.rpc('accept_school_invite_by_code' as any, {
                    p_code: code,
                    p_user_id: userId
                  });

                  if (joinError) {
                    console.error('Join RPC error:', joinError);
                    throw new Error(joinError.message || 'Failed to link invite to account');
                  }

                  // Success!
                  window.location.href = '/dashboard';

                } catch (error: any) {
                  setErrors({ form: error.message || 'Failed to login with code' });
                } finally {
                  setIsLoading(false);
                }
              }} className="space-y-4">
                {errors.form && (
                  <div className="p-3 rounded bg-destructive/10 text-destructive text-sm font-medium">
                    {errors.form}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="member-email">School Email</Label>
                  <Input
                    id="member-email"
                    name="email"
                    type="email"
                    placeholder="you@school.edu"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="member-code">Security Code</Label>
                  <Input
                    id="member-code"
                    name="code"
                    placeholder="A1B2C3"
                    className="font-mono tracking-widest uppercase"
                    maxLength={6}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Use the 6-character code provided by your principal.
                  </p>
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-purple-600 to-purple-400 hover:opacity-90 transition-opacity"
                  disabled={isLoading}
                >
                  {isLoading ? ' verifying...' : 'Login with Code'}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="signup-name">Full Name</Label>
                  <Input
                    id="signup-name"
                    name="name"
                    type="text"
                    placeholder="Enter your full name"
                    className={errors.name ? 'border-destructive' : ''}
                    required
                  />
                  {errors.name && (
                    <p className="text-sm text-destructive">{errors.name}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-email">Email</Label>
                  <Input
                    id="signup-email"
                    name="email"
                    type="email"
                    placeholder="Enter your email"
                    className={errors.email ? 'border-destructive' : ''}
                    required
                  />
                  {errors.email && (
                    <p className="text-sm text-destructive">{errors.email}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="signup-password">Password</Label>
                  <Input
                    id="signup-password"
                    name="password"
                    type="password"
                    placeholder="Create a password"
                    className={errors.password ? 'border-destructive' : ''}
                    required
                  />
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password}</p>
                  )}
                </div>
                <Button
                  type="submit"
                  className="w-full bg-gradient-to-r from-primary to-primary-glow hover:opacity-90 transition-opacity"
                  disabled={isLoading}
                >
                  {isLoading ? 'Creating school...' : 'Register School'}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Auth;