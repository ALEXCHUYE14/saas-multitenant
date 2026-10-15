// Tipos de la BD. En tu proyecto regénéralos con:
//   npx supabase gen types typescript --project-id <id> > src/lib/supabase/database.types.ts
// Este archivo refleja las migraciones de supabase/migrations/

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type OrgRole = "owner" | "admin" | "staff";
export type OrgPlan = "free" | "starter" | "pro" | "enterprise";
export type OrgStatus = "trialing" | "active" | "past_due" | "suspended" | "canceled";
export type ProductUnit = "unit" | "kg" | "l" | "service";
export type StockMovementKind = "initial" | "purchase" | "waste" | "adjustment" | "sale" | "sale_void";
export type PaymentMethod = "cash" | "yape" | "plin" | "card" | "transfer" | "credit";
export type SaleStatus = "completed" | "voided";
export type OrderStatus = "open" | "paid" | "canceled";

type DiningTableRow = {
  id: string;
  organization_id: string;
  name: string;
  sort_order: number;
  active: boolean;
  created_at: string;
};

type OrderRow = {
  id: string;
  organization_id: string;
  table_id: string | null;
  label: string | null;
  status: OrderStatus;
  opened_by: string | null;
  opened_at: string;
  closed_by: string | null;
  closed_at: string | null;
  sale_id: string | null;
  cancel_reason: string | null;
};

type OrderItemRow = {
  id: string;
  organization_id: string;
  order_id: string;
  product_id: string;
  quantity: number;
  note: string | null;
  created_by: string | null;
  created_at: string;
};

type CashSessionRow = {
  id: string;
  organization_id: string;
  opened_by: string | null;
  opened_at: string;
  opening_amount: number;
  closed_by: string | null;
  closed_at: string | null;
  expected_cash: number | null;
  counted_cash: number | null;
  note: string | null;
};

