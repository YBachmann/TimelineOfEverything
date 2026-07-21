import { useEffect, useRef } from 'react';

// The one dialog shell every modal surface in the app uses (Q10).
//
// It started as LegalModal's private implementation (D17) — that dialog shipped
// the keyboard contract the older Timeline modals lacked — and is extracted here
// rather than copied, so "our modals are accessible" is a property of one file
// instead of a habit three files have to keep.
//
// The contract:
//   - role="dialog" + aria-modal, labelled by a heading the caller owns
//   - Escape closes; the keypress is stopped so it can't also reach handlers
//     behind the dialog
//   - focus moves onto the panel on mount, and Tab cycles within the panel
//     instead of walking into the (still-rendered) chart behind it
//   - a click on the backdrop closes; clicks inside never bubble out to it
//
// What it deliberately does NOT do: send focus back out on close. Restoring
// from whatever document.activeElement was at mount silently fails when the
// trigger was never focused — a programmatic .click(), Safari (which does not
// focus buttons on click), or a pointer landing on an SVG mark that isn't
// focusable at all — and focus then falls back to <body>, stranding keyboard
// users at the top of the document. Only the OWNER knows what to return to, so
// SiteFooter and Timeline each restore their own (see their restore refs).
//
// Class names come from the caller: Timeline's double-tap handler keys off the
// literal class `event-modal-overlay` to decide a tap hit a backdrop (D11), so
// the legal dialog must keep using its own `legal-*` classes to stay uncoupled
// from timeline zoom.

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), '
    + 'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function Modal({ overlayClass, panelClass, labelledBy, onClose, children }) {
    const panelRef = useRef(null);

    useEffect(() => {
        panelRef.current?.focus();
    }, []);

    const onKeyDown = (e) => {
        if (e.key === 'Escape') {
            e.stopPropagation();
            onClose();
            return;
        }
        if (e.key !== 'Tab') return;
        // Focus trap. The panel itself is focusable (tabIndex -1) so an empty
        // list can't strand focus, but guard anyway.
        const focusable = panelRef.current?.querySelectorAll(FOCUSABLE);
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        // Focus starts on the panel (outside the list) — send Tab into it.
        if (!panelRef.current.contains(document.activeElement)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    };

    return (
        <div className={overlayClass} onClick={onClose}>
            <div
                className={panelClass}
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                onClick={e => e.stopPropagation()}
                onKeyDown={onKeyDown}
            >
                {children}
            </div>
        </div>
    );
}
