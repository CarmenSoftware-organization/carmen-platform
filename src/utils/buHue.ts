// Deterministic per-BU colour identity for the SQL Workbench.
//
// The same BU code always maps to the same hue, so an operator switching between
// dozens of tenant databases can recognise "which tenant am I pointed at" by
// colour — a cheap guard against running DDL (Save / Drop) against the wrong
// tenant. Saturation/lightness come from CSS custom properties (`--bu-chip-s` /
// `--bu-chip-l`, defined per theme in index.css) so light and dark can each tune
// legibility without shifting the hue.

/** Stable hue (0–359) derived from the BU code. */
export function buHue(code: string): number {
  let h = 0;
  for (let i = 0; i < code.length; i++) {
    h = (h * 31 + code.charCodeAt(i)) % 360;
  }
  return h;
}

/** CSS colour for the BU chip / rail / dot. */
export function buHueColor(code: string): string {
  return `hsl(${buHue(code)} var(--bu-chip-s, 62%) var(--bu-chip-l, 46%))`;
}

/** Up to two uppercase initials from the leading segment of a BU code (e.g. `ACME-TH` → `AC`). */
export function buInitials(code: string): string {
  const head = code.split(/[-_ ]/)[0] || code;
  return head.slice(0, 2).toUpperCase();
}
