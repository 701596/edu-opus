import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserCheck, CreditCard, TrendingUp, DollarSign, Receipt, LayoutDashboard, AlertCircle, TrendingDown, Wallet } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import SystemStatus from '@/components/SystemStatus';

interface DashboardStats {
  totalStudents: number;
  totalStaff: number;
  totalIncome: number;
  totalExpenses: number;
  totalSalaries: number;
  remainingFees: number;
  netProfit: number;
  profitMargin: number;
  monthlyData: Array<{ month: string; income: number; expenses: number; salaries: number }>;
  paymentMethods: Array<{ name: string; value: number; amount: number }>;
  recentPayments: Array<{ id: string; student_name: string; amount: number; date: string; method: string }>;
  pendingFees: Array<{ student_name: string; amount: number; due_date: string }>;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalStaff: 0,
    totalIncome: 0,
    totalExpenses: 0,
    totalSalaries: 0,
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

  useEffect(() => {
    fetchDashboardData();
    
    // Real-time subscriptions for all tables
    const paymentsChannel = supabase
      .channel('dashboard-payments')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'payments' }, fetchDashboardData)
      .subscribe();
    
    const expensesChannel = supabase
      .channel('dashboard-expenses')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, fetchDashboardData)
      .subscribe();
    
    const studentsChannel = supabase
      .channel('dashboard-students')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students' }, fetchDashboardData)
      .subscribe();
    
    const staffChannel = supabase
      .channel('dashboard-staff')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'staff' }, fetchDashboardData)
      .subscribe();

    const salariesChannel = supabase
      .channel('dashboard-salaries')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'salaries' }, fetchDashboardData)
      .subscribe();

    const feeFoldersChannel = supabase
      .channel('dashboard-fee-folders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'fee_folders' }, fetchDashboardData)
      .subscribe();

    return () => {
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(staffChannel);
      supabase.removeChannel(salariesChannel);
      supabase.removeChannel(feeFoldersChannel);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch all data in parallel
      const [
        studentsResponse,
        staffResponse,
        paymentsResponse,
        expensesResponse,
        salariesResponse,
        recentPaymentsResponse,
        pendingFeesResponse
      ] = await Promise.all([
        supabase.from('students').select('total_fee, remaining_fee'),
        supabase.from('staff').select('id'),
        supabase.from('payments').select('amount, payment_method, payment_date'),
        supabase.from('expenses').select('amount, expense_date'),
        supabase.from('salaries').select('net_amount, payment_date'),
        supabase.from('payments').select(`
          id, amount, payment_date, payment_method,
          students!inner(name)
        `).order('payment_date', { ascending: false }).limit(5),
        supabase.from('students').select(`
          id, name, remaining_fee
        `).gt('remaining_fee', 0).order('remaining_fee', { ascending: false }).limit(5)
      ]);

      const students = studentsResponse.data || [];
      const staff = staffResponse.data || [];
      const paymentsData = paymentsResponse.data || [];
      const expensesData = expensesResponse.data || [];
      const salariesData = salariesResponse.data || [];

      // Calculate financial metrics
      const totalStudents = students.length;
      const totalStaff = staff.length;
      const totalIncome = paymentsData.reduce((sum, p) => sum + Number(p.amount || 0), 0);
      const totalExpensesAmount = expensesData.reduce((sum, e) => sum + Number(e.amount || 0), 0);
      const totalSalariesAmount = salariesData.reduce((sum, s) => sum + Number(s.net_amount || 0), 0);
      const totalExpenses = totalExpensesAmount + totalSalariesAmount;
      const remainingFees = students.reduce((sum, s) => sum + Number(s.remaining_fee || 0), 0);
      const netProfit = totalIncome - totalExpenses;
      const profitMargin = totalIncome > 0 ? (netProfit / totalIncome) * 100 : 0;

      // Calculate monthly data for the last 6 months
      const monthlyData = calculateMonthlyData(paymentsData, expensesData, salariesData);

      // Calculate payment methods distribution
      const paymentMethods = calculatePaymentMethodsData(paymentsData);

      // Format recent payments
      const recentPayments = (recentPaymentsResponse.data || []).map(payment => ({
        id: payment.id,
        student_name: payment.students?.name || 'Unknown',
        amount: Number(payment.amount),
        date: payment.payment_date,
        method: payment.payment_method
      }));

      // Format pending fees
      const pendingFees = (pendingFeesResponse.data || []).map(student => ({
        student_name: student.name || 'Unknown',
        amount: Number(student.remaining_fee || 0),
        due_date: '' // Not tracking due date per student, only per fee folder
      }));

      setStats({
        totalStudents,
        totalStaff,
        totalIncome,
        totalExpenses,
        totalSalaries: 0, // Salaries are now integrated into expenses
        remainingFees,
        netProfit,
        profitMargin,
        monthlyData,
        paymentMethods,
        recentPayments,
        pendingFees,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMonthlyData = (payments: any[], expenses: any[], salaries: any[]) => {
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

  const calculatePaymentMethodsData = (payments: any[]) => {
    const methodData: Record<string, { count: number; amount: number }> = {};
    
    payments.forEach(payment => {
      const method = payment.payment_method || 'Unknown';
      if (!methodData[method]) {
        methodData[method] = { count: 0, amount: 0 };
      }
      methodData[method].count += 1;
      methodData[method].amount += Number(payment.amount);
    });
    
    return Object.entries(methodData).map(([name, data]) => ({ 
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
          <LayoutDashboard className="w-8 h-8 text-primary" />
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary-glow bg-clip-text text-transparent">
            Dashboard
          </h1>
        </div>
        <p className="text-muted-foreground">Overview of your institution's performance</p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Students</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{stats.totalStudents}</div>
            <p className="text-xs text-muted-foreground">Active enrollments</p>
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
            <p className="text-xs text-muted-foreground">From student payments</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            <Receipt className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(stats.totalExpenses)}</div>
            <p className="text-xs text-muted-foreground">Operational costs</p>
          </CardContent>
        </Card>
      </div>

      {/* Financial Overview */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Remaining Fees</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">{formatAmount(stats.remainingFees)}</div>
            <p className="text-xs text-muted-foreground">Outstanding amount</p>
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
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats.profitMargin.toFixed(1)}%
            </div>
            <p className="text-xs text-muted-foreground">Of total income</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts and Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Monthly Financial Trends</CardTitle>
          </CardHeader>
          <CardContent>
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
                <Bar dataKey="salaries" fill="hsl(var(--secondary))" name="Salaries" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Payment Methods</CardTitle>
          </CardHeader>
          <CardContent>
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
                  {stats.paymentMethods.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Recent Payments</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.recentPayments.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No recent payments</p>
              ) : (
                stats.recentPayments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <div>
                        <p className="font-medium">{payment.student_name}</p>
                        <p className="text-sm text-muted-foreground">
                          {new Date(payment.date).toLocaleDateString()} • {payment.method}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-green-600">{formatAmount(payment.amount)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Pending Fees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {stats.pendingFees.length === 0 ? (
                <p className="text-muted-foreground text-center py-4">No pending fees</p>
              ) : (
                stats.pendingFees.map((fee, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border border-border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                      <div>
                        <p className="font-medium">{fee.student_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Due: {new Date(fee.due_date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-orange-600">{formatAmount(fee.amount)}</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* System Status */}
      <div className="grid gap-6 md:grid-cols-1">
        <SystemStatus
          totalStudents={stats.totalStudents}
          totalStaff={stats.totalStaff}
          totalIncome={stats.totalIncome}
          totalExpenses={stats.totalExpenses}
          remainingFees={stats.remainingFees}
          netProfit={stats.netProfit}
          profitMargin={stats.profitMargin}
        />
      </div>
    </div>
  );
};

export default Dashboard;