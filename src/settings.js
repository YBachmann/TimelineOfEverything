// App settings.
//
// Today these are compile-time constants with no UI behind them. The shape is
// deliberate, though: every value is *read at render time and passed into* the
// helper that uses it, never consulted as a global deep inside one. So turning
// one into React state (a settings menu, D22 open item) is a local change —
// thread the value down instead of a constant, and add it to the render
// effect's dependency array so the D3 scene rebuilds when it flips.

export const settings = {
    // Prefix on-canvas event labels with the precision mark (~ / ≈ / ?) that the
    // event's date carries. The dot's soft rim is the always-on cue; this is the
    // explicit, readable confirmation on the ~35 labels that get placed (D22).
    // Off = labels show the bare title, as they did before D22.
    precisionMarksOnLabels: true,
};
