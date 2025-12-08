import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Receipt, CreditCard, BarChart3 } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface ReportData {
  totalIncome: number;
  totalExpenses: number;
  totalSalaries: number;
  totalFeeFolders: number;
  remainingFees: number;
  netProfit: number;
  profitMargin: number;
  expectedSalaryExpense: number;
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
    expectedSalaryExpense: 0,
    monthlyTrends: [],
    categoryExpenses: [],
    paymentMethods: [],
  });
  const [loading, setLoading] = useState(true);
  const { formatAmount } = useCurrency();

  useEffect(() => {
    fetchReportData();

    // Reduced real-time - only listen to key financial tables
    const paymentsChannel = supabase
      .channel('reports-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchReportData)
      .subscribe();

    const expensesChannel = supabase
      .channel('reports-expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchReportData)
      .subscribe();

    return () => {
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(expensesChannel);
    };
  }, []);

  const fetchReportData = async () => {
    try {
      // Use server-side RPC for aggregated data - single call instead of 6 queries
      const { data, error } = await supabase.rpc('get_report_summary' as any);

      if (error) {
        console.error('RPC error:', error);
        // Fallback to legacy method if RPC doesn't exist yet
        await fetchReportDataLegacy();
        return;
      }

      // Parse RPC response
      const summary = data as unknown as {
        total_income: number;
        total_expenses: number;
        total_salaries: number;
        total_fee_folders: number;
        remaining_fees: number;
        expected_salary_expense: number;
        category_expenses: Array<{ name: string; value: number }>;
        payment_methods: Array<{ name: string; value: number; amount: number }>;
        monthly_trends: Array<{ month: string; income: number; expenses: number; salaries: number }>;
      };

      const totalIncome = Number(summary.total_income) || 0;
      const totalExpenses = Number(summary.total_expenses) + Number(summary.total_salaries) || 0;
      const netProfit = totalIncome - totalExpenses;
      const profitMargin = totalExpenses > 0 ? (netProfit / totalExpenses) * 100 : (totalIncome > 0 ? 100 : 0);

      setReportData({
        totalIncome,
        totalExpenses,
        totalSalaries: Number(summary.total_salaries) || 0,
        totalFeeFolders: Number(summary.total_fee_folders) || 0,
        remainingFees: Number(summary.remaining_fees) || 0,
        netProfit,
        profitMargin,
        expectedSalaryExpense: Number(summary.expected_salary_expense) || 0,
        monthlyTrends: (summary.monthly_trends || []).map(m => ({
          month: m.month,
          income: Number(m.income) || 0,
          expenses: Number(m.expenses) || 0,
          salaries: Number(m.salaries) || 0,
        })),
        categoryExpenses: (summary.category_expenses || []).map(c => ({
          name: c.name || 'Other',
          value: Number(c.value) || 0,
        })),
        paymentMethods: (summary.payment_methods || []).map(pm => ({
          name: pm.name || 'Unknown',
          value: Number(pm.value) || 0,
          amount: Number(pm.amount) || 0,
        })),
      });
    } catch (error) {
      console.error('Error fetching report data:', error);
      await fetchReportDataLegacy();
    } finally {
      setLoading(false);
    }
  };

  // Legacy fallback for when RPC is not yet deployed
  const fetchReportDataLegacy = async () => {
    try {
      const [
        studentsResponse,
        expensesResponse,
        salariesResponse,
        feeFoldersResponse,
        staffResponse
      ] = await Promise.all([
        supabase.from('students').select('paid_fee, remaining_fee').limit(1000),
        supabase.from('expenses').select('amount, category').limit(1000),
        supabase.from('salaries').select('net_amount').limit(500),
        supabase.from('fee_folders').select('amount_due').limit(500),
        supabase.from('staff').select('expected_salary_expense').limit(500)
      ]);

      const students = studentsResponse.data || [];
      const expenses = expensesResponse.data || [];
      const salaries = salariesResponse.data || [];
      const feeFolders = feeFoldersResponse.data || [];
      const staff = staffResponse.data || [];

      const totalIncome = students.reduce((sum, s) => sum + Number(s.paid_fee || 0), 0);
      const totalExpensesAmount = expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalSalaries = salaries.reduce((sum, s) => sum + Number(s.net_amount || 0), 0);
      const totalExpenses = totalExpensesAmount + totalSalaries;
      const totalFeeFolders = feeFolders.reduce((sum, f) => sum + Number(f.amount_due || 0), 0);
      const remainingFees = students.reduce((sum, s) => sum + Number(s.remaining_fee || 0), 0);
      const expectedSalaryExpense = staff.reduce((sum, s) => sum + Number((s as Record<string, unknown>).expected_salary_expense || 0), 0);
      const netProfit = totalIncome - totalExpenses;
      const profitMargin = totalExpenses > 0 ? (netProfit / totalExpenses) * 100 : (totalIncome > 0 ? 100 : 0);

      // Calculate category expenses
      const categoryTotals: Record<string, number> = {};
      expenses.forEach(e => {
        const cat = e.category || 'Other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Number(e.amount);
      });
      const categoryExpenses = Object.entries(categoryTotals).map(([name, value]) => ({ name, value }));

      setReportData({
        totalIncome,
        totalExpenses,
        totalSalaries,
        totalFeeFolders,
        remainingFees,
        netProfit,
        profitMargin,
        expectedSalaryExpense,
        monthlyTrends: [],
        categoryExpenses,
        paymentMethods: [],
      });
    } catch (error) {
      console.error('Error in legacy fetch:', error);
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
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
            <p className="text-xs text-muted-foreground">
              Expected staff salaries: {formatAmount(reportData.expectedSalaryExpense)}
            </p>
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
            {reportData.monthlyTrends.length > 0 ? (
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
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                Apply migration to enable monthly trends
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Expense Categories</CardTitle>
          </CardHeader>
          <CardContent>
            {reportData.categoryExpenses.length > 0 ? (
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
                    {reportData.categoryExpenses.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No expense data available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Payment Methods */}
      <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
        <CardHeader>
          <CardTitle className="text-foreground">Payment Methods Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {reportData.paymentMethods.length > 0 ? (
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
          ) : (
            <div className="text-center text-muted-foreground py-8">
              Apply migration to enable payment method analysis
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Reports;
