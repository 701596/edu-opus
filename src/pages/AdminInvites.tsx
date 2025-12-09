/**
 * Admin Invite Panel
 * 
 * Principal-only interface for inviting and managing staff members.
 * Uses secure edge functions for all invite operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
    UserPlus,
    Mail,
    Copy,
    Loader2,
    Users,
    Trash2,
    Clock,
    AlertTriangle,
    Activity,
    CheckCircle,
    XCircle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRole, UserRole } from '@/contexts/RoleContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';

// =============================================
// Types
// =============================================

type InviteStatus = 'pending' | 'accepted' | 'revoked' | 'expired';

interface SchoolMember {
    member_id: string;
    user_id: string;
    role: UserRole;
    is_active: boolean;
    joined_at: string;
    email?: string;
}

interface SchoolInvite {
    id: string;
    email: string;
    role: UserRole;
    status: InviteStatus;
    expires_at: string;
    created_at: string;
    accepted_at: string | null;
    accepted_by: string | null;
}

interface LoginLog {
    id: string;
    email: string;
    role: string;
    created_at: string;
}

interface CreateInviteResult {
    status: string;
    invite_id?: string;
    token?: string;
    security_code?: string;
    link?: string;
    expires_at?: string;
    message?: string;
}

// =============================================
// Component
// =============================================

export default function AdminInvites() {
    const { user } = useAuth();
    const { currentSchool, isPrincipal } = useRole();
    const { toast } = useToast();

    const [members, setMembers] = useState<SchoolMember[]>([]);
    const [invites, setInvites] = useState<SchoolInvite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('teacher');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteResult, setInviteResult] = useState<CreateInviteResult | null>(null);
    const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
    const [activeTab, setActiveTab] = useState('activity');
    const [dialogOpen, setDialogOpen] = useState(false);

    // =============================================
    // Data Fetching
    // =============================================

    const fetchData = useCallback(async () => {
        if (!currentSchool) return;

        try {
            // Fetch members
            const { data: membersData, error: membersError } = await (supabase.rpc as Function)(
                'get_school_members_extended',
                { p_school_id: currentSchool.school_id }
            );

            if (membersError) {
                console.error('Members fetch error:', membersError);
            }

            // Fetch invites using secure RPC
            const { data: invitesData, error: invitesError } = await (supabase.rpc as Function)(
                'get_school_invites_secure',
                { p_school_id: currentSchool.school_id }
            );

            if (invitesError) {
                console.error('Invites fetch error:', invitesError);
            }

            // Fetch login logs
            const { data: logsData } = await (supabase as unknown as { from: (table: string) => { select: (cols: string) => { eq: (col: string, val: string) => { order: (col: string, opts: { ascending: boolean }) => { limit: (n: number) => Promise<{ data: LoginLog[] | null }> } } } } })
                .from('login_logs')
                .select('*')
                .eq('school_id', currentSchool.school_id)
                .order('created_at', { ascending: false })
                .limit(20);

            setMembers((membersData as SchoolMember[]) || []);
            setInvites((invitesData as SchoolInvite[]) || []);
            setLoginLogs(logsData || []);
        } catch (error) {
            console.error('Data fetch error:', error);
        } finally {
            setIsLoading(false);
        }
    }, [currentSchool]);

    useEffect(() => {
        fetchData();

        // Realtime subscription for invites
        if (currentSchool) {
            const channel = supabase
                .channel('admin_invites_changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'school_invites',
                        filter: `school_id=eq.${currentSchool.school_id}`,
                    },
                    () => {
                        fetchData();
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [currentSchool, fetchData]);

    // =============================================
    // Send Invite
    // =============================================

    const sendInvite = async () => {
        if (!inviteEmail || !currentSchool) return;

        setIsInviting(true);
        setInviteResult(null);

        try {
            // Get session for auth header
            const { data: sessionData } = await supabase.auth.getSession();
            const accessToken = sessionData.session?.access_token;

            if (!accessToken) {
                toast({ title: 'Session expired', variant: 'destructive' });
                setIsInviting(false);
                return;
            }

            // Call edge function
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-invite`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                    },
                    body: JSON.stringify({
                        school_id: currentSchool.school_id,
                        email: inviteEmail,
                        role: inviteRole,
                        expires_in_hours: 168, // 7 days
                    }),
                }
            );

            const result: CreateInviteResult = await response.json();

            if (result.status === 'SUCCESS') {
                setInviteResult(result);
                toast({
                    title: 'Invite Created',
                    description: `Invitation sent to ${inviteEmail}`,
                });
                setInviteEmail('');
                fetchData();
            } else {
                toast({
                    title: 'Invite Failed',
                    description: result.message || 'Failed to create invite',
                    variant: 'destructive',
                });
            }
        } catch (error) {
            console.error('Invite error:', error);
            toast({
                title: 'Error',
                description: 'Failed to create invite',
                variant: 'destructive',
            });
        } finally {
            setIsInviting(false);
        }
    };

    // =============================================
    // Revoke Invite
    // =============================================

    const revokeInvite = async (inviteId: string) => {
        const { data, error } = await (supabase.rpc as Function)('revoke_invite_secure', {
            p_invite_id: inviteId,
        });

        const result = data as { status: string } | null;

        if (error || result?.status !== 'SUCCESS') {
            toast({ title: 'Failed to revoke', variant: 'destructive' });
        } else {
            setInvites(prev => prev.map(i =>
                i.id === inviteId ? { ...i, status: 'revoked' as InviteStatus } : i
            ));
            toast({ title: 'Invite revoked' });
        }
    };

    // =============================================
    // Copy Helpers
    // =============================================

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        toast({ title: `${label} copied!` });
    };

    // =============================================
    // Role Badge
    // =============================================

    const getRoleBadge = (role: UserRole) => {
        const colors: Record<UserRole, string> = {
            principal: 'bg-purple-500',
            accountant: 'bg-blue-500',
            cashier: 'bg-green-500',
            teacher: 'bg-orange-500',
        };
        return <Badge className={colors[role]}>{role}</Badge>;
    };

    const getStatusBadge = (status: InviteStatus) => {
        const config: Record<InviteStatus, { color: string; icon: React.ReactNode }> = {
            pending: { color: 'bg-yellow-500', icon: <Clock className="h-3 w-3" /> },
            accepted: { color: 'bg-green-500', icon: <CheckCircle className="h-3 w-3" /> },
            revoked: { color: 'bg-red-500', icon: <XCircle className="h-3 w-3" /> },
            expired: { color: 'bg-gray-500', icon: <AlertTriangle className="h-3 w-3" /> },
        };
        const { color, icon } = config[status];
        return (
            <Badge className={`${color} flex items-center gap-1`}>
                {icon}
                {status}
            </Badge>
        );
    };

    // =============================================
    // Render Guards
    // =============================================

    if (!currentSchool) {
        return <div className="p-8 text-center text-muted-foreground">Loading school data...</div>;
    }

    if (!isPrincipal) {
        return (
            <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Access Denied</AlertTitle>
                <AlertDescription>Only principals can manage team members.</AlertDescription>
            </Alert>
        );
    }

    // =============================================
    // Main Render
    // =============================================

    return (
        <div className="container mx-auto py-6 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Team Management</h1>
                    <p className="text-muted-foreground">Invite and manage staff members</p>
                </div>

                {/* Invite Dialog */}
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                    <DialogTrigger asChild>
                        <Button onClick={() => { setInviteResult(null); setDialogOpen(true); }}>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Invite Member
                        </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                        <DialogHeader>
                            <DialogTitle>Invite Team Member</DialogTitle>
                            <DialogDescription>
                                Send an invitation to join your school.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="email">Email Address</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder="colleague@school.edu"
                                    value={inviteEmail}
                                    onChange={(e) => setInviteEmail(e.target.value)}
                                    disabled={isInviting}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Role</Label>
                                {/* Role selector - using user_role enum values */}
                                <Select
                                    value={inviteRole}
                                    onValueChange={(v) => setInviteRole(v as UserRole)}
                                    disabled={isInviting}
                                >
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="accountant">Accountant (Finance)</SelectItem>
                                        <SelectItem value="cashier">Cashier (Fee Collection)</SelectItem>
                                        <SelectItem value="teacher">Teacher (Attendance)</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <Button
                                onClick={sendInvite}
                                disabled={!inviteEmail || isInviting}
                                className="w-full"
                            >
                                {isInviting ? (
                                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                ) : (
                                    <Mail className="h-4 w-4 mr-2" />
                                )}
                                Send Invite
                            </Button>

                            {/* Invite Result - TESTING ONLY */}
                            {/* TODO: Remove this section for production - send code via email instead */}
                            {inviteResult && inviteResult.status === 'SUCCESS' && (
                                <div className="mt-4 space-y-4">
                                    <div className="p-3 bg-muted rounded-md space-y-2">
                                        <Label className="text-sm font-semibold">1. Share this Link</Label>
                                        <div className="flex items-center gap-2">
                                            <Input value={inviteResult.link || ''} readOnly className="text-xs" />
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => copyToClipboard(inviteResult.link || '', 'Link')}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-md space-y-2">
                                        <Label className="text-sm font-semibold text-primary">
                                            2. Share this Security Code
                                        </Label>
                                        <div className="flex items-center gap-2">
                                            <div className="bg-background border rounded px-3 py-2 font-mono text-lg tracking-widest font-bold flex-1 text-center">
                                                {inviteResult.security_code}
                                            </div>
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() => copyToClipboard(inviteResult.security_code || '', 'Code')}
                                            >
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                            They will need this code to accept the invite.
                                        </p>
                                    </div>
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 max-w-[400px]">
                    <TabsTrigger value="activity">
                        <Activity className="mr-2 h-4 w-4" />
                        Activity
                    </TabsTrigger>
                    <TabsTrigger value="members">
                        <Users className="mr-2 h-4 w-4" />
                        Members ({members.length})
                    </TabsTrigger>
                    <TabsTrigger value="invites">
                        <Clock className="mr-2 h-4 w-4" />
                        Invites ({invites.filter(i => i.status === 'pending').length})
                    </TabsTrigger>
                </TabsList>

                {/* Members Tab */}
                <TabsContent value="members" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Current Team</CardTitle>
                            <CardDescription>Active members of your school.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            {isLoading ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-8 w-8 animate-spin" />
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Member</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Joined</TableHead>
                                            <TableHead>Status</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {members.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center text-muted-foreground p-8">
                                                    No members found.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            members.map((member) => (
                                                <TableRow key={member.member_id}>
                                                    <TableCell>
                                                        <span className="font-medium">{member.email || 'Unknown'}</span>
                                                    </TableCell>
                                                    <TableCell>{getRoleBadge(member.role)}</TableCell>
                                                    <TableCell>
                                                        {format(new Date(member.joined_at), 'MMM d, yyyy')}
                                                    </TableCell>
                                                    <TableCell>
                                                        <Badge variant={member.is_active ? 'default' : 'secondary'}>
                                                            {member.is_active ? 'Active' : 'Inactive'}
                                                        </Badge>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Invites Tab */}
                <TabsContent value="invites" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>All Invitations</CardTitle>
                            <CardDescription>Invitation history for your school.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Created</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invites.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                                                No invites found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        invites.map((invite) => (
                                            <TableRow key={invite.id}>
                                                <TableCell>{invite.email}</TableCell>
                                                <TableCell>{getRoleBadge(invite.role)}</TableCell>
                                                <TableCell>{getStatusBadge(invite.status)}</TableCell>
                                                <TableCell>
                                                    {format(new Date(invite.created_at), 'MMM d, yyyy')}
                                                </TableCell>
                                                <TableCell>
                                                    {format(new Date(invite.expires_at), 'MMM d, HH:mm')}
                                                </TableCell>
                                                <TableCell>
                                                    {invite.status === 'pending' && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-destructive hover:text-destructive/90"
                                                            onClick={() => revokeInvite(invite.id)}
                                                        >
                                                            <Trash2 className="h-4 w-4" />
                                                        </Button>
                                                    )}
                                                    {invite.status === 'accepted' && invite.accepted_by && (
                                                        <span className="text-xs text-green-600">
                                                            Accepted
                                                        </span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Activity Tab */}
                <TabsContent value="activity">
                    <Card>
                        <CardHeader>
                            <CardTitle>Login Activity</CardTitle>
                            <CardDescription>Recent staff logins.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Role</TableHead>
                                        <TableHead>User Email</TableHead>
                                        <TableHead>Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loginLogs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={3} className="text-center text-muted-foreground p-8">
                                                No recent activity recorded.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        loginLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell>{getRoleBadge(log.role as UserRole)}</TableCell>
                                                <TableCell className="font-mono text-xs">{log.email}</TableCell>
                                                <TableCell className="text-muted-foreground">
                                                    {format(new Date(log.created_at), 'MMM d, h:mm a')}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
