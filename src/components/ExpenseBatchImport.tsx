import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

interface ExpenseBatchImportProps {
  onImportComplete: () => void;
}

export const ExpenseBatchImport = ({ onImportComplete }: ExpenseBatchImportProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const { toast } = useToast();

  const downloadTemplate = () => {
    const template = [
      {
        description: 'Office Supplies',
        amount: '500',
        category: 'Supplies',
        expense_date: '2025-01-15',
        vendor: 'ABC Store'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses Template');
    XLSX.writeFile(wb, 'expenses_template.xlsx');

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
            await processExpenses(parsedData);
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
        await processExpenses(parsedData);
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

  const processExpenses = async (data: any[]) => {
    const errors: string[] = [];
    const validExpenses: any[] = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      
      if (!row.description || !row.amount || !row.category || !row.expense_date) {
        errors.push(`Row ${i + 1}: Missing required fields`);
        continue;
      }

      const amount = Number(row.amount);
      if (isNaN(amount) || amount <= 0) {
        errors.push(`Row ${i + 1}: Invalid amount`);
        continue;
      }

      validExpenses.push({
        description: row.description,
        amount,
        category: row.category,
        expense_date: row.expense_date,
        vendor: row.vendor || row.description,
        receipt_number: `EXP-${Date.now()}-${i}`,
        currency: 'USD'
      });
    }

    if (validExpenses.length === 0) {
      throw new Error(`No valid expenses found. Errors:\n${errors.join('\n')}`);
    }

    const { error: insertError } = await supabase
      .from('expenses')
      .insert(validExpenses);

    if (insertError) throw insertError;

    setImporting(false);
    setIsOpen(false);
    onImportComplete();

    const message = errors.length > 0
      ? `Imported ${validExpenses.length} expenses. ${errors.length} rows had errors.`
      : `Successfully imported ${validExpenses.length} expenses`;

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
          Import Expenses
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Expenses from File</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Upload a CSV or Excel file with expense records. Download the template to see the required format.
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
              id="expense-file-upload"
            />
            <label htmlFor="expense-file-upload" className="cursor-pointer">
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
