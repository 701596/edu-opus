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
import { Plus, Edit, Trash2, Wallet, Download, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useCurrency } from '@/contexts/CurrencyContext';
import { downloadReceipt } from '@/lib/receiptGenerator';
import { PaymentBatchImport } from '@/components/PaymentBatchImport';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { StudentSearchSelect } from '@/components/ui/StudentSearchSelect';

const ITEMS_PER_PAGE = 20;

const paymentSchema = z.object({
  student_id: z.string().min(1, 'Student is required'),
  amount: z.number().min(0, 'Amount must be positive'),
  payment_date: z.string().min(1, 'Payment date is required'),
  payment_method: z.string().min(1, 'Payment method is required'),
  category: z.string().min(1, 'Category is required'),
  currency: z.string().default('USD'),
});

type Payment = {
  id: string;
  student_id: string;
  amount: number;
  currency: string;
  payment_date: string;
  payment_method: string;
  category: string;
  description?: string;
  receipt_number?: string;
  created_at: string;
  students?: { name: string };
};

const Payments = () => {
  const { user } = useAuth();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [selectedPayments, setSelectedPayments] = useState<Set<string>>(new Set());
  const { toast } = useToast();
  const { formatAmount, currency } = useCurrency();

  // Pagination & Search state
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [totalCount, setTotalCount] = useState(0);

  const form = useForm<z.infer<typeof paymentSchema>>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      student_id: '',
      amount: 0,
      payment_date: new Date().toISOString().split('T')[0],
      payment_method: 'cash',
      category: 'school_fee',
      currency: 'USD',
    },
  });

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setCurrentPage(1); // Reset to page 1 on new search
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

  // Fetch payments with pagination and search
  const fetchPayments = useCallback(async () => {
    try {
      setLoading(true);
      const from = (currentPage - 1) * ITEMS_PER_PAGE;
      const to = from + ITEMS_PER_PAGE - 1;

      // Get total count first
      let countQuery = supabase
        .from('payments')
        .select('*', { count: 'exact', head: true });

      if (debouncedSearch) {
        countQuery = countQuery.textSearch('search_vector', debouncedSearch.split(' ').join(' & '));
      }

      const { count, error: countError } = await countQuery;
      if (countError) throw countError;
      setTotalCount(count || 0);

      // Fetch paginated data
      let query = supabase
        .from('payments')
        .select(`
          id,
          student_id,
          amount,
          currency,
          payment_date,
          payment_method,
          category,
          description,
          receipt_number,
          created_at,
          students!payments_student_id_fkey (
            name
          )
        `)
        .order('created_at', { ascending: false })
        .range(from, to);

      if (debouncedSearch) {
        query = query.textSearch('search_vector', debouncedSearch.split(' ').join(' & '));
      }

      const { data, error } = await query;
      if (error) throw error;
      setPayments(data || []);
    } catch (error) {
      console.error('Error fetching payments:', error);
      toast({
        title: 'Error',
        description: 'Failed to fetch payments',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [currentPage, debouncedSearch, toast]);

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setStudents(data || []);
    } catch (error) {
      console.error('Error fetching students:', error);
    }
  };

  useEffect(() => {
    fetchPayments();
    fetchStudents();

    // Real-time subscription
    const channel = supabase
      .channel('payments-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => {
          fetchPayments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchPayments]);

  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };

  const onSubmit = async (data: z.infer<typeof paymentSchema>) => {
    if (!user) return;
    try {
      const receiptNumber = `PAY-${Date.now()}`;

      // Check for duplicate receipt number (only for new payments)
      if (!editingPayment) {
        const { data: existing } = await supabase
          .from('payments')
          .select('id')
          .eq('receipt_number', receiptNumber)
          .maybeSingle();

        if (existing) {
          toast({ title: 'Error', description: 'A payment with this receipt number already exists', variant: 'destructive' });
          return;
        }
      }

      const payload = {
        student_id: data.student_id,
        amount: data.amount,
        payment_date: data.payment_date,
        payment_method: data.payment_method,
        category: data.category,
        currency: currency.code,
        receipt_number: receiptNumber,
        user_id: user.id,
      };

      if (editingPayment) {
        const { error } = await supabase
          .from('payments')
          .update(payload)
          .eq('id', editingPayment.id);

        if (error) throw error;
        toast({ title: 'Success', description: 'Payment updated successfully' });
      } else {
        // Add payment
        const { error: paymentError } = await supabase
          .from('payments')
          .insert([payload]);

        if (paymentError) throw paymentError;

        // Generate and download receipt
        const student = students.find(s => s.id === data.student_id);
        if (student) {
          downloadReceipt({
            receiptNumber,
            studentName: student.name,
            amount: data.amount,
            paymentDate: data.payment_date,
            paymentMethod: data.payment_method,
            currency: currency.code,
            description: `School Fee Payment`,
          });
        }

        // Update fee folder - find pending fee folders and update them
        const { data: feeFolders } = await supabase
          .from('fee_folders')
          .select('id, amount_paid, amount_due')
          .eq('student_id', data.student_id)
          .neq('status', 'paid')
          .order('due_date', { ascending: true })
          .limit(1);

        if (feeFolders && feeFolders.length > 0) {
          const folder = feeFolders[0];
          const newAmountPaid = Number(folder.amount_paid || 0) + data.amount;
          const amountDue = Number(folder.amount_due);
          const newStatus = newAmountPaid >= amountDue ? 'paid' : newAmountPaid > 0 ? 'partial' : 'pending';

          await supabase
            .from('fee_folders')
            .update({
              amount_paid: newAmountPaid,
              status: newStatus,
            })
            .eq('id', folder.id);
        }

        toast({ title: 'Success', description: 'Payment added and fees updated successfully' });
      }

      setIsDialogOpen(false);
      setEditingPayment(null);
      form.reset({
        student_id: '',
        amount: 0,
        payment_date: new Date().toISOString().split('T')[0],
        payment_method: 'cash',
        category: 'school_fee',
        currency: currency.code,
      });
      fetchPayments();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selectedPayments.size === 0) {
      toast({ title: 'No Selection', description: 'Please select payments to delete', variant: 'destructive' });
      return;
    }

    if (!confirm(`Are you sure you want to delete ${selectedPayments.size} payment(s)?`)) return;

    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .in('id', Array.from(selectedPayments));

      if (error) throw error;
      toast({ title: 'Success', description: `Deleted ${selectedPayments.size} payment(s) successfully` });
      setSelectedPayments(new Set());
      fetchPayments();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'An error occurred';
      toast({ title: 'Error', description: errorMessage, variant: 'destructive' });
    }
  };

  const togglePaymentSelection = (id: string) => {
    const newSelection = new Set(selectedPayments);
    if (newSelection.has(id)) {
      newSelection.delete(id);
    } else {
      newSelection.add(id);
    }
    setSelectedPayments(newSelection);
  };

  const toggleSelectAll = () => {
    if (selectedPayments.size === payments.length) {
      setSelectedPayments(new Set());
    } else {
      setSelectedPayments(new Set(payments.map(p => p.id)));
    }
  };

  const handleEdit = (payment: Payment) => {
    setEditingPayment(payment);
    form.reset({
      student_id: payment.student_id,
      amount: Number(payment.amount),
      payment_date: payment.payment_date,
      payment_method: payment.payment_method,
      category: payment.category || 'school_fee',
      currency: payment.currency || 'USD',
    });
    setIsDialogOpen(true);
  };

  const handleDownloadReceipt = (payment: Payment) => {
    const student = students.find(s => s.id === payment.student_id);
    if (student) {
      downloadReceipt({
        receiptNumber: payment.receipt_number || `PAY-${payment.id.substring(0, 8)}`,
        studentName: student.name,
        amount: Number(payment.amount),
        paymentDate: payment.payment_date,
        paymentMethod: payment.payment_method,
        currency: payment.currency || 'USD',
        description: payment.description || 'School Fee Payment',
      });
      toast({ title: 'Success', description: 'Receipt downloaded successfully' });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this payment?')) return;

    try {
      const { error } = await supabase
        .from('payments')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast({ title: 'Success', description: 'Payment deleted successfully' });
      fetchPayments();
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to delete payment';
      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingPayment(null);
      form.reset();
    }
  };

  if (loading && payments.length === 0) {
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
            <Wallet className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Payments
            </h1>
          </div>
          <p className="text-muted-foreground">Track student fee payments</p>
        </div>
        <div className="flex gap-2">
          <PaymentBatchImport onImportComplete={fetchPayments} />
          <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
                <Plus className="w-4 h-4 mr-2" />
                Add Payment
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{editingPayment ? 'Edit Payment' : 'Add New Payment'}</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="student_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Select Student</FormLabel>
                        <FormControl>
                          <StudentSearchSelect
                            value={field.value}
                            onChange={(id) => field.onChange(id)}
                            placeholder="Search for a student..."
                          />
                        </FormControl>
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
                          <FormLabel>Amount Paid</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Enter amount paid"
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
                          <FormLabel>Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="payment_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Payment Method</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select payment method" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="cash">Cash</SelectItem>
                            <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                            <SelectItem value="check">Check</SelectItem>
                            <SelectItem value="online">Online Payment</SelectItem>
                          </SelectContent>
                        </Select>
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
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="school_fee">School Fee</SelectItem>
                            <SelectItem value="transportation_fee">Transportation Fee</SelectItem>
                            <SelectItem value="admission_fee">Admission Fee</SelectItem>
                            <SelectItem value="tuition">Tuition</SelectItem>
                            <SelectItem value="library">Library Fee</SelectItem>
                            <SelectItem value="lab">Lab Fee</SelectItem>
                            <SelectItem value="sports">Sports Fee</SelectItem>
                            <SelectItem value="exam">Exam Fee</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex justify-end space-x-2 pt-4">
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
                      {editingPayment ? 'Update' : 'Add'} Payment
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
          placeholder="Search payments (student, receipt, method...)"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <CardTitle>Payments List</CardTitle>
              <span className="text-sm text-muted-foreground">
                Showing {payments.length} of {totalCount} payments
              </span>
            </div>
            {selectedPayments.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={handleBulkDelete}
                className="gap-2"
              >
                <Trash2 className="h-4 w-4" />
                Delete ({selectedPayments.size})
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
                      checked={selectedPayments.size === payments.length && payments.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Amount Paid</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Receipt</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {debouncedSearch ? 'No payments match your search' : 'No payments found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  payments.map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedPayments.has(payment.id)}
                          onCheckedChange={() => togglePaymentSelection(payment.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {payment.students?.name || 'Unknown Student'}
                      </TableCell>
                      <TableCell className="font-semibold text-primary">{formatAmount(Number(payment.amount))}</TableCell>
                      <TableCell className="capitalize">
                        {(payment.category || 'school_fee').replace(/_/g, ' ')}
                      </TableCell>
                      <TableCell className="capitalize">{payment.payment_method.replace('_', ' ')}</TableCell>
                      <TableCell>{new Date(payment.payment_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDownloadReceipt(payment)}
                          className="text-primary hover:text-primary"
                        >
                          <Download className="w-4 h-4 mr-1" />
                          Download
                        </Button>
                      </TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(payment)}
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(payment.id)}
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

export default Payments;