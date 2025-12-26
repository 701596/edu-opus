import { useState, useEffect } from "react";
import { useRole } from "@/contexts/RoleContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { CreateStaffDialog } from "@/components/CreateStaffDialog";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { Users, Shield, Trash2, Loader2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface StaffMember {
    staff_id: string;
    staff_name: string;
    staff_email: string;
    staff_role: string;
    staff_joined_at: string;
}

const Admin = () => {
    const { currentSchool, isPrincipal } = useRole();
    const [staffList, setStaffList] = useState<StaffMember[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    const fetchStaff = async () => {
        if (!currentSchool?.school_id) return;

        try {
            setLoading(true);
            const { data, error } = await supabase.rpc('get_staff_list', {
                p_school_id: currentSchool.school_id
            });

            if (error) throw error;
            setStaffList((data as any) || []);
        } catch (err) {
            console.error("Error fetching staff:", err);
            toast.error("Failed to load staff list");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStaff();
    }, [currentSchool?.school_id]);

    const handleDelete = async () => {
        if (!deleteId || !currentSchool?.school_id) return;

        setIsDeleting(true);
        try {
            const { data, error } = await supabase.functions.invoke('delete-staff-user', {
                body: {
                    target_user_id: deleteId,
                    school_id: currentSchool.school_id
                }
            });

            if (error) throw error;
            if (!data.ok) throw new Error(data.error || "Failed to delete staff");

            toast.success("Staff member deleted successfully");
            setDeleteId(null);
            fetchStaff(); // Refresh list
        } catch (err: any) {
            console.error("Delete error:", err);
            toast.error(err.message || "Failed to delete staff member");
        } finally {
            setIsDeleting(false);
        }
    };

    const getRoleBadge = (role: string) => {
        switch (role) {
            case "admin":
                return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200 border-none"><Shield className="w-3 h-3 mr-1" /> Admin</Badge>;
            case "finance":
                return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 border-none">Finance</Badge>;
            case "teacher":
                return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200 border-none">Teacher</Badge>;
            default:
                return <Badge variant="outline">{role}</Badge>;
        }
    };

    if (!isPrincipal) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground animate-in fade-in">
                <Shield className="w-12 h-12 text-destructive/50 mb-4" />
                <h2 className="text-xl font-semibold text-foreground">Access Restricted</h2>
                <p>Only Principals can access the Admin Dashboard.</p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in p-6 max-w-7xl mx-auto">
            {/* Header Section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-6">
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-primary/10 rounded-lg">
                            <Shield className="w-6 h-6 text-primary" />
                        </div>
                        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
                    </div>
                    <p className="text-muted-foreground pl-12 text-sm">
                        Manage staff access, roles, and school settings
                    </p>
                </div>
                <CreateStaffDialog onSuccess={fetchStaff} />
            </div>

            {/* Staff Card */}
            <Card className="border-none shadow-sm bg-card/50 backdrop-blur-sm">
                <CardHeader className="bg-card/50 border-b px-6 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-muted-foreground" />
                            <div>
                                <CardTitle className="text-lg">Staff Directory</CardTitle>
                                <CardDescription className="text-xs">
                                    {staffList.length} active member{staffList.length !== 1 ? 's' : ''}
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow className="hover:bg-transparent border-b bg-muted/40">
                                    <TableHead className="w-[30%] pl-6">Name</TableHead>
                                    <TableHead className="w-[30%]">Email</TableHead>
                                    <TableHead className="w-[15%]">Role</TableHead>
                                    <TableHead className="w-[15%]">Joined</TableHead>
                                    <TableHead className="w-[10%] text-right pr-6">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    [...Array(3)].map((_, i) => (
                                        <TableRow key={i}>
                                            <TableCell colSpan={5} className="py-4">
                                                <div className="h-6 bg-muted rounded animate-pulse w-full max-w-[800px] mx-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ))
                                ) : staffList.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="py-12 text-center">
                                            <div className="flex flex-col items-center justify-center text-muted-foreground gap-2">
                                                <Users className="w-8 h-8 opacity-20" />
                                                <p>No staff members found</p>
                                                <Button variant="link" size="sm" className="h-auto p-0">
                                                    Invite your first staff member
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ) : (
                                    staffList.map((staff) => (
                                        <TableRow key={staff.staff_id} className="group hover:bg-muted/30 transition-colors">
                                            <TableCell className="pl-6 font-medium">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold ring-1 ring-primary/20">
                                                        {staff.staff_name.charAt(0).toUpperCase()}
                                                    </div>
                                                    {staff.staff_name}
                                                </div>
                                            </TableCell>
                                            <TableCell className="text-muted-foreground">{staff.staff_email}</TableCell>
                                            <TableCell>{getRoleBadge(staff.staff_role)}</TableCell>
                                            <TableCell className="text-muted-foreground text-sm">
                                                {format(new Date(staff.staff_joined_at), "MMM d, yyyy")}
                                            </TableCell>
                                            <TableCell className="text-right pr-6">
                                                {staff.staff_role !== 'principal' && (
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => setDeleteId(staff.staff_id)}
                                                        className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100"
                                                        title="Delete Staff Account"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    ))
                                )}
                            </TableBody>
                        </Table>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertCircle className="w-5 h-5" />
                            Delete Staff Account
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete this staff member?
                            <br /><br />
                            <span className="font-medium text-foreground block mb-1">
                                Warning: This action cannot be undone.
                            </span>
                            They will immediately lose access to the school dashboard and their account data will be removed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                handleDelete();
                            }}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            disabled={isDeleting}
                        >
                            {isDeleting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                            Delete Account
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default Admin;
