import { useState, useEffect, useRef } from 'react';
import LegalModal from './LegalModal';
import { GITHUB_PROFILE, GITHUB_REPO } from '../legalContent';

// A single always-visible footer line (D17).
//
// It has to survive every breakpoint: the privacy notice must stay reachable,
// and .timeline-info — the other candidate host — is display:none on phones.
// So this sits outside that block and stays visible, kept to one small line
// because chart height is the scarce resource in this layout.
//
// The GitHub credit is attribution, not an Impressum: no Impressum ships here
// (see DESIGN.md D17), but pointing at the author is worth doing anyway.
export default function SiteFooter() {
    const [legalOpen, setLegalOpen] = useState(false);
    const triggerRef = useRef(null);
    const wasOpen = useRef(false);

    // Return focus to the button that opened the dialog once it closes, so a
    // keyboard user resumes where they left off instead of at <body>. Owned
    // here because only the owner reliably knows the trigger — see LegalModal.
    useEffect(() => {
        if (wasOpen.current && !legalOpen) triggerRef.current?.focus();
        wasOpen.current = legalOpen;
    }, [legalOpen]);

    return (
        <footer className="site-footer">
            <span>
                Built by{' '}
                <a href={GITHUB_PROFILE} target="_blank" rel="noopener noreferrer">
                    Yannic Bachmann
                </a>
            </span>
            <span className="footer-sep" aria-hidden="true">·</span>
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                Source on GitHub
            </a>
            <span className="footer-sep" aria-hidden="true">·</span>
            <button
                ref={triggerRef}
                className="footer-link"
                onClick={() => setLegalOpen(true)}
            >
                Privacy &amp; credits
            </button>

            {legalOpen && <LegalModal onClose={() => setLegalOpen(false)} />}
        </footer>
    );
}
