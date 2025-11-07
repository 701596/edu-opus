import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { useCurrency } from '@/contexts/CurrencyContext';

interface PaymentBatchImportProps {
  onImportComplete: () => void;
}

export const PaymentBatchImport = ({ onImportComplete }: PaymentBatchImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();
  const { currency } = useCurrency();

  const downloadTemplate = () => {
    const template = [
      {
        student_id: 'UUID of student',
        amount: '1000',
        payment_date: '2025-01-15',
        payment_method: 'cash',
        description: 'School fee payment'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Payments Template');
    XLSX.writeFile(wb, 'payments_template.xlsx');

    toast({ title: 'Success', description: 'Template downloaded successfully' });
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);

    try {
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      let parsedData: any[] = [];

      if (fileExtension === 'csv') {
        Papa.parse(file, {
          header: true,
          complete: async (results) => {
            parsedData = results.data;
            await processPayments(parsedData);
          },
          error: (error) => {
            throw new Error(`CSV parsing error: ${error.message}`);
          }
        });
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        parsedData = XLSX.utils.sheet_to_json(worksheet);
        await processPayments(parsedData);
      } else {
        throw new Error('Unsupported file format. Please upload CSV or Excel files.');
      }
    } catch (error: any) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to process file',
        variant: 'destructive'
      });
      setImporting(false);
    }
  };

  const processPayments = async (data: any[]) => {
    const errors: string[] = [];
    const validPayments: any[] = [];
    
    // Get all students for validation
    const { data: students } = await supabase
      .from('students')
      .select('id, name');

    const studentMap = new Map(students?.map(s => [s.id, s.name]) || []);

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      if (!row.student_id || !row.amount || !row.payment_date || !row.payment_method) {
        errors.push(`Row ${i + 1}: Missing required fields`);
        continue;
      }

      if (!studentMap.has(row.student_id)) {
        errors.push(`Row ${i + 1}: Invalid student_id`);
        continue;
      }

      const amount = Number(row.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Row ${i + 1}: Invalid amount`);
        continue;
      }

      const validMethods = ['cash', 'bank_transfer', 'check', 'online'];
      if (!validMethods.includes(row.payment_method)) {
        errors.push(`Row ${i + 1}: Invalid payment method (use: cash, bank_transfer, check, online)`);
        continue;
      }

      validPayments.push({
        student_id: row.student_id,
        amount,
        payment_date: row.payment_date,
        payment_method: row.payment_method,
        description: row.description || 'Batch import payment',
        currency: currency.code,
        receipt_number: `PAY-${Date.now()}-${i}`
      });
    }

    if (validPayments.length === 0) {
      throw new Error(`No valid payments found. Errors:\n${errors.join('\n')}`);
    }

    const { error: insertError } = await supabase
      .from('payments')
      .insert(validPayments);

    if (insertError) throw insertError;

    setImporting(false);
    setIsOpen(false);
    onImportComplete();

    const message = errors.length > 0
      ? `Imported ${validPayments.length} payments. ${errors.length} rows had errors.`
      : `Successfully imported ${validPayments.length} payments`;

    toast({
      title: errors.length > 0 ? 'Partial Success' : 'Success',
      description: message,
      variant: errors.length > 0 ? 'default' : 'default'
    });

    if (errors.length > 0) {
      console.warn('Import errors:', errors);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Import Payments
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Payments from File</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Upload a CSV or Excel file with payment records. Download the template to see the required format.
          </div>
          <Button onClick={downloadTemplate} variant="outline" className="w-full">
            <Download className="w-4 h-4 mr-2" />
            Download Template
          </Button>
          <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
            <input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={handleFileUpload}
              disabled={importing}
              className="hidden"
              id="payment-file-upload"
            />
            <label htmlFor="payment-file-upload" className="cursor-pointer">
              <Upload className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {importing ? 'Processing...' : 'Click to upload CSV or Excel file'}
              </p>
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
