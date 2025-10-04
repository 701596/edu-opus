import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Users, Receipt, CreditCard, BarChart3 } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface ReportData {
  totalIncome: number;
  totalExpenses: number;
  totalSalaries: number;
  totalFeeFolders: number;
  remainingFees: number;
  netProfit: number;
  profitMargin: number;
  monthlyTrends: Array<{ month: string; income: number; expenses: number; salaries: number }>;
  categoryExpenses: Array<{ name: string; value: number }>;
  paymentMethods: Array<{ name: string; value: number; amount: number }>;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

const Reports = () => {
  const [reportData, setReportData] = useState<ReportData>({
    totalIncome: 0,
    totalExpenses: 0,
    totalSalaries: 0,
    totalFeeFolders: 0,
    remainingFees: 0,
    netProfit: 0,
    profitMargin: 0,
    monthlyTrends: [],
    categoryExpenses: [],
    paymentMethods: [],
  });
  const [loading, setLoading] = useState(true);
  const { formatAmount } = useCurrency();

  useEffect(() => {
    fetchReportData();

    // Real-time subscriptions for all tables
    const paymentsChannel = supabase
      .channel('reports-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchReportData)
      .subscribe();
    
    const expensesChannel = supabase
      .channel('reports-expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchReportData)
      .subscribe();
    
    const salariesChannel = supabase
      .channel('reports-salaries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salaries' }, fetchReportData)
      .subscribe();

    const feeFoldersChannel = supabase
      .channel('reports-fee-folders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fee_folders' }, fetchReportData)
      .subscribe();

    const studentsChannel = supabase
      .channel('reports-students')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, fetchReportData)
      .subscribe();

    const staffChannel = supabase
      .channel('reports-staff')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, fetchReportData)
      .subscribe();

    return () => {
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(salariesChannel);
      supabase.removeChannel(feeFoldersChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(staffChannel);
    };
  }, []);

  const fetchReportData = async () => {
    try {
      // Fetch all data in parallel
      const [paymentsResponse, expensesResponse, salariesResponse, feeFoldersResponse] = await Promise.all([
        supabase.from('payments').select('amount, payment_method, payment_date'),
        supabase.from('expenses').select('amount, category, expense_date'),
        supabase.from('salaries').select('net_amount, payment_date'),
        supabase.from('fee_folders').select('amount_due, amount_paid, status')
      ]);

      const payments = paymentsResponse.data || [];
      const expenses = expensesResponse.data || [];
      const salaries = salariesResponse.data || [];
      const feeFolders = feeFoldersResponse.data || [];

      // Calculate totals
      const totalIncome = payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const totalExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
      const totalSalaries = salaries.reduce((sum, salary) => sum + Number(salary.net_amount), 0);
      const totalFeeFolders = feeFolders.reduce((sum, folder) => sum + Number(folder.amount_due), 0);
      const remainingFees = feeFolders.reduce((sum, folder) => {
        const remaining = Number(folder.amount_due) - (Number(folder.amount_paid) || 0);
        return sum + Math.max(0, remaining);
      }, 0);

      const netProfit = totalIncome - totalExpenses - totalSalaries;
      const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

      // Calculate monthly trends
      const monthlyTrends = calculateMonthlyTrends(payments, expenses, salaries);

      // Calculate category expenses
      const categoryExpenses = calculateCategoryExpenses(expenses);

      // Calculate payment methods
      const paymentMethods = calculatePaymentMethods(payments);

      setReportData({
        totalIncome,
        totalExpenses,
        totalSalaries,
        totalFeeFolders,
        remainingFees,
        netProfit,
        profitMargin,
        monthlyTrends,
        categoryExpenses,
        paymentMethods,
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMonthlyTrends = (payments: any[], expenses: any[], salaries: any[]) => {
    const months = [];
    const today = new Date();
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const monthName = date.toLocaleDateString('en-US', { month: 'short' });
      const yearMonth = date.toISOString().substring(0, 7);
      
      const monthlyIncome = payments
        .filter(p => p.payment_date.startsWith(yearMonth))
        .reduce((sum, p) => sum + Number(p.amount), 0);
      
      const monthlyExpenses = expenses
        .filter(e => e.expense_date.startsWith(yearMonth))
        .reduce((sum, e) => sum + Number(e.amount), 0);
      
      const monthlySalaries = salaries
        .filter(s => s.payment_date.startsWith(yearMonth))
        .reduce((sum, s) => sum + Number(s.net_amount), 0);
      
      months.push({
        month: monthName,
        income: monthlyIncome,
        expenses: monthlyExpenses,
        salaries: monthlySalaries,
      });
    }
    
    return months;
  };

  const calculateCategoryExpenses = (expenses: any[]) => {
    const categoryTotals: Record<string, number> = {};
    
    expenses.forEach(expense => {
      const category = expense.category || 'Other';
      categoryTotals[category] = (categoryTotals[category] || 0) + Number(expense.amount);
    });
    
    return Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));
  };

  const calculatePaymentMethods = (payments: any[]) => {
    const methodTotals: Record<string, { count: number; amount: number }> = {};
    
    payments.forEach(payment => {
      const method = payment.payment_method || 'Unknown';
      if (!methodTotals[method]) {
        methodTotals[method] = { count: 0, amount: 0 };
      }
      methodTotals[method].count += 1;
      methodTotals[method].amount += Number(payment.amount);
    });
    
    return Object.entries(methodTotals).map(([name, data]) => ({ 
      name, 
      value: data.count, 
      amount: data.amount 
    }));
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
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Reports
          </h1>
        </div>
        <p className="text-muted-foreground">Financial overview and analytics</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(reportData.totalIncome)}</div>
            <p className="text-xs text-muted-foreground">From all payments</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(reportData.totalExpenses)}</div>
            <p className="text-xs text-muted-foreground">Operational costs</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Salaries</CardTitle>
            <Users className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(reportData.totalSalaries)}</div>
            <p className="text-xs text-muted-foreground">Staff payments</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            {reportData.netProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${reportData.netProfit >= 0 ? 'text-green-500' : 'text-destructive'}`}>
              {formatAmount(reportData.netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">{reportData.profitMargin.toFixed(1)}% margin</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Health Insights */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Fees Due</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(reportData.totalFeeFolders)}</div>
            <p className="text-xs text-muted-foreground">From fee folders</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Remaining Fees</CardTitle>
            <Receipt className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(reportData.remainingFees)}</div>
            <p className="text-xs text-muted-foreground">Outstanding amount</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Collection Rate</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {reportData.totalFeeFolders > 0 
                ? (((reportData.totalFeeFolders - reportData.remainingFees) / reportData.totalFeeFolders) * 100).toFixed(1)
                : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Fees collected</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Monthly Financial Trends</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={reportData.monthlyTrends}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                <YAxis stroke="hsl(var(--muted-foreground))" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }} 
                />
                <Bar dataKey="income" fill="hsl(var(--primary))" name="Income" />
                <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Expenses" />
                <Bar dataKey="salaries" fill="hsl(var(--secondary))" name="Salaries" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={reportData.categoryExpenses}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {reportData.categoryExpenses.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods */}
      <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
        <CardHeader>
          <CardTitle className="text-foreground">Payment Methods Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {reportData.paymentMethods.map((method, index) => (
              <div key={method.name} className="p-4 border border-border rounded-lg">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium capitalize">{method.name.replace('_', ' ')}</h3>
                  <div className={`w-3 h-3 rounded-full`} style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                </div>
                <div className="mt-2">
                  <div className="text-2xl font-bold">{method.value}</div>
                  <div className="text-sm text-muted-foreground">transactions</div>
                  <div className="text-lg font-semibold text-primary">{formatAmount(method.amount)}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;