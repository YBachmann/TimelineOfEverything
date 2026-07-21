// Copy for the footer's "Privacy & credits" modal, in German and English
// (D17: a German controller owes a Datenschutzerklärung; the site itself is
// English, so both ship and the modal toggles between them).
//
// Content is data, not JSX, for three reasons: the two languages stay
// structurally identical (easy to spot a missing section), the renderer needs
// no dangerouslySetInnerHTML, and a plain module keeps Fast Refresh happy
// (component files must only export components — same reason format.js exists).
//
// Shape: sections[] of { h, blocks[] }, where a block is
//   { p: Para }            a paragraph
//   { ul: Para[] }         a bullet list
// and Para is an array of strings and { text, href } links, concatenated in
// order. Keeping links as data is what lets one renderer serve both languages.

const a = (text, href) => ({ text, href });

const GITHUB_PRIVACY = 'https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement';
const DPF = 'https://www.dataprivacyframework.gov/';
const REPO = 'https://github.com/YBachmann/TimelineOfEverything';
const PROFILE = 'https://github.com/YBachmann';
const CONTACT = 'yannic.bachmann@proton.me';

export const CONTACT_EMAIL = CONTACT;
export const GITHUB_PROFILE = PROFILE;
export const GITHUB_REPO = REPO;

