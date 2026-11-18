// Shared API types for web and admin (hand-written, mirrors docs/api.md).
// Money is integer paise, weight is integer mg, rates are milli-percent.
export type Paise = number;
export type Milligrams = number;

export type BusinessStatus = "pending" | "rejected" | "approved" | "active" | "suspended";

export interface ApiErrorBody {
  error: { code: string; message: string; fields?: Record<string, string> };
}

export interface Me {
  user: { id: string; email: string; name: string; avatar_url: string | null };
  business: {
    id: string;
    status: BusinessStatus;
    onboarding_step: number;
    trade_name: string | null;
    review_note: string | null;
  } | null;
}

export interface ApplicationInput {
  business_name: string;
  owner_name: string;
  phone: string;
  city: string;
  gstin: string | null;
}

export interface Application extends ApplicationInput {
  id: string;
  status: BusinessStatus;
  applied_at: string;
  review_note: string | null;
}

// Admin: one row of /api/admin/applications and /api/admin/clients.
export interface BusinessRow {
  id: string;
  status: BusinessStatus;
  applicant_business_name: string;
  applicant_owner_name: string;
  applicant_phone: string;
  applicant_city: string;
  applicant_gstin: string | null;
  applied_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
  review_note: string | null;
  trade_name: string | null;
  suspend_reason: string | null;
  owner_email: string | null;
}

export interface AuditRow {
  id: number;
  at: string;
  actor_type: "user" | "admin" | "system";
  actor_email: string | null;
  business_id: string | null;
  action: string;
  data: Record<string, unknown>;
}

export interface Page<T> {
  items: T[];
  next_cursor: string | null;
}

// ── Phase 3: business profile, settings, masters ──────────────────────────
export type RegistrationType = "regular" | "composition" | "unregistered";
export type MakingMode = "per_gram" | "flat" | "percent";

export interface Business {
  id: string;
  status: BusinessStatus;
  registration_type: RegistrationType | null;
  legal_name: string | null;
  trade_name: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  pincode: string | null;
  state_code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  udyam_no: string | null;
  logo_id: string | null;
  onboarding_step: number;
  applicant_city: string;
  applicant_gstin: string | null;
  applicant_business_name: string;
  applicant_phone: string;
}

export interface Settings {
  invoice_prefix: string;
  include_fy: boolean;
  number_min_digits: number;
  fy_reset: boolean;
  copies: ("original" | "duplicate" | "triplicate")[];
  terms: string;
  declaration: string;
  jurisdiction: string;
  signatory_name: string;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_no: string | null;
  bank_ifsc: string | null;
  bank_branch: string | null;
  upi_id: string | null;
  default_gst_rate: number;
  default_making_mode: MakingMode;
  default_making_value: number;
  next_no: number;
  preview: string;
}

export interface MetalRate { metal: string; rate_paise: Paise; updated_at?: string }
export interface State { code: string; name: string; is_ut_without_legislature: boolean }

export interface Party {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  pan: string | null;
  bill_address: string;
  bill_state_code: string | null;
  ship_same_as_bill: boolean;
  opening_balance_paise: Paise;
  opening_balance_date: string | null;
}

export interface Item {
  id: string;
  name: string;
  hsn: string | null;
  unit: "g" | "pcs" | "ct" | "pair" | "set" | "nos";
  purity: string | null;
  gst_rate: number;
  metal: string | null;
}
