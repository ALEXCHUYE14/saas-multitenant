// Tipos de la BD. En tu proyecto regénéralos con:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
// Este archivo refleja exactamente la migración 20261013000000_multitenant_core.sql

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgRole = "owner" | "admin" | "staff";
export type OrgPlan = "free" | "starter" | "pro" | "enterprise";
export type OrgStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  status: OrgStatus;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: never;
        Update: { name?: string };
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          organization_id: string | null;
          full_name: string | null;
          role: OrgRole;
          created_at: string;
          updated_at: string;
        };
        Insert: never;
        Update: { full_name?: string | null };
        Relationships: [
          {
            foreignKeyName: "profiles_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      invitations: {
        Row: {
          id: string;
          organization_id: string;
          email: string;
          role: OrgRole;
          token: string;
          invited_by: string | null;
          expires_at: string;
          accepted_at: string | null;
          created_at: string;
        };
        Insert: {
          organization_id: string;
          email: string;
          role?: OrgRole;
          invited_by: string;
          expires_at?: string;
        };
        Update: never;
        Relationships: [
          {
            foreignKeyName: "invitations_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      customers: {
        Row: {
          id: string;
          organization_id: string;
          full_name: string;
          phone: string | null;
          email: string | null;
          document_id: string | null;
          notes: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          organization_id?: string; // lo completa la BD desde la sesión
          full_name: string;
          phone?: string | null;
          email?: string | null;
          document_id?: string | null;
          notes?: string | null;
        };
        Update: {
          full_name?: string;
          phone?: string | null;
          email?: string | null;
          document_id?: string | null;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "customers_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: {
      is_slug_available: { Args: { p_slug: string }; Returns: boolean };
      create_organization: { Args: { p_name: string; p_slug: string }; Returns: OrganizationRow };
      accept_invitation: { Args: { p_token: string }; Returns: OrganizationRow };
      set_member_role: { Args: { p_member_id: string; p_role: OrgRole }; Returns: undefined };
      remove_member: { Args: { p_member_id: string }; Returns: undefined };
    };
    Enums: {
      org_role: OrgRole;
      org_plan: OrgPlan;
      org_status: OrgStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Organization = OrganizationRow;
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];
