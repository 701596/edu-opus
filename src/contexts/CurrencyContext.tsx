import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface Currency {
  code: string;
  symbol: string;
  name: string;
}

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (currency: Currency) => Promise<void>;
  formatAmount: (amount: number) => string;
  availableCurrencies: Currency[];
}

const defaultCurrency: Currency = {
  code: 'USD',
  symbol: '$',
  name: 'US Dollar',
};

const availableCurrencies: Currency[] = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'INR', symbol: '₹', name: 'Indian Rupee' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
];

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider = ({ children }: { children: ReactNode }) => {
  const [currency, setCurrencyState] = useState<Currency>(defaultCurrency);
  const { toast } = useToast();

  useEffect(() => {
    fetchCurrency();
    
    // Set up real-time subscription
    // Minimal typed payload shape for realtime changes handler
    type SettingsPayload = { new?: { value?: unknown } };

    const channel = supabase
      .channel('settings-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'settings',
          filter: 'key=eq.currency',
        },
        (payload: SettingsPayload) => {
          if (payload.new && 'value' in payload.new && payload.new.value) {
            // value comes from the DB as JSON; perform a safe cast from unknown
            setCurrencyState((payload.new.value as unknown) as Currency);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchCurrency = async () => {
    try {
      const { data, error } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'currency')
        .single();

      if (error) throw error;
      if (data?.value) {
        setCurrencyState((data.value as unknown) as Currency);
      }
    } catch (err: unknown) {
      // Avoid assuming shape of error
      console.error('Error fetching currency:', err);
    }
  };

  const setCurrency = async (newCurrency: Currency) => {
    try {
      const { error } = await supabase
        .from('settings')
        .update({
          // store as JSON
          value: newCurrency as unknown,
        })
        .eq('key', 'currency');

      if (error) throw error;

      setCurrencyState(newCurrency);
      toast({
        title: 'Success',
        description: `Currency changed to ${newCurrency.name}`,
      });
    } catch (err: unknown) {
      const message = (err as { message?: string })?.message ?? 'Failed to update currency';
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    }
  };

  const formatAmount = (amount: number): string => {
    return `${currency.symbol}${amount.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        formatAmount,
        availableCurrencies,
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (context === undefined) {
    throw new Error('useCurrency must be used within a CurrencyProvider');
  }
  return context;
};