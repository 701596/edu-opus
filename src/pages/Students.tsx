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
import { Plus, Edit, Trash2, Users } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

const studentSchema = z.object({
  student_id: z.string().min(1, 'Student ID is required'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  date_of_birth: z.string().optional(),
  guardian_name: z.string().optional(),
  guardian_phone: z.string().optional(),
  enrollment_date: z.string().min(1, 'Enrollment date is required'),
  fee_amount: z.number().min(0, 'Fee amount must be positive'),
  fee_type: z.enum(['monthly', 'annually']),
});

type Student = z.infer<typeof studentSchema> & { 
  id: string;
  created_at?: string;
  updated_at?: string;
};

const Students = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const { toast } = useToast();
  const { formatAmount } = useCurrency();

  const form = useForm<z.infer<typeof studentSchema>>({
    resolver: zodResolver(studentSchema),
    defaultValues: {
      student_id: '',
      name: '',
      email: '',
      phone: '',
      address: '',
      date_of_birth: '',
      guardian_name: '',
      guardian_phone: '',
      enrollment_date: new Date().toISOString().split('T')[0],
      fee_amount: 0,
      fee_type: 'monthly',
    },
  });

  useEffect(() => {
    fetchStudents();
    
    const channel = supabase
      .channel('students-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, fetchStudents)
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchStudents = async () => {
    try {
      const { data, error } = await supabase
        .from('students')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setStudents((data || []) as Student[]);
    } catch (error) {
      console.error('Error fetching students:', error);
      toast({ title: 'Error', description: 'Failed to fetch students', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: z.infer<typeof studentSchema>) => {
    try {
      const payload = {
        student_id: data.student_id,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        date_of_birth: data.date_of_birth || null,
        guardian_name: data.guardian_name || null,
        guardian_phone: data.guardian_phone || null,
        enrollment_date: data.enrollment_date,
        fee_amount: data.fee_amount,
        fee_type: data.fee_type,
      };

      if (editingStudent) {
        const { error } = await supabase.from('students').update(payload).eq('id', editingStudent.id);
        if (error) throw error;
        toast({ title: 'Success', description: 'Student updated successfully' });
      } else {
        const { error } = await supabase.from('students').insert([payload]);
        if (error) throw error;
        toast({ title: 'Success', description: 'Student added successfully' });
      }

      setIsDialogOpen(false);
      setEditingStudent(null);
      form.reset();
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'An error occurred', variant: 'destructive' });
    }
  };

  const handleEdit = (student: Student) => {
    setEditingStudent(student);
    form.reset({
      ...student,
      email: student.email || '',
      phone: student.phone || '',
      address: student.address || '',
      date_of_birth: student.date_of_birth || '',
      guardian_name: student.guardian_name || '',
      guardian_phone: student.guardian_phone || '',
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this student?')) return;
    try {
      const { error } = await supabase.from('students').delete().eq('id', id);
      if (error) throw error;
      toast({ title: 'Success', description: 'Student deleted successfully' });
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to delete student', variant: 'destructive' });
    }
  };

  const handleDialogChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingStudent(null);
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
            <Users className="w-8 h-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
              Students
            </h1>
          </div>
          <p className="text-muted-foreground">Manage student enrollment and information</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogChange}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
              <Plus className="w-4 h-4 mr-2" />
              Add Student
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingStudent ? 'Edit Student' : 'Add New Student'}</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="student_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Student ID</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter student ID" {...field} />
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
                    name="date_of_birth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Date of Birth</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="enrollment_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enrollment Date</FormLabel>
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
                    name="guardian_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Guardian Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter guardian name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="guardian_phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Guardian Phone</FormLabel>
                        <FormControl>
                          <Input placeholder="Enter guardian phone" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="fee_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fee Amount</FormLabel>
                        <FormControl>
                          <Input 
                            type="number" 
                            placeholder="Enter fee amount" 
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
                    name="fee_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Fee Type</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select fee type" />
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
                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-gradient-to-r from-primary to-primary-glow hover:opacity-90">
                    {editingStudent ? 'Update' : 'Add'} Student
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
        <CardHeader>
          <CardTitle>Students List</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Fee Amount</TableHead>
                  <TableHead>Fee Type</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {students.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No students found
                    </TableCell>
                  </TableRow>
                ) : (
                  students.map((student) => (
                    <TableRow key={student.id}>
                      <TableCell className="font-medium">{student.student_id}</TableCell>
                      <TableCell>{student.name}</TableCell>
                      <TableCell>{student.email || '-'}</TableCell>
                      <TableCell className="font-semibold text-primary">
                        {formatAmount(Number(student.fee_amount || 0))}
                      </TableCell>
                      <TableCell className="capitalize">{student.fee_type}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm" onClick={() => handleEdit(student)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(student.id)}
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

export default Students;