type CustomerPaymentRow = {
  id: string;
  organization_id: string;
  customer_id: string;
  amount: number;
  payment_method: PaymentMethod;
  cash_session_id: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

type SaleRow = {
  id: string;
  organization_id: string;
  number: number;
  cash_session_id: string;
  customer_id: string | null;
  status: SaleStatus;
  payment_method: PaymentMethod;
  subtotal: number;
  discount: number;
  total: number;
  amount_received: number | null;
  change_given: number | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
};

type ProductRow = {
  id: string;
  organization_id: string;
  name: string;
  code: string | null;
  category: string | null;
  unit: ProductUnit;
  price: number;
  cost: number | null;
  track_stock: boolean;
  stock: number;
  min_stock: number | null;
  low_stock: boolean;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  status: OrgStatus;
  tax_id: string | null;
  address: string | null;
  phone: string | null;
  ticket_footer: string | null;
  trial_ends_at: string;
  paid_until: string | null;
  provisional_until: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingMethod = "card" | "yape" | "plin" | "transfer";
export type BillingPaymentStatus = "pending" | "approved" | "rejected";

type BillingPaymentRow = {
  id: string;
  organization_id: string;
  method: BillingMethod;
  amount: number;
  months: number;
  status: BillingPaymentStatus;
  provider_payment_id: string | null;
  operation_number: string | null;
  paid_on: string | null;
  receipt_path: string | null;
  period_start: string | null;
  period_end: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
  created_by: string | null;
  created_at: string;
};

type BillingSubscriptionRow = {
  organization_id: string;
  provider_subscription_id: string;
  status: string;
  payer_email: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: never;
        Update: {
          name?: string;
          tax_id?: string | null;
          address?: string | null;
          phone?: string | null;
          ticket_footer?: string | null;
        };
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
      products: {
        Row: ProductRow;
        Insert: {
          name: string;
          code?: string | null;
          category?: string | null;
          unit?: ProductUnit;
          price: number;
          cost?: number | null;
          track_stock?: boolean;
          stock?: number; // solo al crear; después cambia vía adjust_stock()
          min_stock?: number | null;
          active?: boolean;
        };
        Update: {
          name?: string;
          code?: string | null;
          category?: string | null;
          unit?: ProductUnit;
          price?: number;
          cost?: number | null;
          track_stock?: boolean;
          min_stock?: number | null;
          active?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey";
            columns: ["organization_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_movements: {
        Row: {
          id: string;
          organization_id: string;
          product_id: string;
          kind: StockMovementKind;
          quantity: number;
          stock_after: number;
          note: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      billing_payments: {
        Row: BillingPaymentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      billing_subscriptions: {
        Row: BillingSubscriptionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      dining_tables: {
        Row: DiningTableRow;
        Insert: { name: string; sort_order?: number };
        Update: { name?: string; sort_order?: number; active?: boolean };
        Relationships: [];
      };
      orders: {
        Row: OrderRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "orders_table_id_fkey";
            columns: ["table_id"];
            isOneToOne: false;
            referencedRelation: "dining_tables";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: OrderItemRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
        ];
      };
      customer_payments: {
        Row: CustomerPaymentRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "customer_payments_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
        ];
      };
      cash_sessions: {
        Row: CashSessionRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      sales: {
        Row: SaleRow;
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "sales_customer_id_fkey";
            columns: ["customer_id"];
            isOneToOne: false;
            referencedRelation: "customers";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_cash_session_id_fkey";
            columns: ["cash_session_id"];
            isOneToOne: false;
            referencedRelation: "cash_sessions";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_items: {
        Row: {
          id: string;
          organization_id: string;
          sale_id: string;
          product_id: string;
          product_name: string;
          unit: ProductUnit;
          quantity: number;
          unit_price: number;
          line_total: number;
          unit_cost: number | null;
          stock_moved: boolean;
        };
        Insert: never;
        Update: never;
        Relationships: [
          {
            foreignKeyName: "sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
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
      adjust_stock: {
        Args: { p_product_id: string; p_kind: StockMovementKind; p_quantity: number; p_note?: string | null };
        Returns: ProductRow;
      };
      open_cash_session: { Args: { p_opening_amount: number }; Returns: CashSessionRow };
      close_cash_session: {
        Args: { p_session_id: string; p_counted_cash: number; p_note?: string | null };
        Returns: CashSessionRow;
      };
      create_sale: {
        Args: {
          p_items: { product_id: string; quantity: number }[];
          p_payment_method: PaymentMethod;
          p_amount_received?: number | null;
          p_discount?: number;
          p_customer_id?: string | null;
          p_note?: string | null;
        };
        Returns: SaleRow;
      };
      void_sale: { Args: { p_sale_id: string; p_reason: string }; Returns: SaleRow };
      sales_summary: {
        Args: { p_from: string; p_to: string };
        Returns: { sales_count: number; total: number }[];
      };
      is_platform_admin: { Args: Record<string, never>; Returns: boolean };
      my_billing: {
        Args: Record<string, never>;
        Returns: {
          organization_id: string;
          name: string;
          slug: string;
          status: OrgStatus;
          trial_ends_at: string;
          paid_until: string | null;
          provisional_until: string | null;
          access_until: string;
          has_access: boolean;
          is_owner: boolean;
          subscription_status: string | null;
          pending_payment: boolean;
        }[];
      };
      report_manual_payment: {
        Args: {
          p_method: BillingMethod;
          p_operation_number: string;
          p_paid_on: string;
          p_amount: number;
          p_receipt_path?: string | null;
        };
        Returns: BillingPaymentRow;
      };
      billing_upsert_subscription: {
        Args: { p_org: string; p_provider_id: string; p_status: string; p_payer_email?: string | null };
        Returns: undefined;
      };
      billing_apply_card_payment: {
        Args: { p_org: string; p_provider_payment_id: string; p_amount: number; p_paid_at: string | null };
        Returns: boolean;
      };
      admin_review_payment: {
        Args: { p_payment_id: string; p_approve: boolean; p_reason?: string | null };
        Returns: BillingPaymentRow;
      };
      admin_organizations: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          name: string;
          slug: string;
          status: OrgStatus;
          created_at: string;
          trial_ends_at: string;
          paid_until: string | null;
          provisional_until: string | null;
          access_until: string;
          owner_email: string | null;
          subscription_status: string | null;
          pending_payments: number;
        }[];
      };
      admin_pending_payments: {
        Args: Record<string, never>;
        Returns: {
          id: string;
          organization_id: string;
          organization_name: string;
          method: BillingMethod;
          amount: number;
          months: number;
          operation_number: string;
          paid_on: string;
          receipt_path: string | null;
          created_at: string;
        }[];
      };
      admin_set_org_status: { Args: { p_org: string; p_status: OrgStatus }; Returns: undefined };
      admin_extend_trial: { Args: { p_org: string; p_days: number }; Returns: undefined };
      report_summary: {
        Args: { p_from: string; p_to: string };
        Returns: { sales_count: number; gross: number; discounts: number; net: number; credit_total: number; voided_count: number }[];
      };
      report_sales_by_day: {
        Args: { p_from: string; p_to: string };
        Returns: { day: string; sales_count: number; total: number }[];
      };
      report_payment_methods: {
        Args: { p_from: string; p_to: string };
        Returns: { payment_method: PaymentMethod; sales_count: number; total: number }[];
      };
      report_top_products: {
        Args: { p_from: string; p_to: string; p_limit?: number };
        Returns: {
          product_id: string;
          product_name: string;
          unit: ProductUnit;
          quantity: number;
          revenue: number;
          cost: number;
          revenue_with_cost: number;
        }[];
      };
      report_profit: {
        Args: { p_from: string; p_to: string };
        Returns: { revenue: number; revenue_with_cost: number; cost: number }[];
      };
      report_by_seller: {
        Args: { p_from: string; p_to: string };
        Returns: { seller_id: string | null; sales_count: number; total: number }[];
      };
      open_order: { Args: { p_table_id?: string | null; p_label?: string | null }; Returns: OrderRow };
      add_order_item: {
        Args: { p_order_id: string; p_product_id: string; p_quantity?: number; p_note?: string | null };
        Returns: OrderItemRow;
      };
      set_order_item_quantity: { Args: { p_item_id: string; p_quantity: number }; Returns: undefined };
      move_order: { Args: { p_order_id: string; p_table_id: string | null }; Returns: OrderRow };
      cancel_order: { Args: { p_order_id: string; p_reason?: string | null }; Returns: OrderRow };
      pay_order: {
        Args: {
          p_order_id: string;
          p_payment_method: PaymentMethod;
          p_amount_received?: number | null;
          p_discount?: number;
          p_customer_id?: string | null;
        };
        Returns: SaleRow;
      };
      customer_balance: { Args: { p_customer_id: string }; Returns: number };
      customer_debts: {
        Args: Record<string, never>;
        Returns: { customer_id: string; full_name: string; phone: string | null; debt: number; last_credit_at: string }[];
      };
      register_customer_payment: {
        Args: { p_customer_id: string; p_amount: number; p_payment_method: PaymentMethod; p_note?: string | null };
        Returns: CustomerPaymentRow;
      };
      void_customer_payment: { Args: { p_payment_id: string; p_reason: string }; Returns: CustomerPaymentRow };
      cash_session_payments_summary: {
        Args: { p_session_id: string };
        Returns: { payment_method: PaymentMethod; payments_count: number; total: number }[];
      };
      cash_session_summary: {
        Args: { p_session_id: string };
        Returns: { payment_method: PaymentMethod; sales_count: number; total: number }[];
      };
    };
    Enums: {
      org_role: OrgRole;
      org_plan: OrgPlan;
      org_status: OrgStatus;
      product_unit: ProductUnit;
      stock_movement_kind: StockMovementKind;
      payment_method: PaymentMethod;
      sale_status: SaleStatus;
      order_status: OrderStatus;
      billing_method: BillingMethod;
      billing_payment_status: BillingPaymentStatus;
    };
    CompositeTypes: { [_ in never]: never };
  };
};

export type Organization = OrganizationRow;
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Customer = Database["public"]["Tables"]["customers"]["Row"];
export type Product = ProductRow;
export type StockMovement = Database["public"]["Tables"]["stock_movements"]["Row"];
export type CashSession = CashSessionRow;
export type Sale = SaleRow;
export type SaleItem = Database["public"]["Tables"]["sale_items"]["Row"];
export type CustomerPayment = CustomerPaymentRow;
export type DiningTable = DiningTableRow;
export type BillingPayment = BillingPaymentRow;
export type Order = OrderRow;
export type OrderItem = OrderItemRow;
