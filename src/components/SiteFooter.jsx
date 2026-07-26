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
            {/* The two attribution labels shorten on phones so the line stays a
                LINE (PM-Q4) — at 390px it had been wrapping to two, costing
                ~27px of chart height against the "one small line" this footer
                was designed as. The alternative, squeezing the gap, would have
                pulled the links closer together than D13 wants tap targets to
                be; words are the cheaper thing to spend.

                "Privacy & credits" is deliberately NOT shortened: it is the
                legally load-bearing label (D17), and "credits" is what points
                at the source attribution that settles the CC-BY-SA/LICENSE
                tension. The variants are display:none rather than conditional
                render, so screen readers announce exactly one of them. */}
            <span>
                <span className="wide-only">Built by </span>
                <a href={GITHUB_PROFILE} target="_blank" rel="noopener noreferrer">
                    Yannic Bachmann
                </a>
            </span>
            <span className="footer-sep" aria-hidden="true">·</span>
            <a href={GITHUB_REPO} target="_blank" rel="noopener noreferrer">
                <span className="wide-only">Source on </span>GitHub
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
