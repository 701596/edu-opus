import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Upload, Download, AlertCircle, CheckCircle2, Edit, Save } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

interface StudentRow {
  name: string;
  class: string;
  fee_amount: number;
  fee_type: string;
  guardian_name: string;
  guardian_phone: string;
  join_date: string;
  email?: string;
  phone?: string;
  address?: string;
  date_of_birth?: string;
}

interface OptionalFields {
  email: boolean;
  phone: boolean;
  address: boolean;
  date_of_birth: boolean;
  guardian_phone: boolean;
}

export const StudentBatchImport = ({ onImportComplete }: { onImportComplete: () => void }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [parsedData, setParsedData] = useState<StudentRow[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedRow, setEditedRow] = useState<StudentRow | null>(null);
  const [optionalFields, setOptionalFields] = useState<OptionalFields>({
    email: true,
    phone: true,
    address: true,
    date_of_birth: true,
    guardian_phone: false,
  });
  const { toast } = useToast();

  const downloadTemplate = () => {
    const template = [
      {
        name: 'John Doe',
        class: 'Grade 10',
        fee_amount: 5000,
        fee_type: 'monthly',
        guardian_name: 'Jane Doe',
        guardian_phone: '1234567890',
        join_date: '2024-01-01',
        email: 'john@example.com',
        phone: '0987654321',
        address: '123 Main St',
        date_of_birth: '2008-05-15'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Students Template');
    XLSX.writeFile(wb, 'students_import_template.xlsx');

    toast({ title: 'Success', description: 'Template downloaded successfully' });
  };

  const validateRow = (row: any): { valid: boolean; error?: string } => {
    if (!row.name || row.name.trim().length < 2) {
      return { valid: false, error: 'Name must be at least 2 characters' };
    }
    if (!row.class || row.class.trim().length < 1) {
      return { valid: false, error: 'Class is required' };
    }
    if (!row.fee_amount || isNaN(Number(row.fee_amount)) || Number(row.fee_amount) < 0) {
      return { valid: false, error: 'Valid fee amount is required' };
    }
    if (!['monthly', 'annually'].includes(row.fee_type)) {
      return { valid: false, error: 'Fee type must be "monthly" or "annually"' };
    }
    if (!row.guardian_name || row.guardian_name.trim().length < 2) {
      return { valid: false, error: 'Guardian name is required' };
    }
    if (!optionalFields.guardian_phone && (!row.guardian_phone || row.guardian_phone.trim().length < 10)) {
      return { valid: false, error: 'Guardian phone is required (min 10 characters)' };
    }
    if (!row.join_date) {
      return { valid: false, error: 'Joining date is required' };
    }
    if (!optionalFields.email && row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
      return { valid: false, error: 'Invalid email format' };
    }
    if (row.email && row.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) {
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
            setParsedData(parsedData);
            setImporting(false);
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
        setParsedData(parsedData);
        setImporting(false);
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
            .from('students')
            .select('id')
            .eq('email', row.email.trim())
            .maybeSingle();

          if (existing) {
            results.failed++;
            results.errors.push(`Row ${i + 1}: Student with email ${row.email} already exists in your account`);
            continue;
          }
        }

        const payload = {
          student_id: `STU-${Date.now()}-${i}`,
          name: row.name.trim(),
          class: row.class.trim(),
          fee_amount: Number(row.fee_amount),
          fee_type: row.fee_type,
          guardian_name: row.guardian_name.trim(),
          guardian_phone: row.guardian_phone.trim(),
          join_date: row.join_date,
          enrollment_date: row.join_date,
          email: row.email?.trim() || null,
          phone: row.phone?.trim() || null,
          address: row.address?.trim() || null,
          date_of_birth: row.date_of_birth || null,
        };

        const { error } = await supabase.from('students').insert([payload]);

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
        description: `Successfully imported ${results.success} student(s)` 
      });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    setResult(null);
    setProgress(0);
    setParsedData([]);
    setEditingIndex(null);
    setEditedRow(null);
  };

  const handleEditRow = (index: number) => {
    setEditingIndex(index);
    setEditedRow({ ...parsedData[index] });
  };

  const handleSaveRow = () => {
    if (editingIndex !== null && editedRow) {
      const updated = [...parsedData];
      updated[editingIndex] = editedRow;
      setParsedData(updated);
      setEditingIndex(null);
      setEditedRow(null);
      toast({ title: 'Success', description: 'Row updated successfully' });
    }
  };

  const handleBulkEdit = (field: keyof StudentRow, value: any) => {
    const updated = parsedData.map(row => ({ ...row, [field]: value }));
    setParsedData(updated);
    toast({ title: 'Success', description: `Bulk updated ${field} for all rows` });
  };

  const handleConfirmImport = async () => {
    setImporting(true);
    await processImport(parsedData);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Upload className="w-4 h-4" />
          Import Students
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Batch Import Students</DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="upload" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">Upload File</TabsTrigger>
            <TabsTrigger value="optional" disabled={parsedData.length === 0}>Make Optional</TabsTrigger>
            <TabsTrigger value="edit" disabled={parsedData.length === 0}>Edit Records</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Upload a CSV or Excel file with student data. Download the template below to see the required format.
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

            {parsedData.length > 0 && !importing && (
              <Alert className="border-green-500/50">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <AlertDescription>
                  <div className="font-semibold">{parsedData.length} records parsed successfully!</div>
                  <p className="text-sm mt-1">Go to "Make Optional" to configure field requirements, or "Edit Records" to review and modify data before importing.</p>
                </AlertDescription>
              </Alert>
            )}

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
          </TabsContent>

          <TabsContent value="optional" className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Mark fields as optional to allow missing values during import. Unchecked fields will be required.
              </AlertDescription>
            </Alert>

            <div className="space-y-3 border rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="email-opt" 
                  checked={optionalFields.email}
                  onCheckedChange={(checked) => setOptionalFields(prev => ({ ...prev, email: checked as boolean }))}
                />
                <Label htmlFor="email-opt" className="cursor-pointer">Email (optional)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="phone-opt" 
                  checked={optionalFields.phone}
                  onCheckedChange={(checked) => setOptionalFields(prev => ({ ...prev, phone: checked as boolean }))}
                />
                <Label htmlFor="phone-opt" className="cursor-pointer">Phone (optional)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="address-opt" 
                  checked={optionalFields.address}
                  onCheckedChange={(checked) => setOptionalFields(prev => ({ ...prev, address: checked as boolean }))}
                />
                <Label htmlFor="address-opt" className="cursor-pointer">Address (optional)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="dob-opt" 
                  checked={optionalFields.date_of_birth}
                  onCheckedChange={(checked) => setOptionalFields(prev => ({ ...prev, date_of_birth: checked as boolean }))}
                />
                <Label htmlFor="dob-opt" className="cursor-pointer">Date of Birth (optional)</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="guardian-phone-opt" 
                  checked={optionalFields.guardian_phone}
                  onCheckedChange={(checked) => setOptionalFields(prev => ({ ...prev, guardian_phone: checked as boolean }))}
                />
                <Label htmlFor="guardian-phone-opt" className="cursor-pointer">Guardian Phone (optional)</Label>
              </div>
            </div>

            <Button onClick={handleConfirmImport} className="w-full" disabled={importing}>
              {importing ? 'Importing...' : `Confirm Import (${parsedData.length} records)`}
            </Button>
          </TabsContent>

          <TabsContent value="edit" className="space-y-4">
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Review and edit records before importing. Click edit icon for single edit, or use bulk edit controls.
              </AlertDescription>
            </Alert>

            <div className="border rounded-lg overflow-hidden">
              <div className="max-h-96 overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">#</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Class</TableHead>
                      <TableHead>Fee Amount</TableHead>
                      <TableHead>Fee Type</TableHead>
                      <TableHead>Join Date</TableHead>
                      <TableHead className="w-16">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {parsedData.map((row, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{idx + 1}</TableCell>
                        <TableCell>
                          {editingIndex === idx ? (
                            <Input 
                              value={editedRow?.name || ''} 
                              onChange={(e) => setEditedRow(prev => prev ? { ...prev, name: e.target.value } : null)}
                              className="w-full"
                            />
                          ) : row.name}
                        </TableCell>
                        <TableCell>
                          {editingIndex === idx ? (
                            <Input 
                              value={editedRow?.class || ''} 
                              onChange={(e) => setEditedRow(prev => prev ? { ...prev, class: e.target.value } : null)}
                              className="w-full"
                            />
                          ) : row.class}
                        </TableCell>
                        <TableCell>
                          {editingIndex === idx ? (
                            <Input 
                              type="number"
                              value={editedRow?.fee_amount || ''} 
                              onChange={(e) => setEditedRow(prev => prev ? { ...prev, fee_amount: Number(e.target.value) } : null)}
                              className="w-full"
                            />
                          ) : row.fee_amount}
                        </TableCell>
                        <TableCell>
                          {editingIndex === idx ? (
                            <select 
                              value={editedRow?.fee_type || 'monthly'} 
                              onChange={(e) => setEditedRow(prev => prev ? { ...prev, fee_type: e.target.value } : null)}
                              className="w-full border rounded px-2 py-1"
                            >
                              <option value="monthly">monthly</option>
                              <option value="annually">annually</option>
                            </select>
                          ) : row.fee_type}
                        </TableCell>
                        <TableCell>
                          {editingIndex === idx ? (
                            <Input 
                              type="date"
                              value={editedRow?.join_date || ''} 
                              onChange={(e) => setEditedRow(prev => prev ? { ...prev, join_date: e.target.value } : null)}
                              className="w-full"
                            />
                          ) : row.join_date}
                        </TableCell>
                        <TableCell>
                          {editingIndex === idx ? (
                            <Button size="sm" onClick={handleSaveRow}>
                              <Save className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => handleEditRow(idx)}>
                              <Edit className="w-4 h-4" />
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-2">
              <p className="font-semibold text-sm">Bulk Edit Controls</p>
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    const value = prompt('Enter fee type (monthly/annually):');
                    if (value) handleBulkEdit('fee_type', value);
                  }}
                >
                  Bulk Set Fee Type
                </Button>
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={() => {
                    const value = prompt('Enter class:');
                    if (value) handleBulkEdit('class', value);
                  }}
                >
                  Bulk Set Class
                </Button>
              </div>
            </div>

            <Button onClick={handleConfirmImport} className="w-full" disabled={importing}>
              {importing ? 'Importing...' : `Confirm Import (${parsedData.length} records)`}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
