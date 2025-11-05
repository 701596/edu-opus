export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          currency: string | null
          description: string
          expense_date: string
          id: string
          receipt_number: string
          updated_at: string
          user_id: string | null
          vendor: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          currency?: string | null
          description: string
          expense_date?: string
          id?: string
          receipt_number: string
          updated_at?: string
          user_id?: string | null
          vendor: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          currency?: string | null
          description?: string
          expense_date?: string
          id?: string
          receipt_number?: string
          updated_at?: string
          user_id?: string | null
          vendor?: string
        }
        Relationships: []
      }
      fee_folders: {
        Row: {
          amount_due: number
          amount_paid: number | null
          category: string
          created_at: string
          due_date: string
          folder_name: string
          id: string
          status: string
          student_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount_due: number
          amount_paid?: number | null
          category: string
          created_at?: string
          due_date: string
          folder_name: string
          id?: string
          status?: string
          student_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount_due?: number
          amount_paid?: number | null
          category?: string
          created_at?: string
          due_date?: string
          folder_name?: string
          id?: string
          status?: string
          student_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fee_folders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_audit: {
        Row: {
          amount: number
          created_at: string | null
          id: string
          method: string
          payment_id: string
          recorded_at: string | null
          student_id: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          method: string
          payment_id: string
          recorded_at?: string | null
          student_id: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          method?: string
          payment_id?: string
          recorded_at?: string | null
          student_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_audit_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_audit_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          currency: string | null
          description: string | null
          id: string
          payment_date: string
          payment_method: string
          receipt_number: string
          receipt_url: string | null
          student_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          payment_date?: string
          payment_method: string
          receipt_number: string
          receipt_url?: string | null
          student_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          payment_date?: string
          payment_method?: string
          receipt_number?: string
          receipt_url?: string | null
          student_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          created_at: string | null
          id: string
          month_start: string
          net: number | null
          total_expense: number | null
          total_income: number | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          month_start: string
          net?: number | null
          total_expense?: number | null
          total_income?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          month_start?: string
          net?: number | null
          total_expense?: number | null
          total_income?: number | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      salaries: {
        Row: {
          amount: number
          bonus: number | null
          created_at: string
          currency: string | null
          deductions: number | null
          id: string
          net_amount: number
          pay_period_end: string
          pay_period_start: string
          payment_date: string
          staff_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          bonus?: number | null
          created_at?: string
          currency?: string | null
          deductions?: number | null
          id?: string
          net_amount: number
          pay_period_end: string
          pay_period_start: string
          payment_date?: string
          staff_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          bonus?: number | null
          created_at?: string
          currency?: string | null
          deductions?: number | null
          id?: string
          net_amount?: number
          pay_period_end?: string
          pay_period_start?: string
          payment_date?: string
          staff_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "salaries_staff_id_fkey"
            columns: ["staff_id"]
            isOneToOne: false
            referencedRelation: "staff"
            referencedColumns: ["id"]
          },
        ]
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: Json
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value: Json
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: Json
        }
        Relationships: []
      }
      staff: {
        Row: {
          address: string | null
          created_at: string
          department: string | null
          email: string | null
          hire_date: string
          id: string
          join_date: string | null
          name: string
          phone: string
          position: string
          role: string | null
          salary: number
          salary_type: string | null
          staff_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          hire_date: string
          id?: string
          join_date?: string | null
          name: string
          phone: string
          position: string
          role?: string | null
          salary: number
          salary_type?: string | null
          staff_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          hire_date?: string
          id?: string
          join_date?: string | null
          name?: string
          phone?: string
          position?: string
          role?: string | null
          salary?: number
          salary_type?: string | null
          staff_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      students: {
        Row: {
          address: string | null
          class: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          enrollment_date: string
          fee_amount: number | null
          fee_type: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          join_date: string | null
          name: string
          payment_status: string | null
          phone: string | null
          remaining_fee: number | null
          student_id: string
          total_fee: number | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string
          fee_amount?: number | null
          fee_type?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          join_date?: string | null
          name: string
          payment_status?: string | null
          phone?: string | null
          remaining_fee?: number | null
          student_id: string
          total_fee?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string
          fee_amount?: number | null
          fee_type?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          join_date?: string | null
          name?: string
          payment_status?: string | null
          phone?: string | null
          remaining_fee?: number | null
          student_id?: string
          total_fee?: number | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      calculate_student_paid_fees: {
        Args: { student_uuid: string }
        Returns: number
      }
      calculate_student_remaining_fees: {
        Args: { student_uuid: string }
        Returns: number
      }
      recalc_monthly_report: {
        Args: { p_month: number; p_year: number }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
