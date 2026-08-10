/**
 * Policy documents.
 *
 * The text is data, not markup — LegalPage renders it through React, so no
 * policy string can ever become HTML. Every company-specific value comes from
 * `LegalInfo`, which is served by GET /api/legal/info, so the published
 * policies always match the running configuration.
 */

export interface LegalInfo {
  app_name: string;
  company_name: string;
  contact_email: string;
  privacy_email: string;
  security_email: string;
  company_address: string;
  jurisdiction: string;
  policy_version: string;
  data_retention_days: number;
}

/** Used until /api/legal/info responds, and if it is unreachable. */
export const DEFAULT_LEGAL_INFO: LegalInfo = {
  app_name: 'ForgeQuote',
  company_name: 'ForgeQuote',
  contact_email: 'support@forgequote.app',
  privacy_email: 'privacy@forgequote.app',
  security_email: 'security@forgequote.app',
  company_address: 'India',
  jurisdiction: 'India',
  policy_version: '2026-07-30',
  data_retention_days: 730,
};

export type LegalSlug =
  | 'privacy'
  | 'terms'
  | 'cookies'
  | 'disclaimer'
  | 'security'
  | 'disclosure';

export interface LegalSection {
  heading: string;
  body?: string[];
  bullets?: string[];
  table?: { columns: string[]; rows: string[][] };
}

export interface LegalDocument {
  slug: LegalSlug;
  title: string;
  summary: string;
  sections: LegalSection[];
}

export const LEGAL_NAV: { slug: LegalSlug; title: string }[] = [
  { slug: 'privacy', title: 'Privacy Policy' },
  { slug: 'terms', title: 'Terms & Conditions' },
  { slug: 'cookies', title: 'Cookie Policy' },
  { slug: 'disclaimer', title: 'Disclaimer' },
  { slug: 'security', title: 'Security Policy' },
  { slug: 'disclosure', title: 'Responsible Disclosure' },
];

const retentionYears = (days: number) => {
  const years = days / 365;
  if (years >= 1) return `${years % 1 === 0 ? years : years.toFixed(1)} year${years === 1 ? '' : 's'}`;
  return `${days} days`;
};

/** Third parties that can receive data, listed in one place so every policy
 *  that mentions them stays consistent. */
const SUB_PROCESSORS = (info: LegalInfo) => [
  `Stripe Payments — payment processing for points top-ups. ${info.company_name} never receives or stores your card number.`,
  'Cloud hosting and object storage — runs the application and stores your CAD files, generated PDFs and database.',
  'Transactional email provider — delivers password reset and security notification emails.',
];

