/**
 * Giorni che mancano a una data scritta come AAAA-MM-GG.
 *
 * Conta per giorni di calendario locali, non per ore: due date distano un
 * giorno anche se fra loro passano solo dieci minuti di orologio. Era scritta
 * due volte, nella barra e nella home, con lo stesso codice.
 */
export function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}
