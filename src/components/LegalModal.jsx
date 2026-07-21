import { useState } from 'react';
import Modal from './Modal';
import { LEGAL } from '../legalContent';

// The footer's "Privacy & credits" dialog (D17).
//
// The keyboard contract this dialog introduced (Escape, focus-in, Tab trap,
// role="dialog") now lives in the shared Modal shell, which the timeline's
// modals adopted in the Q10 accessibility pass. Focus RESTORE on close stays
// with the owner — SiteFooter holds the trigger ref.
//
// Its class names stay distinct from .event-modal-overlay on purpose:
// Timeline's double-tap handler keys off that exact class name to decide
// whether a tap landed on a modal backdrop, so sharing it would let a
// double-tap on this dialog drive the timeline's zoom.

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

    const t = LEGAL[lang];

    return (
        <Modal
            overlayClass="legal-overlay"
            panelClass="legal-panel"
            labelledBy="legal-title"
            onClose={onClose}
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
        </Modal>
    );
}
