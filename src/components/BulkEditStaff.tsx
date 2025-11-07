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

interface BulkEditStaffMember {
  id: string;
  name: string;
  salary: number;
  salary_type: string;
  position: string;
}

interface BulkEditStaffProps {
  staff: BulkEditStaffMember[];
  onEditComplete: () => void;
}

export const BulkEditStaff = ({ staff, onEditComplete }: BulkEditStaffProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [updating, setUpdating] = useState(false);
  const [salary, setSalary] = useState<number | ''>('');
  const [salaryType, setSalaryType] = useState<string>('');
  const { toast } = useToast();

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedStaff(new Set(staff.map(s => s.id)));
    } else {
      setSelectedStaff(new Set());
    }
  };

  const handleSelectStaff = (staffId: string, checked: boolean) => {
    const newSelected = new Set(selectedStaff);
    if (checked) {
      newSelected.add(staffId);
    } else {
      newSelected.delete(staffId);
    }
    setSelectedStaff(newSelected);
  };

  const handleBulkUpdate = async () => {
    if (selectedStaff.size === 0) {
      toast({ title: 'Error', description: 'Please select at least one staff member', variant: 'destructive' });
      return;
    }

    if (!salary && !salaryType) {
      toast({ title: 'Error', description: 'Please specify at least one field to update', variant: 'destructive' });
      return;
    }

    setUpdating(true);

    try {
      const updates: any = {};
      if (salary) updates.salary = salary;
      if (salaryType) updates.salary_type = salaryType;

      const { error } = await supabase
        .from('staff')
        .update(updates)
        .in('id', Array.from(selectedStaff));

      if (error) throw error;

      setUpdating(false);
      setIsOpen(false);
      setSelectedStaff(new Set());
      setSalary('');
      setSalaryType('');
      onEditComplete();

      toast({
        title: 'Success',
        description: `Updated ${selectedStaff.size} staff member(s) successfully`
      });
    } catch (error: any) {
      setUpdating(false);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update staff',
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
          <DialogTitle>Bulk Edit Staff</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">Select Staff Members</h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="select-all-staff"
                checked={selectedStaff.size === staff.length && staff.length > 0}
                onCheckedChange={handleSelectAll}
              />
              <label htmlFor="select-all-staff" className="text-sm font-medium">
                Select All ({staff.length})
              </label>
            </div>
            <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-2">
              {staff.map((staffMember) => (
                <div key={staffMember.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={staffMember.id}
                    checked={selectedStaff.has(staffMember.id)}
                    onCheckedChange={(checked) => handleSelectStaff(staffMember.id, checked as boolean)}
                  />
                  <label htmlFor={staffMember.id} className="text-sm flex-1">
                    {staffMember.name} ({staffMember.position}) - Current: {staffMember.salary} ({staffMember.salary_type})
                  </label>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold">Update Fields</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="bulk-salary">Salary Amount</Label>
                <Input
                  id="bulk-salary"
                  type="number"
                  placeholder="Leave empty to keep current"
                  value={salary}
                  onChange={(e) => setSalary(e.target.value ? Number(e.target.value) : '')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="bulk-salary-type">Salary Type</Label>
                <Select value={salaryType} onValueChange={setSalaryType}>
                  <SelectTrigger id="bulk-salary-type">
                    <SelectValue placeholder="Leave empty to keep current" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button variant="outline" onClick={() => setIsOpen(false)} disabled={updating}>
              Cancel
            </Button>
            <Button onClick={handleBulkUpdate} disabled={updating}>
              {updating ? 'Updating...' : `Update ${selectedStaff.size} Staff Member(s)`}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
