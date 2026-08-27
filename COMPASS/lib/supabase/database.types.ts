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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_access_list: {
        Row: {
          added_by: string | null
          created_at: string | null
          email: string
          id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string | null
          email: string
          id?: string
        }
        Update: {
          added_by?: string | null
          created_at?: string | null
          email?: string
          id?: string
        }
        Relationships: []
      }
      app_documents: {
        Row: {
          ai_indexed: boolean | null
          ai_indexed_at: string | null
          category: string
          created_at: string
          current_status: string
          description: string | null
          id: string
          is_archived: boolean | null
          is_public: boolean | null
          owner_id: string
          text_content: string | null
          title: string
          updated_at: string
        }
        Insert: {
          ai_indexed?: boolean | null
          ai_indexed_at?: string | null
          category: string
          created_at?: string
          current_status?: string
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_public?: boolean | null
          owner_id: string
          text_content?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          ai_indexed?: boolean | null
          ai_indexed_at?: string | null
          category?: string
          created_at?: string
          current_status?: string
          description?: string | null
          id?: string
          is_archived?: boolean | null
          is_public?: boolean | null
          owner_id?: string
          text_content?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_records: {
        Row: {
          created_at: string
          created_by: string | null
          date: string
          id: string
          location: string | null
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          date: string
          id?: string
          location?: string | null
          note?: string | null
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          date?: string
          id?: string
          location?: string | null
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_records_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          ip_address: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          ip_address?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      bonuses: {
        Row: {
          amount: number
          attachment_filename: string | null
          attachment_mime: string | null
          attachment_path: string | null
          attachment_size_bytes: number | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          category: string
          client_name: string | null
          created_at: string
          currency: string
          custom_email_memo: string | null
          delivery_candidate_name: string | null
          delivery_consultant_id: string | null
          delivery_margin_amount: number | null
          delivery_margin_percent: number | null
          id: string
          linked_invoice_id: string | null
          notes: string | null
          paid_at: string | null
          period_month: number | null
          period_quarter: number | null
          period_year: number | null
          place_rank: number | null
          proposed_by: string
          reason: string
          recipient_user_id: string
          recruiter_calculated_tier: number | null
          recruiter_candidate_name: string | null
          recruiter_margin_per_hour: number | null
          sales_client_name: string | null
          sales_service_description: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          attachment_filename?: string | null
          attachment_mime?: string | null
          attachment_path?: string | null
          attachment_size_bytes?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          client_name?: string | null
          created_at?: string
          currency?: string
          custom_email_memo?: string | null
          delivery_candidate_name?: string | null
          delivery_consultant_id?: string | null
          delivery_margin_amount?: number | null
          delivery_margin_percent?: number | null
          id?: string
          linked_invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          period_month?: number | null
          period_quarter?: number | null
          period_year?: number | null
          place_rank?: number | null
          proposed_by: string
          reason: string
          recipient_user_id: string
          recruiter_calculated_tier?: number | null
          recruiter_candidate_name?: string | null
          recruiter_margin_per_hour?: number | null
          sales_client_name?: string | null
          sales_service_description?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          attachment_filename?: string | null
          attachment_mime?: string | null
          attachment_path?: string | null
          attachment_size_bytes?: number | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          category?: string
          client_name?: string | null
          created_at?: string
          currency?: string
          custom_email_memo?: string | null
          delivery_candidate_name?: string | null
          delivery_consultant_id?: string | null
          delivery_margin_amount?: number | null
          delivery_margin_percent?: number | null
          id?: string
          linked_invoice_id?: string | null
          notes?: string | null
          paid_at?: string | null
          period_month?: number | null
          period_quarter?: number | null
          period_year?: number | null
          place_rank?: number | null
          proposed_by?: string
          reason?: string
          recipient_user_id?: string
          recruiter_calculated_tier?: number | null
          recruiter_candidate_name?: string | null
          recruiter_margin_per_hour?: number | null
          sales_client_name?: string | null
          sales_service_description?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bonuses_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonuses_delivery_consultant_id_fkey"
            columns: ["delivery_consultant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonuses_linked_invoice_id_fkey"
            columns: ["linked_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonuses_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bonuses_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_areas: {
        Row: {
          client_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      client_departures: {
        Row: {
          client_name: string
          comment: string | null
          consultant_name: string
          contractor_id: string | null
          cost_rate: number | null
          created_at: string
          created_by: string | null
          departure_date: string | null
          external_key: string | null
          guarantee_ratio: number | null
          id: string
          imported_by: string | null
          last_import_batch_id: string | null
          last_notice_day: string | null
          manager_raw: string | null
          monthly_margin: number | null
          note_am: string | null
          note_hr: string | null
          order_number: string | null
          order_term: string | null
          placement_id: string | null
          position: string | null
          reason: string | null
          recruiter_id: string | null
          recruiter_raw: string | null
          replacement: boolean
          revenue_rate: number | null
          source: string
          start_date: string | null
          transferred: boolean
          updated_at: string
          who_resigned: string | null
        }
        Insert: {
          client_name: string
          comment?: string | null
          consultant_name: string
          contractor_id?: string | null
          cost_rate?: number | null
          created_at?: string
          created_by?: string | null
          departure_date?: string | null
          external_key?: string | null
          guarantee_ratio?: number | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          last_notice_day?: string | null
          manager_raw?: string | null
          monthly_margin?: number | null
          note_am?: string | null
          note_hr?: string | null
          order_number?: string | null
          order_term?: string | null
          placement_id?: string | null
          position?: string | null
          reason?: string | null
          recruiter_id?: string | null
          recruiter_raw?: string | null
          replacement?: boolean
          revenue_rate?: number | null
          source?: string
          start_date?: string | null
          transferred?: boolean
          updated_at?: string
          who_resigned?: string | null
        }
        Update: {
          client_name?: string
          comment?: string | null
          consultant_name?: string
          contractor_id?: string | null
          cost_rate?: number | null
          created_at?: string
          created_by?: string | null
          departure_date?: string | null
          external_key?: string | null
          guarantee_ratio?: number | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          last_notice_day?: string | null
          manager_raw?: string | null
          monthly_margin?: number | null
          note_am?: string | null
          note_hr?: string | null
          order_number?: string | null
          order_term?: string | null
          placement_id?: string | null
          position?: string | null
          reason?: string | null
          recruiter_id?: string | null
          recruiter_raw?: string | null
          replacement?: boolean
          revenue_rate?: number | null
          source?: string
          start_date?: string | null
          transferred?: boolean
          updated_at?: string
          who_resigned?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_departures_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_departures_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_departures_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_departures_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_departures_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      client_entries: {
        Row: {
          client_name: string
          consultant_name: string
          contractor_id: string | null
          cost_rate: number | null
          created_at: string
          delivery_lead_id: string | null
          delivery_lead_raw: string | null
          external_key: string | null
          guarantee: string | null
          id: string
          imported_by: string | null
          last_import_batch_id: string | null
          monthly_margin: number | null
          note_am: string | null
          note_billing: string | null
          note_hr: string | null
          order_number: string | null
          order_term: string | null
          position: string | null
          recruiter_id: string | null
          recruiter_raw: string | null
          revenue_rate: number | null
          signing_date: string | null
          source: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          client_name: string
          consultant_name: string
          contractor_id?: string | null
          cost_rate?: number | null
          created_at?: string
          delivery_lead_id?: string | null
          delivery_lead_raw?: string | null
          external_key?: string | null
          guarantee?: string | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          monthly_margin?: number | null
          note_am?: string | null
          note_billing?: string | null
          note_hr?: string | null
          order_number?: string | null
          order_term?: string | null
          position?: string | null
          recruiter_id?: string | null
          recruiter_raw?: string | null
          revenue_rate?: number | null
          signing_date?: string | null
          source?: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          client_name?: string
          consultant_name?: string
          contractor_id?: string | null
          cost_rate?: number | null
          created_at?: string
          delivery_lead_id?: string | null
          delivery_lead_raw?: string | null
          external_key?: string | null
          guarantee?: string | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          monthly_margin?: number | null
          note_am?: string | null
          note_billing?: string | null
          note_hr?: string | null
          order_number?: string | null
          order_term?: string | null
          position?: string | null
          recruiter_id?: string | null
          recruiter_raw?: string | null
          revenue_rate?: number | null
          signing_date?: string | null
          source?: string
          start_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_entries_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_entries_delivery_lead_id_fkey"
            columns: ["delivery_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_entries_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_entries_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "clients_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      compass_assist_knowledge: {
        Row: {
          category: string | null
          content: string
          created_at: string | null
          embedding: string | null
          id: string
          is_active: boolean | null
          source_id: string | null
          source_type: string | null
          tags: string[] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          content: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          source_id?: string | null
          source_type?: string | null
          tags?: string[] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          content?: string
          created_at?: string | null
          embedding?: string | null
          id?: string
          is_active?: boolean | null
          source_id?: string | null
          source_type?: string | null
          tags?: string[] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      compass_assist_tickets: {
        Row: {
          created_at: string | null
          id: string
          message: string
          priority: string | null
          status: string | null
          subject: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          message: string
          priority?: string | null
          status?: string | null
          subject: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          message?: string
          priority?: string | null
          status?: string | null
          subject?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      contractor_bench: {
        Row: {
          benefits: string
          client_name: string | null
          consultant_name: string
          contractor_id: string | null
          created_at: string
          created_by: string | null
          departure_date: string | null
          departure_id: string | null
          dismissed_at: string | null
          id: string
          notice_date: string | null
          role: string | null
          source: string
          status: string
          updated_at: string
        }
        Insert: {
          benefits?: string
          client_name?: string | null
          consultant_name: string
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          departure_date?: string | null
          departure_id?: string | null
          dismissed_at?: string | null
          id?: string
          notice_date?: string | null
          role?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Update: {
          benefits?: string
          client_name?: string | null
          consultant_name?: string
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          departure_date?: string | null
          departure_id?: string | null
          dismissed_at?: string | null
          id?: string
          notice_date?: string | null
          role?: string | null
          source?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_bench_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_bench_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_bench_departure_id_fkey"
            columns: ["departure_id"]
            isOneToOne: false
            referencedRelation: "client_departures"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_check_ins: {
        Row: {
          agenda: string | null
          assigned_tcm_id: string | null
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          channel: string | null
          check_in_type: string
          completed_at: string | null
          completed_by: string | null
          contractor_id: string
          created_at: string
          created_by: string | null
          duration_minutes: number | null
          health_review_on: string | null
          health_status: string | null
          health_status_reason: string | null
          id: string
          next_check_in_on: string | null
          notes: string | null
          occurred_at: string | null
          priority: string
          scheduled_at: string
          scheduled_for: string | null
          status: string
          summary: string | null
          tags: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          agenda?: string | null
          assigned_tcm_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: string | null
          check_in_type?: string
          completed_at?: string | null
          completed_by?: string | null
          contractor_id: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          health_review_on?: string | null
          health_status?: string | null
          health_status_reason?: string | null
          id?: string
          next_check_in_on?: string | null
          notes?: string | null
          occurred_at?: string | null
          priority?: string
          scheduled_at: string
          scheduled_for?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          agenda?: string | null
          assigned_tcm_id?: string | null
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          channel?: string | null
          check_in_type?: string
          completed_at?: string | null
          completed_by?: string | null
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          duration_minutes?: number | null
          health_review_on?: string | null
          health_status?: string | null
          health_status_reason?: string | null
          id?: string
          next_check_in_on?: string | null
          notes?: string | null
          occurred_at?: string | null
          priority?: string
          scheduled_at?: string
          scheduled_for?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_check_ins_assigned_tcm_id_fkey"
            columns: ["assigned_tcm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_check_ins_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_check_ins_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_check_ins_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_check_ins_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_check_ins_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_client_feedback: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          client_name_snapshot: string | null
          communication_rating: number | null
          contractor_id: string
          created_at: string
          engagement_rating: number | null
          feedback_date: string
          id: string
          improvement_areas: string | null
          overall_rating: number | null
          placement_id: string | null
          provided_by_name: string | null
          provided_by_role: string | null
          recommended_actions: string | null
          recorded_by: string | null
          reliability_rating: number | null
          risk_level: string
          source_check_in_id: string | null
          strengths: string | null
          summary: string | null
          technical_rating: number | null
          updated_at: string
          willing_to_continue: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          client_name_snapshot?: string | null
          communication_rating?: number | null
          contractor_id: string
          created_at?: string
          engagement_rating?: number | null
          feedback_date?: string
          id?: string
          improvement_areas?: string | null
          overall_rating?: number | null
          placement_id?: string | null
          provided_by_name?: string | null
          provided_by_role?: string | null
          recommended_actions?: string | null
          recorded_by?: string | null
          reliability_rating?: number | null
          risk_level?: string
          source_check_in_id?: string | null
          strengths?: string | null
          summary?: string | null
          technical_rating?: number | null
          updated_at?: string
          willing_to_continue?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          client_name_snapshot?: string | null
          communication_rating?: number | null
          contractor_id?: string
          created_at?: string
          engagement_rating?: number | null
          feedback_date?: string
          id?: string
          improvement_areas?: string | null
          overall_rating?: number | null
          placement_id?: string | null
          provided_by_name?: string | null
          provided_by_role?: string | null
          recommended_actions?: string | null
          recorded_by?: string | null
          reliability_rating?: number | null
          risk_level?: string
          source_check_in_id?: string | null
          strengths?: string | null
          summary?: string | null
          technical_rating?: number | null
          updated_at?: string
          willing_to_continue?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_client_feedback_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_client_feedback_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_client_feedback_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_client_feedback_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_client_feedback_source_check_in_id_fkey"
            columns: ["source_check_in_id"]
            isOneToOne: false
            referencedRelation: "contractor_check_ins"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_conversations: {
        Row: {
          category: string
          client_snapshot: string | null
          contractor_id: string
          conversation_date: string
          created_at: string
          created_by: string | null
          external_key: string | null
          follow_up_date: string | null
          id: string
          imported_by: string | null
          last_import_batch_id: string | null
          note: string | null
          placement_id: string | null
          resolved_at: string | null
          source: string
          status: string
          tcm_id: string | null
          tcm_raw: string | null
          updated_at: string
        }
        Insert: {
          category?: string
          client_snapshot?: string | null
          contractor_id: string
          conversation_date: string
          created_at?: string
          created_by?: string | null
          external_key?: string | null
          follow_up_date?: string | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          note?: string | null
          placement_id?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          tcm_id?: string | null
          tcm_raw?: string | null
          updated_at?: string
        }
        Update: {
          category?: string
          client_snapshot?: string | null
          contractor_id?: string
          conversation_date?: string
          created_at?: string
          created_by?: string | null
          external_key?: string | null
          follow_up_date?: string | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          note?: string | null
          placement_id?: string | null
          resolved_at?: string | null
          source?: string
          status?: string
          tcm_id?: string | null
          tcm_raw?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_conversations_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_conversations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_conversations_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_conversations_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_conversations_tcm_id_fkey"
            columns: ["tcm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_exit_interviews: {
        Row: {
          attachments: Json
          can_extend_departure: boolean | null
          can_retain_transfer: boolean | null
          causes: string | null
          client_snapshot: string | null
          contractor_id: string
          created_at: string
          created_by: string | null
          end_date: string | null
          extend_departure_note: string | null
          feedback_lessons: string | null
          formal_reason: string | null
          id: string
          is_final: boolean | null
          placement_id: string | null
          position_snapshot: string | null
          repair_potential: string | null
          retain_transfer_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          scheduled_for: string | null
          start_date: string | null
          status: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          can_extend_departure?: boolean | null
          can_retain_transfer?: boolean | null
          causes?: string | null
          client_snapshot?: string | null
          contractor_id: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          extend_departure_note?: string | null
          feedback_lessons?: string | null
          formal_reason?: string | null
          id?: string
          is_final?: boolean | null
          placement_id?: string | null
          position_snapshot?: string | null
          repair_potential?: string | null
          retain_transfer_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          scheduled_for?: string | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          can_extend_departure?: boolean | null
          can_retain_transfer?: boolean | null
          causes?: string | null
          client_snapshot?: string | null
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          extend_departure_note?: string | null
          feedback_lessons?: string | null
          formal_reason?: string | null
          id?: string
          is_final?: boolean | null
          placement_id?: string | null
          position_snapshot?: string | null
          repair_potential?: string | null
          retain_transfer_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          scheduled_for?: string | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_exit_interviews_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_exit_interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_exit_interviews_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_exit_interviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_health_status_history: {
        Row: {
          changed_by: string | null
          contractor_id: string
          created_at: string
          id: string
          new_review_on: string | null
          new_status: string
          previous_review_on: string | null
          previous_status: string | null
          reason: string | null
          source_id: string | null
          source_type: string
        }
        Insert: {
          changed_by?: string | null
          contractor_id: string
          created_at?: string
          id?: string
          new_review_on?: string | null
          new_status: string
          previous_review_on?: string | null
          previous_status?: string | null
          reason?: string | null
          source_id?: string | null
          source_type: string
        }
        Update: {
          changed_by?: string | null
          contractor_id?: string
          created_at?: string
          id?: string
          new_review_on?: string | null
          new_status?: string
          previous_review_on?: string | null
          previous_status?: string | null
          reason?: string | null
          source_id?: string | null
          source_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_health_status_history_changed_by_fkey"
            columns: ["changed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_health_status_history_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_onboarding_interviews: {
        Row: {
          attachments: Json
          client_manager_name: string | null
          client_snapshot: string | null
          contractor_id: string
          created_at: string
          created_by: string | null
          cs_challenge: string | null
          cs_client: string | null
          cs_sector: string | null
          cs_solution: string | null
          cs_technologies: string | null
          doubts_note: string | null
          duties_note: string | null
          equipment_note: string | null
          first_day_note: string | null
          id: string
          manager_relation_note: string | null
          missing_resolved_note: string | null
          negative_surprise: string | null
          placement_id: string | null
          position_snapshot: string | null
          positive_surprise: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          scheduled_for: string | null
          side_projects_interest: boolean | null
          start_date: string | null
          status: string
          submitted_at: string | null
          system_access_note: string | null
          tcm_role_note: string | null
          updated_at: string
          work_note: string | null
        }
        Insert: {
          attachments?: Json
          client_manager_name?: string | null
          client_snapshot?: string | null
          contractor_id: string
          created_at?: string
          created_by?: string | null
          cs_challenge?: string | null
          cs_client?: string | null
          cs_sector?: string | null
          cs_solution?: string | null
          cs_technologies?: string | null
          doubts_note?: string | null
          duties_note?: string | null
          equipment_note?: string | null
          first_day_note?: string | null
          id?: string
          manager_relation_note?: string | null
          missing_resolved_note?: string | null
          negative_surprise?: string | null
          placement_id?: string | null
          position_snapshot?: string | null
          positive_surprise?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          scheduled_for?: string | null
          side_projects_interest?: boolean | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          system_access_note?: string | null
          tcm_role_note?: string | null
          updated_at?: string
          work_note?: string | null
        }
        Update: {
          attachments?: Json
          client_manager_name?: string | null
          client_snapshot?: string | null
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          cs_challenge?: string | null
          cs_client?: string | null
          cs_sector?: string | null
          cs_solution?: string | null
          cs_technologies?: string | null
          doubts_note?: string | null
          duties_note?: string | null
          equipment_note?: string | null
          first_day_note?: string | null
          id?: string
          manager_relation_note?: string | null
          missing_resolved_note?: string | null
          negative_surprise?: string | null
          placement_id?: string | null
          position_snapshot?: string | null
          positive_surprise?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          scheduled_for?: string | null
          side_projects_interest?: boolean | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          system_access_note?: string | null
          tcm_role_note?: string | null
          updated_at?: string
          work_note?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_onboarding_interviews_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_onboarding_interviews_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_onboarding_interviews_placement_id_fkey"
            columns: ["placement_id"]
            isOneToOne: false
            referencedRelation: "placements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_onboarding_interviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_pulse_rate_limits: {
        Row: {
          attempts: number
          bucket_key: string
          updated_at: string
          window_started_at: string
        }
        Insert: {
          attempts: number
          bucket_key: string
          updated_at?: string
          window_started_at: string
        }
        Update: {
          attempts?: number
          bucket_key?: string
          updated_at?: string
          window_started_at?: string
        }
        Relationships: []
      }
      contractor_pulse_requests: {
        Row: {
          cancelled_at: string | null
          cancelled_by: string | null
          contractor_id: string
          created_at: string
          created_by: string | null
          delivery_channel: string
          expires_at: string
          id: string
          last_reminder_at: string | null
          next_reminder_at: string | null
          recipient_email_snapshot: string | null
          reminder_count: number
          responded_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          source_check_in_id: string | null
          status: string
          token_hash: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          contractor_id: string
          created_at?: string
          created_by?: string | null
          delivery_channel?: string
          expires_at: string
          id?: string
          last_reminder_at?: string | null
          next_reminder_at?: string | null
          recipient_email_snapshot?: string | null
          reminder_count?: number
          responded_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          source_check_in_id?: string | null
          status?: string
          token_hash: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          cancelled_by?: string | null
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          delivery_channel?: string
          expires_at?: string
          id?: string
          last_reminder_at?: string | null
          next_reminder_at?: string | null
          recipient_email_snapshot?: string | null
          reminder_count?: number
          responded_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          source_check_in_id?: string | null
          status?: string
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_pulse_requests_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_pulse_requests_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_pulse_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_pulse_requests_source_check_in_id_fkey"
            columns: ["source_check_in_id"]
            isOneToOne: false
            referencedRelation: "contractor_check_ins"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_pulse_responses: {
        Row: {
          engagement_score: number
          note: string | null
          recommendation_score: number
          request_id: string
          satisfaction_score: number
          submitted_at: string
        }
        Insert: {
          engagement_score: number
          note?: string | null
          recommendation_score: number
          request_id: string
          satisfaction_score: number
          submitted_at?: string
        }
        Update: {
          engagement_score?: number
          note?: string | null
          recommendation_score?: number
          request_id?: string
          satisfaction_score?: number
          submitted_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_pulse_responses_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "contractor_pulse_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_success_deliveries: {
        Row: {
          attempt_count: number
          available_at: string
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          contractor_id: string | null
          created_at: string
          dedupe_key: string
          delivery_kind: string
          entity_id: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          payload: Json
          recipient_email: string | null
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          available_at?: string
          channel: string
          claimed_at?: string | null
          claimed_by?: string | null
          contractor_id?: string | null
          created_at?: string
          dedupe_key: string
          delivery_kind: string
          entity_id: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          payload?: Json
          recipient_email?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          available_at?: string
          channel?: string
          claimed_at?: string | null
          claimed_by?: string | null
          contractor_id?: string | null
          created_at?: string
          dedupe_key?: string
          delivery_kind?: string
          entity_id?: string
          id?: string
          last_error?: string | null
          lease_expires_at?: string | null
          max_attempts?: number
          payload?: Json
          recipient_email?: string | null
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_success_deliveries_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_deliveries_recipient_user_id_fkey"
            columns: ["recipient_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_success_job_state: {
        Row: {
          cursor: Json
          job_name: string
          last_completed_at: string | null
          last_error: string | null
          last_error_at: string | null
          last_started_at: string | null
          last_success_at: string | null
          lease_expires_at: string | null
          lease_owner: string | null
          run_count: number
          updated_at: string
        }
        Insert: {
          cursor?: Json
          job_name: string
          last_completed_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_started_at?: string | null
          last_success_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          run_count?: number
          updated_at?: string
        }
        Update: {
          cursor?: Json
          job_name?: string
          last_completed_at?: string | null
          last_error?: string | null
          last_error_at?: string | null
          last_started_at?: string | null
          last_success_at?: string | null
          lease_expires_at?: string | null
          lease_owner?: string | null
          run_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      contractor_success_settings: {
        Row: {
          check_in_cadence_days: number
          contractor_id: string
          created_at: string
          created_by: string | null
          health_review_on: string | null
          health_reviewed_at: string | null
          health_reviewed_by: string | null
          health_status: string
          health_status_reason: string | null
          health_status_set_at: string | null
          health_status_set_by: string | null
          health_status_source: string
          health_status_source_id: string | null
          monitoring_paused_at: string | null
          monitoring_paused_by: string | null
          monitoring_started_at: string | null
          monitoring_started_by: string | null
          monitoring_status: string
          next_check_in_on: string | null
          status_verified_at: string | null
          status_verified_by: string | null
          surveys_enabled: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          check_in_cadence_days?: number
          contractor_id: string
          created_at?: string
          created_by?: string | null
          health_review_on?: string | null
          health_reviewed_at?: string | null
          health_reviewed_by?: string | null
          health_status?: string
          health_status_reason?: string | null
          health_status_set_at?: string | null
          health_status_set_by?: string | null
          health_status_source?: string
          health_status_source_id?: string | null
          monitoring_paused_at?: string | null
          monitoring_paused_by?: string | null
          monitoring_started_at?: string | null
          monitoring_started_by?: string | null
          monitoring_status?: string
          next_check_in_on?: string | null
          status_verified_at?: string | null
          status_verified_by?: string | null
          surveys_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          check_in_cadence_days?: number
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          health_review_on?: string | null
          health_reviewed_at?: string | null
          health_reviewed_by?: string | null
          health_status?: string
          health_status_reason?: string | null
          health_status_set_at?: string | null
          health_status_set_by?: string | null
          health_status_source?: string
          health_status_source_id?: string | null
          monitoring_paused_at?: string | null
          monitoring_paused_by?: string | null
          monitoring_started_at?: string | null
          monitoring_started_by?: string | null
          monitoring_status?: string
          next_check_in_on?: string | null
          status_verified_at?: string | null
          status_verified_by?: string | null
          surveys_enabled?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contractor_success_settings_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: true
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_settings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_settings_health_reviewed_by_fkey"
            columns: ["health_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_settings_health_status_set_by_fkey"
            columns: ["health_status_set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_settings_monitoring_paused_by_fkey"
            columns: ["monitoring_paused_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_settings_monitoring_started_by_fkey"
            columns: ["monitoring_started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_settings_status_verified_by_fkey"
            columns: ["status_verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_success_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contractor_tasks: {
        Row: {
          assigned_tcm_id: string | null
          completed_at: string | null
          contractor_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          original_due_date: string | null
          outcome: string | null
          priority: string
          snoozed_until: string | null
          source_check_in_id: string | null
          source_conversation_id: string | null
          source_feedback_id: string | null
          source_ticket_id: string | null
          status: string
          task_kind: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_tcm_id?: string | null
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          original_due_date?: string | null
          outcome?: string | null
          priority?: string
          snoozed_until?: string | null
          source_check_in_id?: string | null
          source_conversation_id?: string | null
          source_feedback_id?: string | null
          source_ticket_id?: string | null
          status?: string
          task_kind?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_tcm_id?: string | null
          completed_at?: string | null
          contractor_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          original_due_date?: string | null
          outcome?: string | null
          priority?: string
          snoozed_until?: string | null
          source_check_in_id?: string | null
          source_conversation_id?: string | null
          source_feedback_id?: string | null
          source_ticket_id?: string | null
          status?: string
          task_kind?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractor_tasks_assigned_tcm_id_fkey"
            columns: ["assigned_tcm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_tasks_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_tasks_source_check_in_id_fkey"
            columns: ["source_check_in_id"]
            isOneToOne: false
            referencedRelation: "contractor_check_ins"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_tasks_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "contractor_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_tasks_source_feedback_id_fkey"
            columns: ["source_feedback_id"]
            isOneToOne: false
            referencedRelation: "contractor_client_feedback"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractor_tasks_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      contractors: {
        Row: {
          created_at: string
          current_client: string | null
          current_position: string | null
          email: string | null
          full_name: string
          id: string
          imported_by: string | null
          last_import_batch_id: string | null
          notes: string | null
          owner_tcm_id: string | null
          phone: string | null
          profile_id: string | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_client?: string | null
          current_position?: string | null
          email?: string | null
          full_name: string
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          notes?: string | null
          owner_tcm_id?: string | null
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_client?: string | null
          current_position?: string | null
          email?: string | null
          full_name?: string
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          notes?: string | null
          owner_tcm_id?: string | null
          phone?: string | null
          profile_id?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contractors_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_owner_tcm_id_fkey"
            columns: ["owner_tcm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contractors_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      contracts: {
        Row: {
          client_name: string
          consultant_id: string
          contract_number: string | null
          created_at: string | null
          created_by: string | null
          currency: string | null
          deleted_at: string | null
          end_date: string
          extension_count: number | null
          health_score: number | null
          hourly_rate: number | null
          hours_per_week: number | null
          id: string
          last_health_check: string | null
          monthly_rate: number | null
          notes: string | null
          original_end_date: string | null
          position: string
          project_name: string
          start_date: string
          status: string
          updated_at: string | null
          work_location: string | null
          work_mode: string | null
        }
        Insert: {
          client_name: string
          consultant_id: string
          contract_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          end_date: string
          extension_count?: number | null
          health_score?: number | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          last_health_check?: string | null
          monthly_rate?: number | null
          notes?: string | null
          original_end_date?: string | null
          position: string
          project_name: string
          start_date: string
          status?: string
          updated_at?: string | null
          work_location?: string | null
          work_mode?: string | null
        }
        Update: {
          client_name?: string
          consultant_id?: string
          contract_number?: string | null
          created_at?: string | null
          created_by?: string | null
          currency?: string | null
          deleted_at?: string | null
          end_date?: string
          extension_count?: number | null
          health_score?: number | null
          hourly_rate?: number | null
          hours_per_week?: number | null
          id?: string
          last_health_check?: string | null
          monthly_rate?: number | null
          notes?: string | null
          original_end_date?: string | null
          position?: string
          project_name?: string
          start_date?: string
          status?: string
          updated_at?: string | null
          work_location?: string | null
          work_mode?: string | null
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          joined_at: string | null
          last_read_at: string | null
          role: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          joined_at?: string | null
          last_read_at?: string | null
          role?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          joined_at?: string | null
          last_read_at?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          id: string
          last_message_at: string | null
          name: string | null
          owner_id: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          name?: string | null
          owner_id?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          last_message_at?: string | null
          name?: string | null
          owner_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_answers: {
        Row: {
          answer_text: string
          created_at: string
          id: string
          is_author_answer: boolean
          question_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answer_text: string
          created_at?: string
          id?: string
          is_author_answer?: boolean
          question_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answer_text?: string
          created_at?: string
          id?: string
          is_author_answer?: boolean
          question_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_answers_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "course_questions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_answers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_enrollments: {
        Row: {
          certificate_hash: string | null
          certificate_issued_at: string | null
          completed_at: string | null
          completed_lessons: string[]
          course_id: string
          enrolled_at: string
          id: string
          last_accessed_at: string | null
          last_accessed_lesson_id: string | null
          last_inactivity_email_at: string | null
          lesson_completion_dates: Json
          points_awarded: boolean
          user_id: string
        }
        Insert: {
          certificate_hash?: string | null
          certificate_issued_at?: string | null
          completed_at?: string | null
          completed_lessons?: string[]
          course_id: string
          enrolled_at?: string
          id?: string
          last_accessed_at?: string | null
          last_accessed_lesson_id?: string | null
          last_inactivity_email_at?: string | null
          lesson_completion_dates?: Json
          points_awarded?: boolean
          user_id: string
        }
        Update: {
          certificate_hash?: string | null
          certificate_issued_at?: string | null
          completed_at?: string | null
          completed_lessons?: string[]
          course_id?: string
          enrolled_at?: string
          id?: string
          last_accessed_at?: string | null
          last_accessed_lesson_id?: string | null
          last_inactivity_email_at?: string | null
          lesson_completion_dates?: Json
          points_awarded?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_enrollments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_last_accessed_lesson_id_fkey"
            columns: ["last_accessed_lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_lessons: {
        Row: {
          ai_summary: string | null
          ai_summary_generated_at: string | null
          attachments: Json
          content_md: string | null
          course_id: string
          created_at: string
          estimated_minutes: number | null
          id: string
          order_index: number
          title: string
          unlock_after_days: number
          updated_at: string
          video_url: string | null
        }
        Insert: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          attachments?: Json
          content_md?: string | null
          course_id: string
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          order_index: number
          title: string
          unlock_after_days?: number
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          ai_summary?: string | null
          ai_summary_generated_at?: string | null
          attachments?: Json
          content_md?: string | null
          course_id?: string
          created_at?: string
          estimated_minutes?: number | null
          id?: string
          order_index?: number
          title?: string
          unlock_after_days?: number
          updated_at?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_lessons_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_questions: {
        Row: {
          answers_count: number
          course_id: string
          created_at: string
          id: string
          is_resolved: boolean
          lesson_id: string | null
          question_text: string
          updated_at: string
          user_id: string
        }
        Insert: {
          answers_count?: number
          course_id: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          lesson_id?: string | null
          question_text: string
          updated_at?: string
          user_id: string
        }
        Update: {
          answers_count?: number
          course_id?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          lesson_id?: string | null
          question_text?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_questions_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "course_lessons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_questions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_quiz_attempts: {
        Row: {
          answers: Json
          attempted_at: string
          course_id: string
          enrollment_id: string
          id: string
          passed: boolean
          score_percent: number
          user_id: string
        }
        Insert: {
          answers: Json
          attempted_at?: string
          course_id: string
          enrollment_id: string
          id?: string
          passed: boolean
          score_percent: number
          user_id: string
        }
        Update: {
          answers?: Json
          attempted_at?: string
          course_id?: string
          enrollment_id?: string
          id?: string
          passed?: boolean
          score_percent?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_quiz_attempts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_quiz_attempts_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_quiz_attempts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_quiz_options: {
        Row: {
          created_at: string
          id: string
          is_correct: boolean
          option_text: string
          order_index: number
          question_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text: string
          order_index: number
          question_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_correct?: boolean
          option_text?: string
          order_index?: number
          question_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_quiz_options_question_id_fkey"
            columns: ["question_id"]
            isOneToOne: false
            referencedRelation: "course_quiz_questions"
            referencedColumns: ["id"]
          },
        ]
      }
      course_quiz_questions: {
        Row: {
          course_id: string
          created_at: string
          id: string
          order_index: number
          question_text: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          order_index: number
          question_text: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          order_index?: number
          question_text?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_quiz_questions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_ratings: {
        Row: {
          comment: string | null
          course_id: string
          created_at: string
          id: string
          rating: number
          user_id: string
        }
        Insert: {
          comment?: string | null
          course_id: string
          created_at?: string
          id?: string
          rating: number
          user_id: string
        }
        Update: {
          comment?: string | null
          course_id?: string
          created_at?: string
          id?: string
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_ratings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_ratings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_survey_responses: {
        Row: {
          best_part: string | null
          course_id: string
          enrollment_id: string
          id: string
          improvement_suggestion: string | null
          nps_score: number | null
          submitted_at: string
          user_id: string
        }
        Insert: {
          best_part?: string | null
          course_id: string
          enrollment_id: string
          id?: string
          improvement_suggestion?: string | null
          nps_score?: number | null
          submitted_at?: string
          user_id: string
        }
        Update: {
          best_part?: string | null
          course_id?: string
          enrollment_id?: string
          id?: string
          improvement_suggestion?: string | null
          nps_score?: number | null
          submitted_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_survey_responses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_survey_responses_enrollment_id_fkey"
            columns: ["enrollment_id"]
            isOneToOne: false
            referencedRelation: "course_enrollments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_survey_responses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          author_id: string
          avg_rating: number
          category: string
          completions_count: number
          course_type: Database["public"]["Enums"]["course_type_t"]
          cover_image_url: string | null
          created_at: string
          description: string | null
          duration_minutes: number | null
          embedding: string | null
          embedding_generated_at: string | null
          enrollments_count: number
          id: string
          is_official: boolean
          level: string
          prerequisite_course_ids: string[]
          published_at: string | null
          ratings_count: number
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          status: string
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          avg_rating?: number
          category: string
          completions_count?: number
          course_type?: Database["public"]["Enums"]["course_type_t"]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          embedding?: string | null
          embedding_generated_at?: string | null
          enrollments_count?: number
          id?: string
          is_official?: boolean
          level?: string
          prerequisite_course_ids?: string[]
          published_at?: string | null
          ratings_count?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          status?: string
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          avg_rating?: number
          category?: string
          completions_count?: number
          course_type?: Database["public"]["Enums"]["course_type_t"]
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          embedding?: string | null
          embedding_generated_at?: string | null
          enrollments_count?: number
          id?: string
          is_official?: boolean
          level?: string
          prerequisite_course_ids?: string[]
          published_at?: string | null
          ratings_count?: number
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          status?: string
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_versions: {
        Row: {
          change_summary: string | null
          created_at: string
          document_id: string
          file_name: string
          file_size: number | null
          file_url: string
          id: string
          uploaded_by: string
          version_number: number
        }
        Insert: {
          change_summary?: string | null
          created_at?: string
          document_id: string
          file_name: string
          file_size?: number | null
          file_url: string
          id?: string
          uploaded_by: string
          version_number: number
        }
        Update: {
          change_summary?: string | null
          created_at?: string
          document_id?: string
          file_name?: string
          file_size?: number | null
          file_url?: string
          id?: string
          uploaded_by?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "app_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_versions_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exit_cases: {
        Row: {
          attachments: Json
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          client_snapshot: string | null
          contractor_form: Json
          created_at: string
          created_by: string | null
          department_snapshot: string | null
          end_date: string | null
          exit_reason: string | null
          exit_reason_detail: string | null
          id: string
          is_anonymous: boolean
          knowledge_transfer_notes: string | null
          manager_snapshot: string | null
          nps_score: number | null
          person_id: string | null
          person_type: string
          placement_id: string | null
          position_snapshot: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          role_snapshot: string | null
          satisfaction_manager: number | null
          satisfaction_projects: number | null
          satisfaction_team: number | null
          scheduled_for: string | null
          start_date: string | null
          status: string
          submitted_at: string | null
          tenure_months: number | null
          updated_at: string
          what_to_improve: string | null
          what_worked: string | null
          would_recommend: boolean | null
        }
        Insert: {
          attachments?: Json
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          client_snapshot?: string | null
          contractor_form?: Json
          created_at?: string
          created_by?: string | null
          department_snapshot?: string | null
          end_date?: string | null
          exit_reason?: string | null
          exit_reason_detail?: string | null
          id?: string
          is_anonymous?: boolean
          knowledge_transfer_notes?: string | null
          manager_snapshot?: string | null
          nps_score?: number | null
          person_id?: string | null
          person_type: string
          placement_id?: string | null
          position_snapshot?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          role_snapshot?: string | null
          satisfaction_manager?: number | null
          satisfaction_projects?: number | null
          satisfaction_team?: number | null
          scheduled_for?: string | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          tenure_months?: number | null
          updated_at?: string
          what_to_improve?: string | null
          what_worked?: string | null
          would_recommend?: boolean | null
        }
        Update: {
          attachments?: Json
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          client_snapshot?: string | null
          contractor_form?: Json
          created_at?: string
          created_by?: string | null
          department_snapshot?: string | null
          end_date?: string | null
          exit_reason?: string | null
          exit_reason_detail?: string | null
          id?: string
          is_anonymous?: boolean
          knowledge_transfer_notes?: string | null
          manager_snapshot?: string | null
          nps_score?: number | null
          person_id?: string | null
          person_type?: string
          placement_id?: string | null
          position_snapshot?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          role_snapshot?: string | null
          satisfaction_manager?: number | null
          satisfaction_projects?: number | null
          satisfaction_team?: number | null
          scheduled_for?: string | null
          start_date?: string | null
          status?: string
          submitted_at?: string | null
          tenure_months?: number | null
          updated_at?: string
          what_to_improve?: string | null
          what_worked?: string | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "exit_cases_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_cases_manager_snapshot_fkey"
            columns: ["manager_snapshot"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_cases_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exit_interview_attachments: {
        Row: {
          file_hash: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          interview_id: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_hash?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          interview_id: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_hash?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          interview_id?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "exit_interview_attachments_interview_id_fkey"
            columns: ["interview_id"]
            isOneToOne: false
            referencedRelation: "exit_interviews"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_interview_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      exit_interviews: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          department_snapshot: string | null
          exit_reason: string | null
          exit_reason_detail: string | null
          id: string
          invitation_sent_at: string | null
          invitation_sent_by: string | null
          is_anonymous: boolean
          knowledge_transfer_notes: string | null
          manager_checklist_sent_at: string | null
          manager_checklist_sent_by: string | null
          manager_snapshot: string | null
          nps_score: number | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          role_snapshot: string
          satisfaction_manager: number | null
          satisfaction_projects: number | null
          satisfaction_team: number | null
          scheduled_for: string | null
          status: string
          submitted_at: string | null
          tenure_months: number | null
          updated_at: string
          user_id: string | null
          what_to_improve: string | null
          what_worked: string | null
          would_recommend: boolean | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          department_snapshot?: string | null
          exit_reason?: string | null
          exit_reason_detail?: string | null
          id?: string
          invitation_sent_at?: string | null
          invitation_sent_by?: string | null
          is_anonymous?: boolean
          knowledge_transfer_notes?: string | null
          manager_checklist_sent_at?: string | null
          manager_checklist_sent_by?: string | null
          manager_snapshot?: string | null
          nps_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          role_snapshot: string
          satisfaction_manager?: number | null
          satisfaction_projects?: number | null
          satisfaction_team?: number | null
          scheduled_for?: string | null
          status?: string
          submitted_at?: string | null
          tenure_months?: number | null
          updated_at?: string
          user_id?: string | null
          what_to_improve?: string | null
          what_worked?: string | null
          would_recommend?: boolean | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          department_snapshot?: string | null
          exit_reason?: string | null
          exit_reason_detail?: string | null
          id?: string
          invitation_sent_at?: string | null
          invitation_sent_by?: string | null
          is_anonymous?: boolean
          knowledge_transfer_notes?: string | null
          manager_checklist_sent_at?: string | null
          manager_checklist_sent_by?: string | null
          manager_snapshot?: string | null
          nps_score?: number | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          role_snapshot?: string
          satisfaction_manager?: number | null
          satisfaction_projects?: number | null
          satisfaction_team?: number | null
          scheduled_for?: string | null
          status?: string
          submitted_at?: string | null
          tenure_months?: number | null
          updated_at?: string
          user_id?: string | null
          what_to_improve?: string | null
          what_worked?: string | null
          would_recommend?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "exit_interviews_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_interviews_invitation_sent_by_fkey"
            columns: ["invitation_sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_interviews_manager_checklist_sent_by_fkey"
            columns: ["manager_checklist_sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_interviews_manager_snapshot_fkey"
            columns: ["manager_snapshot"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_interviews_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exit_interviews_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      favorite_projects: {
        Row: {
          created_at: string
          id: string
          note: string | null
          project_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          project_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          project_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "favorite_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      inbox_sync_state: {
        Row: {
          group_id: string | null
          last_appended: number
          last_created: number
          last_error: string | null
          last_run_at: string | null
          last_scanned: number
          last_skipped: number
          last_synced_at: string
          mailbox: string
          mailbox_kind: string
          updated_at: string
        }
        Insert: {
          group_id?: string | null
          last_appended?: number
          last_created?: number
          last_error?: string | null
          last_run_at?: string | null
          last_scanned?: number
          last_skipped?: number
          last_synced_at: string
          mailbox: string
          mailbox_kind?: string
          updated_at?: string
        }
        Update: {
          group_id?: string | null
          last_appended?: number
          last_created?: number
          last_error?: string | null
          last_run_at?: string | null
          last_scanned?: number
          last_skipped?: number
          last_synced_at?: string
          mailbox?: string
          mailbox_kind?: string
          updated_at?: string
        }
        Relationships: []
      }
      incubator_applications: {
        Row: {
          applicant_id: string
          created_at: string
          id: string
          motivation_md: string
          project_id: string
          status: string
          updated_at: string
        }
        Insert: {
          applicant_id: string
          created_at?: string
          id?: string
          motivation_md: string
          project_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          applicant_id?: string
          created_at?: string
          id?: string
          motivation_md?: string
          project_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubator_applications_applicant_id_fkey"
            columns: ["applicant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_applications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "incubator_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      incubator_pitches: {
        Row: {
          attachment_urls: string[] | null
          created_at: string
          description_md: string
          equity_ask: string | null
          id: string
          investment_ask_pln: number | null
          nda_accepted_at: string
          review_notes_md: string | null
          reviewer_id: string | null
          status: string
          submitter_id: string
          title: string
          updated_at: string
        }
        Insert: {
          attachment_urls?: string[] | null
          created_at?: string
          description_md: string
          equity_ask?: string | null
          id?: string
          investment_ask_pln?: number | null
          nda_accepted_at: string
          review_notes_md?: string | null
          reviewer_id?: string | null
          status?: string
          submitter_id: string
          title: string
          updated_at?: string
        }
        Update: {
          attachment_urls?: string[] | null
          created_at?: string
          description_md?: string
          equity_ask?: string | null
          id?: string
          investment_ask_pln?: number | null
          nda_accepted_at?: string
          review_notes_md?: string | null
          reviewer_id?: string | null
          status?: string
          submitter_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubator_pitches_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incubator_pitches_submitter_id_fkey"
            columns: ["submitter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incubator_projects: {
        Row: {
          closes_at: string | null
          compensation_model: string | null
          created_at: string
          description_md: string
          id: string
          opens_at: string | null
          owner_id: string
          slug: string
          status: string
          tech_stack: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          closes_at?: string | null
          compensation_model?: string | null
          created_at?: string
          description_md: string
          id?: string
          opens_at?: string | null
          owner_id: string
          slug: string
          status?: string
          tech_stack?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          closes_at?: string | null
          compensation_model?: string | null
          created_at?: string
          description_md?: string
          id?: string
          opens_at?: string | null
          owner_id?: string
          slug?: string
          status?: string
          tech_stack?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incubator_projects_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          due_date: string | null
          file_hash: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          invoice_number: string
          issue_date: string
          manager_review_note: string | null
          manager_reviewed_at: string | null
          manager_reviewed_by: string | null
          notes: string | null
          period_month: number
          period_year: number
          rejected_by_stage: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          due_date?: string | null
          file_hash?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          invoice_number: string
          issue_date?: string
          manager_review_note?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          notes?: string | null
          period_month: number
          period_year: number
          rejected_by_stage?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          due_date?: string | null
          file_hash?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          invoice_number?: string
          issue_date?: string
          manager_review_note?: string | null
          manager_reviewed_at?: string | null
          manager_reviewed_by?: string | null
          notes?: string | null
          period_month?: number
          period_year?: number
          rejected_by_stage?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_manager_reviewed_by_fkey"
            columns: ["manager_reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_path_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          is_required: boolean
          order_index: number
          path_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          is_required?: boolean
          order_index: number
          path_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          is_required?: boolean
          order_index?: number
          path_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_courses_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_path_enrollments: {
        Row: {
          completed_at: string | null
          enrolled_at: string
          id: string
          path_id: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          enrolled_at?: string
          id?: string
          path_id: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          enrolled_at?: string
          id?: string
          path_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_path_enrollments_path_id_fkey"
            columns: ["path_id"]
            isOneToOne: false
            referencedRelation: "learning_paths"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_path_enrollments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_paths: {
        Row: {
          author_id: string
          completions_count: number
          cover_image_url: string | null
          created_at: string
          description: string | null
          enrollments_count: number
          estimated_hours: number | null
          id: string
          level: string
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          completions_count?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          enrollments_count?: number
          estimated_hours?: number | null
          id?: string
          level?: string
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          completions_count?: number
          cover_image_url?: string | null
          created_at?: string
          description?: string | null
          enrollments_count?: number
          estimated_hours?: number | null
          id?: string
          level?: string
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_paths_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_requests: {
        Row: {
          created_at: string
          created_by: string
          created_on_behalf: boolean
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          documentation_url: string | null
          end_date: string
          forward_mail_enabled: boolean
          graph_oof_set: boolean
          graph_oof_set_at: string | null
          graph_oof_skip_reason: string | null
          graph_sync_error: string | null
          half_day: string | null
          id: string
          leave_type: string
          note: string | null
          oof_external_message: string | null
          oof_internal_message: string | null
          outlook_event_id: string | null
          outlook_forward_rule_id: string | null
          paid_days: number
          source: string | null
          start_date: string
          status: string
          substitute_id: string | null
          unpaid_days: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          created_on_behalf?: boolean
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          documentation_url?: string | null
          end_date: string
          forward_mail_enabled?: boolean
          graph_oof_set?: boolean
          graph_oof_set_at?: string | null
          graph_oof_skip_reason?: string | null
          graph_sync_error?: string | null
          half_day?: string | null
          id?: string
          leave_type: string
          note?: string | null
          oof_external_message?: string | null
          oof_internal_message?: string | null
          outlook_event_id?: string | null
          outlook_forward_rule_id?: string | null
          paid_days?: number
          source?: string | null
          start_date: string
          status?: string
          substitute_id?: string | null
          unpaid_days?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          created_on_behalf?: boolean
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          documentation_url?: string | null
          end_date?: string
          forward_mail_enabled?: boolean
          graph_oof_set?: boolean
          graph_oof_set_at?: string | null
          graph_oof_skip_reason?: string | null
          graph_sync_error?: string | null
          half_day?: string | null
          id?: string
          leave_type?: string
          note?: string | null
          oof_external_message?: string | null
          oof_internal_message?: string | null
          outlook_event_id?: string | null
          outlook_forward_rule_id?: string | null
          paid_days?: number
          source?: string | null
          start_date?: string
          status?: string
          substitute_id?: string | null
          unpaid_days?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leave_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_substitute_id_fkey"
            columns: ["substitute_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leave_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_monitor_items: {
        Row: {
          alerted_at: string | null
          pinned_at: string | null
          pinned_by: string | null
          assigned_to: string | null
          due_date: string | null
          reminded_at: string | null
          created_at: string
          dedupe_key: string
          id: string
          published_at: string | null
          reference: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          severity: string
          source: string
          source_label: string
          status: string
          summary: string
          title: string
          topic: string
          url: string | null
          why_it_matters: string
        }
        Insert: {
          alerted_at?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          assigned_to?: string | null
          due_date?: string | null
          reminded_at?: string | null
          created_at?: string
          dedupe_key: string
          id?: string
          published_at?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity: string
          source: string
          source_label: string
          status?: string
          summary: string
          title: string
          topic: string
          url?: string | null
          why_it_matters: string
        }
        Update: {
          alerted_at?: string | null
          pinned_at?: string | null
          pinned_by?: string | null
          assigned_to?: string | null
          due_date?: string | null
          reminded_at?: string | null
          created_at?: string
          dedupe_key?: string
          id?: string
          published_at?: string | null
          reference?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          severity?: string
          source?: string
          source_label?: string
          status?: string
          summary?: string
          title?: string
          topic?: string
          url?: string | null
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "legal_monitor_items_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "legal_monitor_items_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      legal_monitor_runs: {
        Row: {
          id: string
          items_found: number
          notes: string | null
          run_at: string
          sources_checked: Json
          status: string
          window_from: string | null
        }
        Insert: {
          id?: string
          items_found?: number
          notes?: string | null
          run_at?: string
          sources_checked?: Json
          status: string
          window_from?: string | null
        }
        Update: {
          id?: string
          items_found?: number
          notes?: string | null
          run_at?: string
          sources_checked?: Json
          status?: string
          window_from?: string | null
        }
        Relationships: []
      }
      lifecycle_events: {
        Row: {
          created_at: string
          created_by: string | null
          event_type: string
          id: string
          metadata: Json
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          event_type: string
          id?: string
          metadata?: Json
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lifecycle_notes: {
        Row: {
          author_id: string | null
          category: string
          content: string
          created_at: string
          id: string
          is_private: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          author_id?: string | null
          category?: string
          content: string
          created_at?: string
          id?: string
          is_private?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          author_id?: string | null
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_private?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lifecycle_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lifecycle_notes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      login_attempts: {
        Row: {
          attempt_time: string | null
          email: string
          id: string
          ip_address: string
          success: boolean | null
        }
        Insert: {
          attempt_time?: string | null
          email: string
          id?: string
          ip_address: string
          success?: boolean | null
        }
        Update: {
          attempt_time?: string | null
          email?: string
          id?: string
          ip_address?: string
          success?: boolean | null
        }
        Relationships: []
      }
      loyalty_rules: {
        Row: {
          category: string
          code: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          points: number
          updated_at: string
        }
        Insert: {
          category: string
          code: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points: number
          updated_at?: string
        }
        Update: {
          category?: string
          code?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_transactions: {
        Row: {
          confirmed_at: string | null
          created_at: string | null
          description: string
          id: string
          points: number
          reverses_id: string | null
          source_id: string | null
          source_type: string
          status: string
          user_id: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string | null
          description: string
          id?: string
          points: number
          reverses_id?: string | null
          source_id?: string | null
          source_type: string
          status?: string
          user_id: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string | null
          description?: string
          id?: string
          points?: number
          reverses_id?: string | null
          source_id?: string | null
          source_type?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_reverses_id_fkey"
            columns: ["reverses_id"]
            isOneToOne: false
            referencedRelation: "loyalty_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          attachment_url: string | null
          content: string | null
          conversation_id: string
          created_at: string | null
          id: string
          sender_id: string
          type: string | null
        }
        Insert: {
          attachment_url?: string | null
          content?: string | null
          conversation_id: string
          created_at?: string | null
          id?: string
          sender_id: string
          type?: string | null
        }
        Update: {
          attachment_url?: string | null
          content?: string | null
          conversation_id?: string
          created_at?: string | null
          id?: string
          sender_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news_post_reads: {
        Row: {
          post_id: string
          read_at: string
          user_id: string
        }
        Insert: {
          post_id: string
          read_at?: string
          user_id: string
        }
        Update: {
          post_id?: string
          read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_post_reads_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "news_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_post_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news_posts: {
        Row: {
          audience_role: string[] | null
          author_id: string
          body_md: string
          cover_url: string | null
          created_at: string
          excerpt: string | null
          id: string
          pinned: boolean
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_role?: string[] | null
          author_id: string
          body_md: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          pinned?: boolean
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_role?: string[] | null
          author_id?: string
          body_md?: string
          cover_url?: string | null
          created_at?: string
          excerpt?: string | null
          id?: string
          pinned?: boolean
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_posts_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      news_reactions: {
        Row: {
          created_at: string
          id: string
          kind: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "news_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "news_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "news_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          body_en: string | null
          body_pl: string | null
          created_at: string | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          priority: string | null
          read_at: string | null
          title_en: string
          title_pl: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          body_en?: string | null
          body_pl?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          priority?: string | null
          read_at?: string | null
          title_en: string
          title_pl: string
          type: string
          user_id: string
        }
        Update: {
          action_url?: string | null
          body_en?: string | null
          body_pl?: string | null
          created_at?: string | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          priority?: string | null
          read_at?: string | null
          title_en?: string
          title_pl?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      offboarding_tasks: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          is_required: boolean
          notes: string | null
          position: number
          responsible_role: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          category: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          notes?: string | null
          position?: number
          responsible_role?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          is_required?: boolean
          notes?: string | null
          position?: number
          responsible_role?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offboarding_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offboarding_tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_cases: {
        Row: {
          attachments: Json
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          checkin_day1_at: string | null
          checkin_day1_note: string | null
          checkin_day1_score: number | null
          checkin_day30_at: string | null
          checkin_day30_note: string | null
          checkin_day30_score: number | null
          checkin_day7_at: string | null
          checkin_day7_note: string | null
          checkin_day7_score: number | null
          client_snapshot: string | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          interview: Json
          owner_id: string | null
          person_id: string
          person_type: string
          placement_id: string | null
          position_snapshot: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          reviewer_note: string | null
          scheduled_for: string | null
          start_date: string | null
          started_at: string | null
          status: string
          submitted_at: string | null
          template_id: string | null
          updated_at: string
        }
        Insert: {
          attachments?: Json
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          checkin_day1_at?: string | null
          checkin_day1_note?: string | null
          checkin_day1_score?: number | null
          checkin_day30_at?: string | null
          checkin_day30_note?: string | null
          checkin_day30_score?: number | null
          checkin_day7_at?: string | null
          checkin_day7_note?: string | null
          checkin_day7_score?: number | null
          client_snapshot?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interview?: Json
          owner_id?: string | null
          person_id: string
          person_type: string
          placement_id?: string | null
          position_snapshot?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          scheduled_for?: string | null
          start_date?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          attachments?: Json
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          checkin_day1_at?: string | null
          checkin_day1_note?: string | null
          checkin_day1_score?: number | null
          checkin_day30_at?: string | null
          checkin_day30_note?: string | null
          checkin_day30_score?: number | null
          checkin_day7_at?: string | null
          checkin_day7_note?: string | null
          checkin_day7_score?: number | null
          client_snapshot?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          interview?: Json
          owner_id?: string | null
          person_id?: string
          person_type?: string
          placement_id?: string | null
          position_snapshot?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          reviewer_note?: string | null
          scheduled_for?: string | null
          start_date?: string | null
          started_at?: string | null
          status?: string
          submitted_at?: string | null
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_cases_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_cases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_cases_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_cases_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_cases_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_progress: {
        Row: {
          cancellation_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          checkin_day1_at: string | null
          checkin_day1_note: string | null
          checkin_day1_score: number | null
          checkin_day30_at: string | null
          checkin_day30_note: string | null
          checkin_day30_score: number | null
          checkin_day7_at: string | null
          checkin_day7_note: string | null
          checkin_day7_score: number | null
          completed_at: string | null
          created_at: string
          id: string
          started_at: string
          template_id: string
          updated_at: string
          user_id: string
          welcome_email_sent_at: string | null
          welcome_email_sent_by: string | null
        }
        Insert: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkin_day1_at?: string | null
          checkin_day1_note?: string | null
          checkin_day1_score?: number | null
          checkin_day30_at?: string | null
          checkin_day30_note?: string | null
          checkin_day30_score?: number | null
          checkin_day7_at?: string | null
          checkin_day7_note?: string | null
          checkin_day7_score?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          started_at?: string
          template_id: string
          updated_at?: string
          user_id: string
          welcome_email_sent_at?: string | null
          welcome_email_sent_by?: string | null
        }
        Update: {
          cancellation_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          checkin_day1_at?: string | null
          checkin_day1_note?: string | null
          checkin_day1_score?: number | null
          checkin_day30_at?: string | null
          checkin_day30_note?: string | null
          checkin_day30_score?: number | null
          checkin_day7_at?: string | null
          checkin_day7_note?: string | null
          checkin_day7_score?: number | null
          completed_at?: string | null
          created_at?: string
          id?: string
          started_at?: string
          template_id?: string
          updated_at?: string
          user_id?: string
          welcome_email_sent_at?: string | null
          welcome_email_sent_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_progress_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_progress_welcome_email_sent_by_fkey"
            columns: ["welcome_email_sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_tasks: {
        Row: {
          category: string
          completed_at: string | null
          completed_by: string | null
          course_slug: string | null
          created_at: string
          description: string | null
          due_date: string | null
          file_hash: string | null
          file_path: string | null
          id: string
          is_required: boolean
          notes: string | null
          position: number
          progress_id: string
          requires_file: boolean
          responsible_role: string
          template_item_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          completed_at?: string | null
          completed_by?: string | null
          course_slug?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          is_required?: boolean
          notes?: string | null
          position?: number
          progress_id: string
          requires_file?: boolean
          responsible_role?: string
          template_item_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          completed_by?: string | null
          course_slug?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          file_hash?: string | null
          file_path?: string | null
          id?: string
          is_required?: boolean
          notes?: string | null
          position?: number
          progress_id?: string
          requires_file?: boolean
          responsible_role?: string
          template_item_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_tasks_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_progress_id_fkey"
            columns: ["progress_id"]
            isOneToOne: false
            referencedRelation: "onboarding_progress"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboarding_tasks_template_item_id_fkey"
            columns: ["template_item_id"]
            isOneToOne: false
            referencedRelation: "onboarding_template_items"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_template_items: {
        Row: {
          category: string
          course_slug: string | null
          created_at: string
          description: string | null
          due_offset_days: number
          id: string
          is_required: boolean
          position: number
          requires_file: boolean
          responsible_role: string
          template_id: string
          title: string
        }
        Insert: {
          category: string
          course_slug?: string | null
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          is_required?: boolean
          position: number
          requires_file?: boolean
          responsible_role?: string
          template_id: string
          title: string
        }
        Update: {
          category?: string
          course_slug?: string | null
          created_at?: string
          description?: string | null
          due_offset_days?: number
          id?: string
          is_required?: boolean
          position?: number
          requires_file?: boolean
          responsible_role?: string
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "onboarding_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_archived: boolean
          is_default: boolean
          name: string
          target_role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          name: string
          target_role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_archived?: boolean
          is_default?: boolean
          name?: string
          target_role?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      placement_person_aliases: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          profile_id: string
          raw_name_norm: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id: string
          raw_name_norm: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          profile_id?: string
          raw_name_norm?: string
        }
        Relationships: [
          {
            foreignKeyName: "placement_person_aliases_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placement_person_aliases_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      placements: {
        Row: {
          additional_dl_bonus_id: string | null
          bonus_eligible_date: string
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          client_name: string
          consultant_name: string
          contractor_id: string | null
          cost_rate: number
          created_at: string
          delivery_lead_id: string
          delivery_lead_raw: string
          dl_bonus_amount: number
          dl_bonus_id: string | null
          guarantee: string | null
          hours_confirmed_at: string | null
          hours_confirmed_by: string | null
          id: string
          imported_by: string | null
          last_import_batch_id: string | null
          margin_per_hour: number
          monthly_margin: number
          note_am: string | null
          note_billing: string | null
          note_hr: string | null
          order_number: string | null
          order_term: string | null
          position: string | null
          recruiter_bonus_amount: number
          recruiter_bonus_id: string | null
          recruiter_id: string
          recruiter_raw: string
          recruiter_tier: number
          revenue_rate: number
          signing_date: string | null
          start_date: string
          status: string
          tcm_ticket_id: string | null
          updated_at: string
        }
        Insert: {
          additional_dl_bonus_id?: string | null
          bonus_eligible_date: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_name: string
          consultant_name: string
          contractor_id?: string | null
          cost_rate: number
          created_at?: string
          delivery_lead_id: string
          delivery_lead_raw: string
          dl_bonus_amount: number
          dl_bonus_id?: string | null
          guarantee?: string | null
          hours_confirmed_at?: string | null
          hours_confirmed_by?: string | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          margin_per_hour: number
          monthly_margin: number
          note_am?: string | null
          note_billing?: string | null
          note_hr?: string | null
          order_number?: string | null
          order_term?: string | null
          position?: string | null
          recruiter_bonus_amount: number
          recruiter_bonus_id?: string | null
          recruiter_id: string
          recruiter_raw: string
          recruiter_tier: number
          revenue_rate: number
          signing_date?: string | null
          start_date: string
          status?: string
          tcm_ticket_id?: string | null
          updated_at?: string
        }
        Update: {
          additional_dl_bonus_id?: string | null
          bonus_eligible_date?: string
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          client_name?: string
          consultant_name?: string
          contractor_id?: string | null
          cost_rate?: number
          created_at?: string
          delivery_lead_id?: string
          delivery_lead_raw?: string
          dl_bonus_amount?: number
          dl_bonus_id?: string | null
          guarantee?: string | null
          hours_confirmed_at?: string | null
          hours_confirmed_by?: string | null
          id?: string
          imported_by?: string | null
          last_import_batch_id?: string | null
          margin_per_hour?: number
          monthly_margin?: number
          note_am?: string | null
          note_billing?: string | null
          note_hr?: string | null
          order_number?: string | null
          order_term?: string | null
          position?: string | null
          recruiter_bonus_amount?: number
          recruiter_bonus_id?: string | null
          recruiter_id?: string
          recruiter_raw?: string
          recruiter_tier?: number
          revenue_rate?: number
          signing_date?: string | null
          start_date?: string
          status?: string
          tcm_ticket_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "placements_additional_dl_bonus_id_fkey"
            columns: ["additional_dl_bonus_id"]
            isOneToOne: false
            referencedRelation: "bonuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_delivery_lead_id_fkey"
            columns: ["delivery_lead_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_dl_bonus_id_fkey"
            columns: ["dl_bonus_id"]
            isOneToOne: false
            referencedRelation: "bonuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_hours_confirmed_by_fkey"
            columns: ["hours_confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_imported_by_fkey"
            columns: ["imported_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_recruiter_bonus_id_fkey"
            columns: ["recruiter_bonus_id"]
            isOneToOne: false
            referencedRelation: "bonuses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_recruiter_id_fkey"
            columns: ["recruiter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "placements_tcm_ticket_id_fkey"
            columns: ["tcm_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ambassador_status: string | null
          annual_leave_days: number | null
          available_from: string | null
          avatar_source: string | null
          avatar_url: string | null
          bio: string | null
          buddy_id: string | null
          certifications: Json | null
          clock_daily_summary_email: boolean
          created_at: string
          current_status: string | null
          cv_url: string | null
          default_location: string | null
          department: string | null
          desired_rate_max: number | null
          desired_rate_min: number | null
          education: Json | null
          email: string
          embedding: string | null
          employment_status: string
          employment_type: string | null
          experience_level: string | null
          experience_years: number | null
          external_notes: string | null
          fte_status: string | null
          full_name: string | null
          gdpr_consent: boolean | null
          github_url: string | null
          hired_at: string | null
          id: string
          can_log_overtime: boolean
          can_view_legal_monitor: boolean
          can_view_tech_map: boolean
          has_tcm_access: boolean
          is_external: boolean
          is_inbox_handler: boolean
          job_title: string | null
          languages: string[] | null
          leaderboard_opt_out: boolean
          learning_streak_current: number
          learning_streak_last_date: string | null
          learning_streak_longest: number
          leave_carried_over_days: number
          leave_entitlement_days: number | null
          leave_used_initial_days: number
          linkedin_url: string | null
          location: string | null
          loyalty_joined_at: string | null
          loyalty_points: number | null
          loyalty_tier: Database["public"]["Enums"]["loyalty_tier_t"]
          m365_synced_at: string | null
          manager_email: string | null
          manager_id: string | null
          max_monthly_hours: number | null
          onboarding_completed: boolean
          onboarding_tour_done: boolean
          phone: string | null
          portfolio_url: string | null
          preferred_language: string | null
          previous_clients: string[] | null
          profile_completion_percent: number | null
          project_sentiment: string | null
          role: Database["public"]["Enums"]["user_role"] | null
          sales_support_status: string | null
          skills: string[] | null
          termination_date: string | null
          verifier_status: string | null
          work_history: Json | null
          work_start_date: string | null
        }
        Insert: {
          ambassador_status?: string | null
          annual_leave_days?: number | null
          available_from?: string | null
          avatar_source?: string | null
          avatar_url?: string | null
          bio?: string | null
          buddy_id?: string | null
          certifications?: Json | null
          clock_daily_summary_email?: boolean
          created_at?: string
          current_status?: string | null
          cv_url?: string | null
          default_location?: string | null
          department?: string | null
          desired_rate_max?: number | null
          desired_rate_min?: number | null
          education?: Json | null
          email: string
          embedding?: string | null
          employment_status?: string
          employment_type?: string | null
          experience_level?: string | null
          experience_years?: number | null
          external_notes?: string | null
          fte_status?: string | null
          full_name?: string | null
          gdpr_consent?: boolean | null
          github_url?: string | null
          hired_at?: string | null
          id: string
          can_log_overtime?: boolean
          can_view_legal_monitor?: boolean
          can_view_tech_map?: boolean
          has_tcm_access?: boolean
          is_external?: boolean
          is_inbox_handler?: boolean
          job_title?: string | null
          languages?: string[] | null
          leaderboard_opt_out?: boolean
          learning_streak_current?: number
          learning_streak_last_date?: string | null
          learning_streak_longest?: number
          leave_carried_over_days?: number
          leave_entitlement_days?: number | null
          leave_used_initial_days?: number
          linkedin_url?: string | null
          location?: string | null
          loyalty_joined_at?: string | null
          loyalty_points?: number | null
          loyalty_tier?: Database["public"]["Enums"]["loyalty_tier_t"]
          m365_synced_at?: string | null
          manager_email?: string | null
          manager_id?: string | null
          max_monthly_hours?: number | null
          onboarding_completed?: boolean
          onboarding_tour_done?: boolean
          phone?: string | null
          portfolio_url?: string | null
          preferred_language?: string | null
          previous_clients?: string[] | null
          profile_completion_percent?: number | null
          project_sentiment?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          sales_support_status?: string | null
          skills?: string[] | null
          termination_date?: string | null
          verifier_status?: string | null
          work_history?: Json | null
          work_start_date?: string | null
        }
        Update: {
          ambassador_status?: string | null
          annual_leave_days?: number | null
          available_from?: string | null
          avatar_source?: string | null
          avatar_url?: string | null
          bio?: string | null
          buddy_id?: string | null
          certifications?: Json | null
          clock_daily_summary_email?: boolean
          created_at?: string
          current_status?: string | null
          cv_url?: string | null
          default_location?: string | null
          department?: string | null
          desired_rate_max?: number | null
          desired_rate_min?: number | null
          education?: Json | null
          email?: string
          embedding?: string | null
          employment_status?: string
          employment_type?: string | null
          experience_level?: string | null
          experience_years?: number | null
          external_notes?: string | null
          fte_status?: string | null
          full_name?: string | null
          gdpr_consent?: boolean | null
          github_url?: string | null
          hired_at?: string | null
          id?: string
          can_log_overtime?: boolean
          can_view_legal_monitor?: boolean
          can_view_tech_map?: boolean
          has_tcm_access?: boolean
          is_external?: boolean
          is_inbox_handler?: boolean
          job_title?: string | null
          languages?: string[] | null
          leaderboard_opt_out?: boolean
          learning_streak_current?: number
          learning_streak_last_date?: string | null
          learning_streak_longest?: number
          leave_carried_over_days?: number
          leave_entitlement_days?: number | null
          leave_used_initial_days?: number
          linkedin_url?: string | null
          location?: string | null
          loyalty_joined_at?: string | null
          loyalty_points?: number | null
          loyalty_tier?: Database["public"]["Enums"]["loyalty_tier_t"]
          m365_synced_at?: string | null
          manager_email?: string | null
          manager_id?: string | null
          max_monthly_hours?: number | null
          onboarding_completed?: boolean
          onboarding_tour_done?: boolean
          phone?: string | null
          portfolio_url?: string | null
          preferred_language?: string | null
          previous_clients?: string[] | null
          profile_completion_percent?: number | null
          project_sentiment?: string | null
          role?: Database["public"]["Enums"]["user_role"] | null
          sales_support_status?: string | null
          skills?: string[] | null
          termination_date?: string | null
          verifier_status?: string | null
          work_history?: Json | null
          work_start_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_buddy_id_fkey"
            columns: ["buddy_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget_range: string | null
          created_at: string | null
          description: string
          embedding: string | null
          id: string
          required_skills: string[] | null
          title: string
        }
        Insert: {
          budget_range?: string | null
          created_at?: string | null
          description: string
          embedding?: string | null
          id?: string
          required_skills?: string[] | null
          title: string
        }
        Update: {
          budget_range?: string | null
          created_at?: string | null
          description?: string
          embedding?: string | null
          id?: string
          required_skills?: string[] | null
          title?: string
        }
        Relationships: []
      }
      public_holidays: {
        Row: {
          date: string
          name_pl: string
          year: number | null
        }
        Insert: {
          date: string
          name_pl: string
          year?: number | null
        }
        Update: {
          date?: string
          name_pl?: string
          year?: number | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_article_attachments: {
        Row: {
          article_id: string
          created_at: string
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          sort_order: number
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          article_id: string
          created_at?: string
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          sort_order?: number
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          article_id?: string
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          sort_order?: number
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_article_attachments_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "support_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_article_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_articles: {
        Row: {
          author_id: string
          category_id: string
          content_md: string
          created_at: string
          excerpt: string | null
          id: string
          published_at: string | null
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id: string
          category_id: string
          content_md: string
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          category_id?: string
          content_md?: string
          created_at?: string
          excerpt?: string | null
          id?: string
          published_at?: string | null
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      support_categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          is_active: boolean
          name_en: string
          name_pl: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name_en: string
          name_pl: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          is_active?: boolean
          name_en?: string
          name_pl?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      support_category_materials: {
        Row: {
          category_id: string
          created_at: string
          description: string | null
          file_name: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          sort_order: number
          title: string
          updated_at: string
          uploaded_by: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          file_name: string
          file_path: string
          file_size: number
          id?: string
          mime_type: string
          sort_order?: number
          title: string
          updated_at?: string
          uploaded_by: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          file_name?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          sort_order?: number
          title?: string
          updated_at?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_category_materials_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_category_materials_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_contractor_meta: {
        Row: {
          client_snapshot: string | null
          contractor_id: string | null
          conversation_category: string | null
          created_at: string
          due_date: string | null
          follow_up_date: string | null
          kind: string
          linked_ticket_id: string | null
          placement_id: string | null
          source_conversation_id: string | null
          source_task_id: string | null
          tcm_id: string | null
          ticket_id: string
        }
        Insert: {
          client_snapshot?: string | null
          contractor_id?: string | null
          conversation_category?: string | null
          created_at?: string
          due_date?: string | null
          follow_up_date?: string | null
          kind: string
          linked_ticket_id?: string | null
          placement_id?: string | null
          source_conversation_id?: string | null
          source_task_id?: string | null
          tcm_id?: string | null
          ticket_id: string
        }
        Update: {
          client_snapshot?: string | null
          contractor_id?: string | null
          conversation_category?: string | null
          created_at?: string
          due_date?: string | null
          follow_up_date?: string | null
          kind?: string
          linked_ticket_id?: string | null
          placement_id?: string | null
          source_conversation_id?: string | null
          source_task_id?: string | null
          tcm_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_contractor_meta_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_contractor_meta_linked_ticket_id_fkey"
            columns: ["linked_ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_contractor_meta_tcm_id_fkey"
            columns: ["tcm_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_contractor_meta_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_inbox_email_archive: {
        Row: {
          archived_at: string
          email_body_html: string | null
          email_body_text: string | null
          email_headers: Json | null
          email_skip_reason: string | null
          external_conversation_id: string | null
          ticket_id: string
        }
        Insert: {
          archived_at?: string
          email_body_html?: string | null
          email_body_text?: string | null
          email_headers?: Json | null
          email_skip_reason?: string | null
          external_conversation_id?: string | null
          ticket_id: string
        }
        Update: {
          archived_at?: string
          email_body_html?: string | null
          email_body_text?: string | null
          email_headers?: Json | null
          email_skip_reason?: string | null
          external_conversation_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_inbox_email_archive_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_inbox_meta: {
        Row: {
          client_name: string | null
          consultant_id: string | null
          consultant_name: string | null
          consultant_phone: string | null
          contractor_id: string | null
          created_at: string
          due_date: string
          email_from: string | null
          email_received_at: string | null
          email_subject: string | null
          external_message_id: string | null
          priority_level: string
          source: string
          ticket_id: string
        }
        Insert: {
          client_name?: string | null
          consultant_id?: string | null
          consultant_name?: string | null
          consultant_phone?: string | null
          contractor_id?: string | null
          created_at?: string
          due_date: string
          email_from?: string | null
          email_received_at?: string | null
          email_subject?: string | null
          external_message_id?: string | null
          priority_level?: string
          source?: string
          ticket_id: string
        }
        Update: {
          client_name?: string | null
          consultant_id?: string | null
          consultant_name?: string | null
          consultant_phone?: string | null
          contractor_id?: string | null
          created_at?: string
          due_date?: string
          email_from?: string | null
          email_received_at?: string | null
          email_subject?: string | null
          external_message_id?: string | null
          priority_level?: string
          source?: string
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_inbox_meta_consultant_id_fkey"
            columns: ["consultant_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_inbox_meta_contractor_id_fkey"
            columns: ["contractor_id"]
            isOneToOne: false
            referencedRelation: "contractors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_inbox_meta_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_ticket_comments: {
        Row: {
          author_id: string
          body_md: string
          created_at: string
          id: string
          is_internal: boolean
          ticket_id: string
        }
        Insert: {
          author_id: string
          body_md: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id: string
        }
        Update: {
          author_id?: string
          body_md?: string
          created_at?: string
          id?: string
          is_internal?: boolean
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_ticket_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_ticket_comments_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          assignee_id: string | null
          body_md: string
          category_id: string
          created_at: string
          id: string
          priority: string
          resolved_at: string | null
          status: string
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assignee_id?: string | null
          body_md: string
          category_id: string
          created_at?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assignee_id?: string | null
          body_md?: string
          category_id?: string
          created_at?: string
          id?: string
          priority?: string
          resolved_at?: string | null
          status?: string
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "support_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_tickets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_settings: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          updated_by: string | null
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          updated_by?: string | null
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "system_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_activity: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          id: string
          task_id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          id?: string
          task_id: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          id?: string
          task_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_activity_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_activity_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_assignments: {
        Row: {
          assigned_at: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_assignments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_assignments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_boards: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_shared: boolean | null
          name: string
          owner_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean | null
          name: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_shared?: boolean | null
          name?: string
          owner_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_boards_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      task_columns: {
        Row: {
          board_id: string
          color: string | null
          created_at: string | null
          id: string
          name: string
          position: number
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string | null
          id?: string
          name: string
          position?: number
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string | null
          id?: string
          name?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "task_columns_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      task_comments: {
        Row: {
          author_id: string | null
          content: string
          created_at: string | null
          id: string
          task_id: string
        }
        Insert: {
          author_id?: string | null
          content: string
          created_at?: string | null
          id?: string
          task_id: string
        }
        Update: {
          author_id?: string | null
          content?: string
          created_at?: string | null
          id?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_comments_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_comments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          board_id: string | null
          column_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          position: number | null
          priority: string | null
          status: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          board_id?: string | null
          column_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number | null
          priority?: string | null
          status?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          board_id?: string | null
          column_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          position?: number | null
          priority?: string | null
          status?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_column_id_fkey"
            columns: ["column_id"]
            isOneToOne: false
            referencedRelation: "task_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_interview_card_initiatives: {
        Row: {
          card_id: string
          id: string
          kind: string
          name: string
          priority: string
        }
        Insert: {
          card_id: string
          id?: string
          kind?: string
          name: string
          priority?: string
        }
        Update: {
          card_id?: string
          id?: string
          kind?: string
          name?: string
          priority?: string
        }
        Relationships: []
      }
      tech_interview_card_technologies: {
        Row: {
          card_id: string
          technology_id: string
        }
        Insert: {
          card_id: string
          technology_id: string
        }
        Update: {
          card_id?: string
          technology_id?: string
        }
        Relationships: []
      }
      tech_interview_card_vendors: {
        Row: {
          card_id: string
          vendor_id: string
        }
        Insert: {
          card_id: string
          vendor_id: string
        }
        Update: {
          card_id?: string
          vendor_id?: string
        }
        Relationships: []
      }
      tech_interview_cards: {
        Row: {
          client_area_id: string | null
          client_id: string
          contractor_id: string
          created_at: string
          created_by: string | null
          demand_alerted_at: string | null
          finalized_at: string | null
          hiring: boolean | null
          hiring_roles: string[]
          hiring_source: string | null
          id: string
          interview_date: string
          is_draft: boolean
          memorable_quote: string | null
          placement_id: string | null
          project_end_alerted_at: string | null
          project_end_month: number | null
          project_end_unknown: boolean
          project_end_year: number | null
          satisfaction: number | null
          satisfaction_comment: string | null
          status: string | null
          tcm_id: string | null
          team_externals: number | null
          team_size: string | null
          tech_old_new: string | null
          title: string | null
          updated_at: string
          vendors_note: string | null
        }
        Insert: {
          client_area_id?: string | null
          client_id: string
          contractor_id: string
          created_at?: string
          created_by?: string | null
          demand_alerted_at?: string | null
          finalized_at?: string | null
          hiring?: boolean | null
          hiring_roles?: string[]
          hiring_source?: string | null
          id?: string
          interview_date: string
          is_draft?: boolean
          memorable_quote?: string | null
          placement_id?: string | null
          project_end_alerted_at?: string | null
          project_end_month?: number | null
          project_end_unknown?: boolean
          project_end_year?: number | null
          satisfaction?: number | null
          satisfaction_comment?: string | null
          status?: string | null
          tcm_id?: string | null
          team_externals?: number | null
          team_size?: string | null
          tech_old_new?: string | null
          title?: string | null
          updated_at?: string
          vendors_note?: string | null
        }
        Update: {
          client_area_id?: string | null
          client_id?: string
          contractor_id?: string
          created_at?: string
          created_by?: string | null
          demand_alerted_at?: string | null
          finalized_at?: string | null
          hiring?: boolean | null
          hiring_roles?: string[]
          hiring_source?: string | null
          id?: string
          interview_date?: string
          is_draft?: boolean
          memorable_quote?: string | null
          placement_id?: string | null
          project_end_alerted_at?: string | null
          project_end_month?: number | null
          project_end_unknown?: boolean
          project_end_year?: number | null
          satisfaction?: number | null
          satisfaction_comment?: string | null
          status?: string | null
          tcm_id?: string | null
          team_externals?: number | null
          team_size?: string | null
          tech_old_new?: string | null
          title?: string | null
          updated_at?: string
          vendors_note?: string | null
        }
        Relationships: []
      }
      technologies: {
        Row: {
          aliases: string[]
          category: string
          created_at: string
          created_by: string | null
          id: string
          is_verified: boolean
          name: string
          slug: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_verified?: boolean
          name: string
          slug: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_verified?: boolean
          name?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      timesheet_entries: {
        Row: {
          correction_decided_at: string | null
          correction_decided_by: string | null
          correction_decision_note: string | null
          correction_required: boolean
          created_at: string
          description: string
          hours: number
          id: string
          is_overtime_override: boolean
          override_at: string | null
          override_by: string | null
          override_reason: string | null
          project: string | null
          source: string
          timesheet_id: string
          tracked_hours: number | null
          work_date: string
        }
        Insert: {
          correction_decided_at?: string | null
          correction_decided_by?: string | null
          correction_decision_note?: string | null
          correction_required?: boolean
          created_at?: string
          description: string
          hours: number
          id?: string
          is_overtime_override?: boolean
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          project?: string | null
          source?: string
          timesheet_id: string
          tracked_hours?: number | null
          work_date: string
        }
        Update: {
          correction_decided_at?: string | null
          correction_decided_by?: string | null
          correction_decision_note?: string | null
          correction_required?: boolean
          created_at?: string
          description?: string
          hours?: number
          id?: string
          is_overtime_override?: boolean
          override_at?: string | null
          override_by?: string | null
          override_reason?: string | null
          project?: string | null
          source?: string
          timesheet_id?: string
          tracked_hours?: number | null
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_entries_correction_decided_by_fkey"
            columns: ["correction_decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_entries_override_by_fkey"
            columns: ["override_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_entries_timesheet_id_fkey"
            columns: ["timesheet_id"]
            isOneToOne: false
            referencedRelation: "timesheets"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_reminder_log: {
        Row: {
          id: string
          month: number
          sent_at: string
          user_id: string
          year: number
        }
        Insert: {
          id?: string
          month: number
          sent_at?: string
          user_id: string
          year: number
        }
        Update: {
          id?: string
          month?: number
          sent_at?: string
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_reminder_log_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_role_defaults: {
        Row: {
          applies_to_role: Database["public"]["Enums"]["user_role"] | null
          created_at: string
          created_by: string | null
          default_description: string
          id: string
          is_active: boolean
          label: string
          project: string | null
          sort_order: number
          updated_at: string
        }
        Insert: {
          applies_to_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          created_by?: string | null
          default_description: string
          id?: string
          is_active?: boolean
          label: string
          project?: string | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          applies_to_role?: Database["public"]["Enums"]["user_role"] | null
          created_at?: string
          created_by?: string | null
          default_description?: string
          id?: string
          is_active?: boolean
          label?: string
          project?: string | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_role_defaults_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_timers: {
        Row: {
          converted_entry_id: string | null
          created_at: string
          deprecated_at: string | null
          description: string
          hours_calculated: number | null
          id: string
          project: string | null
          started_at: string
          stopped_at: string | null
          user_id: string
          work_date: string
        }
        Insert: {
          converted_entry_id?: string | null
          created_at?: string
          deprecated_at?: string | null
          description?: string
          hours_calculated?: number | null
          id?: string
          project?: string | null
          started_at?: string
          stopped_at?: string | null
          user_id: string
          work_date?: string
        }
        Update: {
          converted_entry_id?: string | null
          created_at?: string
          deprecated_at?: string | null
          description?: string
          hours_calculated?: number | null
          id?: string
          project?: string | null
          started_at?: string
          stopped_at?: string | null
          user_id?: string
          work_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_timers_converted_entry_id_fkey"
            columns: ["converted_entry_id"]
            isOneToOne: false
            referencedRelation: "timesheet_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheet_timers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheet_user_templates: {
        Row: {
          created_at: string
          description: string
          id: string
          name: string
          project: string | null
          sort_order: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description: string
          id?: string
          name: string
          project?: string | null
          sort_order?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string
          id?: string
          name?: string
          project?: string | null
          sort_order?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timesheet_user_templates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timesheets: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          auto_filled_at: string | null
          created_at: string
          id: string
          month: number
          pdf_hash: string | null
          rejection_note: string | null
          status: string
          submitted_at: string | null
          updated_at: string
          user_cleared_auto_fill: boolean
          user_id: string
          year: number
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          auto_filled_at?: string | null
          created_at?: string
          id?: string
          month: number
          pdf_hash?: string | null
          rejection_note?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_cleared_auto_fill?: boolean
          user_id: string
          year: number
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          auto_filled_at?: string | null
          created_at?: string
          id?: string
          month?: number
          pdf_hash?: string | null
          rejection_note?: string | null
          status?: string
          submitted_at?: string | null
          updated_at?: string
          user_cleared_auto_fill?: boolean
          user_id?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "timesheets_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timesheets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      um_legal_documents: {
        Row: {
          content: string
          created_at: string | null
          document_type: string
          effective_date: string
          id: string
          is_active: boolean | null
          title: string
          updated_at: string | null
          version: string
        }
        Insert: {
          content: string
          created_at?: string | null
          document_type: string
          effective_date: string
          id?: string
          is_active?: boolean | null
          title: string
          updated_at?: string | null
          version: string
        }
        Update: {
          content?: string
          created_at?: string | null
          document_type?: string
          effective_date?: string
          id?: string
          is_active?: boolean | null
          title?: string
          updated_at?: string | null
          version?: string
        }
        Relationships: []
      }
      um_user_consents: {
        Row: {
          accepted_ai: boolean
          accepted_at: string
          accepted_data_processing: boolean
          accepted_ip: unknown
          accepted_privacy: boolean
          accepted_terms: boolean
          accepted_ua: string | null
          created_at: string
          id: string
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_ai?: boolean
          accepted_at?: string
          accepted_data_processing?: boolean
          accepted_ip?: unknown
          accepted_privacy?: boolean
          accepted_terms?: boolean
          accepted_ua?: string | null
          created_at?: string
          id?: string
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_ai?: boolean
          accepted_at?: string
          accepted_data_processing?: boolean
          accepted_ip?: unknown
          accepted_privacy?: boolean
          accepted_terms?: boolean
          accepted_ua?: string | null
          created_at?: string
          id?: string
          terms_version?: string
          user_id?: string
        }
        Relationships: []
      }
      user_contract_documents: {
        Row: {
          created_at: string
          description: string | null
          doc_type: string
          file_mime: string | null
          file_name: string
          file_path: string
          file_size_bytes: number | null
          id: string
          signed_date: string | null
          uploaded_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          doc_type?: string
          file_mime?: string | null
          file_name: string
          file_path: string
          file_size_bytes?: number | null
          id?: string
          signed_date?: string | null
          uploaded_by: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          doc_type?: string
          file_mime?: string | null
          file_name?: string
          file_path?: string
          file_size_bytes?: number | null
          id?: string
          signed_date?: string | null
          uploaded_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_contract_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_contract_documents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_rates: {
        Row: {
          created_at: string
          currency: string
          effective_from: string
          effective_to: string | null
          hourly_rate: number
          id: string
          reason: string | null
          set_by: string
          user_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          effective_from: string
          effective_to?: string | null
          hourly_rate: number
          id?: string
          reason?: string | null
          set_by: string
          user_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          effective_from?: string
          effective_to?: string | null
          hourly_rate?: number
          id?: string
          reason?: string | null
          set_by?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_rates_set_by_fkey"
            columns: ["set_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_rates_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendors: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          is_verified: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_verified?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          is_verified?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      verification_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string
          id: string
          type: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at: string
          id?: string
          type: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string
          id?: string
          type?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      work_clock_consents: {
        Row: {
          accepted_at: string
          accepted_ip: unknown
          accepted_ua: string | null
          revoked_at: string | null
          revoked_reason: string | null
          terms_version: string
          user_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_ip?: unknown
          accepted_ua?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          terms_version: string
          user_id: string
        }
        Update: {
          accepted_at?: string
          accepted_ip?: unknown
          accepted_ua?: string | null
          revoked_at?: string | null
          revoked_reason?: string | null
          terms_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_clock_consents_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      work_clock_heartbeats: {
        Row: {
          id: number
          is_trusted: boolean
          page_visible: boolean
          session_id: string
          ts: string
          was_active: boolean
        }
        Insert: {
          id?: number
          is_trusted?: boolean
          page_visible?: boolean
          session_id: string
          ts: string
          was_active: boolean
        }
        Update: {
          id?: number
          is_trusted?: boolean
          page_visible?: boolean
          session_id?: string
          ts?: string
          was_active?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "work_clock_heartbeats_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "work_clock_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_clock_route_metadata: {
        Row: {
          created_at: string
          id: number
          page_title: string | null
          route_path: string
          session_id: string
          ts_bucket_5min: string
        }
        Insert: {
          created_at?: string
          id?: number
          page_title?: string | null
          route_path: string
          session_id: string
          ts_bucket_5min: string
        }
        Update: {
          created_at?: string
          id?: number
          page_title?: string | null
          route_path?: string
          session_id?: string
          ts_bucket_5min?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_clock_route_metadata_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "work_clock_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_clock_session_pauses: {
        Row: {
          created_by: string | null
          id: number
          pause_reason: string
          paused_at: string
          resumed_at: string | null
          session_id: string
        }
        Insert: {
          created_by?: string | null
          id?: number
          pause_reason: string
          paused_at?: string
          resumed_at?: string | null
          session_id: string
        }
        Update: {
          created_by?: string | null
          id?: number
          pause_reason?: string
          paused_at?: string
          resumed_at?: string | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_clock_session_pauses_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "work_clock_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      work_clock_sessions: {
        Row: {
          active_seconds: number
          client_tz: string
          closed_reason: string | null
          created_at: string
          created_by: string | null
          device_label: string | null
          ended_at: string | null
          id: string
          idle_seconds: number
          last_heartbeat: string
          location: string
          merged_from_session_id: string | null
          pause_reason: string | null
          paused_until: string | null
          route_tracking_enabled: boolean
          started_at: string
          updated_at: string
          user_disregarded: boolean
          user_id: string
        }
        Insert: {
          active_seconds?: number
          client_tz?: string
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          device_label?: string | null
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          last_heartbeat: string
          location: string
          merged_from_session_id?: string | null
          pause_reason?: string | null
          paused_until?: string | null
          route_tracking_enabled?: boolean
          started_at: string
          updated_at?: string
          user_disregarded?: boolean
          user_id: string
        }
        Update: {
          active_seconds?: number
          client_tz?: string
          closed_reason?: string | null
          created_at?: string
          created_by?: string | null
          device_label?: string | null
          ended_at?: string | null
          id?: string
          idle_seconds?: number
          last_heartbeat?: string
          location?: string
          merged_from_session_id?: string | null
          pause_reason?: string | null
          paused_until?: string | null
          route_tracking_enabled?: boolean
          started_at?: string
          updated_at?: string
          user_disregarded?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "work_clock_sessions_merged_from_session_id_fkey"
            columns: ["merged_from_session_id"]
            isOneToOne: false
            referencedRelation: "work_clock_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "work_clock_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      work_clock_daily: {
        Row: {
          active_seconds: number | null
          first_clock_in: string | null
          hours: number | null
          last_clock_out: string | null
          session_count: number | null
          user_id: string | null
          work_date: string | null
        }
        Relationships: [
          {
            foreignKeyName: "work_clock_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      admin_hard_delete_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      admin_revoke_user_sessions: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      award_course_points: {
        Args: { p_enrollment_id: string }
        Returns: string
      }
      award_first_publish_bonus: {
        Args: { p_course_id: string }
        Returns: string
      }
      can_propose_bonus_for: {
        Args: { target_user_id: string }
        Returns: boolean
      }
      claim_contractor_success_deliveries: {
        Args: {
          p_lease_seconds?: number
          p_limit?: number
          p_worker_id: string
        }
        Returns: {
          attempt_count: number
          available_at: string
          channel: string
          claimed_at: string | null
          claimed_by: string | null
          contractor_id: string | null
          created_at: string
          dedupe_key: string
          delivery_kind: string
          entity_id: string
          id: string
          last_error: string | null
          lease_expires_at: string | null
          max_attempts: number
          payload: Json
          recipient_email: string | null
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "contractor_success_deliveries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      complete_contractor_check_in: {
        Args: {
          p_action_steps?: Json
          p_channel?: string
          p_check_in_id: string
          p_duration_minutes?: number
          p_health_review_on?: string
          p_health_status?: string
          p_health_status_reason?: string
          p_next_check_in_on?: string
          p_notes?: string
          p_occurred_at?: string
          p_summary: string
          p_tags?: string[]
        }
        Returns: Json
      }
      consume_contractor_pulse_rate_limit: {
        Args: {
          p_bucket_key: string
          p_max_attempts?: number
          p_window_minutes?: number
        }
        Returns: boolean
      }
      create_notification: {
        Args: {
          p_action_url?: string
          p_body_en?: string
          p_body_pl?: string
          p_priority?: string
          p_title_en: string
          p_title_pl: string
          p_type: string
          p_user_id: string
        }
        Returns: string
      }
      expire_old_notifications: { Args: never; Returns: undefined }
      get_quiz_for_attempt: {
        Args: { p_course_id: string }
        Returns: {
          options: Json
          question_id: string
          question_order: number
          question_text: string
        }[]
      }
      get_user_rate_for_month: {
        Args: { p_month: number; p_user_id: string; p_year: number }
        Returns: number
      }
      has_hr_zone_access: { Args: never; Returns: boolean }
      has_lifecycle_access: { Args: never; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
      is_buddy_of: { Args: { target_user_id: string }; Returns: boolean }
      is_contractor_category: {
        Args: { p_category_id: string }
        Returns: boolean
      }
      has_legal_monitor_read: { Args: never; Returns: boolean }
      is_finanse_or_admin: { Args: never; Returns: boolean }
      is_inbox_category: { Args: { p_category_id: string }; Returns: boolean }
      is_inbox_handler: { Args: never; Returns: boolean }
      is_internal_or_admin: { Args: never; Returns: boolean }
      is_manager: { Args: never; Returns: boolean }
      is_manager_of: { Args: { target_user_id: string }; Returns: boolean }
      is_talent_community: { Args: never; Returns: boolean }
      is_trainer_or_admin: { Args: never; Returns: boolean }
      match_assist_knowledge: {
        Args: {
          filter_category?: string
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          category: string
          content: string
          id: string
          similarity: number
          title: string
        }[]
      }
      match_courses: {
        Args: {
          match_count?: number
          match_threshold?: number
          query_embedding: string
        }
        Returns: {
          course_id: string
          similarity: number
        }[]
      }
      next_month_first_day: { Args: never; Returns: string }
      recruiter_bonus_for_margin: { Args: { margin: number }; Returns: number }
      recruiter_tier_for_margin: { Args: { margin: number }; Returns: number }
      resolve_role_default: {
        Args: {
          target_project: string
          target_role: Database["public"]["Enums"]["user_role"]
        }
        Returns: {
          applies_to_role: Database["public"]["Enums"]["user_role"]
          default_description: string
          id: string
          label: string
          project: string
        }[]
      }
      set_user_rate_progression: {
        Args: {
          p_currency: string
          p_entries: Json
          p_reason: string
          p_set_by: string
          p_user_id: string
        }
        Returns: number
      }
      start_offboarding_for_user: {
        Args: {
          p_actor_id?: string
          p_scheduled_for?: string
          p_termination_date: string
          p_user_id: string
        }
        Returns: string
      }
      start_onboarding_for_user: {
        Args: { p_actor_id?: string; p_template_id?: string; p_user_id: string }
        Returns: string
      }
      submit_contractor_pulse_response: {
        Args: {
          p_engagement: number
          p_note: string
          p_recommendation: number
          p_satisfaction: number
          p_token_hash: string
        }
        Returns: boolean
      }
      submit_quiz_attempt: {
        Args: { p_answers: Json; p_course_id: string }
        Returns: Json
      }
      sync_user_role: {
        Args: { p_email: string; p_is_super_admin?: boolean; p_user_id: string }
        Returns: Database["public"]["Enums"]["user_role"]
      }
    }
    Enums: {
      candidate_interested_status: "yes" | "no" | "not_asked"
      course_type_t: "consultant" | "company"
      engagement_type:
        | "full_time"
        | "half_time"
        | "3_4_days"
        | "to_be_discussed"
      loyalty_tier_t:
        | "scout"
        | "explorer"
        | "pathfinder"
        | "navigator"
        | "captain"
        | "admiral"
        | "legend"
      referral_status:
        | "new"
        | "in_review"
        | "accepted"
        | "rejected"
        | "hired"
        | "withdrawn"
      referral_type: "external_person" | "self_referral"
      relationship_type:
        | "coworker"
        | "industry_contact"
        | "former_project"
        | "linkedin"
        | "other"
      user_role:
        | "consultant"
        | "admin"
        | "internal"
        | "finanse"
        | "manager"
        | "talent_community"
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
      candidate_interested_status: ["yes", "no", "not_asked"],
      course_type_t: ["consultant", "company"],
      engagement_type: [
        "full_time",
        "half_time",
        "3_4_days",
        "to_be_discussed",
      ],
      loyalty_tier_t: [
        "scout",
        "explorer",
        "pathfinder",
        "navigator",
        "captain",
        "admiral",
        "legend",
      ],
      referral_status: [
        "new",
        "in_review",
        "accepted",
        "rejected",
        "hired",
        "withdrawn",
      ],
      referral_type: ["external_person", "self_referral"],
      relationship_type: [
        "coworker",
        "industry_contact",
        "former_project",
        "linkedin",
        "other",
      ],
      user_role: [
        "consultant",
        "admin",
        "internal",
        "finanse",
        "manager",
        "talent_community",
      ],
    },
  },
} as const
