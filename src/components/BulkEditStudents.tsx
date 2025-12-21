import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface BulkEditStudent {
  id: string;
  name?: string;
  fee_amount?: number;
  fee_type?: string;
  payment_status?: string;
  class?: string;
  join_date?: string;
}

interface BulkEditStudentsProps {
  students: BulkEditStudent[];
  onEditComplete: () => void;
}

export const BulkEditStudents = ({ students, onEditComplete }: BulkEditStudentsProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [feeAmount, setFeeAmount] = useState<number | ''>('');
  const [feeType, setFeeType] = useState<string>('');
  const [joinDate, setJoinDate] = useState<string>('');
  const { toast } = useToast();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStudents(new Set(students.map(s => s.id)));
    } else {
      setSelectedStudents(new Set());
    }
  };

  const handleSelectStudent = (studentId: string, checked: boolean) => {
    const newSelected = new Set(selectedStudents);
    if (checked) {
      newSelected.add(studentId);
    } else {
      newSelected.delete(studentId);
    }
    setSelectedStudents(newSelected);
  };

  const handleBulkUpdate = async () => {
    if (selectedStudents.size === 0) {
      toast({ title: 'Error', description: 'Please select at least one student', variant: 'destructive' });
      return;
    }

    if (!feeAmount && !feeType && !joinDate) {
      toast({ title: 'Error', description: 'Please specify at least one field to update', variant: 'destructive' });
      return;
    }

    setUpdating(true);

    try {
      const updates: any = {};
      if (feeAmount) updates.fee_amount = feeAmount;
      if (feeType) updates.fee_type = feeType;
      if (joinDate) updates.join_date = joinDate;

      // Update all selected students
      const selectedStudentsList = Array.from(selectedStudents);

      for (const studentId of selectedStudentsList) {
        const { error } = await supabase
          .from('students')
          .update(updates)
          .eq('id', studentId);

        if (error) throw error;
      }

      setUpdating(false);
      setIsOpen(false);
      setSelectedStudents(new Set());
      setFeeAmount('');
      setFeeType('');
      setJoinDate('');

      toast({
        title: 'Success',
        description: `Updated ${selectedStudentsList.length} student(s). Fees recalculated automatically.`
      });

      // Trigger refresh after a brief delay to ensure real-time updates have propagated
      setTimeout(() => {
        onEditComplete();
      }, 300);
    } catch (error: any) {
      setUpdating(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update students',
        variant: 'destructive'
      });
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Edit2 className="w-4 h-4 mr-2" />
          Bulk Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk Edit Students</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">Select Students</h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all"
                checked={selectedStudents.size === students.length && students.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all" className="text-sm font-medium">
                Select All ({students.length})
              </label>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
              {students.map((student) => (
                <div key={student.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={student.id}
                    checked={selectedStudents.has(student.id)}
                    onCheckedChange={(checked) => handleSelectStudent(student.id, checked as boolean)}
                  />
                  <label htmlFor={student.id} className="text-sm flex-1">
                    {student.name} - Current: {student.fee_amount} ({student.fee_type})
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Update Fields</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-fee-amount">Fee Amount</Label>
                <Input
                  id="bulk-fee-amount"
                  type="number"
                  placeholder="Leave empty to keep current"
                  value={feeAmount}
                  onChange={(e) => setFeeAmount(e.target.value ? Number(e.target.value) : '')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-fee-type">Fee Type</Label>
                <Select value={feeType} onValueChange={setFeeType}>
                  <SelectTrigger id="bulk-fee-type">
                    <SelectValue placeholder="Leave empty to keep current" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-join-date">Joining Date</Label>
                <Input
                  id="bulk-join-date"
                  type="date"
                  placeholder="Leave empty to keep current"
                  value={joinDate}
                  onChange={(e) => setJoinDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={updating}>
              Cancel
            </Button>
            <Button onClick={handleBulkUpdate} disabled={updating}>
              {updating ? 'Recalculating fees...' : `Update ${selectedStudents.size} Student(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
