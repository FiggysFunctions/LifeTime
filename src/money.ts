export const round2 = (n: number) => Math.round(n * 100) / 100;

export const fmtMoney = (n: number, symbol: string) =>
  `${symbol}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Accepts "12", "12.5", "12,50" — returns a positive 2dp number or null.
export function parseAmount(raw: string): number | null {
  const n = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return round2(n);
}
