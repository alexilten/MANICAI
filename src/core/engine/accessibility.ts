/**
 * Accessible seating requirements. Only the US table is encoded; other jurisdictions set their own
 * numbers (see standards: ada.221). Wheelchair positions are counted against total seating capacity.
 */

/** Wheelchair spaces required by the 2010 ADA Standards for Accessible Design, table 221.2.1.1 (recall). */
export function adaRequired(seats: number): number {
  if (seats <= 0) return 0;
  if (seats <= 25) return 1;
  if (seats <= 50) return 2;
  if (seats <= 150) return 4;
  if (seats <= 300) return 5;
  if (seats <= 500) return 6;
  if (seats <= 5000) return 6 + Math.ceil((seats - 500) / 150);
  return 36 + Math.ceil((seats - 5000) / 200);
}
