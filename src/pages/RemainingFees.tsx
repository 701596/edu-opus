import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import { Plus, Edit, Trash2, CreditCard, FolderOpen } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrency } from '@/contexts/CurrencyContext';

const feeFolderSchema = z.object({
  student_id: z.string().min(1, 'Student is required'),
  folder_name: z.string().min(1, 'Folder name is required'),
  category: z.string().min(1, 'Category is required'),
  amount_due: z.number().min(0, 'Amount due must be positive'),
  amount_paid: z.number().min(0, 'Amount paid must be positive').optional(),
  due_date: z.string().optional(),
  status: z.string().optional(),
});

type FeeFolder = z.infer<typeof feeFolderSchema> & { 
  id: string; 
  students?: { name: string };
  remaining_amount?: number;
};

const RemainingFees = () => {
  const [feeFolders, setFeeFolders] = useState<FeeFolder[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string; remaining_fee?: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingFeeFolder, setEditingFeeFolder] = useState<FeeFolder | null>(null);
  const [selectedFeeFolders, setSelectedFeeFolders] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const form = useForm<z.infer<typeof feeFolderSchema>>({
    resolver: zodResolver(feeFolderSchema),
    defaultValues: {
      student_id: '',
      folder_name: '',
      category: '',
      amount_due: 0,
      amount_paid: 0,
      due_date: '',
      status: 'pending',
    },
  });

  useEffect(() => {
    fetchFeeFolders();
    fetchStudents();
    
    // Real-time subscriptions
    const feeFoldersChannel = supabase
      .channel('fee-folders-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fee_folders' }, fetchFeeFolders)
      .subscribe();

    const paymentsChannel = supabase
      .channel('fee-folders-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchFeeFolders)
      .subscribe();

    const studentsChannel = supabase
      .channel('fee-folders-students')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, () => {
        fetchFeeFolders();
        fetchStudents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(feeFoldersChannel);
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(studentsChannel);
    };
  }, []);

  const fetchFeeFolders = async () => {
    try {
      const { data, error } = await supabase
        .from('fee_folders')
        .select(`
          *,
          students (
            name
          )
        `)
        .order('due_date', { ascending: true });

      if (error) throw error;
      
      // Calculate remaining amounts
      const foldersWithRemaining = (data || []).map(folder => ({
        ...folder,
        remaining_amount: Number(folder.amount_due) - (Number(folder.amount_paid) || 0)
      }));
      
      setFeeFolders(foldersWithRemaining);
    } catch (error) {
      console.error('Error fetching fee folders:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch fee folders',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name, remaining_fee')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  const onSubmit = async (data: z.infer<typeof feeFolderSchema>) => {
    try {
      const amountPaid = data.amount_paid || 0;
      const status = amountPaid >= data.amount_due ? 'paid' : amountPaid > 0 ? 'partial' : 'pending';
      
      if (editingFeeFolder) {
        const { error } = await supabase
          .from('fee_folders')
          .update({
            student_id: data.student_id,
            folder_name: data.folder_name,
            category: data.category,
            amount_due: data.amount_due,
            amount_paid: amountPaid,
            due_date: data.due_date || null,
            status,
          })
          .eq('id', editingFeeFolder.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Fee folder updated successfully' });
      } else {
        const { error } = await supabase
          .from('fee_folders')
          .insert([{
            student_id: data.student_id,
            folder_name: data.folder_name,
            category: data.category,
            amount_due: data.amount_due,
            amount_paid: amountPaid,
            due_date: data.due_date || null,
            status,
          }]);

        if (error) throw error;
        toast({ title: 'Success', description: 'Fee folder added successfully' });
      }

      setIsDialogOpen(false);
      setEditingFeeFolder(null);
      form.reset();
      fetchFeeFolders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const handleEdit = (feeFolder: FeeFolder) => {
    setEditingFeeFolder(feeFolder);
    form.reset({
      ...feeFolder,
      amount_due: Number(feeFolder.amount_due),
      amount_paid: Number(feeFolder.amount_paid) || 0,
      due_date: feeFolder.due_date || '',
    });
    setIsDialogOpen(true);
  };

  const deleteFeeFolder = async (id: string) => {
    try {
      const { error } = await supabase.from('fee_folders').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Fee folder deleted successfully' });
      fetchFeeFolders();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedFeeFolders.size === 0) {
      toast({ title: 'No Selection', description: 'Please select fee folders to delete', variant: 'destructive' });
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedFeeFolders.size} fee folder(s)?`)) return;

    try {
      const { error } = await supabase
        .from('fee_folders')
        .delete()
        .in('id', Array.from(selectedFeeFolders));

      if (error) throw error;
      toast({ title: 'Success', description: `Deleted ${selectedFeeFolders.size} fee folder(s) successfully` });
      setSelectedFeeFolders(new Set());
      fetchFeeFolders();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  };

  const toggleFeeFolderSelection = (id: string) => {
    const newSelection = new Set(selectedFeeFolders);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedFeeFolders(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedFeeFolders.size === feeFolders.length) {
      setSelectedFeeFolders(new Set());
    } else {
      setSelectedFeeFolders(new Set(feeFolders.map(f => f.id)));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this fee folder?')) return;

    try {
      const { error } = await supabase
        .from('fee_folders')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Fee folder deleted successfully' });
      fetchFeeFolders();
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete fee folder',
        variant: 'destructive',
      });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingFeeFolder(null);
      form.reset();
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
      case 'partial': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
      default: return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
    }
  };

  const totalRemaining = feeFolders.reduce((sum, folder) => sum + (folder.remaining_amount || 0), 0);
  const totalStudentRemainingFees = students.reduce((sum, student) => sum + Number(student.remaining_fee || 0), 0);

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
            <FolderOpen className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Remaining Fees
            </h1>
          </div>
          <p className="text-muted-foreground">Manage student fee folders and track outstanding payments</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Add Fee Folder
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingFeeFolder ? 'Edit Fee Folder' : 'Add New Fee Folder'}</DialogTitle>
              <DialogDescription>
                {editingFeeFolder ? 'Update fee folder details' : 'Create a new fee folder for a student'}
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="student_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Student</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a student" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {students.map((student) => (
                            <SelectItem key={student.id} value={student.id}>
                              {student.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="folder_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Folder Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter folder name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="school_fee">School Fee</SelectItem>
                          <SelectItem value="tuition">Tuition</SelectItem>
                          <SelectItem value="library">Library</SelectItem>
                          <SelectItem value="lab">Lab Fees</SelectItem>
                          <SelectItem value="sports">Sports</SelectItem>
                          <SelectItem value="transport">Transport</SelectItem>
                          <SelectItem value="exam">Exam Fees</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="amount_due"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount Due</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter amount" 
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
                    name="amount_paid"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Amount Paid</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter paid amount" 
                            {...field}
                            onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="due_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Due Date</FormLabel>
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
                    {editingFeeFolder ? 'Update' : 'Add'} Fee Folder
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Student Outstanding Fees</CardTitle>
            <CreditCard className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatAmount(totalStudentRemainingFees)}</div>
            <p className="text-xs text-muted-foreground">Total remaining across all students</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Fee Folders Outstanding</CardTitle>
            <FolderOpen className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">{formatAmount(totalRemaining)}</div>
            <p className="text-xs text-muted-foreground">Across {feeFolders.filter(f => f.remaining_amount! > 0).length} folders</p>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Fee Folders</CardTitle>
            {selectedFeeFolders.size > 0 && (
              <Button 
                variant="destructive" 
                size="sm"
                onClick={handleBulkDelete}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedFeeFolders.size})
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
                      checked={selectedFeeFolders.size === feeFolders.length && feeFolders.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Folder</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Amount Due</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Remaining</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {feeFolders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground">
                      No fee folders found
                    </TableCell>
                  </TableRow>
                ) : (
                  feeFolders.map((folder) => (
                    <TableRow key={folder.id}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedFeeFolders.has(folder.id)}
                          onCheckedChange={() => toggleFeeFolderSelection(folder.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {folder.students?.name || 'Unknown Student'}
                      </TableCell>
                      <TableCell>{folder.folder_name}</TableCell>
                      <TableCell className="capitalize">{folder.category}</TableCell>
                      <TableCell>{formatAmount(Number(folder.amount_due))}</TableCell>
                      <TableCell className="text-green-600">{formatAmount(Number(folder.amount_paid || 0))}</TableCell>
                      <TableCell className={folder.remaining_amount! > 0 ? 'text-destructive font-semibold' : 'text-green-600 font-semibold'}>
                        {formatAmount(folder.remaining_amount!)}
                      </TableCell>
                      <TableCell>
                        {folder.due_date ? new Date(folder.due_date).toLocaleDateString() : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(folder.status || 'pending')}>
                          {folder.status || 'pending'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(folder)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(folder.id)}
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

export default RemainingFees;