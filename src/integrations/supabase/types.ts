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
      ai_audit_logs: {
        Row: {
          action_type: string | null
          created_at: string | null
          id: string
          model_used: string | null
          query: string
          response: string | null
          school_id: string | null
          tokens_used: number | null
          user_id: string
        }
        Insert: {
          action_type?: string | null
          created_at?: string | null
          id?: string
          model_used?: string | null
          query: string
          response?: string | null
          school_id?: string | null
          tokens_used?: number | null
          user_id: string
        }
        Update: {
          action_type?: string | null
          created_at?: string | null
          id?: string
          model_used?: string | null
          query?: string
          response?: string | null
          school_id?: string | null
          tokens_used?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_audit_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_identity_memory: {
        Row: {
          authority: string | null
          created_at: string | null
          name: string | null
          role: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          authority?: string | null
          created_at?: string | null
          name?: string | null
          role?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          authority?: string | null
          created_at?: string | null
          name?: string | null
          role?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      ai_memories: {
        Row: {
          created_at: string | null
          id: string
          identity_memory: Json | null
          last_scrape_at: string | null
          memory_version: number | null
          messages: Json | null
          school_id: string | null
          summary: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          identity_memory?: Json | null
          last_scrape_at?: string | null
          memory_version?: number | null
          messages?: Json | null
          school_id?: string | null
          summary?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          identity_memory?: Json | null
          last_scrape_at?: string | null
          memory_version?: number | null
          messages?: Json | null
          school_id?: string | null
          summary?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_memories_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_pending_writes: {
        Row: {
          action_data: Json
          action_summary: string
          action_type: string
          confirmed: boolean | null
          created_at: string | null
          executed_at: string | null
          expires_at: string
          id: string
          school_id: string | null
          user_id: string
        }
        Insert: {
          action_data: Json
          action_summary: string
          action_type: string
          confirmed?: boolean | null
          created_at?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          school_id?: string | null
          user_id: string
        }
        Update: {
          action_data?: Json
          action_summary?: string
          action_type?: string
          confirmed?: boolean | null
          created_at?: string | null
          executed_at?: string | null
          expires_at?: string
          id?: string
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_pending_writes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
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
      backup_invite_audit: {
        Row: {
          action: string | null
          actor_id: string | null
          created_at: string | null
          id: string | null
          invite_id: string | null
          meta: Json | null
        }
        Insert: {
          action?: string | null
          actor_id?: string | null
          created_at?: string | null
          id?: string | null
          invite_id?: string | null
          meta?: Json | null
        }
        Update: {
          action?: string | null
          actor_id?: string | null
          created_at?: string | null
          id?: string | null
          invite_id?: string | null
          meta?: Json | null
        }
        Relationships: []
      }
      backup_school_invites: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          created_at: string | null
          email: string | null
          expires_at: string | null
          id: string | null
          invited_by: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          school_id: string | null
          security_code: string | null
          token: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
          security_code?: string | null
          token?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          created_at?: string | null
          email?: string | null
          expires_at?: string | null
          id?: string | null
          invited_by?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
          security_code?: string | null
          token?: string | null
        }
        Relationships: []
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
      invitation_codes: {
        Row: {
          code: string
          created_at: string | null
          created_by: string | null
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at: string | null
          used_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at?: string | null
          used_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
          updated_at?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitation_codes_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
      }
      invitations: {
        Row: {
          created_at: string | null
          created_by: string | null
          email: string
          expires_at: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          token: string
          updated_at: string | null
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          token?: string
          updated_at?: string | null
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
          token?: string
          updated_at?: string | null
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invitations_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
      profiles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string | null
        }
        Insert: {
          created_at?: string | null
          id: string
          role: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
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
      school_invite_whitelist: {
        Row: {
          created_at: string | null
          email: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          school_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_invite_whitelist_school_id_fkey"
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
          invite_used_code: string | null
          invite_used_type: string | null
          invited_by: string | null
          is_active: boolean | null
          joined_at: string | null
          last_active_at: string | null
          role: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invite_used_code?: string | null
          invite_used_type?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          last_active_at?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          school_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invite_used_code?: string | null
          invite_used_type?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          joined_at?: string | null
          last_active_at?: string | null
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
      school_staff: {
        Row: {
          created_at: string | null
          id: string
          joined_at: string | null
          role: string
          school_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          role?: string
          school_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          joined_at?: string | null
          role?: string
          school_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_staff_school_id_fkey"
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
      staff_login_logs: {
        Row: {
          device_info: string | null
          id: string
          ip_address: string | null
          login_at: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          school_id: string | null
          user_id: string
        }
        Insert: {
          device_info?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
          user_id: string
        }
        Update: {
          device_info?: string | null
          id?: string
          ip_address?: string | null
          login_at?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          school_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_login_logs_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["id"]
          },
        ]
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
      accept_hybrid_invite: {
        Args: { p_code?: string; p_token?: string }
        Returns: Json
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
      cleanup_expired_pending_writes: { Args: never; Returns: undefined }
      create_code_invite: {
        Args: {
          p_role: Database["public"]["Enums"]["user_role"]
          p_school_id: string
        }
        Returns: Json
      }
      create_email_invite: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_school_id: string
        }
        Returns: Json
      }
      deactivate_member_code: {
        Args: { p_member_id: string }
        Returns: boolean
      }
      generate_invite_code: { Args: never; Returns: string }
      generate_invite_code_segment: { Args: never; Returns: string }
      get_attendance_scoped: {
        Args: {
          p_class_id?: string
          p_class_name?: string
          p_date_from?: string
          p_date_to?: string
          p_school_id?: string
          p_status?: string
        }
        Returns: Json
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
        Args: { p_class_id: string; p_date?: string }
        Returns: {
          notes: string
          status: string
          student_id: string
          student_name: string
        }[]
      }
      get_class_attendance_paginated: {
        Args: {
          p_class_id: string
          p_date: string
          p_limit?: number
          p_page?: number
        }
        Returns: {
          notes: string
          status: string
          student_id: string
          student_name: string
        }[]
      }
      get_class_attendance_summary: {
        Args: { p_class_id: string }
        Returns: {
          attendance_percentage: number
          class_id: string
          present_count: number
          student_id: string
          student_name: string
          total_classes: number
        }[]
      }
      get_class_student_count: { Args: { p_class_id: string }; Returns: number }
      get_classes_scoped: { Args: { p_school_id?: string }; Returns: Json }
      get_dashboard_summary: { Args: never; Returns: Json }
      get_fees_scoped: {
        Args: {
          p_class_name?: string
          p_limit?: number
          p_month?: string
          p_school_id?: string
          p_status?: string
          p_year?: string
        }
        Returns: Json
      }
      get_report_summary: { Args: never; Returns: Json }
      get_school_activity: { Args: { p_school_id: string }; Returns: Json }
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
      get_school_quick_stats: { Args: { p_school_id?: string }; Returns: Json }
      get_staff_scoped: {
        Args: {
          p_department?: string
          p_limit?: number
          p_role?: string
          p_school_id?: string
        }
        Returns: Json
      }
      get_student_attendance_ranking: {
        Args: { p_class_id: string }
        Returns: {
          attendance_percentage: number
          rank: number
          student_id: string
          student_name: string
        }[]
      }
      get_students_scoped: {
        Args: {
          p_class_name?: string
          p_limit?: number
          p_school_id?: string
          p_status?: string
        }
        Returns: Json
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
      is_school_member: {
        Args: { p_roles: string[]; p_school_id: string }
        Returns: boolean
      }
      is_school_principal: { Args: { p_school_id: string }; Returns: boolean }
      is_user_principal: {
        Args: { p_user_id?: string }
        Returns: {
          is_principal: boolean
          school_id: string
        }[]
      }
      log_login:
        | { Args: { p_role: string; p_school_id: string }; Returns: undefined }
        | {
            Args: {
              p_device_info?: string
              p_ip_address?: string
              p_role: Database["public"]["Enums"]["user_role"]
              p_school_id: string
            }
            Returns: undefined
          }
      mark_attendance_bulk: {
        Args: { p_attendance: Json; p_class_id: string; p_date: string }
        Returns: undefined
      }
      recalc_monthly_report:
        | { Args: { p_month: number; p_year: number }; Returns: undefined }
        | {
            Args: { p_month: number; p_user_id: string; p_year: number }
            Returns: undefined
          }
      remove_member: { Args: { p_member_id: string }; Returns: boolean }
      update_heartbeat: { Args: never; Returns: undefined }
      update_member_role: {
        Args: {
          p_member_id: string
          p_new_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: boolean
      }
      use_school_mode: { Args: never; Returns: boolean }
      verify_hybrid_invite: {
        Args: { p_code?: string; p_token?: string }
        Returns: Json
      }
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
