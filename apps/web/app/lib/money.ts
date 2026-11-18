// Forgiving decimal input → integer in the smallest unit, without floats.
// "13457", "13,457", "₹13,457.00" all parse; too many decimals or junk → null.
export function parseScaled(raw: string, decimals: number): number | null {
  const s = raw.replace(/[₹,\s]/g, "").replace(/^Rs\.?/i, "");
  if (s === "") return null;
  const m = /^(\d*)(?:\.(\d*))?$/.exec(s);
  if (!m || (m[1] === "" && !m[2]) || (m[2] ?? "").length > decimals) return null;
  const n = Number(m[1] || "0") * 10 ** decimals + Number((m[2] ?? "").padEnd(decimals, "0") || "0");
  return Number.isSafeInteger(n) ? n : null;
}

export const toPaise = (raw: string) => parseScaled(raw, 2);
export const toMilliPct = (raw: string) => parseScaled(raw, 3); // "3" → 3000

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtINR = (paise: number) => "₹" + inr.format(paise / 100); // ₹4,46,119.00

// Plain value for an <input defaultValue>: 1345700 → "13457", 1097950 → "10979.5"
export const plain = (n: number | null | undefined, decimals: number) =>
  n == null ? "" : String(n / 10 ** decimals);

// Mirror of server docNumber(); keep in sync with services/api/internal/server/business.go.
export function docNumber(prefix: string, includeFY: boolean, digits: number, n: number, now = new Date()): string {
  const ist = new Date(now.getTime() + 330 * 60_000);
  const fy = ist.getUTCMonth() < 3 ? ist.getUTCFullYear() - 1 : ist.getUTCFullYear();
  const yy = (y: number) => String(y % 100).padStart(2, "0");
  return prefix + (includeFY ? `${yy(fy)}-${yy(fy + 1)}/` : "") + String(n).padStart(digits, "0");
}
