import { useCurrency } from '@/contexts/CurrencyContext';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign } from 'lucide-react';

export const CurrencySelector = () => {
  const { currency, setCurrency, availableCurrencies } = useCurrency();

  return (
    <div className="flex items-center gap-2">
      <DollarSign className="w-5 h-5 text-muted-foreground" />
      <Select
        value={currency.code}
        onValueChange={(code) => {
          const selected = availableCurrencies.find((c) => c.code === code);
          if (selected) setCurrency(selected);
        }}
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="Select currency" />
        </SelectTrigger>
        <SelectContent className="bg-popover z-50">
          {availableCurrencies.map((curr) => (
            <SelectItem key={curr.code} value={curr.code}>
              {curr.symbol} {curr.code} - {curr.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};