import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { Users, UserCheck, CreditCard, TrendingUp, DollarSign, Receipt, LayoutDashboard } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';

interface DashboardStats {
  totalStudents: number;
  totalStaff: number;
  totalPayments: number;
  totalExpenses: number;
  netIncome: number;
  monthlyData: Array<{ month: string; income: number; expenses: number }>;
  paymentMethods: Array<{ name: string; value: number }>;
}

const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))'];

const Dashboard = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    totalStaff: 0,
    totalPayments: 0,
    totalExpenses: 0,
    netIncome: 0,
    monthlyData: [],
    paymentMethods: [],
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

    return () => {
      supabase.removeChannel(paymentsChannel);
      supabase.removeChannel(expensesChannel);
      supabase.removeChannel(studentsChannel);
      supabase.removeChannel(staffChannel);
    };
  }, []);

  const fetchDashboardData = async () => {
    try {
      // Fetch students count
      const { count: studentsCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true });

      // Fetch staff count
      const { count: staffCount } = await supabase
        .from('staff')
        .select('*', { count: 'exact', head: true });

      // Fetch total payments
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('amount, payment_method, payment_date');

      // Fetch total expenses
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, expense_date');

      const totalPayments = paymentsData?.reduce((sum, payment) => sum + Number(payment.amount), 0) || 0;
      const totalExpenses = expensesData?.reduce((sum, expense) => sum + Number(expense.amount), 0) || 0;
      const netIncome = totalPayments - totalExpenses;

      // Calculate monthly data for the last 6 months
      const monthlyData = calculateMonthlyData(paymentsData || [], expensesData || []);

      // Calculate payment methods distribution
      const paymentMethods = calculatePaymentMethodsData(paymentsData || []);

      setStats({
        totalStudents: studentsCount || 0,
        totalStaff: staffCount || 0,
        totalPayments,
        totalExpenses,
        netIncome,
        monthlyData,
        paymentMethods,
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  const calculateMonthlyData = (payments: any[], expenses: any[]) => {
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
      
      months.push({
        month: monthName,
        income: monthlyIncome,
        expenses: monthlyExpenses,
      });
    }
    
    return months;
  };

  const calculatePaymentMethodsData = (payments: any[]) => {
    const methodCounts: Record<string, number> = {};
    
    payments.forEach(payment => {
      const method = payment.payment_method || 'Unknown';
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    });
    
    return Object.entries(methodCounts).map(([name, value]) => ({ name, value }));
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

      {/* Stats Cards */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
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
            <div className="text-2xl font-bold text-foreground">{formatAmount(stats.totalPayments)}</div>
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

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Net Income</CardTitle>
            <TrendingUp className={`h-4 w-4 ${stats.netIncome >= 0 ? 'text-green-500' : 'text-destructive'}`} />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${stats.netIncome >= 0 ? 'text-green-500' : 'text-destructive'}`}>
              {formatAmount(stats.netIncome)}
            </div>
            <p className="text-xs text-muted-foreground">Profit/Loss</p>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Profit Margin</CardTitle>
            <DollarSign className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-foreground">
              {stats.totalPayments > 0 ? ((stats.netIncome / stats.totalPayments) * 100).toFixed(1) : 0}%
            </div>
            <p className="text-xs text-muted-foreground">Of total income</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 md:grid-cols-2">
        <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
          <CardHeader>
            <CardTitle className="text-foreground">Monthly Income vs Expenses</CardTitle>
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
    </div>
  );
};

export default Dashboard;