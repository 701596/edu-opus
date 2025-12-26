import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserCheck, CreditCard, TrendingUp, DollarSign, Receipt, LayoutDashboard, TrendingDown, Wallet } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import SystemStatus from '@/components/SystemStatus';
import { AIChatBox } from '@/components/ai/AIChatBox';
import { useFinancialData } from '@/hooks/useFinancialData';
import { useRole } from '@/contexts/RoleContext';

interface DashboardStats {
  totalStudents: number;
  totalStaff: number;
  totalIncome: number;
  totalExpenses: number;
  remainingFees: number;
  netProfit: number;
  profitMargin: number;
  monthlyData: Array<{ month: string; income: number; expenses: number }>;
  paymentMethods: Array<{ name: string; value: number; amount: number }>;
  recentPayments: Array<{ id: string; student_name: string; amount: number; date: string; method: string }>;
  pendingFees: Array<{ id: string; student_name: string; amount: number; due_date: string }>;
  totalExpectedSalaryExpense?: number;
  totalPaidSalary?: number;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalStaff: 0,
    totalIncome: 0,
    totalExpenses: 0,
    remainingFees: 0,
    netProfit: 0,
    profitMargin: 0,
    monthlyData: [],
    paymentMethods: [],
    recentPayments: [],
    pendingFees: [],
  });
  const [loading, setLoading] = useState(true);
  const { formatAmount } = useCurrency();
  const { isPrincipal, currentSchool } = useRole();

  // Derived financial data (time-based, server-driven, tenant-scoped)
  const { data: financialData, isLoading: financialLoading, error: financialError } = useFinancialData();

  useEffect(() => {
    fetchDashboardData();

    // Reduced real-time subscriptions - only listen to key tables
    const paymentsChannel = supabase
      .channel('dashboard-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchDashboardData)
      .subscribe();

    const studentsChannel = supabase
      .channel('dashboard-students')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, fetchDashboardData)
      .subscribe();

    return () => {
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(studentsChannel);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Use server-side RPC for aggregated data - single call instead of 6 queries
      const { data, error } = await supabase.rpc('get_dashboard_summary' as any);

      if (error) {
        console.error('RPC error:', error);
        // Fallback to legacy method if RPC doesn't exist yet
        await fetchDashboardDataLegacy();
        return;
      }

      // Parse RPC response
      const summary = data as unknown as {
        total_students: number;
        total_staff: number;
        total_expected_salary: number;
        total_paid_salary: number;
        total_payments_amount: number;
        total_expenses_amount: number;
        recent_payments: Array<{ id: string; amount: number; payment_date: string; payment_method: string; student_name: string }>;
        pending_fees: Array<{ id: string; name: string }>;
        payment_methods: Array<{ payment_method: string; count: number; total_amount: number }>;
        monthly_data: Array<{ month_name: string; income: number; expenses: number }>;
      };

      const totalIncome = summary.total_payments_amount || 0;
      const totalExpenses = summary.total_expenses_amount || 0;
      const netProfit = totalIncome - totalExpenses;
      const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

      setStats({
        totalStudents: summary.total_students || 0,
        totalStaff: summary.total_staff || 0,
        totalIncome,
        totalExpenses,
        remainingFees: 0, // Controlled by useFinancialData hook
        netProfit,
        profitMargin,
        monthlyData: (summary.monthly_data || []).map(m => ({
          month: m.month_name,
          income: Number(m.income) || 0,
          expenses: Number(m.expenses) || 0,
        })),
        paymentMethods: (summary.payment_methods || []).map(pm => ({
          name: pm.payment_method || 'Unknown',
          value: pm.count || 0,
          amount: Number(pm.total_amount) || 0,
        })),
        recentPayments: (summary.recent_payments || []).map(p => ({
          id: p.id,
          student_name: p.student_name || 'Unknown',
          amount: Number(p.amount) || 0,
          date: p.payment_date,
          method: p.payment_method,
        })),
        pendingFees: (summary.pending_fees || []).map(s => ({
          id: s.id,
          student_name: s.name || 'Unknown',
          amount: 0, // Will be updated by mapping financialData
          due_date: '',
        })),
        totalExpectedSalaryExpense: summary.total_expected_salary || 0,
        totalPaidSalary: summary.total_paid_salary || 0,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
      await fetchDashboardDataLegacy();
    } finally {
      setLoading(false);
    }
  };

  // Legacy fallback for when RPC is not yet deployed
  const fetchDashboardDataLegacy = async () => {
    try {
      const [
        studentsResponse,
        staffResponse,
        expensesResponse,
        recentPaymentsResponse,
        pendingFeesResponse
      ] = await Promise.all([
        supabase.from('students').select('id, fee_amount').limit(1000),
        supabase.from('staff').select('id, expected_salary_expense, paid_salary').limit(500),
        supabase.from('expenses').select('amount').limit(1000),
        supabase.from('payments').select(`
          id, amount, payment_date, payment_method,
          students!payments_student_id_fkey(name)
        `).order('payment_date', { ascending: false }).limit(5),
        supabase.from('students').select(`
          id, name
        `).order('name', { ascending: true }).limit(5)
      ]);

      const students = studentsResponse.data || [];
      const staff = staffResponse.data || [];
      const expensesData = expensesResponse.data || [];

      const totalStudents = students.length;
      const totalStaff = staff.length;
      const totalIncome = 0; // Driven by calculations or payments table directly? Legacy just 0.
      const totalExpenses = expensesData.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalExpectedSalaryExpense = staff.reduce((sum, s) => sum + Number((s as Record<string, unknown>).expected_salary_expense || 0), 0);
      const totalPaidSalary = staff.reduce((sum, s) => sum + Number((s as Record<string, unknown>).paid_salary || 0), 0);
      const remainingFees = 0;
      const netProfit = totalIncome - totalExpenses;
      const profitMargin = totalExpenses > 0 ? (netProfit / totalExpenses) * 100 : (totalIncome > 0 ? 100 : 0);

      const recentPayments = (recentPaymentsResponse.data || []).map(payment => ({
        id: payment.id,
        student_name: payment.students?.name || 'Unknown',
        amount: Number(payment.amount),
        date: payment.payment_date,
        method: payment.payment_method
      }));

      const pendingFees = (pendingFeesResponse.data || []).map(student => ({
        id: student.id,
        student_name: student.name || 'Unknown',
        amount: 0,
        due_date: ''
      }));

      setStats({
        totalStudents,
        totalStaff,
        totalIncome,
        totalExpenses,
        remainingFees,
        netProfit,
        profitMargin,
        monthlyData: [],
        paymentMethods: [],
        recentPayments,
        pendingFees,
        totalExpectedSalaryExpense,
        totalPaidSalary,
      });
    } catch (error) {
      console.error('Error in legacy fetch:', error);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        {/* Header Skeleton */}
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-muted animate-pulse" />
            <div className="h-8 w-32 bg-muted rounded animate-pulse" />
          </div>
          <div className="h-4 w-64 bg-muted rounded animate-pulse" />
        </div>

        {/* 4 Metric Cards Skeleton */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg p-6 border">
              <div className="flex justify-between items-center mb-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-8 w-20 bg-muted rounded animate-pulse mb-1" />
              <div className="h-3 w-28 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* 3 Financial Health Cards Skeleton */}
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg p-6 border">
              <div className="flex justify-between items-center mb-2">
                <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                <div className="h-4 w-4 bg-muted rounded animate-pulse" />
              </div>
              <div className="h-8 w-24 bg-muted rounded animate-pulse mb-1" />
              <div className="h-3 w-20 bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* 2 Charts Skeleton */}
        <div className="grid gap-6 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg p-6 border">
              <div className="h-5 w-40 bg-muted rounded animate-pulse mb-4" />
              <div className="h-[300px] bg-muted rounded animate-pulse" />
            </div>
          ))}
        </div>

        {/* 2 Activity Lists Skeleton */}
        <div className="grid gap-6 md:grid-cols-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="bg-card rounded-lg p-6 border">
              <div className="h-5 w-32 bg-muted rounded animate-pulse mb-4" />
              <div className="space-y-3">
                {[...Array(5)].map((_, j) => (
                  <div key={j} className="flex justify-between items-center p-3 bg-muted/50 rounded">
                    <div className="space-y-1">
                      <div className="h-4 w-24 bg-muted rounded animate-pulse" />
                      <div className="h-3 w-32 bg-muted rounded animate-pulse" />
                    </div>
                    <div className="h-5 w-16 bg-muted rounded animate-pulse" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <LayoutDashboard className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Dashboard
          </h1>
        </div>
        <p className="text-muted-foreground">Overview of your institution's finances</p>
      </div>

      {/* System Status */}
      <SystemStatus {...stats} />

      {/* Key Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Students</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">Enrolled students</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Staff</CardTitle>
            <UserCheck className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalStaff}</div>
            <p className="text-xs text-muted-foreground">Active employees</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Income</CardTitle>
            <CreditCard className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(stats.totalIncome)}</div>
            <p className="text-xs text-muted-foreground">From fee payments</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(stats.totalExpenses)}</div>
            <p className="text-xs text-muted-foreground">
              Expected salaries: {formatAmount(financialData?.salaries?.total_expected ?? stats.totalExpectedSalaryExpense ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Health */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Remaining Fees</CardTitle>
            <DollarSign className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {financialLoading ? (
              <div className="text-2xl font-bold text-muted-foreground animate-pulse">Loading...</div>
            ) : financialError ? (
              <div className="text-sm text-destructive">Error: {financialError}</div>
            ) : (
              <>
                <div className="text-2xl font-bold text-orange-500">
                  {formatAmount(financialData?.fees?.total_remaining ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground">
                  {financialData?.school_id ? 'Tenant-scoped' : 'Derived from server date'}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Profit</CardTitle>
            {stats.netProfit >= 0 ? (
              <TrendingUp className="h-4 w-4 text-green-500" />
            ) : (
              <TrendingDown className="h-4 w-4 text-destructive" />
            )}
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.netProfit >= 0 ? 'text-green-500' : 'text-destructive'}`}>
              {formatAmount(stats.netProfit)}
            </div>
            <p className="text-xs text-muted-foreground">{stats.profitMargin.toFixed(1)}% margin</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profit Margin</CardTitle>
            <TrendingUp className="h-4 w-4 text-chart-1" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.profitMargin.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">Of total income</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Monthly Trends */}
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Monthly Financial Trends</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.monthlyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={stats.monthlyData}>
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
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No monthly data available
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment Methods */}
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.paymentMethods.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={stats.paymentMethods}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {stats.paymentMethods.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-[300px] text-muted-foreground">
                No payment method data
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Recent Payments */}
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Recent Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentPayments.length > 0 ? (
                stats.recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium">{payment.student_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {payment.date} • {payment.method}
                      </p>
                    </div>
                    <div className="font-semibold text-primary">
                      {formatAmount(payment.amount)}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  No recent payments
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pending Fees */}
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Top Pending Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.pendingFees.length > 0 ? (
                stats.pendingFees.map((fee, index) => {
                  const studentFee = financialData?.fees?.students?.find(s => s.student_id === fee.id);
                  const amount = studentFee?.remaining_fee ?? fee.amount;

                  return (
                    <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                      <div>
                        <p className="font-medium">{fee.student_name}</p>
                        <p className="text-sm text-muted-foreground">Outstanding balance</p>
                      </div>
                      <div className="font-semibold text-orange-500">
                        {formatAmount(amount)}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center text-muted-foreground py-4">
                  No pending fees
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* AI Assistant Floating Button */}
      <AIChatBox />
    </div>
  );
};

export default Dashboard;