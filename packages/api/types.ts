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
    logo_id: string | null;
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
export type Purity = "gold999" | "gold995" | "gold916" | "gold750" | "gold585" | "silver999";
// IBJA benchmark (ex-GST), paise per gram. day is YYYY-MM-DD.
export interface MarketRate { day: string; session: "AM" | "PM"; purity: Purity; paise_per_gram: Paise; fetched_at: string }
export interface MarketRates { items: MarketRate[]; stale: boolean }
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
  archived_at?: string | null;
}

export interface Item {
  id: string;
  name: string;
  hsn: string | null;
  unit: "g" | "pcs" | "ct" | "pair" | "set" | "nos";
  purity: string | null;
  gst_rate: number;
  metal: string | null;
  default_rate_paise: number | null;
  making_mode: MakingMode | null;
  making_value: number | null;
}

// ── Phase 4/5: documents ─────────────────────────────────────────────────
export type DocStatus = "draft" | "issued" | "cancelled";
export type PayMode = "cash" | "upi" | "bank" | "cheque" | "card" | "old_gold";

export interface PartyBlock { name: string; address: string; state_code: string | null; gstin: string | null; phone: string | null; pan: string | null }

export interface LineInput {
  kind: "goods" | "charge";
  item_id: string | null;
  description: string;
  hsn: string | null;
  purity: string | null;
  huid: string | null;
  unit: Item["unit"];
  gross_weight_mg: number | null;
  qty_milli: number;
  rate_paise: number;
  making: { mode: MakingMode; value: number } | null;
  other_paise: number;
  other_label: string | null;
  gst_rate: number;
  target_total_paise: number | null;
}

export interface OldGoldLineInput { description: string; purity: string | null; gross_weight_mg: number; less_weight_mg: number; rate_paise: number }

export interface InvoiceInput {
  doc_type?: "tax_invoice" | "bill_of_supply";
  invoice_date: string;
  calc_mode: "forward" | "reverse";
  party_id: string | null;
  buyer: PartyBlock;
  goods_movement: boolean;
  place_of_supply_override: string | null;
  lines: LineInput[];
  old_gold: { seller_kind: "individual" | "business"; lines: OldGoldLineInput[] } | null;
  notes: string;
}

export interface Warning { code: string; message: string }
export interface TaxGroup { hsn: string; gst_rate: number; taxable_paise: Paise; cgst_paise: Paise; sgst_paise: Paise; igst_paise: Paise }

export interface Computed {
  doc_type: string;
  supply_type: "intra" | "inter";
  place_of_supply: string;
  sgst_label: string;
  lines: { metal_paise: Paise; making_paise: Paise; other_paise: Paise; taxable_paise: Paise; rate_paise: Paise; rate_derived: boolean }[];
  tax_groups: TaxGroup[];
  taxable_paise: Paise;
  cgst_paise: Paise;
  sgst_paise: Paise;
  igst_paise: Paise;
  tcs_paise: Paise;
  round_off_paise: Paise;
  grand_total_paise: Paise;
  old_gold: { lines: { net_weight_mg: number; amount_paise: Paise }[]; net_weight_mg: number; round_off_paise: Paise; total_paise: Paise } | null;
  net_payable_paise: Paise;
  words: { grand_total: string; tax: string; net_payable: string };
  warnings: Warning[];
}

export interface InvoiceRow {
  id: string;
  doc_type: string;
  status: DocStatus;
  invoice_no: string | null;
  invoice_date: string;
  party_id: string | null;
  buyer_name: string;
  buyer_gstin: string | null;
  grand_total_paise: Paise;
  old_gold_paise: Paise;
  net_payable_paise: Paise;
  paid_paise: Paise;
}

export interface Invoice extends Omit<InvoiceRow, "paid_paise"> {
  input: InvoiceInput;
  cancel_reason: string | null;
  issued_at: string | null;
}

export interface Snapshot {
  doc: { type: string; title: string; no: string; date: string; place_of_supply: { code: string; name: string } | null };
  seller: { legal_name: string; trade_name: string; address: string; gstin: string | null; logo_id: string | null; state: { code: string; name: string } };
  buyer: { name: string; address: string; state: { code: string; name: string } | null; gstin: string | null; phone: string | null; pan: string | null };
  lines: { sno: number; description: string; hsn: string | null; purity: string | null; unit: string; qty_milli: number; gross_weight_mg: number | null; rate_paise: Paise; rate_derived: boolean; making: { paise: Paise } | null; other_paise: Paise; taxable_paise: Paise; gst_rate: number }[];
  tax_groups: TaxGroup[];
  totals: { supply_type: string; sgst_label: string; taxable_paise: Paise; cgst_paise: Paise; sgst_paise: Paise; igst_paise: Paise; tcs_paise: Paise; round_off_paise: Paise; grand_total_paise: Paise; old_gold_paise: Paise; net_payable_paise: Paise };
  old_gold: { voucher_no: string; lines: { description: string; net_weight_mg: number; rate_paise: Paise; amount_paise: Paise }[]; total_paise: Paise } | null;
  words: { grand_total: string; tax: string; net_payable: string };
}

export interface Payment {
  id: string;
  party_id: string | null;
  invoice_id: string | null;
  invoice_no?: string | null;
  received_on: string;
  amount_paise: Paise;
  mode: PayMode;
  reference: string | null;
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
}

export interface InvoiceDetail {
  invoice: Invoice;
  computed?: Computed | null;
  snapshot?: Snapshot;
  payments: Payment[];
  paid_paise: Paise;
  voucher_id?: string;
}

export interface Voucher {
  id: string;
  status: "issued" | "cancelled";
  voucher_no: string;
  voucher_date: string;
  party_id: string | null;
  seller_name: string;
  seller_kind: "individual" | "business";
  settlement: "exchange" | "paid" | "on_account";
  invoice_id: string | null;
  paid_mode: string | null;
  net_weight_mg: number;
  total_paise: Paise;
}

export interface LedgerEntry { date: string; type: string; ref: string; id: string; debit_paise: Paise; credit_paise: Paise; balance_paise: Paise }
export interface Ledger { party: { id: string; name: string; phone: string | null }; opening_balance_paise: Paise; entries: LedgerEntry[]; closing_balance_paise: Paise }
export interface PartyBalance { id: string; name: string; phone: string | null; balance_paise: Paise }

export interface HomeData {
  today_paise: Paise;
  today_count: number;
  month_paise: Paise;
  month_count: number;
  outstanding_paise: Paise;
  recent: InvoiceRow[];
  rates: MetalRate[];
}
