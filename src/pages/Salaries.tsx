import { useState, useEffect } from 'react';
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
import { Plus, Edit, Trash2 } from 'lucide-react';

const salarySchema = z.object({
  staff_id: z.string().min(1, 'Staff member is required'),
  amount: z.number().min(0, 'Amount must be positive'),
  pay_period_start: z.string().min(1, 'Pay period start is required'),
  pay_period_end: z.string().min(1, 'Pay period end is required'),
  payment_date: z.string().min(1, 'Payment date is required'),
  bonus: z.number().min(0, 'Bonus must be positive').optional(),
  deductions: z.number().min(0, 'Deductions must be positive').optional(),
  net_amount: z.number().min(0, 'Net amount must be positive'),
});

type Salary = z.infer<typeof salarySchema> & { id: string; staff?: { name: string } };

const Salaries = () => {
  const [salaries, setSalaries] = useState<Salary[]>([]);
  const [staff, setStaff] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSalary, setEditingSalary] = useState<Salary | null>(null);
  const { toast } = useToast();

  const form = useForm<z.infer<typeof salarySchema>>({
    resolver: zodResolver(salarySchema),
    defaultValues: {
      staff_id: '',
      amount: 0,
      pay_period_start: '',
      pay_period_end: '',
      payment_date: new Date().toISOString().split('T')[0],
      bonus: 0,
      deductions: 0,
      net_amount: 0,
    },
  });

  const watchedFields = form.watch(['amount', 'bonus', 'deductions']);

  useEffect(() => {
    const [amount, bonus, deductions] = watchedFields;
    const netAmount = (amount || 0) + (bonus || 0) - (deductions || 0);
    form.setValue('net_amount', Math.max(0, netAmount));
  }, [watchedFields, form]);

  useEffect(() => {
    fetchSalaries();
    fetchStaff();
  }, []);

  const fetchSalaries = async () => {
    try {
      const { data, error } = await supabase
        .from('salaries')
        .select(`
          *,
          staff (
            name
          )
        `)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      setSalaries(data || []);
    } catch (error) {
      console.error('Error fetching salaries:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch salaries',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStaff = async () => {
    try {
      const { data, error } = await supabase
        .from('staff')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setStaff(data || []);
    } catch (error) {
      console.error('Error fetching staff:', error);
    }
  };

  const onSubmit = async (data: z.infer<typeof salarySchema>) => {
    try {
      if (editingSalary) {
        const { error } = await supabase
          .from('salaries')
          .update({
            staff_id: data.staff_id,
            amount: data.amount,
            pay_period_start: data.pay_period_start,
            pay_period_end: data.pay_period_end,
            payment_date: data.payment_date,
            bonus: data.bonus || 0,
            deductions: data.deductions || 0,
            net_amount: data.net_amount,
          })
          .eq('id', editingSalary.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Salary updated successfully' });
      } else {
        const { error } = await supabase
          .from('salaries')
          .insert([{
            staff_id: data.staff_id,
            amount: data.amount,
            pay_period_start: data.pay_period_start,
            pay_period_end: data.pay_period_end,
            payment_date: data.payment_date,
            bonus: data.bonus || 0,
            deductions: data.deductions || 0,
            net_amount: data.net_amount,
          }]);

        if (error) throw error;
        toast({ title: 'Success', description: 'Salary added successfully' });
      }

      setIsDialogOpen(false);
      setEditingSalary(null);
      form.reset();
      fetchSalaries();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (salary: Salary) => {
    setEditingSalary(salary);
    form.reset({
      ...salary,
      amount: Number(salary.amount),
      bonus: Number(salary.bonus) || 0,
      deductions: Number(salary.deductions) || 0,
      net_amount: Number(salary.net_amount),
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this salary record?')) return;

    try {
      const { error } = await supabase
        .from('salaries')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Salary record deleted successfully' });
      fetchSalaries();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete salary record',
        variant: 'destructive',
      });
    }
  };

  const handleDialogClose = () => {
    setIsDialogOpen(false);
    setEditingSalary(null);
    form.reset();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Salaries</h1>
          <p className="text-muted-foreground">Manage staff salary payments</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Add Salary
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingSalary ? 'Edit Salary' : 'Add New Salary'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="staff_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Staff Member</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a staff member" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {staff.map((member) => (
                            <SelectItem key={member.id} value={member.id}>
                              {member.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Base Amount</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter base amount" 
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
                    name="payment_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Date</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="pay_period_start"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pay Period Start</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="pay_period_end"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Pay Period End</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="bonus"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bonus</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter bonus" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="deductions"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Deductions</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter deductions" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="net_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Net Amount</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            {...field}
                            readOnly
                            className="bg-muted"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={handleDialogClose}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
                    {editingSalary ? 'Update' : 'Add'} Salary
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-gradient-to-br from-card to-accent/5 border-0 shadow-card">
        <CardHeader>
          <CardTitle>Salaries List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Staff Member</TableHead>
                  <TableHead>Pay Period</TableHead>
                  <TableHead>Base Amount</TableHead>
                  <TableHead>Bonus</TableHead>
                  <TableHead>Deductions</TableHead>
                  <TableHead>Net Amount</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {salaries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground">
                      No salary records found
                    </TableCell>
                  </TableRow>
                ) : (
                  salaries.map((salary) => (
                    <TableRow key={salary.id}>
                      <TableCell className="font-medium">
                        {salary.staff?.name || 'Unknown Staff'}
                      </TableCell>
                      <TableCell>
                        {new Date(salary.pay_period_start).toLocaleDateString()} - {new Date(salary.pay_period_end).toLocaleDateString()}
                      </TableCell>
                      <TableCell>${Number(salary.amount).toFixed(2)}</TableCell>
                      <TableCell>${Number(salary.bonus || 0).toFixed(2)}</TableCell>
                      <TableCell>${Number(salary.deductions || 0).toFixed(2)}</TableCell>
                      <TableCell className="font-medium">${Number(salary.net_amount).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(salary)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(salary.id)}
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

export default Salaries;