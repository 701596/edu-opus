import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Copy, Check, Mail, Key } from "lucide-react";
import { useRole } from "@/contexts/RoleContext";

const AdminInvites = () => {
    const { currentSchool } = useRole();
    const schoolId = currentSchool?.school_id;
    const [loading, setLoading] = useState(false);

    // Active Staff State
    const [activeStaff, setActiveStaff] = useState<any[]>([]);
    const [loadingStaff, setLoadingStaff] = useState(false);

    // Fetch Active Staff
    const fetchActiveStaff = async () => {
        if (!schoolId) return;
        setLoadingStaff(true);
        try {
            // Use direct query instead of RPC
            const { data, error } = await supabase
                .from('school_members')
                .select('user_id, role, is_active, joined_at, last_active_at, invite_used_type, invite_used_code')
                .eq('school_id', schoolId)
                .eq('is_active', true);
            
            if (error) throw error;
            setActiveStaff(data || []);
        } catch (error: any) {
            console.error(error);
            toast.error("Failed to load active staff");
        } finally {
            setLoadingStaff(false);
        }
    };


    // Email Invite State
    const [email, setEmail] = useState("");
    const [emailRole, setEmailRole] = useState("teacher");
    const [generatedLink, setGeneratedLink] = useState("");

    // Code Invite State
    const [codeRole, setCodeRole] = useState("teacher");
    const [generatedCode, setGeneratedCode] = useState("");

    const handleCopy = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success("Copied to clipboard!");
        } catch (err) {
            toast.error("Failed to copy");
        }
    };

    const createEmailInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schoolId) return toast.error("No school selected");

        setLoading(true);
        setGeneratedLink("");

        try {
            // Call edge function instead of RPC
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-invite`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        school_id: schoolId,
                        email,
                        role: emailRole
                    })
                }
            );

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            setGeneratedLink(result.invite_link);
            toast.success("Invitation link generated!");

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    const createCodeInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!schoolId) return toast.error("No school selected");

        setLoading(true);
        setGeneratedCode("");

        try {
            // Call edge function instead of RPC
            const { data: { session } } = await supabase.auth.getSession();
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-staff-invite`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${session?.access_token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        school_id: schoolId,
                        role: codeRole
                    })
                }
            );

            const result = await response.json();
            if (!response.ok) throw new Error(result.error);

            setGeneratedCode(result.code || 'CODE');
            toast.success("Invitation code generated!");

        } catch (error: any) {
            toast.error(error.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="container mx-auto p-6 max-w-4xl space-y-8">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Staff Invitations</h1>
                <p className="text-muted-foreground mt-2">
                    Invite teachers and staff members to join your school.
                </p>
            </div>

            <Tabs defaultValue="email" className="w-full" onValueChange={(val) => {
                if (val === 'active') fetchActiveStaff();
            }}>
                <TabsList className="grid w-full grid-cols-3 lg:w-[600px]">
                    <TabsTrigger value="email">
                        <Mail className="w-4 h-4 mr-2" />
                        Email Invite
                    </TabsTrigger>
                    <TabsTrigger value="code">
                        <Key className="w-4 h-4 mr-2" />
                        Manual Code
                    </TabsTrigger>
                    <TabsTrigger value="active">
                        <div className="flex items-center gap-2">
                            <span>Active Staff</span>
                        </div>
                    </TabsTrigger>
                </TabsList>

                {/* Email Invite Tab */}
                <TabsContent value="email" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Send Email Invitation</CardTitle>
                            <CardDescription>
                                Generate a secure link for a staff member. The link expires in 7 days.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={createEmailInvite} className="space-y-4">
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Staff Email</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            placeholder="teacher@school.edu"
                                            value={email}
                                            onChange={(e) => setEmail(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="role">Role</Label>
                                        <Select value={emailRole} onValueChange={setEmailRole}>
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="teacher">Teacher</SelectItem>
                                                <SelectItem value="accountant">Accountant</SelectItem>
                                                <SelectItem value="cashier">Cashier</SelectItem>
                                                <SelectItem value="principal">Principal</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </div>

                                {generatedLink ? (
                                    <div className="p-4 bg-muted/50 rounded-lg border space-y-2 animate-in fade-in">
                                        <Label className="text-xs text-muted-foreground uppercase opacity-70">Invitation Link</Label>
                                        <div className="flex items-center gap-2">
                                            <code className="flex-1 p-2 bg-background rounded border text-sm break-all">
                                                {generatedLink}
                                            </code>
                                            <Button type="button" size="icon" variant="outline" onClick={() => handleCopy(generatedLink)}>
                                                <Copy className="h-4 w-4" />
                                            </Button>
                                        </div>
                                        <p className="text-xs text-green-600 flex items-center mt-2">
                                            <Check className="w-3 h-3 mr-1" />
                                            Ready to share
                                        </p>
                                    </div>
                                ) : (
                                    <Button type="submit" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Generate Link"}
                                    </Button>
                                )}
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Code Invite Tab */}
                <TabsContent value="code" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Generate Invitation Code</CardTitle>
                            <CardDescription>
                                Create a short, one-time code for staff who can't receive emails.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={createCodeInvite} className="space-y-4">
                                <div className="space-y-2">
                                    <Label htmlFor="code-role">Role</Label>
                                    <Select value={codeRole} onValueChange={setCodeRole}>
                                        <SelectTrigger className="w-[200px]">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="teacher">Teacher</SelectItem>
                                            <SelectItem value="accountant">Accountant</SelectItem>
                                            <SelectItem value="cashier">Cashier</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {generatedCode ? (
                                    <div className="p-6 bg-muted/50 rounded-lg border text-center space-y-4 animate-in fade-in">
                                        <Label className="text-sm text-muted-foreground uppercase tracking-widest">One-Time Code</Label>
                                        <div className="text-4xl font-mono font-bold tracking-widest text-primary selection:bg-primary selection:text-primary-foreground">
                                            {generatedCode}
                                        </div>
                                        <Button type="button" variant="outline" size="sm" onClick={() => handleCopy(generatedCode)}>
                                            <Copy className="h-3 w-3 mr-2" />
                                            Copy Code
                                        </Button>
                                        <p className="text-xs text-muted-foreground">Expires in 7 days</p>
                                    </div>
                                ) : (
                                    <Button type="submit" disabled={loading}>
                                        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Generate Code"}
                                    </Button>
                                )}
                            </form>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Active Staff Tab */}
                <TabsContent value="active" className="mt-6">
                    <Card>
                        <CardHeader>
                            <CardTitle>Active Staff Members</CardTitle>
                            <CardDescription>
                                View all users with access to your school, their roles, and invite history.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            {loadingStaff ? (
                                <div className="flex justify-center p-8">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                </div>
                            ) : (
                                <div className="rounded-md border">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-muted/50 text-muted-foreground font-medium">
                                            <tr>
                                                <th className="p-3">User ID</th>
                                                <th className="p-3">Role</th>
                                                <th className="p-3">Status</th>
                                                <th className="p-3">Joined Via</th>
                                                <th className="p-3">Used Code</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {activeStaff.length === 0 ? (
                                                <tr>
                                                    <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                                        No active staff members found.
                                                    </td>
                                                </tr>
                                            ) : (
                                                activeStaff.map((staff: any) => {
                                                    const now = new Date();
                                                    const lastActive = staff.last_active_at ? new Date(staff.last_active_at) : null;
                                                    const isOnline = lastActive && (now.getTime() - lastActive.getTime() < 5 * 60 * 1000);

                                                    return (
                                                        <tr key={staff.user_id} className="border-t">
                                                            <td className="p-3 font-medium text-xs">{staff.user_id?.slice(0, 8)}...</td>
                                                            <td className="p-3 capitalize">
                                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                                                    {staff.role}
                                                                </span>
                                                            </td>
                                                            <td className="p-3">
                                                                <div className="flex items-center gap-2">
                                                                    <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                                                                    <span className="text-muted-foreground text-xs">
                                                                        {isOnline ? 'Online' : 'Offline'}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="p-3 capitalize text-muted-foreground">
                                                                {staff.invite_used_type || 'Direct'}
                                                            </td>
                                                            <td className="p-3 font-mono text-xs">
                                                                {staff.invite_used_code || '-'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default AdminInvites;
