import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface SystemStatusProps {
  totalStudents: number;
  totalStaff: number;
  totalIncome: number;
  totalExpenses: number;
  remainingFees: number;
  netProfit: number;
  profitMargin: number;
}

const SystemStatus = ({
  totalStudents,
  totalStaff,
  totalIncome,
  totalExpenses,
  remainingFees,
  netProfit,
  profitMargin
}: SystemStatusProps) => {
  const { formatAmount } = useCurrency();

  const getHealthStatus = () => {
    if (profitMargin >= 20) return { status: 'excellent', color: 'text-green-600', icon: CheckCircle };
    if (profitMargin >= 10) return { status: 'good', color: 'text-blue-600', icon: TrendingUp };
    if (profitMargin >= 0) return { status: 'fair', color: 'text-yellow-600', icon: AlertCircle };
    return { status: 'poor', color: 'text-red-600', icon: XCircle };
  };

  const healthStatus = getHealthStatus();
  const HealthIcon = healthStatus.icon;

  return (
    <Card className="bg-gradient-to-br from-card via-card to-accent/5 border-0 shadow-card hover-lift">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <HealthIcon className={`h-5 w-5 ${healthStatus.color}`} />
          System Health Status
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{totalStudents}</div>
            <p className="text-sm text-muted-foreground">Students</p>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-foreground">{totalStaff}</div>
            <p className="text-sm text-muted-foreground">Staff</p>
          </div>
        </div>
        
        <div className="space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Net Profit</span>
            <span className={`font-semibold ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {formatAmount(netProfit)}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Profit Margin</span>
            <span className={`font-semibold ${healthStatus.color}`}>
              {profitMargin.toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">Outstanding Fees</span>
            <span className="font-semibold text-orange-600">
              {formatAmount(remainingFees)}
            </span>
          </div>
        </div>

        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Status</span>
            <Badge 
              variant={healthStatus.status === 'excellent' ? 'default' : 
                      healthStatus.status === 'good' ? 'secondary' : 
                      healthStatus.status === 'fair' ? 'outline' : 'destructive'}
              className="capitalize"
            >
              {healthStatus.status}
            </Badge>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SystemStatus;
