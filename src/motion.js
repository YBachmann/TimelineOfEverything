// Reduced-motion support (Q10).
//
// One live media query, deliberately NOT snapshotted into React state: every
// consumer reads it at the moment it is about to move something — inside a D3
// render pass, an animation frame callback, or a gesture handler — all of
// which run long after the React render that created them. Reading live means
// a mid-session OS change takes effect on the next gesture without any
// subscription, re-render, or scene rebuild. CSS handles its own half through
// the matching @media block in App.css.
const query = typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;

export function prefersReducedMotion() {
    return !!query?.matches;
}