export const LEGAL = {
    de: {
        nativeName: 'Deutsch',
        title: 'Datenschutz & Credits',
        switchTo: 'English',
        close: 'Schließen',
        sections: [
            {
                h: 'Verantwortlicher',
                blocks: [
                    { p: ['Verantwortlich für die Datenverarbeitung auf dieser Website ist:'] },
                    { p: ['Yannic Bachmann, E-Mail: ', a(CONTACT, `mailto:${CONTACT}`)] },
                ],
            },
            {
                h: 'Hosting (GitHub Pages)',
                blocks: [
                    {
                        p: ['Diese Website wird von GitHub Pages gehostet, einem Dienst der ' +
                            'GitHub, Inc., 88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, ' +
                            'USA — einem Unternehmen von Microsoft.'],
                    },
                    {
                        p: ['Beim Aufruf der Seite verarbeitet GitHub automatisch technische ' +
                            'Zugriffsdaten (Server-Logs), insbesondere die IP-Adresse, Datum und ' +
                            'Uhrzeit des Zugriffs, die aufgerufene Datei, den Referrer sowie ' +
                            'Angaben zu Browser und Betriebssystem. Diese Verarbeitung ist ' +
                            'technisch erforderlich, um die Website auszuliefern und ihren ' +
                            'sicheren Betrieb zu gewährleisten.'],
                    },
                    {
                        p: ['Rechtsgrundlage ist Art. 6 Abs. 1 lit. f DSGVO — das berechtigte ' +
                            'Interesse am zuverlässigen und sicheren Betrieb der Website.'],
                    },
                    {
                        p: ['Die Verarbeitung findet auch in den USA statt. GitHub, Inc. gehört ' +
                            'zur Microsoft Corporation, die unter dem ',
                        a('EU-U.S. Data Privacy Framework', DPF),
                        ' zertifiziert ist; die Übermittlung stützt sich auf den ' +
                            'entsprechenden Angemessenheitsbeschluss der Europäischen ' +
                            'Kommission. Einzelheiten zur Datenverarbeitung durch GitHub: ',
                        a('GitHub Privacy Statement', GITHUB_PRIVACY), '.'],
                    },
                    {
                        p: ['Ich selbst habe keinen Zugriff auf diese Logdaten und werte sie ' +
                            'nicht aus.'],
                    },
                ],
            },
            {
                h: 'Was diese Website nicht tut',
                blocks: [
                    { p: ['Diese Website ist eine rein statische Anwendung. Sie'] },
                    {
                        ul: [
                            ['setzt keine Cookies,'],
                            ['verwendet kein Tracking und keine Analyse-Werkzeuge,'],
                            ['bindet keine externen Schriftarten, Karten, Videos oder ' +
                                'CDN-Ressourcen ein,'],
                            ['speichert nichts in localStorage oder sessionStorage,'],
                            ['enthält keine Formulare, Kommentarfunktionen oder Nutzerkonten,'],
                            ['sendet während der Benutzung keinerlei Anfragen an Server.'],
                        ],
                    },
                    {
                        p: ['Der gesamte Datenbestand ist in die ausgelieferte JavaScript-Datei ' +
                            'eingebettet. Nach dem Laden der Seite findet keine weitere ' +
                            'Kommunikation statt — Suchen, Zoomen und Filtern geschehen ' +
                            'ausschließlich lokal in Ihrem Browser.'],
                    },
                    {
                        p: ['Ein Cookie-Banner ist deshalb nicht erforderlich: es gibt nichts, ' +
                            'worin eingewilligt werden könnte.'],
                    },
                ],
            },
            {
                h: 'Externe Links',
                blocks: [
                    {
                        p: ['Diese Seite verlinkt auf externe Websites (etwa GitHub und Quellen ' +
                            'zum Datenbestand). Für deren Inhalte und Datenverarbeitung sind ' +
                            'ausschließlich die jeweiligen Anbieter verantwortlich. Mit dem ' +
                            'Anklicken eines solchen Links verlassen Sie diese Website; es gilt ' +
                            'dann die Datenschutzerklärung des Ziels.'],
                    },
                ],
            },
            {
                h: 'Ihre Rechte',
                blocks: [
                    {
                        p: ['Sie haben jederzeit das Recht auf Auskunft (Art. 15), Berichtigung ' +
                            '(Art. 16), Löschung (Art. 17), Einschränkung der Verarbeitung ' +
                            '(Art. 18), Datenübertragbarkeit (Art. 20) sowie das Recht, der ' +
                            'Verarbeitung zu widersprechen (Art. 21 DSGVO). Wenden Sie sich ' +
                            'dazu an die oben genannte E-Mail-Adresse.'],
                    },
                    {
                        p: ['Unabhängig davon steht Ihnen ein Beschwerderecht bei einer ' +
                            'Datenschutz-Aufsichtsbehörde zu (Art. 77 DSGVO); zuständig ist ' +
                            'die Behörde Ihres gewöhnlichen Aufenthaltsorts.'],
                    },
                ],
            },
            {
                h: 'Credits & Quellen',
                blocks: [
                    {
                        p: ['Der Datenbestand wurde von Hand kuratiert. Die Ereignisangaben ' +
                            'stützen sich im Wesentlichen auf ',
                        a('Wikipedia', 'https://en.wikipedia.org/'),
                        ' (CC BY-SA 4.0), die ',
                        a('geologische Zeitskala', 'https://en.wikipedia.org/wiki/Geologic_time_scale'),
                        ', ',
                        a('NASA WMAP', 'https://wmap.gsfc.nasa.gov/'),
                        ' (Alter des Universums) sowie die ',
                        a('Nobelpreis-Datenbank', 'https://www.nobelprize.org/'),
                        '.'],
                    },
                    {
                        p: ['Gebaut mit React, D3 und Vite. Quellcode: ',
                            a('github.com/YBachmann/TimelineOfEverything', REPO), '.'],
                    },
                ],
            },
            {
                h: 'Stand',
                blocks: [{ p: ['Juli 2026. Diese Erklärung wird angepasst, wenn sich die ' +
                    'Website ändert.'] }],
            },
        ],
    },

    en: {
        nativeName: 'English',
        title: 'Privacy & credits',
        switchTo: 'Deutsch',
        close: 'Close',
        sections: [
            {
                h: 'Controller',
                blocks: [
                    { p: ['The party responsible for data processing on this website is:'] },
                    { p: ['Yannic Bachmann, email: ', a(CONTACT, `mailto:${CONTACT}`)] },
                ],
            },
            {
                h: 'Hosting (GitHub Pages)',
                blocks: [
                    {
                        p: ['This site is hosted on GitHub Pages, a service of GitHub, Inc., ' +
                            '88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, USA — a ' +
                            'Microsoft company.'],
                    },
                    {
                        p: ['When you open the page, GitHub automatically processes technical ' +
                            'access data (server logs): your IP address, the date and time of ' +
                            'the request, the file requested, the referrer, and browser and ' +
                            'operating-system details. This processing is technically necessary ' +
                            'to deliver the site and keep it running securely.'],
                    },
                    {
                        p: ['The legal basis is Art. 6(1)(f) GDPR — the legitimate interest in ' +
                            'operating the website reliably and securely.'],
                    },
                    {
                        p: ['Processing also takes place in the USA. GitHub, Inc. belongs to ' +
                            'Microsoft Corporation, which is certified under the ',
                        a('EU-U.S. Data Privacy Framework', DPF),
                        '; transfers rely on the European Commission’s corresponding ' +
                            'adequacy decision. For details on GitHub’s processing, see the ',
                        a('GitHub Privacy Statement', GITHUB_PRIVACY), '.'],
                    },
                    { p: ['I have no access to these logs and do not analyse them.'] },
                ],
            },
            {
                h: 'What this site does not do',
                blocks: [
                    { p: ['This is a purely static application. It'] },
                    {
                        ul: [
                            ['sets no cookies,'],
                            ['uses no tracking and no analytics,'],
                            ['embeds no external fonts, maps, videos or CDN resources,'],
                            ['stores nothing in localStorage or sessionStorage,'],
                            ['has no forms, comments or user accounts,'],
                            ['sends no requests to any server while you use it.'],
                        ],
                    },
                    {
                        p: ['The entire dataset is bundled into the JavaScript that is served ' +
                            'to you. Once the page has loaded, no further communication takes ' +
                            'place — searching, zooming and filtering all happen locally in ' +
                            'your browser.'],
                    },
                    {
                        p: ['A cookie banner is therefore unnecessary: there is nothing to ' +
                            'consent to.'],
                    },
                ],
            },
            {
                h: 'External links',
                blocks: [
                    {
                        p: ['This page links to external sites (GitHub, and sources for the ' +
                            'dataset). Their operators alone are responsible for their content ' +
                            'and data processing. Following such a link takes you off this ' +
                            'site, and the destination’s privacy policy applies from then on.'],
                    },
                ],
            },
            {
                h: 'Your rights',
                blocks: [
                    {
                        p: ['You have the right of access (Art. 15), rectification (Art. 16), ' +
                            'erasure (Art. 17), restriction of processing (Art. 18), data ' +
                            'portability (Art. 20), and the right to object to processing ' +
                            '(Art. 21 GDPR) at any time. To exercise them, use the email ' +
                            'address given above.'],
                    },
                    {
                        p: ['You also have the right to lodge a complaint with a data ' +
                            'protection supervisory authority (Art. 77 GDPR); the competent ' +
                            'authority is the one where you habitually reside.'],
                    },
                ],
            },
            {
                h: 'Credits & sources',
                blocks: [
                    {
                        p: ['The dataset is hand-curated. Event information draws mainly on ',
                            a('Wikipedia', 'https://en.wikipedia.org/'),
                            ' (CC BY-SA 4.0), the ',
                            a('geologic time scale', 'https://en.wikipedia.org/wiki/Geologic_time_scale'),
                            ', ',
                            a('NASA WMAP', 'https://wmap.gsfc.nasa.gov/'),
                            ' (age of the universe), and the ',
                            a('Nobel Prize database', 'https://www.nobelprize.org/'),
                            '.'],
                    },
                    {
                        p: ['Built with React, D3 and Vite. Source code: ',
                            a('github.com/YBachmann/TimelineOfEverything', REPO), '.'],
                    },
                ],
            },
            {
                h: 'Last updated',
                blocks: [{ p: ['July 2026. This notice is revised whenever the site changes.'] }],
            },
        ],
    },
};
