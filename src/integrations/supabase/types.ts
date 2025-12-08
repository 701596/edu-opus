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
      attendance: {
        Row: {
          class_id: string | null
          created_at: string | null
          date: string
          id: string
          marked_by: string
          notes: string | null
          school_id: string
          status: string
          student_id: string
          updated_at: string | null
        }
        Insert: {
          class_id?: string | null
          created_at?: string | null
          date: string
          id?: string
          marked_by: string
          notes?: string | null
          school_id: string
          status: string
          student_id: string
          updated_at?: string | null
        }
        Update: {
          class_id?: string | null
          created_at?: string | null
          date?: string
          id?: string
          marked_by?: string
          notes?: string | null
          school_id?: string
          status?: string
          student_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attendance_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          id: string
          ip_address: string | null
          new_data: Json | null
          old_data: Json | null
          record_id: string | null
          school_id: string | null
          table_name: string
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          school_id?: string | null
          table_name: string
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          ip_address?: string | null
          new_data?: Json | null
          old_data?: Json | null
          record_id?: string | null
          school_id?: string | null
          table_name?: string
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      classes: {
        Row: {
          academic_year: string | null
          created_at: string | null
          grade: string | null
          id: string
          is_active: boolean | null
          name: string
          school_id: string
          section: string | null
          teacher_id: string | null
          updated_at: string | null
        }
        Insert: {
          academic_year?: string | null
          created_at?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          school_id: string
          section?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Update: {
          academic_year?: string | null
          created_at?: string | null
          grade?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          school_id?: string
          section?: string | null
          teacher_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "classes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
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
          school_id: string | null
          search_vector: unknown
          updated_at: string
          user_id: string
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
          school_id?: string | null
          search_vector?: unknown
          updated_at?: string
          user_id: string
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
          school_id?: string | null
          search_vector?: unknown
          updated_at?: string
          user_id?: string
          vendor?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_calculation_audit: {
        Row: {
          actor_id: string | null
          calculation_timestamp: string | null
          changed_fields: Json | null
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          student_id: string
        }
        Insert: {
          actor_id?: string | null
          calculation_timestamp?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          student_id: string
        }
        Update: {
          actor_id?: string | null
          calculation_timestamp?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          student_id?: string
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
      login_logs: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          ip_address: string | null
          role: string | null
          school_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          role?: string | null
          school_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          ip_address?: string | null
          role?: string | null
          school_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
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
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string | null
          id?: string
          method: string
          payment_id: string
          recorded_at?: string | null
          student_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string | null
          id?: string
          method?: string
          payment_id?: string
          recorded_at?: string | null
          student_id?: string
          user_id?: string
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
          category: string | null
          created_at: string
          currency: string | null
          description: string | null
          id: string
          payment_date: string
          payment_method: string
          receipt_number: string
          receipt_url: string | null
          school_id: string | null
          search_vector: unknown
          student_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          payment_date?: string
          payment_method: string
          receipt_number: string
          receipt_url?: string | null
          school_id?: string | null
          search_vector?: unknown
          student_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          currency?: string | null
          description?: string | null
          id?: string
          payment_date?: string
          payment_method?: string
          receipt_number?: string
          receipt_url?: string | null
          school_id?: string | null
          search_vector?: unknown
          student_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_payments_student_id"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
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
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          month_start: string
          net?: number | null
          total_expense?: number | null
          total_income?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          month_start?: string
          net?: number | null
          total_expense?: number | null
          total_income?: number | null
          updated_at?: string | null
          user_id?: string
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
          user_id: string
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
          user_id: string
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
          user_id?: string
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
      school_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          security_code: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          security_code?: string | null
          token: string
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
          security_code?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_invites_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      school_members: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string | null
          is_active: boolean | null
          joined_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_members_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      schools: {
        Row: {
          code: string | null
          created_at: string | null
          id: string
          name: string
          owner_id: string | null
          settings: Json | null
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          settings?: Json | null
          updated_at?: string | null
        }
        Relationships: []
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
          expected_salary_expense: number | null
          hire_date: string
          id: string
          is_archived: boolean
          join_date: string | null
          name: string
          paid_salary: number | null
          phone: string
          position: string
          role: string | null
          salary: number
          salary_type: string | null
          school_id: string | null
          staff_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          expected_salary_expense?: number | null
          hire_date: string
          id?: string
          is_archived?: boolean
          join_date?: string | null
          name: string
          paid_salary?: number | null
          phone: string
          position: string
          role?: string | null
          salary: number
          salary_type?: string | null
          school_id?: string | null
          staff_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          department?: string | null
          email?: string | null
          expected_salary_expense?: number | null
          hire_date?: string
          id?: string
          is_archived?: boolean
          join_date?: string | null
          name?: string
          paid_salary?: number | null
          phone?: string
          position?: string
          role?: string | null
          salary?: number
          salary_type?: string | null
          school_id?: string | null
          staff_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_invites: {
        Row: {
          accepted: boolean | null
          accepted_at: string | null
          accepted_by: string | null
          code: string | null
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invite_token: string
          owner_id: string
          role: string
          school_id: string
        }
        Insert: {
          accepted?: boolean | null
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string | null
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          invite_token?: string
          owner_id: string
          role: string
          school_id: string
        }
        Update: {
          accepted?: boolean | null
          accepted_at?: string | null
          accepted_by?: string | null
          code?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invite_token?: string
          owner_id?: string
          role?: string
          school_id?: string
        }
        Relationships: []
      }
      staff_members: {
        Row: {
          created_at: string | null
          id: string
          owner_id: string
          role: string
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          owner_id: string
          role: string
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          owner_id?: string
          role?: string
          school_id?: string
          user_id?: string
        }
        Relationships: []
      }
      staff_salary_audit: {
        Row: {
          actor_id: string | null
          calculation_timestamp: string | null
          changed_fields: Json | null
          created_at: string | null
          id: string
          new_values: Json | null
          old_values: Json | null
          staff_id: string
        }
        Insert: {
          actor_id?: string | null
          calculation_timestamp?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          staff_id: string
        }
        Update: {
          actor_id?: string | null
          calculation_timestamp?: string | null
          changed_fields?: Json | null
          created_at?: string | null
          id?: string
          new_values?: Json | null
          old_values?: Json | null
          staff_id?: string
        }
        Relationships: []
      }
      student_classes: {
        Row: {
          class_id: string
          enrolled_at: string | null
          id: string
          is_active: boolean | null
          student_id: string
        }
        Insert: {
          class_id: string
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id: string
        }
        Update: {
          class_id?: string
          enrolled_at?: string | null
          id?: string
          is_active?: boolean | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_classes_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_classes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
        ]
      }
      students: {
        Row: {
          address: string | null
          class: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          enrollment_date: string
          expected_fee: number | null
          fee_amount: number | null
          fee_type: string | null
          guardian_name: string | null
          guardian_phone: string | null
          id: string
          is_archived: boolean
          join_date: string | null
          metadata: Json | null
          name: string
          paid_fee: number | null
          payment_status: string | null
          phone: string | null
          remaining_fee: number | null
          school_id: string | null
          search_vector: unknown
          student_id: string
          total_fee: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string
          expected_fee?: number | null
          fee_amount?: number | null
          fee_type?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          is_archived?: boolean
          join_date?: string | null
          metadata?: Json | null
          name: string
          paid_fee?: number | null
          payment_status?: string | null
          phone?: string | null
          remaining_fee?: number | null
          school_id?: string | null
          search_vector?: unknown
          student_id: string
          total_fee?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          class?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          enrollment_date?: string
          expected_fee?: number | null
          fee_amount?: number | null
          fee_type?: string | null
          guardian_name?: string | null
          guardian_phone?: string | null
          id?: string
          is_archived?: boolean
          join_date?: string | null
          metadata?: Json | null
          name?: string
          paid_fee?: number | null
          payment_status?: string | null
          phone?: string | null
          remaining_fee?: number | null
          school_id?: string | null
          search_vector?: unknown
          student_id?: string
          total_fee?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_school_invite: {
        Args: { p_token: string; p_user_id?: string }
        Returns: {
          res_role: Database["public"]["Enums"]["user_role"]
          res_school_id: string
          res_school_name: string
        }[]
      }
      accept_school_invite_by_code: {
        Args: { p_code: string; p_user_id?: string }
        Returns: {
          res_role: Database["public"]["Enums"]["user_role"]
          res_school_id: string
          res_school_name: string
        }[]
      }
      calculate_expected_fee: {
        Args: {
          p_as_of_date?: string
          p_fee_amount: number
          p_fee_type: string
          p_join_date: string
        }
        Returns: number
      }
      calculate_expected_staff_expense: {
        Args: {
          p_as_of_date?: string
          p_join_date: string
          p_salary: number
          p_salary_type: string
        }
        Returns: number
      }
      calculate_student_paid_fees: {
        Args: { student_uuid: string }
        Returns: number
      }
      calculate_student_remaining_fees: {
        Args: { student_uuid: string }
        Returns: number
      }
      create_school_invite: {
        Args: {
          p_email: string
          p_expires_hours?: number
          p_role: Database["public"]["Enums"]["user_role"]
          p_school_id: string
        }
        Returns: {
          id: string
          security_code: string
          token: string
        }[]
      }
      deactivate_member_code: {
        Args: { p_member_id: string }
        Returns: boolean
      }
      get_attendance_stats: {
        Args: { p_class_id: string; p_end_date: string; p_start_date: string }
        Returns: {
          absent_days: number
          attendance_pct: number
          late_days: number
          present_days: number
          student_id: string
          student_name: string
          total_days: number
        }[]
      }
      get_audit_logs: {
        Args: { p_limit?: number; p_school_id: string; p_table_name?: string }
        Returns: {
          action: string
          created_at: string
          id: string
          new_data: Json
          old_data: Json
          record_id: string
          table_name: string
          user_id: string
        }[]
      }
      get_class_attendance: {
        Args: { p_class_id: string; p_date: string }
        Returns: {
          notes: string
          status: string
          student_id: string
          student_name: string
        }[]
      }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_invite_by_token: { Args: { p_token: string }; Returns: Json }
      get_report_summary: { Args: never; Returns: Json }
      get_school_invites: {
        Args: { p_school_id: string }
        Returns: {
          created_at: string
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
        }[]
      }
      get_school_members_extended: {
        Args: { p_school_id: string }
        Returns: {
          code_expires_at: string
          email: string
          is_active: boolean
          joined_at: string
          member_id: string
          role: Database["public"]["Enums"]["user_role"]
          security_code: string
          user_id: string
        }[]
      }
      get_table_triggers: {
        Args: { table_name: string }
        Returns: {
          action_statement: string
          event_manipulation: string
          trigger_name: string
        }[]
      }
      get_user_role: {
        Args: { p_school_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
      get_user_roles: {
        Args: never
        Returns: {
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          school_name: string
        }[]
      }
      get_user_school_id: { Args: never; Returns: string }
      has_role: {
        Args: {
          p_roles: Database["public"]["Enums"]["user_role"][]
          p_school_id: string
        }
        Returns: boolean
      }
      is_principal: { Args: never; Returns: boolean }
      is_school_principal: { Args: { p_school_id: string }; Returns: boolean }
      log_login: {
        Args: { p_role: string; p_school_id: string }
        Returns: undefined
      }
      mark_attendance_bulk: {
        Args: { p_attendance: Json; p_class_id: string; p_date: string }
        Returns: number
      }
      recalc_monthly_report:
        | {
            Args: { p_month: number; p_user_id: string; p_year: number }
            Returns: undefined
          }
        | { Args: { p_month: number; p_year: number }; Returns: undefined }
      remove_member: { Args: { p_member_id: string }; Returns: boolean }
      revoke_school_invite: { Args: { p_invite_id: string }; Returns: boolean }
      update_member_role: {
        Args: {
          p_member_id: string
          p_new_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: boolean
      }
      use_school_mode: { Args: never; Returns: boolean }
    }
    Enums: {
      user_role: "principal" | "accountant" | "cashier" | "teacher"
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
    Enums: {
      user_role: ["principal", "accountant", "cashier", "teacher"],
    },
  },
} as const
