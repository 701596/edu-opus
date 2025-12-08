import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/hooks/useAuth';

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export const StaffBatchImport = ({ onImportComplete }: { onImportComplete: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const { toast } = useToast();
  const { user } = useAuth();

  const downloadTemplate = () => {
    const template = [
      {
        name: 'John Smith',
        position: 'Teacher',
        salary: 50000,
        salary_type: 'monthly',
        phone: '1234567890',
        join_date: '2024-01-01',
        email: 'john.smith@example.com',
        address: '123 Main St',
        department: 'Mathematics'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Staff Template');
    XLSX.writeFile(wb, 'staff_import_template.xlsx');

    toast({ title: 'Success', description: 'Template downloaded successfully' });
  };

  const validateRow = (row: any): { valid: boolean; error?: string } => {
    if (!row.name || row.name.trim().length < 2) {
      return { valid: false, error: 'Name must be at least 2 characters' };
    }
    if (!row.position || row.position.trim().length < 1) {
      return { valid: false, error: 'Position/Role is required' };
    }
    if (!row.salary || isNaN(Number(row.salary)) || Number(row.salary) < 0) {
      return { valid: false, error: 'Valid salary is required' };
    }
    if (!['monthly', 'annually'].includes(row.salary_type)) {
      return { valid: false, error: 'Salary type must be "monthly" or "annually"' };
    }
    if (!row.phone || row.phone.trim().length < 10) {
      return { valid: false, error: 'Contact number is required (min 10 characters)' };
    }
    if (!row.join_date) {
      return { valid: false, error: 'Joining date is required' };
    }
    if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    return { valid: true };
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setResult(null);
    setProgress(0);

    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      let parsedData: any[] = [];

      if (fileExtension === 'csv') {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: true,
          complete: async (results) => {
            parsedData = results.data;
            await processImport(parsedData);
          },
          error: (error) => {
            toast({ title: 'Error', description: `CSV parsing error: ${error.message}`, variant: 'destructive' });
            setImporting(false);
          }
        });
      } else if (['xlsx', 'xls'].includes(fileExtension || '')) {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedData = XLSX.utils.sheet_to_json(firstSheet);
        await processImport(parsedData);
      } else {
        toast({ title: 'Error', description: 'Please upload a CSV or Excel file', variant: 'destructive' });
        setImporting(false);
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
      setImporting(false);
    }
  };

  const processImport = async (data: any[]) => {
    const results: ImportResult = { success: 0, failed: 0, errors: [] };
    const total = data.length;

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      setProgress(Math.round(((i + 1) / total) * 100));

      const validation = validateRow(row);
      if (!validation.valid) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${validation.error}`);
        continue;
      }

      try {
        // Check for duplicate email
        if (row.email && row.email.trim()) {
          const { data: existing } = await supabase
            .from('staff')
            .select('id')
            .eq('email', row.email.trim())
            .maybeSingle();

          if (existing) {
            results.failed++;
            results.errors.push(`Row ${i + 1}: Staff member with email ${row.email} already exists in your account`);
            continue;
          }
        }

        const payload = {
          staff_id: `STF-${Date.now()}-${i}`,
          name: row.name.trim(),
          position: row.position.trim(),
          salary: Number(row.salary),
          salary_type: row.salary_type,
          phone: row.phone.trim(),
          join_date: row.join_date,
          hire_date: row.join_date,
          email: row.email?.trim() || null,
          address: row.address?.trim() || null,
          department: row.department?.trim() || null,
          user_id: user!.id,
        };

        const { error } = await supabase.from('staff').insert([payload]);

        if (error) throw error;
        results.success++;
      } catch (error: any) {
        results.failed++;
        results.errors.push(`Row ${i + 1}: ${error.message}`);
      }
    }

    setResult(results);
    setImporting(false);
    setProgress(100);

    if (results.success > 0) {
      onImportComplete();
      toast({ 
        title: 'Import Complete', 
        description: `Successfully imported ${results.success} staff member(s)` 
      });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
    setProgress(0);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" />
          Import Staff
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Batch Import Staff</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              Upload a CSV or Excel file with staff data. Download the template below to see the required format.
            </AlertDescription>
          </Alert>

          <Button onClick={downloadTemplate} variant="outline" className="w-full gap-2">
            <Download className="w-4 h-4" />
            Download Template
          </Button>

          <div className="border-2 border-dashed rounded-lg p-6 text-center">
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={importing}
              className="cursor-pointer"
            />
            <p className="text-sm text-muted-foreground mt-2">
              Supported formats: CSV, Excel (.xlsx, .xls)
            </p>
          </div>

          {importing && (
            <div className="space-y-2">
              <Progress value={progress} />
              <p className="text-sm text-center text-muted-foreground">
                Importing... {progress}%
              </p>
            </div>
          )}

          {result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <Alert className="border-green-500/50">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    <div className="font-semibold">Success: {result.success}</div>
                  </AlertDescription>
                </Alert>
                <Alert className="border-destructive/50">
                  <AlertCircle className="h-4 w-4 text-destructive" />
                  <AlertDescription>
                    <div className="font-semibold">Failed: {result.failed}</div>
                  </AlertDescription>
                </Alert>
              </div>

              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  <p className="font-semibold text-sm">Errors:</p>
                  {result.errors.map((error, idx) => (
                    <p key={idx} className="text-xs text-destructive">{error}</p>
                  ))}
                </div>
              )}

              <Button onClick={handleClose} className="w-full">
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
