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
