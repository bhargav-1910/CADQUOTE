/** "What's new" entries, newest first. Bump `id` for each release; the unread dot compares against it. */
export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  items: string[];
  help?: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    id: '2026-10-25',
    date: '25 Oct 2026',
    title: 'Versions, templates and drawings',
    help: '/help/versions-and-names',
    items: [
      'Editing a quote now creates a new version (v2, v3…). The customer’s link always shows the latest one, and you can see what changed.',
      'Give any quote a name, like “Acme bracket – batch 2”. It shows in lists, search, the PDF and the customer’s page.',
      'Simpler navigation: Settings now groups Account, Cost Master and Billing, and on phones a More tab holds settings, help and log out.',
      'Add extra charges, discounts and notes on top of the computed price.',
      'Save your usual setup as a template and reuse it.',
      'Attach 2D drawings to a quote, and choose which ones the customer can download.',
      'See when the customer opened your quote, and extend an expiring quote with one tap.',
      'New: “How is this calculated?” next to every price, and a Help center.',
    ],
  },
  {
    id: '2026-10-20',
    date: '20 Oct 2026',
    title: 'A cleaner, faster app on every screen',
    items: [
      'Refreshed light and dark themes.',
      'Phone and iPad layouts, with a simpler bottom bar.',
      'Cost Master rates are now private to your workspace.',
    ],
  },
];

export const LATEST_CHANGELOG_ID = CHANGELOG[0].id;