export const buildLegalDocuments = (info: LegalInfo): Record<LegalSlug, LegalDocument> => ({
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: `How ${info.company_name} collects, uses, stores and protects information when you use ${info.app_name}.`,
    sections: [
      {
        heading: '1. Who we are',
        body: [
          `${info.app_name} ("the Service") is operated by ${info.company_name} ("we", "us"), located at ${info.company_address}. We are the data controller for the personal data described in this policy.`,
          `For any privacy question or to exercise a right described below, contact ${info.privacy_email}.`,
        ],
      },
      {
        heading: '2. Information we collect',
        body: ['We collect only what the Service needs to function. Specifically:'],
        table: {
          columns: ['Category', 'Examples', 'Why we collect it'],
          rows: [
            [
              'Account data',
              'Full name, email address, password (stored only as a bcrypt hash), phone number',
              'To create and secure your account and to contact you about it',
            ],
            [
              'Business profile',
              'Company name, company address, GSTIN, company logo, brand colour',
              'To render your branding on quotations you issue',
            ],
            [
              'Uploaded content',
              'CAD files (STEP, STL), derived geometry measurements, thumbnails',
              'To analyse geometry and calculate a machining price',
            ],
            [
              'Quotation data',
              'Quote line items, pricing breakdowns, your customers’ names and contact details that you enter',
              'To generate, store and share quotations on your behalf',
            ],
            [
              'Billing data',
              'Points balance, transaction ledger, Stripe checkout session identifiers',
              'To operate usage billing. Card details are handled by Stripe and never reach our servers',
            ],
            [
              'Technical and security data',
              'IP address, browser user agent, timestamps, authentication events',
              'To keep accounts secure, detect abuse and meet our legal obligations',
            ],
            [
              'Consent records',
              'Your cookie choices, policy version, a salted hash of your IP address',
              'To evidence the consent you gave, as required by law',
            ],
          ],
        },
      },
      {
        heading: '3. Why we process your data (purposes and legal bases)',
        bullets: [
          'Performance of a contract — creating your account, analysing your files, producing quotations, and providing support.',
          'Legitimate interests — securing the Service, preventing fraud and abuse, and improving reliability. We balance these against your rights.',
          'Legal obligation — retaining invoicing and tax-relevant records.',
          'Consent — non-essential cookies and any optional communications. You may withdraw consent at any time.',
        ],
      },
      {
        heading: '4. We do not sell your data',
        body: [
          'We do not sell, rent or trade your personal data or your uploaded CAD files. We do not use your CAD geometry to train machine-learning models for other customers.',
        ],
      },
      {
        heading: '5. Third parties and sub-processors',
        body: ['We share data only with the service providers needed to run the Service:'],
        bullets: SUB_PROCESSORS(info),
      },
      {
        heading: '6. How long we keep data',
        bullets: [
          `Account, quotation and billing records: for as long as your account is active, and up to ${retentionYears(info.data_retention_days)} afterwards where needed for tax, accounting or dispute-resolution purposes.`,
          'Uploaded CAD files and generated PDFs: until you delete them or delete your account.',
          'Security and authentication logs: up to 12 months.',
          'Backups: rolling backups are overwritten within 35 days.',
        ],
      },
      {
        heading: '7. Your rights',
        body: [
          `Depending on where you live, you may have the rights below. Write to ${info.privacy_email} to exercise them; we respond within 30 days and never charge for a first request.`,
        ],
        bullets: [
          'Access — obtain a copy of the personal data we hold about you.',
          'Rectification — correct inaccurate or incomplete data (most fields are editable in Profile Settings).',
          'Erasure — delete your account and associated data (see section 8).',
          'Restriction and objection — ask us to pause or stop certain processing.',
          'Portability — receive your data in a structured, machine-readable format.',
          'Withdraw consent — change your cookie preferences at any time from the footer link.',
          'Complain — lodge a complaint with your local data protection authority.',
        ],
      },
      {
        heading: '8. Deleting your account',
        body: [
          'You can permanently delete your account at any time from Profile Settings → Delete account, or by writing to ' +
            info.privacy_email +
            '. You will be asked to re-enter your password and type DELETE to confirm, because the action cannot be undone.',
          'Deletion immediately and permanently removes your profile, uploaded CAD files, geometry analyses, thumbnails, quotations, generated PDFs, customer records, points wallet and ledger, consent records and any outstanding password reset tokens. Backups containing this data are overwritten within 35 days.',
          'Where the law requires us to retain a minimal invoicing record, we keep only the transaction amount, date and tax identifiers, with no other personal data attached.',
        ],
      },
      {
        heading: '9. How we protect your data',
        bullets: [
          'Passwords are stored only as bcrypt hashes with a work factor of 12; we can never read your password.',
          'All traffic is served over TLS with HSTS in production.',
          'Every file and quotation is scoped to its owning account and ownership is verified on every request.',
          'Authentication events are logged; passwords, tokens and secrets are never written to logs.',
          'Uploads are validated by file signature, stored under randomly generated names, and served only through authenticated endpoints.',
        ],
        body: [`Our full Security Policy is published at /legal/security.`],
      },
      {
        heading: '10. International transfers',
        body: [
          `Our infrastructure and sub-processors may process data outside ${info.jurisdiction}. Where that happens, transfers are covered by appropriate safeguards such as Standard Contractual Clauses.`,
        ],
      },
      {
        heading: '11. Children',
        body: [
          'The Service is a business tool and is not directed at children under 16. We do not knowingly collect data from children. If you believe a child has provided us data, contact ' +
            info.privacy_email +
            ' and we will delete it.',
        ],
      },
      {
        heading: '12. Changes to this policy',
        body: [
          `We will post any change here and update the version date. Material changes are announced in-app before they take effect. Current version: ${info.policy_version}.`,
        ],
      },
    ],
  },

  terms: {
    slug: 'terms',
    title: 'Terms & Conditions',
    summary: `The agreement between you and ${info.company_name} for use of ${info.app_name}.`,
    sections: [
      {
        heading: '1. Agreement',
        body: [
          `These Terms govern your use of ${info.app_name}, operated by ${info.company_name}, ${info.company_address}. By creating an account or using the Service you agree to them. If you do not agree, do not use the Service.`,
        ],
      },
      {
        heading: '2. Your account',
        bullets: [
          'You must provide accurate registration details and keep them current.',
          'You are responsible for everything that happens under your account and for keeping your password confidential.',
          'You must choose a password meeting our published policy and must not reuse a password from another service.',
          `Notify ${info.security_email} immediately if you suspect unauthorised access.`,
          'One account per legal entity unless we agree otherwise in writing.',
        ],
      },
      {
        heading: '3. Acceptable use',
        body: ['You agree not to:'],
        bullets: [
          'Upload content you do not have the right to upload, or that infringes anyone’s intellectual property.',
          'Attempt to access another account, tenant or quotation.',
          'Probe, scan or test the security of the Service except as permitted by our Responsible Disclosure Policy.',
          'Circumvent rate limits, usage metering, subscription gates or the points system.',
          'Upload malware, or files crafted to exploit our parsers or any user’s software.',
          'Scrape, resell or redistribute the Service or its pricing output as a competing product.',
          'Use the Service to violate any applicable export control, sanctions or defence-trade regulation.',
        ],
      },
      {
        heading: '4. Your content',
        body: [
          'You retain all ownership of the CAD files, quotations and customer data you upload or create ("Your Content"). You grant us only the limited licence needed to host, process, analyse and display Your Content in order to provide the Service to you.',
          'You are responsible for having the rights necessary to upload Your Content, including any rights held by your own customers.',
        ],
      },
      {
        heading: '5. Pricing output is an estimate',
        body: [
          'The Service produces rule-based cost estimates from geometry, material and process inputs. Estimates depend entirely on the accuracy of the models and settings supplied, and on cost assumptions that vary by shop, region and time.',
          'You are solely responsible for reviewing, adjusting and approving any quotation before issuing it to a third party. Nothing produced by the Service is an offer, a guarantee of manufacturability, or engineering advice.',
        ],
      },
      {
        heading: '6. Plans, points and payment',
        bullets: [
          'Free plans are limited to the built-in sample part; paid plans unlock uploading your own CAD files.',
          'Certain actions consume points from your wallet. Points are a prepaid usage credit, are not legal tender, and carry no cash value.',
          'Payments are processed by Stripe under their terms. We do not receive or store your card details.',
          'Unless required by law, purchased points are non-refundable once consumed. Contact ' +
            info.contact_email +
            ' about any billing problem and we will deal with it in good faith.',
          'Prices and points costs may change with reasonable notice; changes never apply retroactively to points already purchased.',
        ],
      },
      {
        heading: '7. Availability',
        body: [
          'We work to keep the Service available but do not guarantee uninterrupted or error-free operation. We may suspend access for maintenance, security or legal reasons, and will give notice where practical.',
        ],
      },
      {
        heading: '8. Suspension and termination',
        body: [
          'You may stop using the Service and delete your account at any time. We may suspend or terminate an account that breaches these Terms, creates a security risk, or is used unlawfully — with notice where practical, and immediately where the risk demands it.',
          'On termination, the data-handling rules in our Privacy Policy apply.',
        ],
      },
      {
        heading: '9. Disclaimers and limitation of liability',
        body: [
          'The Service is provided "as is" and "as available", without warranties of any kind to the maximum extent permitted by law.',
          `To the maximum extent permitted by law, ${info.company_name} is not liable for indirect, incidental, special, consequential or punitive damages, nor for lost profits, lost production, scrap, rework or lost business arising from use of the Service. Our total aggregate liability for any claim is limited to the amount you paid us in the twelve months before the event giving rise to the claim.`,
          'Nothing in these Terms excludes liability that cannot lawfully be excluded.',
        ],
      },
      {
        heading: '10. Indemnity',
        body: [
          `You agree to indemnify ${info.company_name} against claims arising from Your Content, your breach of these Terms, or your unlawful use of the Service.`,
        ],
      },
      {
        heading: '11. Changes',
        body: [
          `We may update these Terms. Continued use after a change takes effect means you accept the updated Terms. Current version: ${info.policy_version}.`,
        ],
      },
      {
        heading: '12. Governing law',
        body: [
          `These Terms are governed by the laws of ${info.jurisdiction}, and the courts of ${info.jurisdiction} have exclusive jurisdiction over any dispute.`,
        ],
      },
      {
        heading: '13. Contact',
        body: [`Questions about these Terms: ${info.contact_email}.`],
      },
    ],
  },

  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    summary: `What ${info.app_name} stores in your browser, and how to control it.`,
    sections: [
      {
        heading: '1. What we use',
        body: [
          `${info.app_name} keeps browser storage to a minimum. We use no advertising cookies and no third-party tracking pixels.`,
        ],
        table: {
          columns: ['Name', 'Type', 'Purpose', 'Duration'],
          rows: [
            [
              'forgequote_refresh',
              'Strictly necessary (cookie)',
              'HttpOnly session cookie holding your refresh token. It keeps you signed in and cannot be read by JavaScript.',
              '30 days',
            ],
            [
              'forgequote.auth.token',
              'Strictly necessary (local storage)',
              'Short-lived access token used to authorise API requests.',
              'Until sign-out',
            ],
            [
              'forgequote.consent',
              'Strictly necessary (local storage)',
              'Remembers the cookie choices you made so we do not ask again.',
              '12 months',
            ],
            [
              'forgequote.consent.id',
              'Strictly necessary (local storage)',
              'Random identifier that links your stored consent to our audit record. It contains no personal data.',
              '12 months',
            ],
            [
              'Preference keys',
              'Preferences (local storage)',
              'Remembers interface choices such as dismissed onboarding steps.',
              '12 months',
            ],
          ],
        },
      },
      {
        heading: '2. Categories',
        bullets: [
          'Strictly necessary — required to sign you in, keep your session safe and remember your consent. These cannot be switched off, and we rely on legitimate interest rather than consent for them.',
          'Preferences — remembers interface choices. Optional.',
          'Analytics — aggregate usage measurement. Off by default and not currently in use; if we introduce it, it will only run after you opt in.',
          'Marketing — not used. We run no advertising or cross-site tracking.',
        ],
      },
      {
        heading: '3. Managing your choices',
        body: [
          'Use the "Cookie preferences" link in the footer to review or change your choices at any time. Your decision is stored in your browser and recorded on our side, with a salted hash of your IP address instead of the address itself, so we can evidence the consent you gave.',
          'You can also clear cookies and site data through your browser settings. Clearing strictly necessary storage will sign you out.',
        ],
      },
      {
        heading: '4. Third-party cookies',
        body: [
          'When you pay for points you are redirected to Stripe, which sets its own cookies under its own policy. We set no cookies on your behalf there.',
        ],
      },
      {
        heading: '5. Contact',
        body: [`Questions about cookies: ${info.privacy_email}. Version: ${info.policy_version}.`],
      },
    ],
  },

  disclaimer: {
    slug: 'disclaimer',
    title: 'Disclaimer',
    summary: 'The limits of what automated quoting output can be relied on for.',
    sections: [
      {
        heading: '1. Estimates, not engineering advice',
        body: [
          `${info.app_name} generates rule-based cost estimates from uploaded geometry and the parameters you select. Output is informational. It is not engineering advice, not a manufacturability guarantee, and not a binding offer to buy or sell.`,
        ],
      },
      {
        heading: '2. Accuracy depends on your inputs',
        bullets: [
          'Geometry analysis reflects the model you upload; an incorrect, simplified or corrupt model produces an incorrect estimate.',
          'Costs vary with machine capability, tooling, batch size, region, material market prices and shop overheads.',
          'Design-for-manufacturing warnings are heuristics. Absence of a warning does not mean a part is manufacturable.',
          'Lead-time figures are indicative and are not delivery commitments.',
        ],
      },
      {
        heading: '3. Your responsibility to verify',
        body: [
          'You must independently review every estimate before relying on it commercially — including material selection, tolerances, finish, inspection level and margin. A qualified person in your organisation is responsible for the final quotation you issue.',
        ],
      },
      {
        heading: '4. No professional relationship',
        body: [
          `Using the Service does not create an engineering, consulting or fiduciary relationship with ${info.company_name}.`,
        ],
      },
      {
        heading: '5. External links',
        body: [
          'The Service may link to third-party sites. We do not control and are not responsible for their content, accuracy or practices.',
        ],
      },
      {
        heading: '6. Limitation',
        body: [
          `To the maximum extent permitted by law, ${info.company_name} accepts no liability for loss arising from reliance on Service output, including lost profit, scrap, rework or production delay. See section 9 of our Terms & Conditions.`,
        ],
      },
      { heading: '7. Contact', body: [`Questions: ${info.contact_email}.`] },
    ],
  },

  security: {
    slug: 'security',
    title: 'Security Policy',
    summary: `How ${info.company_name} protects ${info.app_name}, your account and your files.`,
    sections: [
      {
        heading: '1. Our commitment',
        body: [
          'Security is built into how the Service is designed, not added afterwards. Our controls are aligned with the OWASP Application Security Verification Standard, the OWASP Top 10 (2021) and NIST secure-coding guidance.',
        ],
      },
      {
        heading: '2. Account and authentication security',
        bullets: [
          'Passwords must be at least 12 characters with upper case, lower case, a digit and a symbol; common, sequential and identity-derived passwords are rejected.',
          'Passwords are stored only as bcrypt hashes at work factor 12. Plaintext passwords are never stored, logged or recoverable.',
          'Reusing any of your last five passwords is blocked.',
          'Repeated failed sign-ins trigger throttling and a temporary account lock.',
          'Password reset links are single-use, expire in 15 minutes, and are stored only as a hash.',
          'Changing or resetting your password signs out every other session and emails you a notification.',
        ],
      },
      {
        heading: '3. Session security',
        bullets: [
          'Refresh tokens are held in HttpOnly, Secure, SameSite=Strict cookies that JavaScript cannot read.',
          'A new session identifier is generated at every sign-in, so a pre-authentication token can never be reused.',
          'Refresh tokens rotate on every use; a replayed token immediately invalidates the whole session.',
          'Sessions expire on inactivity and are capped by an absolute lifetime, after which you must sign in again.',
          'Signing out invalidates the session server-side, not just in your browser.',
        ],
      },
      {
        heading: '4. Data security',
        bullets: [
          'All traffic is encrypted in transit with TLS; HSTS is enforced in production.',
          'Data is stored on encrypted volumes managed by our hosting provider.',
          'Every quotation, file and customer record is scoped to its owning account, and ownership is verified on every single request.',
          'Global pricing and vendor configuration can only be changed by administrators.',
          'Payment card details never touch our servers; Stripe handles them directly.',
        ],
      },
      {
        heading: '5. Application security',
        bullets: [
          'All database access uses parameterised ORM queries; no SQL is ever assembled from user input.',
          'Uploads are restricted to STEP and STL, validated by file signature rather than extension, size-capped, and stored under randomly generated names outside any public web root.',
          'Executable and scriptable formats, including SVG, are rejected for logo uploads.',
          'Responses carry a strict Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy and the Cross-Origin isolation headers.',
          'Rate limiting is applied at both the edge and the application layer.',
          'Error responses never expose stack traces, file paths or internal identifiers.',
        ],
      },
      {
        heading: '6. Monitoring and response',
        bullets: [
          'Authentication, authorisation, password reset, administrative and account-deletion events are logged to a dedicated security log.',
          'Passwords, tokens and secrets are never written to logs, and email addresses are masked.',
          'We aim to acknowledge a suspected incident within one business day and to notify affected users and regulators within 72 hours where the law requires it.',
        ],
      },
      {
        heading: '7. Your part',
        bullets: [
          'Use a unique, strong password and a password manager.',
          'Do not share your account credentials.',
          'Sign out on shared devices.',
          `Report anything suspicious to ${info.security_email}.`,
        ],
      },
      {
        heading: '8. Contact',
        body: [
          `Security contact: ${info.security_email}. Machine-readable contact details are published at /.well-known/security.txt. Version: ${info.policy_version}.`,
        ],
      },
    ],
  },

  disclosure: {
    slug: 'disclosure',
    title: 'Responsible Disclosure Policy',
    summary: 'How to report a vulnerability safely, and what we promise in return.',
    sections: [
      {
        heading: '1. Scope',
        body: [
          `This policy covers ${info.app_name}, its API, and infrastructure operated by ${info.company_name}. Third-party services such as Stripe are covered by their own programmes.`,
        ],
      },
      {
        heading: '2. How to report',
        body: [
          `Email ${info.security_email} with a clear description, the steps to reproduce, the impact you believe it has, and any proof-of-concept. Please encrypt sensitive details if you can, and give us a way to reach you.`,
          'We acknowledge reports within 3 business days, give an assessment within 10 business days, and keep you updated until the issue is resolved.',
        ],
      },
      {
        heading: '3. Safe harbour',
        body: [
          'If you follow this policy in good faith, we will not pursue or support legal action against you for your research, and we will work with you if a third party does.',
        ],
      },
      {
        heading: '4. Rules of engagement',
        bullets: [
          'Test only against accounts you own or have explicit permission to use.',
          'Do not access, modify or delete data belonging to anyone else — stop as soon as you have confirmed a vulnerability.',
          'No denial-of-service, volumetric or load testing, and no spam or social engineering of our staff or users.',
          'No physical attacks against our offices or providers.',
          'Give us a reasonable time to fix an issue before disclosing it publicly. We aim for 90 days and will tell you if we need longer.',
        ],
      },
      {
        heading: '5. Out of scope',
        bullets: [
          'Missing security headers with no demonstrated exploit.',
          'Reports produced solely by an automated scanner with no verified impact.',
          'Self-XSS, or issues that require a fully compromised device or browser.',
          'Rate-limit findings on unauthenticated, non-sensitive endpoints.',
          'Email configuration findings (SPF, DKIM, DMARC) without a working spoofing proof.',
          'Social engineering, phishing and physical security.',
        ],
      },
      {
        heading: '6. Recognition',
        body: [
          'We do not currently run a paid bug bounty. We are glad to credit researchers publicly for valid reports, with your permission.',
        ],
      },
      {
        heading: '7. Contact',
        body: [
          `${info.security_email} — see also /.well-known/security.txt. Version: ${info.policy_version}.`,
        ],
      },
    ],
  },
});
