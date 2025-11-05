import { jsPDF } from 'jspdf';

interface ReceiptData {
  receiptNumber: string;
  studentName: string;
  amount: number;
  paymentDate: string;
  paymentMethod: string;
  currency: string;
  description?: string;
}

export const generateReceipt = (data: ReceiptData): Blob => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('PAYMENT RECEIPT', 105, 20, { align: 'center' });
  
  // School name (customizable)
  doc.setFontSize(16);
  doc.setFont('helvetica', 'normal');
  doc.text('Educational Institution', 105, 30, { align: 'center' });
  
  // Divider
  doc.setLineWidth(0.5);
  doc.line(20, 35, 190, 35);
  
  // Receipt details
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  
  let yPos = 50;
  
  // Receipt Number
  doc.text('Receipt Number:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.receiptNumber, 80, yPos);
  yPos += 10;
  
  // Date
  doc.setFont('helvetica', 'bold');
  doc.text('Date:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date(data.paymentDate).toLocaleDateString(), 80, yPos);
  yPos += 10;
  
  // Student Name
  doc.setFont('helvetica', 'bold');
  doc.text('Student Name:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.studentName, 80, yPos);
  yPos += 10;
  
  // Payment Method
  doc.setFont('helvetica', 'bold');
  doc.text('Payment Method:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(data.paymentMethod, 80, yPos);
  yPos += 10;
  
  // Description (if provided)
  if (data.description) {
    doc.setFont('helvetica', 'bold');
    doc.text('Description:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(data.description, 110);
    doc.text(lines, 80, yPos);
    yPos += lines.length * 7;
  }
  
  yPos += 10;
  
  // Amount box
  doc.setFillColor(240, 240, 240);
  doc.rect(20, yPos, 170, 20, 'F');
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Amount Paid:', 25, yPos + 13);
  doc.setTextColor(0, 128, 0);
  doc.text(`${data.currency} ${data.amount.toFixed(2)}`, 160, yPos + 13, { align: 'right' });
  doc.setTextColor(0, 0, 0);
  
  yPos += 35;
  
  // Footer
  doc.setFontSize(10);
  doc.setFont('helvetica', 'italic');
  doc.text('This is a computer-generated receipt.', 105, yPos, { align: 'center' });
  doc.text('Thank you for your payment!', 105, yPos + 5, { align: 'center' });
  
  // Signature line
  yPos += 30;
  doc.setFont('helvetica', 'normal');
  doc.line(130, yPos, 180, yPos);
  doc.text('Authorized Signature', 155, yPos + 5, { align: 'center' });
  
  return doc.output('blob');
};

export const downloadReceipt = (data: ReceiptData) => {
  const blob = generateReceipt(data);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `receipt-${data.receiptNumber}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};
