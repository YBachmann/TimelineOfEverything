import React, { useEffect, useRef, useState } from 'react';

/**
 * First-run gesture hints for the screens where the control-hints box is not
 * shown (D26).
 *
 * The hole this fills: `.timeline-info` lists how to zoom, pan, preview and open
 * events, and it is `display: none` under the small-screen media query (D10) —
 * the hints describe desktop input and are bulky on a phone. So on the devices
 * where the gestures are the ONLY way to drive the chart, nothing announced that
 * they exist. D13 built press-and-hold specifically as touch's answer to hover,
 * and its discoverability was zero.
 *
 * Three decisions worth keeping:
 *
 * 1. SHOWN EXACTLY WHEN THE HINTS BOX IS HIDDEN — and that is decided by asking
 *    the DOM (`getComputedStyle(hints).display === 'none'`), not by re-stating
 *    the media query here. A copy of `(max-width: 640px), (max-height: 540px)`
 *    in JS is free to drift from the CSS that actually governs the box; reading
 *    the resolved style cannot. It also states the intent exactly: this exists
 *    to cover for that element.
 *
 * 2. NOTHING IS PERSISTED. The obvious design is a "don't show again" flag in
 *    localStorage — but the published privacy notice (D17) states, in both
 *    languages, that the app "stores nothing in localStorage or sessionStorage",
 *    and that claim was verified against the source rather than assumed. A UI
 *    convenience does not get to falsify a legal claim, so this shows once per
 *    page load and is deliberately cheap to dismiss instead: the first touch
 *    anywhere on the chart clears it. A returning visitor pays one glance at
 *    something that vanishes as soon as they do anything.
 *
 * 3. IT IS NOT A DIALOG. No focus trap, no focus steal, no backdrop — it must
 *    not stand between the user and the chart it is describing. `role="status"`
 *    announces it politely to a screen reader; the dismiss button is an ordinary
 *    tab stop.
 */
export default function GestureCoach({ hintsRef, coarseInput }) {
    const [show, setShow] = useState(false);
    const rootRef = useRef(null);

    // A plain effect, NOT useLayoutEffect. The hints box is a later sibling of
    // the section this component lives in, so React attaches its ref after this
    // child's layout effect has already run — the first version read `null`
    // there and silently never showed the coach at all, on exactly the screens
    // it exists for. Effects run after paint, when every ref in the commit is
    // attached. Running after paint is also correct rather than merely
    // tolerable here: the coach fades in.
    useEffect(() => {
        const hints = hintsRef.current;
        if (!hints) return;
        setShow(getComputedStyle(hints).display === 'none');
    }, [hintsRef]);

    useEffect(() => {
        if (!show) return;
        // Any real interaction means the user is under way — the hint has done
        // its job and should get out of the way. Capture phase so it fires even
        // when the chart's own handlers stop propagation, and `once` so it costs
        // nothing afterwards. Dismissing the coach never swallows the gesture:
        // this only listens, the event proceeds to the chart normally.
        const done = () => setShow(false);
        window.addEventListener('pointerdown', done, { capture: true, once: true });
        const onKey = (e) => { if (e.key === 'Escape') setShow(false); };
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('pointerdown', done, { capture: true });
            window.removeEventListener('keydown', onKey);
        };
    }, [show]);

    if (!show) return null;

    // Copy mirrors the hints box's own modality split (the same `coarseInput`
    // App uses for it), trimmed to the four things you cannot discover by
    // looking: the two gestures, and the two ways to reach an event.
    // Kept to two or three words each. The first draft ran to phrases ("Pinch or
    // double-tap to zoom") which wrapped mid-sentence at 390px and grew the card
    // to roughly a third of the screen — burying the chart it is describing.
    // Terse also suits the job: this is a nudge that something is possible, not
    // documentation. The hints box carries the full version everywhere it fits.
    const lines = coarseInput
        ? [
            ['Drag', 'to pan'],
            ['Pinch', 'to zoom'],
            ['Tap', 'for details'],
            ['Hold', 'to peek'],
        ]
        : [
            ['Drag', 'to pan'],
            ['Ctrl+scroll', 'to zoom'],
            ['Click', 'for details'],
            ['Ctrl+F', 'to search'],
        ];

    return (
        <div className="gesture-coach" ref={rootRef} role="status">
            <ul className="coach-list">
                {lines.map(([verb, rest]) => (
                    <li key={verb}><strong>{verb}</strong> {rest}</li>
                ))}
            </ul>
            <button
                type="button"
                className="coach-dismiss"
                onClick={() => setShow(false)}
            >
                Got it
            </button>
        </div>
    );
}
