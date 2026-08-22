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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      agencies: {
        Row: {
          created_at: string
          district: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          district?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          district?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      alerts: {
        Row: {
          body: string | null
          case_id: string | null
          connection_id: string | null
          created_at: string
          id: string
          is_read: boolean
          kind: string
          title: string
        }
        Insert: {
          body?: string | null
          case_id?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind: string
          title: string
        }
        Update: {
          body?: string | null
          case_id?: string | null
          connection_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          kind?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alerts_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alerts_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "case_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          action_type: string
          actor_id: string | null
          actor_name: string
          case_id: string | null
          created_at: string
          detail: string | null
          id: string
        }
        Insert: {
          action: string
          action_type: string
          actor_id?: string | null
          actor_name?: string
          case_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
        }
        Update: {
          action?: string
          action_type?: string
          actor_id?: string | null
          actor_name?: string
          case_id?: string | null
          created_at?: string
          detail?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      board_connections: {
        Row: {
          board_id: string
          created_at: string
          from_item_id: string
          id: string
          label: string | null
          to_item_id: string
        }
        Insert: {
          board_id: string
          created_at?: string
          from_item_id: string
          id?: string
          label?: string | null
          to_item_id: string
        }
        Update: {
          board_id?: string
          created_at?: string
          from_item_id?: string
          id?: string
          label?: string | null
          to_item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_connections_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "investigation_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_connections_from_item_id_fkey"
            columns: ["from_item_id"]
            isOneToOne: false
            referencedRelation: "board_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_connections_to_item_id_fkey"
            columns: ["to_item_id"]
            isOneToOne: false
            referencedRelation: "board_items"
            referencedColumns: ["id"]
          },
        ]
      }
      board_items: {
        Row: {
          board_id: string
          created_at: string
          id: string
          kind: string
          label: string
          note: string | null
          ref_id: string | null
          x: number
          y: number
        }
        Insert: {
          board_id: string
          created_at?: string
          id?: string
          kind: string
          label: string
          note?: string | null
          ref_id?: string | null
          x?: number
          y?: number
        }
        Update: {
          board_id?: string
          created_at?: string
          id?: string
          kind?: string
          label?: string
          note?: string | null
          ref_id?: string | null
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "board_items_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "investigation_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      case_connections: {
        Row: {
          ai_score_at_verdict: number | null
          case_a_id: string
          case_b_id: string
          classification: string
          computed_at: string
          explanation: string | null
          id: string
          score: number
          verdict: Database["public"]["Enums"]["connection_verdict"]
          verdict_reason: string | null
          verified_at: string | null
          verified_by: string | null
          verified_by_name: string | null
        }
        Insert: {
          ai_score_at_verdict?: number | null
          case_a_id: string
          case_b_id: string
          classification: string
          computed_at?: string
          explanation?: string | null
          id?: string
          score: number
          verdict?: Database["public"]["Enums"]["connection_verdict"]
          verdict_reason?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
        }
        Update: {
          ai_score_at_verdict?: number | null
          case_a_id?: string
          case_b_id?: string
          classification?: string
          computed_at?: string
          explanation?: string | null
          id?: string
          score?: number
          verdict?: Database["public"]["Enums"]["connection_verdict"]
          verdict_reason?: string | null
          verified_at?: string | null
          verified_by?: string | null
          verified_by_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "case_connections_case_a_id_fkey"
            columns: ["case_a_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_connections_case_b_id_fkey"
            columns: ["case_b_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_connections_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          agency_id: string | null
          case_no: string
          created_at: string
          crime_type: string
          description: string | null
          fir_number: string | null
          id: string
          investigator_id: string | null
          investigator_name: string | null
          is_synthetic: boolean
          latitude: number | null
          location_name: string | null
          longitude: number | null
          modus_operandi: string[]
          notes: string | null
          occurred_at: string
          priority: Database["public"]["Enums"]["case_priority"]
          status: Database["public"]["Enums"]["case_status"]
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          agency_id?: string | null
          case_no: string
          created_at?: string
          crime_type: string
          description?: string | null
          fir_number?: string | null
          id?: string
          investigator_id?: string | null
          investigator_name?: string | null
          is_synthetic?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          modus_operandi?: string[]
          notes?: string | null
          occurred_at?: string
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          agency_id?: string | null
          case_no?: string
          created_at?: string
          crime_type?: string
          description?: string | null
          fir_number?: string | null
          id?: string
          investigator_id?: string | null
          investigator_name?: string | null
          is_synthetic?: boolean
          latitude?: number | null
          location_name?: string | null
          longitude?: number | null
          modus_operandi?: string[]
          notes?: string | null
          occurred_at?: string
          priority?: Database["public"]["Enums"]["case_priority"]
          status?: Database["public"]["Enums"]["case_status"]
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cases_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_investigator_id_fkey"
            columns: ["investigator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cctv: {
        Row: {
          captured_at: string | null
          case_id: string
          created_at: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          notes: string | null
          owner: string | null
          status: string
        }
        Insert: {
          captured_at?: string | null
          case_id: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          notes?: string | null
          owner?: string | null
          status?: string
        }
        Update: {
          captured_at?: string | null
          case_id?: string
          created_at?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          notes?: string | null
          owner?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "cctv_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_factors: {
        Row: {
          connection_id: string
          detail: string | null
          factor: string
          id: string
          insufficient_data: boolean
          similarity: number | null
          sources: string[]
          weight: number
        }
        Insert: {
          connection_id: string
          detail?: string | null
          factor: string
          id?: string
          insufficient_data?: boolean
          similarity?: number | null
          sources?: string[]
          weight: number
        }
        Update: {
          connection_id?: string
          detail?: string | null
          factor?: string
          id?: string
          insufficient_data?: boolean
          similarity?: number | null
          sources?: string[]
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "connection_factors_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "case_connections"
            referencedColumns: ["id"]
          },
        ]
      }
      evidence: {
        Row: {
          case_id: string
          category: string
          checksum_sha256: string | null
          collected_at: string | null
          created_at: string
          description: string | null
          file_size_bytes: number | null
          filename: string | null
          id: string
          latitude: number | null
          longitude: number | null
          mime_type: string | null
          original_filename: string | null
          status: string
          storage_path: string | null
          uploaded_by: string | null
          uploaded_by_name: string | null
          updated_at: string
          withdrawal_reason: string | null
          withdrawn_at: string | null
          withdrawn_by: string | null
        }
        Insert: {
          case_id: string
          category: string
          checksum_sha256?: string | null
          collected_at?: string | null
          created_at?: string
          description?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mime_type?: string | null
          original_filename?: string | null
          status?: string
          storage_path?: string | null
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          updated_at?: string
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Update: {
          case_id?: string
          category?: string
          checksum_sha256?: string | null
          collected_at?: string | null
          created_at?: string
          description?: string | null
          file_size_bytes?: number | null
          filename?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          mime_type?: string | null
          original_filename?: string | null
          status?: string
          storage_path?: string | null
          uploaded_by?: string | null
          uploaded_by_name?: string | null
          updated_at?: string
          withdrawal_reason?: string | null
          withdrawn_at?: string | null
          withdrawn_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "evidence_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "evidence_withdrawn_by_fkey"
            columns: ["withdrawn_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investigation_boards: {
        Row: {
          case_id: string | null
          cluster_key: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          case_id?: string | null
          cluster_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          case_id?: string | null
          cluster_key?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_boards_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_boards_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      investigation_theories: {
        Row: {
          author_id: string
          case_id: string
          created_at: string
          id: string
          theory: string
          updated_at: string
        }
        Insert: {
          author_id: string
          case_id: string
          created_at?: string
          id?: string
          theory: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          case_id?: string
          created_at?: string
          id?: string
          theory?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investigation_theories_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "investigation_theories_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          case_id: string
          created_at: string
          id: string
          kind: string | null
          latitude: number | null
          longitude: number | null
          name: string
        }
        Insert: {
          case_id: string
          created_at?: string
          id?: string
          kind?: string | null
          latitude?: number | null
          longitude?: number | null
          name: string
        }
        Update: {
          case_id?: string
          created_at?: string
          id?: string
          kind?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      persons: {
        Row: {
          age: number | null
          aliases: string[]
          case_id: string
          created_at: string
          description: string | null
          descriptors: string[]
          full_name: string
          id: string
          phone: string | null
          role_in_case: string | null
        }
        Insert: {
          age?: number | null
          aliases?: string[]
          case_id: string
          created_at?: string
          description?: string | null
          descriptors?: string[]
          full_name: string
          id?: string
          phone?: string | null
          role_in_case?: string | null
        }
        Update: {
          age?: number | null
          aliases?: string[]
          case_id?: string
          created_at?: string
          description?: string | null
          descriptors?: string[]
          full_name?: string
          id?: string
          phone?: string | null
          role_in_case?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "persons_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          approval_status: Database["public"]["Enums"]["application_status"]
          awards: string[]
          agency_id: string | null
          badge_no: string | null
          contact_number: string | null
          created_at: string
          full_name: string
          id: string
          professional_bio: string | null
          rank_designation: string | null
          service_start_date: string | null
          specialization: string | null
          unit: string | null
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["application_status"]
          awards?: string[]
          agency_id?: string | null
          badge_no?: string | null
          contact_number?: string | null
          created_at?: string
          full_name?: string
          id: string
          professional_bio?: string | null
          rank_designation?: string | null
          service_start_date?: string | null
          specialization?: string | null
          unit?: string | null
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["application_status"]
          awards?: string[]
          agency_id?: string | null
          badge_no?: string | null
          contact_number?: string | null
          created_at?: string
          full_name?: string
          id?: string
          professional_bio?: string | null
          rank_designation?: string | null
          service_start_date?: string | null
          specialization?: string | null
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agency_id_fkey"
            columns: ["agency_id"]
            isOneToOne: false
            referencedRelation: "agencies"
            referencedColumns: ["id"]
          },
        ]
      }
      account_applications: {
        Row: {
          agency_department: string
          attempt_count: number
          awards: string[]
          contact_number: string
          employee_id_number: string
          full_legal_name: string
          id: string
          last_attempt_at: string
          official_id_mime_type: string | null
          official_id_original_filename: string | null
          official_id_path: string | null
          professional_bio: string | null
          rank_designation: string
          requested_role: Database["public"]["Enums"]["application_role"]
          review_notes: string | null
          reviewed_at: string | null
          reviewer_id: string | null
          service_start_date: string
          specialization: string
          status: Database["public"]["Enums"]["application_status"]
          submitted_at: string
          updated_at: string
          user_id: string
          work_email: string
        }
        Insert: {
          agency_department: string
          attempt_count?: number
          awards?: string[]
          contact_number: string
          employee_id_number: string
          full_legal_name: string
          id?: string
          last_attempt_at?: string
          official_id_mime_type?: string | null
          official_id_original_filename?: string | null
          official_id_path?: string | null
          professional_bio?: string | null
          rank_designation: string
          requested_role: Database["public"]["Enums"]["application_role"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          service_start_date: string
          specialization: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string
          updated_at?: string
          user_id: string
          work_email: string
        }
        Update: {
          agency_department?: string
          attempt_count?: number
          awards?: string[]
          contact_number?: string
          employee_id_number?: string
          full_legal_name?: string
          id?: string
          last_attempt_at?: string
          official_id_mime_type?: string | null
          official_id_original_filename?: string | null
          official_id_path?: string | null
          professional_bio?: string | null
          rank_designation?: string
          requested_role?: Database["public"]["Enums"]["application_role"]
          review_notes?: string | null
          reviewed_at?: string | null
          reviewer_id?: string | null
          service_start_date?: string
          specialization?: string
          status?: Database["public"]["Enums"]["application_status"]
          submitted_at?: string
          updated_at?: string
          user_id?: string
          work_email?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_applications_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "account_applications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_events: {
        Row: {
          case_id: string
          created_at: string
          detail: string | null
          evidence_id: string | null
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          occurred_at: string
          title: string
        }
        Insert: {
          case_id: string
          created_at?: string
          detail?: string | null
          evidence_id?: string | null
          id?: string
          kind: string
          latitude?: number | null
          longitude?: number | null
          occurred_at: string
          title: string
        }
        Update: {
          case_id?: string
          created_at?: string
          detail?: string | null
          evidence_id?: string | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          occurred_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "timeline_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_events_evidence_id_fkey"
            columns: ["evidence_id"]
            isOneToOne: false
            referencedRelation: "evidence"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          case_id: string
          color: string | null
          created_at: string
          id: string
          make_model: string | null
          notes: string | null
          plate: string | null
          plate_partial: string | null
          vehicle_type: string | null
        }
        Insert: {
          case_id: string
          color?: string | null
          created_at?: string
          id?: string
          make_model?: string | null
          notes?: string | null
          plate?: string | null
          plate_partial?: string | null
          vehicle_type?: string | null
        }
        Update: {
          case_id?: string
          color?: string | null
          created_at?: string
          id?: string
          make_model?: string | null
          notes?: string | null
          plate?: string | null
          plate_partial?: string | null
          vehicle_type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      weapons: {
        Row: {
          case_id: string
          created_at: string
          description: string | null
          id: string
          weapon_type: string
        }
        Insert: {
          case_id: string
          created_at?: string
          description?: string | null
          id?: string
          weapon_type: string
        }
        Update: {
          case_id?: string
          created_at?: string
          description?: string | null
          id?: string
          weapon_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "weapons_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
      witnesses: {
        Row: {
          case_id: string
          created_at: string
          descriptors: string[]
          id: string
          name: string
          statement: string | null
        }
        Insert: {
          case_id: string
          created_at?: string
          descriptors?: string[]
          id?: string
          name: string
          statement?: string | null
        }
        Update: {
          case_id?: string
          created_at?: string
          descriptors?: string[]
          id?: string
          name?: string
          statement?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "witnesses_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assign_case_investigator: {
        Args: { _case_id: string; _investigator_id: string }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      add_investigation_theory: {
        Args: { _case_id: string; _theory: string }
        Returns: Database["public"]["Tables"]["investigation_theories"]["Row"]
      }
      attach_application_document: {
        Args: { _mime_type: string; _original_filename: string; _storage_path: string }
        Returns: Database["public"]["Tables"]["account_applications"]["Row"]
      }
      can_verify: { Args: { _user_id: string }; Returns: boolean }
      change_investigation_status: {
        Args: { _case_id: string; _new_status: Database["public"]["Enums"]["case_status"] }
        Returns: Database["public"]["Tables"]["cases"]["Row"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      restore_evidence: {
        Args: { _evidence_id: string }
        Returns: Database["public"]["Tables"]["evidence"]["Row"]
      }
      is_approved_user: { Args: { _user_id: string }; Returns: boolean }
      is_case_writer: { Args: { _user_id: string }; Returns: boolean }
      list_eligible_case_investigators: {
        Args: Record<PropertyKey, never>
        Returns: {
          active_case_count: number
          full_name: string
          id: string
          rank_designation: string | null
          roles: Database["public"]["Enums"]["app_role"][]
          service_start_date: string | null
          specialization: string | null
          total_case_count: number
          unit_or_agency: string | null
        }[]
      }
      review_account_application: {
        Args: {
          _application_id: string
          _decision: Database["public"]["Enums"]["application_status"]
          _notes?: string | null
        }
        Returns: Database["public"]["Tables"]["account_applications"]["Row"]
      }
      withdraw_evidence: {
        Args: { _evidence_id: string; _reason: string }
        Returns: Database["public"]["Tables"]["evidence"]["Row"]
      }
    }
    Enums: {
      app_role: "investigator" | "senior_investigator" | "administrator" | "authorized_user"
      application_role: "investigator" | "senior_investigator" | "administrator" | "authorized_user"
      application_status: "PENDING_DOCUMENT_REVIEW" | "PENDING_ADMIN_APPROVAL" | "VERIFIED_APPROVED" | "FAILED" | "REJECTED" | "MORE_INFORMATION_REQUIRED"
      case_priority: "Critical" | "High" | "Medium" | "Low"
      case_status: "Active" | "Under Review" | "Escalated" | "Dormant" | "Closed"
      connection_verdict: "pending" | "confirmed" | "rejected" | "inconclusive"
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
      app_role: ["investigator", "senior_investigator", "administrator", "authorized_user"],
      application_role: ["investigator", "senior_investigator", "administrator", "authorized_user"],
      application_status: ["PENDING_DOCUMENT_REVIEW", "PENDING_ADMIN_APPROVAL", "VERIFIED_APPROVED", "FAILED", "REJECTED", "MORE_INFORMATION_REQUIRED"],
      case_priority: ["Critical", "High", "Medium", "Low"],
      case_status: ["Active", "Under Review", "Escalated", "Dormant", "Closed"],
      connection_verdict: ["pending", "confirmed", "rejected", "inconclusive"],
    },
  },
} as const
