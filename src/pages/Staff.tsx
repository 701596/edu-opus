import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Briefcase, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrency } from '@/contexts/CurrencyContext';
import { StaffBatchImport } from '@/components/StaffBatchImport';
import { BulkEditStaff } from '@/components/BulkEditStaff';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

const ITEMS_PER_PAGE = 20;

const staffSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  position: z.string().min(1, 'Role is required'),
  salary: z.number().min(0, 'Salary must be positive'),
  salary_type: z.enum(['monthly', 'annually']),
  phone: z.string().min(10, 'Contact number is required'),
  join_date: z.string().min(1, 'Joining date is required'),
  email: z.string().email('Invalid email address').optional().or(z.literal('')),
  address: z.string().optional().or(z.literal('')),
  department: z.string().optional().or(z.literal('')),
});

type Staff = z.infer<typeof staffSchema> & {
  id: string;
  created_at?: string;
  updated_at?: string;
  name: string;
  salary: number;
  salary_type: string;
  position: string;
  last_active_at?: string;
  invite_used_code?: string;
  invite_used_type?: string;
};

const Staff = () => {
  const { user } = useAuth();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  // Pagination & Search state
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [totalCount, setTotalCount] = useState(0);

  const form = useForm<z.infer<typeof staffSchema>>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      name: '',
      position: '',
      salary: 0,
      salary_type: 'monthly',
      phone: '',
      join_date: new Date().toISOString().split('T')[0],
      email: '',
      address: '',
      department: '',
    },
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync URL params
  useEffect(() => {
    const params = new URLSearchParams();
    if (currentPage > 1) params.set('page', currentPage.toString());
    if (debouncedSearch) params.set('search', debouncedSearch);
    setSearchParams(params, { replace: true });
  }, [currentPage, debouncedSearch, setSearchParams]);

  const fetchStaff = useCallback(async () => {
    try {
      setLoading(true);
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Get total count
      let countQuery = supabase
        .from('staff')
        .select('id', { count: 'exact', head: true });

      if (debouncedSearch) {
        countQuery = countQuery.or(`name.ilike.%${debouncedSearch}%,position.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%,department.ilike.%${debouncedSearch}%`);
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotalCount(count || 0);

      // Fetch paginated data with explicit columns
      let query = supabase
        .from('staff')
        .select(`
          id,
          staff_id,
          name,
          position,
          salary,
          salary_type,
          phone,
          email,
          address,
          department,
          join_date,
          hire_date,
          expected_salary_expense,
          paid_salary,
          created_at,
          updated_at
        `)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (debouncedSearch) {
        query = query.or(`name.ilike.%${debouncedSearch}%,position.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%,department.ilike.%${debouncedSearch}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch activity data
      // We assume the user has a school_id in context, but since we are fetching staff, 
      // let's try to get the current school using a known method or pass it?
      // Actually, standard pattern in this app seems to be assuming RLS handles 'my school'.
      // But get_school_activity requires p_school_id. 
      // We'll fetch the user's current school ID via auth or query.
      // Better yet, let's fetch basic 'invitation info' via a generic RPC that uses auth.uid() context if needed,
      // but get_school_activity is safer.
      // For now, let's fetch the schools members for the current user's school.
      // Since we don't have 'currentSchoolId' easily here without context, checking local storage or auth.

      const currentSchoolId = localStorage.getItem('currentSchoolId');
      let activityMap: Record<string, any> = {};

      if (currentSchoolId) {
        // Use direct query instead of RPC
        const { data: activityData } = await supabase
          .from('school_members')
          .select('user_id, last_active_at')
          .eq('school_id', currentSchoolId)
          .eq('is_active', true);
        if (activityData) {
          activityData.forEach((item: any) => {
            if (item.user_id) activityMap[item.user_id] = item;
          });
        }
      }

      const mergedData = (data || []).map((s: any) => ({
        ...s,
        last_active_at: activityMap[s.email]?.last_active_at || null,
        invite_used_code: activityMap[s.email]?.invite_used_code || null,
        invite_used_type: activityMap[s.email]?.invite_used_type || null
      }));

      setStaff(mergedData as Staff[]);
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast({ title: 'Error', description: 'Failed to fetch staff', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, toast]);

  useEffect(() => {
    fetchStaff();

    const channel = supabase
      .channel('staff-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, fetchStaff)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchStaff]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const onSubmit = async (data: z.infer<typeof staffSchema>) => {
    if (!user) return;
    try {
      const payload = {
        staff_id: `STF-${Date.now()}`,
        name: data.name,
        position: data.position,
        salary: data.salary,
        salary_type: data.salary_type,
        phone: data.phone,
        join_date: data.join_date,
        email: data.email || null,
        address: data.address || null,
        department: data.department || null,
        hire_date: data.join_date,
        user_id: user.id,
      };

      if (editingStaff) {
        // Check for duplicates excluding current staff
        if (data.email) {
          const { data: existing } = await supabase
            .from('staff')
            .select('id')
            .eq('email', data.email)
            .neq('id', editingStaff.id)
            .maybeSingle();

          if (existing) {
            toast({ title: 'Error', description: 'A staff member with this email already exists in your account', variant: 'destructive' });
            return;
          }
        }

        const { error } = await supabase.from('staff').update(payload).eq('id', editingStaff.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Staff member updated successfully' });
      } else {
        // Check for duplicate email
        if (data.email) {
          const { data: existing } = await supabase
            .from('staff')
            .select('id')
            .eq('email', data.email)
            .maybeSingle();

          if (existing) {
            toast({ title: 'Error', description: 'A staff member with this email already exists in your account', variant: 'destructive' });
            return;
          }
        }

        const { error } = await supabase.from('staff').insert([payload]);
        if (error) throw error;
        toast({ title: 'Success', description: 'Staff member added successfully' });
      }

      setIsDialogOpen(false);
      setEditingStaff(null);
      form.reset();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleEdit = (staffMember: Staff) => {
    setEditingStaff(staffMember);
    form.reset({
      name: staffMember.name,
      position: staffMember.position,
      salary: Number(staffMember.salary),
      salary_type: staffMember.salary_type as 'monthly' | 'annually',
      phone: staffMember.phone || '',
      join_date: staffMember.join_date || new Date().toISOString().split('T')[0],
      email: staffMember.email || '',
      address: staffMember.address || '',
      department: staffMember.department || '',
    });
    setIsDialogOpen(true);
  };

  const handleBulkDelete = async () => {
    if (selectedStaff.size === 0) {
      toast({ title: 'No Selection', description: 'Please select staff to delete', variant: 'destructive' });
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedStaff.size} staff member(s)?`)) return;

    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .in('id', Array.from(selectedStaff));

      if (error) throw error;
      toast({ title: 'Success', description: `Deleted ${selectedStaff.size} staff member(s) successfully` });
      setSelectedStaff(new Set());
      fetchStaff();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const toggleStaffSelection = (id: string) => {
    const newSelection = new Set(selectedStaff);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedStaff(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedStaff.size === staff.length) {
      setSelectedStaff(new Set());
    } else {
      setSelectedStaff(new Set(staff.map(s => s.id)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;
    try {
      const { error } = await supabase.from('staff').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Staff member deleted successfully' });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete staff member';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingStaff(null);
      form.reset();
    }
  };

  if (loading && staff.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Briefcase className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Staff
            </h1>
          </div>
          <p className="text-muted-foreground">Manage staff members and employees</p>
        </div>
        <div className="flex gap-2">
          <BulkEditStaff staff={staff} onEditComplete={fetchStaff} />
          <StaffBatchImport onImportComplete={fetchStaff} />
          <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Add Staff
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto animate-in fade-in-0 zoom-in-95 duration-300">
              <DialogHeader>
                <DialogTitle className="animate-in slide-in-from-top-2 duration-300">
                  {editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}
                </DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 animate-in slide-in-from-bottom-2 duration-500">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Staff Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter staff name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Role</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter role (e.g., Teacher, Admin)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="salary"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Salary Amount</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Enter salary amount"
                              {...field}
                              onChange={(e) => field.onChange(Number(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="salary_type"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Salary Type</FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select salary type" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="annually">Annually</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Contact Number</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter contact number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="join_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Joining Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
                      {editingStaff ? 'Update' : 'Add'} Staff
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
        <Input
          placeholder="Search by name, role, phone, or department..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <CardTitle>Staff List</CardTitle>
              <span className="text-sm text-muted-foreground">
                Showing {staff.length} of {totalCount} staff members
              </span>
            </div>
            {selectedStaff.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedStaff.size})
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">
                    <Checkbox
                      checked={selectedStaff.size === staff.length && staff.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Salary Amount</TableHead>
                  <TableHead>Salary Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Joined Via</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground">
                      {debouncedSearch ? 'No staff members match your search' : 'No staff members found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((staffMember) => {
                    // Determine status
                    const now = new Date();
                    const lastActive = staffMember.last_active_at ? new Date(staffMember.last_active_at) : null;
                    const isOnline = lastActive && (now.getTime() - lastActive.getTime() < 5 * 60 * 1000); // 5 mins threshold

                    return (
                      <TableRow key={staffMember.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedStaff.has(staffMember.id)}
                            onCheckedChange={() => toggleStaffSelection(staffMember.id)}
                          />
                        </TableCell>
                        <TableCell className="font-medium">{staffMember.name}</TableCell>
                        <TableCell>{staffMember.position}</TableCell>
                        <TableCell>{staffMember.phone || '-'}</TableCell>
                        <TableCell className="font-semibold text-primary">
                          {formatAmount(Number(staffMember.salary))}
                        </TableCell>
                        <TableCell className="capitalize">{staffMember.salary_type}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-300'}`} />
                            <span className="text-sm text-muted-foreground">
                              {isOnline ? 'Online' : 'Offline'}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {staffMember.invite_used_code || '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button variant="outline" size="sm" onClick={() => handleEdit(staffMember)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDelete(staffMember.id)}
                              className="text-destructive hover:text-destructive"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t">
              <div className="text-sm text-muted-foreground">
                Page {currentPage} of {totalPages}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                >
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Staff;
