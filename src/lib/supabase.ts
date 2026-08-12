import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Real admin sessions (Supabase Auth) replace the old localStorage boolean.
    // The session is a scoped, auto-refreshing JWT — admin gating is enforced
    // server-side by RLS via is_admin(), so the client token cannot grant
    // privileges it was not issued.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'pp-admin-auth',
  },
});

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          id: string;
          name: string;
          icon: string;
          sort_order: number;
          active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          icon: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          icon?: string;
          sort_order?: number;
          active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      products: {
        Row: {
          id: string;
          name: string;
          description: string;
          category: string;
          base_price: number;
          discount_price: number | null;
          discount_start_date: string | null;
          discount_end_date: string | null;
          discount_active: boolean;
          purity_percentage: number;
          molecular_weight: string | null;
          cas_number: string | null;
          sequence: string | null;
          storage_conditions: string;
          inclusions: string[] | null;
          stock_quantity: number;
          available: boolean;
          featured: boolean;
          image_url: string | null;
          safety_sheet_url: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          description: string;
          category: string;
          base_price: number;
          discount_price?: number | null;
          discount_start_date?: string | null;
          discount_end_date?: string | null;
          discount_active?: boolean;
          purity_percentage?: number;
          molecular_weight?: string | null;
          cas_number?: string | null;
          sequence?: string | null;
          storage_conditions?: string;
          inclusions?: string[] | null;
          stock_quantity?: number;
          available?: boolean;
          featured?: boolean;
          image_url?: string | null;
          safety_sheet_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          description?: string;
          category?: string;
          base_price?: number;
          discount_price?: number | null;
          discount_start_date?: string | null;
          discount_end_date?: string | null;
          discount_active?: boolean;
          purity_percentage?: number;
          molecular_weight?: string | null;
          cas_number?: string | null;
          sequence?: string | null;
          storage_conditions?: string;
          inclusions?: string[] | null;
          stock_quantity?: number;
          available?: boolean;
          featured?: boolean;
          image_url?: string | null;
          safety_sheet_url?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      product_variations: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          quantity_mg: number;
          price: number;
          stock_quantity: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          name: string;
          quantity_mg: number;
          price: number;
          stock_quantity?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          product_id?: string;
          name?: string;
          quantity_mg?: number;
          price?: number;
          stock_quantity?: number;
          created_at?: string;
        };
      };
      payment_methods: {
        Row: {
          id: string;
          name: string;
          account_number: string;
          account_name: string;
          qr_code_url: string;
          active: boolean;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name: string;
          account_number: string;
          account_name: string;
          qr_code_url: string;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          account_number?: string;
          account_name?: string;
          qr_code_url?: string;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      site_settings: {
        Row: {
          id: string;
          value: string;
          type: string;
          description: string | null;
          updated_at: string;
        };
        Insert: {
          id: string;
          value: string;
          type?: string;
          description?: string | null;
          updated_at?: string;
        };
        Update: {
          id?: string;
          value?: string;
          type?: string;
          description?: string | null;
          updated_at?: string;
        };
      };
      storefront_notices: {
        Row: {
          id: string;
          internal_name: string;
          status: 'draft' | 'published' | 'archived';
          version: number;
          priority: number;
          starts_at: string | null;
          ends_at: string | null;
          audience: 'everyone' | 'visitor' | 'verified_member';
          page_ids: string[];
          frequency: 'once' | 'session' | 'every_visit';
          style: 'info' | 'warning' | 'success' | 'critical';
          title: string;
          subtitle: string;
          body: string;
          highlight: string;
          policy_title: string;
          policy_lines: string;
          button_label: string;
          footer_note: string;
          published_at: string | null;
          archived_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          internal_name: string;
          status?: 'draft' | 'published' | 'archived';
          version?: number;
          priority?: number;
          starts_at?: string | null;
          ends_at?: string | null;
          audience?: 'everyone' | 'visitor' | 'verified_member';
          page_ids?: string[];
          frequency?: 'once' | 'session' | 'every_visit';
          style?: 'info' | 'warning' | 'success' | 'critical';
          title?: string;
          subtitle?: string;
          body?: string;
          highlight?: string;
          policy_title?: string;
          policy_lines?: string;
          button_label?: string;
          footer_note?: string;
          published_at?: string | null;
          archived_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['storefront_notices']['Insert']>;
      };
      storefront_notice_stats: {
        Row: {
          notice_id: string;
          version: number;
          impression_count: number;
          acknowledgement_count: number;
          updated_at: string;
        };
        Insert: {
          notice_id: string;
          version: number;
          impression_count?: number;
          acknowledgement_count?: number;
          updated_at?: string;
        };
        Update: {
          impression_count?: number;
          acknowledgement_count?: number;
          updated_at?: string;
        };
      };
    };
    Functions: {
      get_active_storefront_notice: {
        Args: { p_page_id: string; p_audience: 'visitor' | 'verified_member' };
        Returns: Array<{
          id: string;
          version: number;
          priority: number;
          starts_at: string | null;
          ends_at: string | null;
          audience: string;
          page_ids: string[];
          frequency: string;
          style: string;
          title: string;
          subtitle: string;
          body: string;
          highlight: string;
          policy_title: string;
          policy_lines: string;
          button_label: string;
          footer_note: string;
          published_at: string;
        }>;
      };
      record_storefront_notice_event: {
        Args: {
          p_notice_id: string;
          p_version: number;
          p_event: 'impression' | 'acknowledgement';
        };
        Returns: undefined;
      };
    };
  };
};
