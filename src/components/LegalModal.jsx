import { useState, useEffect, useRef } from 'react';
import { LEGAL } from '../legalContent';

// The footer's "Privacy & credits" dialog (D17).
//
// Deliberately NOT reusing .event-modal-overlay: Timeline's double-tap handler
// keys off that exact class name to decide whether a tap landed on a modal
// backdrop, so sharing it would let a double-tap on this dialog drive the
// timeline's zoom. Separate class names keep the two surfaces uncoupled.
//
// This dialog also implements the keyboard contract the older Timeline modals
// still lack (Q10): Escape closes, focus moves in on open and returns to the
// trigger on close, and Tab cycles within the panel instead of escaping to the
// chart behind it.

// One paragraph: an array of plain strings and { text, href } links.
function Para({ parts }) {
    return parts.map((part, i) => typeof part === 'string'
        ? part
        // Untrusted-target hygiene: noopener stops the opened tab reaching
        // back via window.opener, noreferrer withholds the referrer.
        : <a key={i} href={part.href} target="_blank" rel="noopener noreferrer">{part.text}</a>);
}

function Block({ block }) {
    if (block.ul) {
        return (
            <ul className="legal-list">
                {block.ul.map((item, i) => <li key={i}><Para parts={item} /></li>)}
            </ul>
        );
    }
    return <p><Para parts={block.p} /></p>;
}

export default function LegalModal({ onClose }) {
    // German visitors get the German text first; everyone else gets English,
    // matching the site's own language.
    const [lang, setLang] = useState(
        () => navigator.language?.toLowerCase().startsWith('de') ? 'de' : 'en');
    const panelRef = useRef(null);

    // Move focus in on open. Sending it back out on close is the OWNER's job
    // (SiteFooter) rather than this component's: restoring from whatever
    // document.activeElement happened to be at mount time silently fails when
    // the trigger was never focused — a programmatic .click(), or Safari,
    // which does not focus buttons on click — and focus then falls back to
    // <body>, stranding keyboard users at the top of the document.
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
        // list can't happen, but guard anyway.
        const focusable = panelRef.current?.querySelectorAll(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const onFirst = document.activeElement === first;
        const onLast = document.activeElement === last;
        // Focus starts on the panel (outside the list) — send Tab into it.
        if (!panelRef.current.contains(document.activeElement)) {
            e.preventDefault();
            (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && onFirst) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && onLast) {
            e.preventDefault();
            first.focus();
        }
    };

    const t = LEGAL[lang];

    return (
        <div className="legal-overlay" onClick={onClose}>
            <div
                className="legal-panel"
                ref={panelRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="legal-title"
                onClick={e => e.stopPropagation()}
                onKeyDown={onKeyDown}
            >
                <div className="legal-header">
                    <h2 id="legal-title">{t.title}</h2>
                    <div className="legal-actions">
                        <button
                            className="legal-lang"
                            onClick={() => setLang(l => (l === 'de' ? 'en' : 'de'))}
                            lang={lang === 'de' ? 'en' : 'de'}
                        >
                            {t.switchTo}
                        </button>
                        <button className="legal-close" onClick={onClose} aria-label={t.close}>
                            ×
                        </button>
                    </div>
                </div>

                {/* lang on the body so screen readers switch pronunciation with
                    the toggle, and the heading stays in the chosen language. */}
                <div className="legal-body" lang={lang}>
                    {t.sections.map(section => (
                        <section key={section.h}>
                            <h3>{section.h}</h3>
                            {section.blocks.map((block, i) => <Block key={i} block={block} />)}
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
}
