// Port of services/api/internal/gstin for instant feedback while typing. The server re-validates.
const CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const FORMAT = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export function checkChar(first14: string): string {
  let sum = 0;
  for (let i = 0; i < 14; i++) {
    const p = CHARS.indexOf(first14.charAt(i)) * (1 + (i % 2));
    sum += Math.floor(p / 36) + (p % 36);
  }
  return CHARS.charAt((36 - (sum % 36)) % 36);
}

// gstinProblem returns a user-facing hint, or null when the GSTIN looks valid (or is empty).
export function gstinProblem(raw: string): string | null {
  const g = raw.trim().toUpperCase();
  if (g === "") return null;
  if (g.length < 15) return null; // still typing
  if (!FORMAT.test(g)) return "GSTIN 15 characters ka hota hai, jaise 08ABCDE1234F1Z5";
  if (checkChar(g.slice(0, 14)) !== g[14]) return "Last character galat lag raha hai — please re-check";
  return null;
}
