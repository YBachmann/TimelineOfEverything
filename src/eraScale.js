/**
 * Piecewise-equal era scale for the navigation scrubber (minimap).
 *
 * A minimap sharing the main view's symlog scale would inherit its compression:
 * the Modern era (1500–2030), where most events sit, would occupy ~0.7% of the
 * strip. Instead the scrubber gives every era an EQUAL share of the strip and
 * maps symlog-style *within* each band. Time is non-uniform across the strip,
 * but the labeled bands make that legible — and every era stays readable and
 * scrubbable at any zoom.
 *
 * Pure module (no DOM/d3) so scripts/verify-layout.mjs can property-test the
 * frac/invert round-trip. Design: docs/design/navigation.md
 */

// Era boundaries: each entry ends at `until` (exclusive upper bound in years);
// the first era starts at the domain minimum, the last is capped at the domain
// maximum. Boundaries: solar-system formation, Homo sapiens, ~Renaissance/print,
// and "now-ish" for the future split.
export const ERA_DEFS = [
    { key: 'cosmic', label: 'Cosmic', until: -4600000000 },
    { key: 'life', label: 'Earth & Life', until: -300000 },
    { key: 'human', label: 'Human Era', until: 1500 },
    { key: 'modern', label: 'Modern', until: 2030 },
    { key: 'future', label: 'Future', until: null }, // → domainMax
];

// Symlog transform with constant 1 — must match d3.scaleSymlog's default.
const tSym = y => Math.sign(y) * Math.log1p(Math.abs(y));
const tSymInv = v => Math.sign(v) * Math.expm1(Math.abs(v));

/**
 * Build the era scale for a domain. Eras that fall outside [domainMin,
 * domainMax] (e.g. "Future" when a category filter ends the domain at 2026)
 * are dropped; the survivors split the strip equally.
 *
 * Returns { eras, frac, invert }:
 * - eras: [{ key, label, y0, y1 }] — resolved, clamped, in order
 * - frac(year) → [0, 1] position on the strip (clamped)
 * - invert(f) → year (inverse of frac)
 */
export function createEraScale(domainMin, domainMax) {
    const eras = [];
    let y0 = domainMin;
    for (const def of ERA_DEFS) {
        const rawEnd = def.until == null ? domainMax : def.until;
        const y1 = Math.min(rawEnd, domainMax);
        if (y1 > y0) eras.push({ key: def.key, label: def.label, y0, y1 });
        y0 = Math.max(y0, y1);
        if (y0 >= domainMax) break;
    }
    // Degenerate domain (single-year dataset): one full-strip band.
    if (!eras.length) eras.push({ key: 'all', label: '', y0: domainMin, y1: domainMax });

    const n = eras.length;

    const frac = (year) => {
        const y = Math.max(domainMin, Math.min(domainMax, year));
        let i = eras.findIndex(e => y <= e.y1);
        if (i < 0) i = n - 1;
        const e = eras[i];
        const t0 = tSym(e.y0);
        const t1 = tSym(e.y1);
        const within = t1 > t0 ? (tSym(y) - t0) / (t1 - t0) : 0;
        return (i + Math.max(0, Math.min(1, within))) / n;
    };

    const invert = (f) => {
        const fc = Math.max(0, Math.min(1, f));
        const i = Math.min(n - 1, Math.floor(fc * n));
        const within = fc * n - i;
        const e = eras[i];
        const tv = tSym(e.y0) + within * (tSym(e.y1) - tSym(e.y0));
        return tSymInv(tv);
    };

    return { eras, frac, invert };
}
