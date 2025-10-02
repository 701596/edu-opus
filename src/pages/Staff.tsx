import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, Briefcase } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

const staffSchema = z.object({
  staff_id: z.string().min(1, 'Staff ID is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  position: z.string().min(1, 'Position is required'),
  department: z.string().optional(),
  hire_date: z.string().min(1, 'Hire date is required'),
  salary: z.number().min(0, 'Salary must be positive'),
});

type Staff = z.infer<typeof staffSchema> & { id: string };

const Staff = () => {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const form = useForm<z.infer<typeof staffSchema>>({
    resolver: zodResolver(staffSchema),
    defaultValues: {
      staff_id: '',
      name: '',
      email: '',
      phone: '',
      address: '',
      position: '',
      department: '',
      hire_date: new Date().toISOString().split('T')[0],
      salary: 0,
    },
  });

  useEffect(() => {
    fetchStaff();
    
    // Real-time subscription
    const channel = supabase
      .channel('staff-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'staff',
        },
        () => {
          fetchStaff();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch staff',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: z.infer<typeof staffSchema>) => {
    try {
      if (editingStaff) {
        const { error } = await supabase
          .from('staff')
          .update({
            staff_id: data.staff_id,
            name: data.name,
            email: data.email || null,
            phone: data.phone || null,
            address: data.address || null,
            position: data.position,
            department: data.department || null,
            hire_date: data.hire_date,
            salary: data.salary,
          })
          .eq('id', editingStaff.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Staff member updated successfully' });
      } else {
        const { error } = await supabase
          .from('staff')
          .insert([{
            staff_id: data.staff_id,
            name: data.name,
            email: data.email || null,
            phone: data.phone || null,
            address: data.address || null,
            position: data.position,
            department: data.department || null,
            hire_date: data.hire_date,
            salary: data.salary,
          }]);

        if (error) throw error;
        toast({ title: 'Success', description: 'Staff member added successfully' });
      }

      setIsDialogOpen(false);
      setEditingStaff(null);
      form.reset();
      fetchStaff();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (staffMember: Staff) => {
    setEditingStaff(staffMember);
    form.reset({
      ...staffMember,
      email: staffMember.email || '',
      phone: staffMember.phone || '',
      address: staffMember.address || '',
      department: staffMember.department || '',
      salary: Number(staffMember.salary),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this staff member?')) return;

    try {
      const { error } = await supabase
        .from('staff')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Staff member deleted successfully' });
      fetchStaff();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete staff member',
        variant: 'destructive',
      });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingStaff(null);
      form.reset();
    }
  };

  if (loading) {
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
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Add Staff
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingStaff ? 'Edit Staff Member' : 'Add New Staff Member'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="staff_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Staff ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter staff ID" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter full name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="Enter email" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter phone number" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="position"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Position</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter position" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Department</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter department" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Address</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="hire_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hire Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="salary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Salary</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter salary" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value))}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
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

      <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
        <CardHeader>
          <CardTitle>Staff List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Position</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Salary</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No staff members found
                    </TableCell>
                  </TableRow>
                ) : (
                  staff.map((staffMember) => (
                    <TableRow key={staffMember.id}>
                      <TableCell className="font-medium">{staffMember.staff_id}</TableCell>
                      <TableCell>{staffMember.name}</TableCell>
                      <TableCell>{staffMember.position}</TableCell>
                      <TableCell>{staffMember.department || '-'}</TableCell>
                      <TableCell className="font-semibold text-primary">{formatAmount(Number(staffMember.salary))}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(staffMember)}
                          >
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
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Staff;