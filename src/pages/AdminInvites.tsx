/**
 * Admin Invite Panel
 * 
 * Principal-only interface for inviting staff members.
 */

import { useState, useEffect } from 'react';
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
    CircleUser,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useRole, UserRole } from '@/contexts/RoleContext';
import { useToast } from '@/hooks/use-toast';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';

// =============================================
// Types
// =============================================

interface SchoolMember {
    member_id: string;
    user_id: string;
    role: UserRole;
    is_active: boolean;
    joined_at: string;
    email?: string;
    security_code?: string;
    code_expires_at?: string;
}

interface PendingInvite {
    id: string;
    email: string;
    role: UserRole;
    expires_at: string;
    created_at: string;
}

interface LoginLog {
    id: string;
    email: string;
    role: string;
    created_at: string;
}

// =============================================
// Component
// =============================================

export default function AdminInvites() {
    const { user, signOut } = useAuth();
    const { currentSchool, isPrincipal } = useRole();
    const { toast } = useToast();
    const navigate = useNavigate();

    const [members, setMembers] = useState<SchoolMember[]>([]);
    const [invites, setInvites] = useState<PendingInvite[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [inviteEmail, setInviteEmail] = useState('');
    const [inviteRole, setInviteRole] = useState<UserRole>('teacher');
    const [isInviting, setIsInviting] = useState(false);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [securityCode, setSecurityCode] = useState<string | null>(null);
    const [ownerId, setOwnerId] = useState<string | null>(null);
    const [loginLogs, setLoginLogs] = useState<LoginLog[]>([]);
    const [activeTab, setActiveTab] = useState("activity");

    // Fetch members and invites
    useEffect(() => {
        async function fetchData() {
            if (!currentSchool) return;

            // Fetch school details to get owner_id
            const { data: schoolData } = await (supabase as any)
                .from('schools')
                .select('owner_id')
                .eq('id', currentSchool.school_id)
                .single();

            if (schoolData) setOwnerId(schoolData.owner_id);

            // Fetch members using extended RPC
            const { data: membersData, error: membersError } = await supabase.rpc('get_school_members_extended' as any, {
                p_school_id: currentSchool.school_id
            });

            if (membersError) {
                console.error('Members fetch error:', membersError);
                toast({ title: 'Error fetching members', description: membersError.message, variant: 'destructive' });
            }

            // Fetch pending invites
            const { data: invitesData } = await supabase.rpc('get_school_invites' as any, {
                p_school_id: currentSchool.school_id,
            });

            // Fetch login logs
            const { data: logsData } = await (supabase as any)
                .from('login_logs')
                .select('*')
                .eq('school_id', currentSchool.school_id)
                .order('created_at', { ascending: false })
                .limit(20);

            setMembers(membersData || []);
            setInvites(invitesData || []);
            setLoginLogs(logsData || []);
            setIsLoading(false);
        }

        fetchData();

        // Realtime Subscription
        if (currentSchool) {
            const channel = supabase
                .channel('admin_dashboard_changes')
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'school_members',
                        filter: `school_id=eq.${currentSchool.school_id}`,
                    },
                    (payload) => {
                        console.log('Realtime update:', payload);
                        fetchData(); // Refresh data on any change
                    }
                )
                .subscribe();

            return () => {
                supabase.removeChannel(channel);
            };
        }
    }, [currentSchool]);

    // Send invite
    const sendInvite = async () => {
        if (!inviteEmail || !currentSchool) return;

        setIsInviting(true);
        try {
            const { data, error } = await supabase.rpc('create_school_invite' as any, {
                p_school_id: currentSchool.school_id,
                p_email: inviteEmail,
                p_role: inviteRole,
                p_expires_hours: 72,
            });

            if (error) throw error;

            // Generate invite link
            const token = data[0]?.token;
            const code = data[0]?.security_code;

            const link = `${window.location.origin}/invite/${token}`;
            setInviteLink(link);
            setSecurityCode(code);

            toast({
                title: 'Invite Sent',
                description: `Invitation sent to ${inviteEmail}`,
            });

            // Refresh invites
            const { data: newInvites } = await supabase.rpc('get_school_invites' as any, {
                p_school_id: currentSchool.school_id,
            });
            setInvites(newInvites || []);
            setInviteEmail('');
        } catch (error: any) {
            toast({
                title: 'Invite Failed',
                description: error.message,
                variant: 'destructive',
            });
        } finally {
            setIsInviting(false);
        }
    };

    // Revoke invite
    const revokeInvite = async (inviteId: string) => {
        const { error } = await supabase.rpc('revoke_school_invite' as any, {
            p_invite_id: inviteId,
        });

        if (error) {
            toast({ title: 'Failed to revoke', variant: 'destructive' });
        } else {
            setInvites(prev => prev.filter(i => i.id !== inviteId));
            toast({ title: 'Invite revoked' });
        }
    };

    // Copy invite link
    const copyLink = () => {
        if (inviteLink) {
            navigator.clipboard.writeText(inviteLink);
            toast({ title: 'Link copied!' });
        }
    };

    // Role badge color
    const getRoleBadge = (role: UserRole) => {
        const colors: Record<UserRole, string> = {
            principal: 'bg-purple-500',
            accountant: 'bg-blue-500',
            cashier: 'bg-green-500',
            teacher: 'bg-orange-500',
        };
        return <Badge className={colors[role]}>{role}</Badge>;
    };

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

    return (
        <div className="container mx-auto py-6 px-4 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Team Management</h1>
                    <p className="text-muted-foreground">Invite and manage staff members</p>
                </div>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button>
                            <UserPlus className="h-4 w-4 mr-2" />
                            Invite Member
                        </Button>
                    </DialogTrigger>
                    <DialogContent>
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
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="role">Role</Label>
                                <Select value={inviteRole} onValueChange={(v) => setInviteRole(v as UserRole)}>
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
                            <Button onClick={sendInvite} disabled={!inviteEmail || isInviting} className="w-full">
                                {isInviting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Mail className="h-4 w-4 mr-2" />}
                                Send Invite
                            </Button>

                            {inviteLink && (
                                <div className="mt-4 space-y-4">
                                    <div className="p-3 bg-muted rounded-md space-y-2">
                                        <Label className="text-sm font-semibold">1. Share this Link</Label>
                                        <div className="flex items-center gap-2">
                                            <Input value={inviteLink} readOnly className="text-xs" />
                                            <Button size="sm" variant="outline" onClick={copyLink}>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>

                                    {securityCode && (
                                        <div className="p-3 bg-primary/10 border border-primary/20 rounded-md space-y-2">
                                            <Label className="text-sm font-semibold text-primary">2. Share this Security Code</Label>
                                            <div className="flex items-center gap-2">
                                                <div className="bg-background border rounded px-3 py-2 font-mono text-lg tracking-widest font-bold flex-1 text-center">
                                                    {securityCode}
                                                </div>
                                                <Button size="sm" variant="outline" onClick={() => {
                                                    navigator.clipboard.writeText(securityCode);
                                                    toast({ description: 'Security code copied' });
                                                }}>
                                                    <Copy className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                They will need this code to accept the invite.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

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
                    <TabsTrigger value="pending">
                        <Clock className="mr-2 h-4 w-4" />
                        Pending ({invites.length})
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="members" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Current Team</CardTitle>
                            <CardDescription>Active members of your school.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Member & Role</TableHead>
                                        <TableHead>Security Code</TableHead>
                                        <TableHead>Joined</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {members.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground p-8">
                                                No members found or access denied.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        members.map((member) => (
                                            <TableRow key={member.member_id}>
                                                <TableCell>
                                                    <div className="flex flex-col">
                                                        <span className="font-medium text-sm">{member.email || 'No email'}</span>
                                                        <span className="text-xs text-muted-foreground">{getRoleBadge(member.role)}</span>
                                                    </div>
                                                    {member.user_id === ownerId && (
                                                        <Badge variant="outline" className="ml-2 mt-1">Owner</Badge>
                                                    )}
                                                </TableCell>
                                                <TableCell className="font-mono text-xs text-muted-foreground">
                                                    {member.security_code ? (
                                                        <div className="flex items-center space-x-2 bg-muted p-1 rounded">
                                                            <span className="tracking-widest font-bold">{member.security_code}</span>
                                                            <Button variant="ghost" size="icon" className="h-4 w-4" onClick={() => {
                                                                navigator.clipboard.writeText(member.security_code!);
                                                                toast({ title: 'Copied code' });
                                                            }}>
                                                                <Copy className="h-3 w-3" />
                                                            </Button>
                                                        </div>
                                                    ) : (
                                                        <span className="italic text-muted-foreground">No code</span>
                                                    )}
                                                </TableCell>
                                                <TableCell>{format(new Date(member.joined_at), 'MMM d, yyyy')}</TableCell>
                                                <TableCell>
                                                    <Badge variant={member.is_active ? 'default' : 'secondary'}>
                                                        {member.is_active ? 'Active' : 'Deactivated'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {member.user_id !== ownerId && member.user_id !== user?.id && (
                                                        <div className="flex space-x-1">
                                                            <Dialog>
                                                                <DialogTrigger asChild>
                                                                    <Button variant="ghost" size="sm">
                                                                        <CircleUser className="h-4 w-4" />
                                                                    </Button>
                                                                </DialogTrigger>
                                                                <DialogContent>
                                                                    <DialogHeader>
                                                                        <DialogTitle>Edit Role</DialogTitle>
                                                                        <DialogDescription>Change role for this member.</DialogDescription>
                                                                    </DialogHeader>
                                                                    <div className="space-y-4 pt-4">
                                                                        <Select
                                                                            defaultValue={member.role}
                                                                            onValueChange={(val) => {
                                                                                supabase.rpc('update_member_role' as any, {
                                                                                    p_member_id: member.member_id,
                                                                                    p_new_role: val
                                                                                }).then(({ error }) => {
                                                                                    if (!error) {
                                                                                        toast({ title: 'Role updated' });
                                                                                        window.location.reload();
                                                                                    }
                                                                                });
                                                                            }}
                                                                        >
                                                                            <SelectTrigger><SelectValue /></SelectTrigger>
                                                                            <SelectContent>
                                                                                <SelectItem value="principal">Principal</SelectItem>
                                                                                <SelectItem value="accountant">Accountant</SelectItem>
                                                                                <SelectItem value="cashier">Cashier</SelectItem>
                                                                                <SelectItem value="teacher">Teacher</SelectItem>
                                                                            </SelectContent>
                                                                        </Select>
                                                                    </div>
                                                                </DialogContent>
                                                            </Dialog>

                                                            {member.security_code && (
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    title="Deactivate Security Code"
                                                                    onClick={async () => {
                                                                        if (!confirm('Deactivate this security code? The user will need a new invite to login via code.')) return;
                                                                        const { error } = await supabase.rpc('deactivate_member_code' as any, { p_member_id: member.member_id });
                                                                        if (!error) {
                                                                            toast({ title: 'Code deactivated' });
                                                                            setMembers(prev => prev.map(m => m.member_id === member.member_id ? { ...m, security_code: undefined } : m));
                                                                        }
                                                                    }}
                                                                >
                                                                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                                                                </Button>
                                                            )}

                                                            <Button
                                                                variant="ghost"
                                                                size="sm"
                                                                className="text-destructive"
                                                                onClick={async () => {
                                                                    if (!confirm('Are you sure you want to remove this member?')) return;
                                                                    const { error } = await supabase.rpc('remove_member' as any, { p_member_id: member.member_id });
                                                                    if (!error) {
                                                                        setMembers(prev => prev.filter(m => m.member_id !== member.member_id));
                                                                        toast({ title: 'Member removed' });
                                                                    }
                                                                }}
                                                            >
                                                                <Trash2 className="h-4 w-4" />
                                                            </Button>
                                                        </div>
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

                <TabsContent value="pending" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Pending Invites</CardTitle>
                            <CardDescription>Invitations sent but not yet accepted.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Role</TableHead>
                                        <TableHead>Sent</TableHead>
                                        <TableHead>Expires</TableHead>
                                        <TableHead>Actions</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {invites.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center text-muted-foreground">
                                                No pending invites
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        invites.map((invite) => (
                                            <TableRow key={invite.id}>
                                                <TableCell>{invite.email}</TableCell>
                                                <TableCell>{getRoleBadge(invite.role)}</TableCell>
                                                <TableCell>{format(new Date(invite.created_at), 'MMM d, yyyy')}</TableCell>
                                                <TableCell>{format(new Date(invite.expires_at), 'MMM d, HH:mm')}</TableCell>
                                                <TableCell>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-destructive hover:text-destructive/90"
                                                        onClick={() => revokeInvite(invite.id)}
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

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
        </div >
    );
}
