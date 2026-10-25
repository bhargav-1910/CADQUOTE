/**
 * Help center articles. Plain data so the page stays a renderer; keep the
 * wording consistent with GLOSSARY and with how the app actually behaves.
 */
export type HelpBlock =
  | { type: 'p'; text: string }
  | { type: 'h'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'tip'; text: string };

export interface HelpArticle {
  slug: string;
  title: string;
  summary: string;
  category: 'Getting started' | 'Quoting' | 'Pricing' | 'Customers' | 'Account';
  body: HelpBlock[];
}

export const HELP_CATEGORIES: HelpArticle['category'][] = ['Getting started', 'Quoting', 'Pricing', 'Customers', 'Account'];

export const HELP_ARTICLES: HelpArticle[] = [
  {
    slug: 'getting-started',
    title: 'Quote your first part in two minutes',
    summary: 'From CAD file to a branded, itemized quote your customer can accept online.',
    category: 'Getting started',
    body: [
      { type: 'steps', items: [
        'Open New Quote and drop a STEP or STL file. On the free plan, use "Try a sample part" instead.',
        'Pick material, surface finish, inspection level and quantity. The price updates as you go.',
        'Add the customer and any commercial terms (payment, delivery, GST), plus extra charges if you need them.',
        'Click Generate Quote. You get a quote number and a PDF.',
        'Click Share with customer and send them the link. They can view it, download the PDF, and accept or decline.',
      ] },
      { type: 'tip', text: 'Set your own machine, material and finish rates in Cost Master first, so every quote starts from your real costs.' },
    ],
  },
  {
    slug: 'uploading-cad',
    title: 'Uploading CAD files',
    summary: 'Supported formats, size limits, and why STEP gives the most accurate price.',
    category: 'Quoting',
    body: [
      { type: 'list', items: [
        'Formats: STEP (.step, .stp) and STL (.stl), up to 100 MB each.',
        'STEP is best: the exact geometry lets us count holes, threads and machining directions. STL is a mesh, so some features are estimated.',
        'Upload several files at once to price them together or as one combined quote.',
        'Analysis usually takes a few seconds. If a file fails, re-export it from your CAD tool (STEP AP214 or AP242) and try again.',
      ] },
      { type: 'p', text: 'Files are private to your workspace and are scanned on upload.' },
    ],
  },
  {
    slug: 'configuring-a-quote',
    title: 'Configuring a quote',
    summary: 'Material, finish, inspection, tolerance, quantity and per-quote overrides.',
    category: 'Quoting',
    body: [
      { type: 'list', items: [
        'Material and finish come from your Cost Master rates.',
        'Inspection level sets how parts are checked: visual, dimensional, CMM, or First Article.',
        'Tolerance tier: tighter tiers add machining time, inspection cost and lead-time days.',
        'Quantity: setup and programming are shared across the batch, so unit price drops as quantity rises. See the quantity breaks table.',
        'Quote-specific pricing lets you override rates for this quote only, without touching Cost Master.',
      ] },
      { type: 'tip', text: 'Save a setup you use often as a template (Templates → Save current setup) and start the next quote from it.' },
    ],
  },
  {
    slug: 'understanding-your-price',
    title: 'Understanding your price',
    summary: 'How the engine turns geometry and your rates into an itemized price.',
    category: 'Pricing',
    body: [
      { type: 'p', text: 'Every price is built bottom-up from the CAD geometry and your rates, so you can defend each line to a customer.' },
      { type: 'h', text: '1. Raw material' },
      { type: 'p', text: 'We size the stock you would actually buy (round bar for turned parts, a billet for milled ones), weigh it, and multiply by your ₹/kg rate. A scrap credit can subtract the offcut’s resale value.' },
      { type: 'h', text: '2. Machining' },
      { type: 'p', text: 'Cycle time comes from metal removed, finishing passes over every surface, features (holes, threads, pockets) and tool changes. Tolerance and design-for-manufacturing (DFM) findings can add time. Cycle time × machine hourly rate = machining cost.' },
      { type: 'h', text: '3. Setup, programming and tooling' },
      { type: 'p', text: 'Setups come from how many directions the part must be machined from. Setup time, CAM programming and tooling are one-time costs per batch, spread across the quantity.' },
      { type: 'h', text: '4. Finish and inspection' },
      { type: 'p', text: 'Finish uses your per-part, per-kg and per-area rates. Inspection depends on the level: most check every part, while First Article checks one and spreads the cost.' },
      { type: 'h', text: '5. Margin, quantity and extras' },
      { type: 'p', text: 'Margin is applied to the cost per part to give the unit price, then multiplied by quantity. Extra charges and discounts you add by hand come last.' },
      { type: 'tip', text: 'On any quote, click "How is this calculated?" next to the price to see these steps with that quote’s own numbers.' },
    ],
  },
  {
    slug: 'cost-master',
    title: 'Cost Master: your own rates',
    summary: 'Change machine, material, finish and inspection rates for your workspace only.',
    category: 'Pricing',
    body: [
      { type: 'list', items: [
        'Find it under Settings → Cost Master.',
        'Every workspace starts from shared default rates.',
        'Change a rate and it becomes yours. Only your quotes use it; nobody else’s pricing moves.',
        'Changes apply to quotes you create afterwards. Existing quotes keep their saved prices.',
        'The reset arrow next to a changed rate brings back the default.',
      ] },
    ],
  },
  {
    slug: 'extra-charges-and-discounts',
    title: 'Extra charges, discounts and notes',
    summary: 'Add fixtures, packing, freight, expedite fees or a discount on top of the computed price.',
    category: 'Quoting',
    body: [
      { type: 'p', text: 'In the quote builder, under commercial terms, use Extra charges & discounts:' },
      { type: 'list', items: [
        'Charge: added to the total (e.g. fixture, packing, freight, expedite).',
        'Discount: subtracted from the total. A quote never goes below ₹0.',
        'Note: a text-only line, such as “Deburr all edges”, with no amount.',
      ] },
      { type: 'p', text: 'These lines appear on the PDF and on the customer’s quote page, below the part lines.' },
    ],
  },
  {
    slug: 'versions-and-names',
    title: 'Versions and quote names',
    summary: 'Revise a quote without losing history, and give it a name you’ll recognise.',
    category: 'Quoting',
    body: [
      { type: 'h', text: 'Edit creates a new version' },
      { type: 'p', text: 'Click Edit (new version) on a quote and save. The result is v2 of the same quote (number ends in -v2). Older versions stay as read-only history.' },
      { type: 'list', items: [
        'The customer’s link always shows the latest version. You don’t need to re-send it.',
        'Open Versions on the quote to see every version, which ones the customer opened, and What changed since the previous one.',
        'Deleting a quote removes all of its versions.',
      ] },
      { type: 'h', text: 'Naming a quote' },
      { type: 'p', text: 'Click Add a name (or Rename) next to the quote number, e.g. “Acme bracket – batch 2”. The name shows in your lists, search, the PDF and the customer’s page, and every version shares it. The quote number stays as the reference your customer quotes back to you.' },
    ],
  },
  {
    slug: 'templates',
    title: 'Quote templates',
    summary: 'Save your usual material, finish, terms and extra lines, and reuse them.',
    category: 'Quoting',
    body: [
      { type: 'steps', items: [
        'Set up a quote the way you usually do: material, finish, inspection, tolerance, payment terms, extra lines.',
        'Click Templates → Save current setup as template and give it a name, like “Anodised aluminium brackets”.',
        'Next time, after uploading the CAD file, pick the template from the Templates menu.',
      ] },
      { type: 'p', text: 'Templates never store the CAD file or the customer. You can replace or delete a template from the same menu.' },
    ],
  },
  {
    slug: 'drawings',
    title: 'Attaching 2D drawings',
    summary: 'Keep the customer’s PDF drawing with the quote, and share it if you want.',
    category: 'Quoting',
    body: [
      { type: 'list', items: [
        'On a quote, use Drawings → Attach drawing. PDF, PNG, JPG or WebP, up to 20 MB each.',
        'Drawings are private by default. Click the eye icon to show one to the customer; it then appears as a download on their quote page.',
        'Drawings belong to the quote, so every version keeps them.',
      ] },
    ],
  },
  {
    slug: 'sharing-with-customers',
    title: 'Sharing quotes with customers',
    summary: 'One link to view, download and accept or decline, and knowing when they’ve looked.',
    category: 'Customers',
    body: [
      { type: 'list', items: [
        'Share with customer creates a private link. Anyone with it can view the quote, download the PDF, and accept or decline.',
        'The quote shows “Customer last opened it …” once they’ve viewed it.',
        'Accepted and declined responses appear on the quote, in the notification bell, and on your dashboard.',
        'If they replied by email or phone instead, record it with Mark as accepted / Declined.',
      ] },
    ],
  },
  {
    slug: 'expiry-and-reminders',
    title: 'Quote validity and reminders',
    summary: 'When quotes expire, how you get reminded, and extending them in one tap.',
    category: 'Customers',
    body: [
      { type: 'list', items: [
        'Each quote has a valid-until date. After it, the customer can no longer accept it.',
        'The bell turns amber when a quote expires within 3 days, and the dashboard lists quotes expiring this week.',
        'Use +7 days on the dashboard, or +7 / +14 / +30 days on the quote, to extend it. An expired quote becomes open again.',
        'If rates have changed, use Edit instead to re-price it as a new version.',
      ] },
    ],
  },
  {
    slug: 'customers',
    title: 'Your customer list',
    summary: 'Customers are created automatically from your quotes.',
    category: 'Customers',
    body: [
      { type: 'p', text: 'When you add a customer’s name, company or email to a quote, they’re added to Customers. Each customer shows their quote history, total quoted value and win rate.' },
    ],
  },
  {
    slug: 'plans-and-billing',
    title: 'Plans and billing',
    summary: 'What the free plan includes and how to upgrade.',
    category: 'Account',
    body: [
      { type: 'list', items: [
        'Starter (free): try the full quoting flow with the built-in sample part.',
        'Professional: quote your own CAD files, with every feature included.',
        'Enterprise: for larger shops with custom workflows and volume. Contact us.',
      ] },
      { type: 'p', text: 'See current prices on the Pricing page. To upgrade, open Settings → Billing in the app.' },
    ],
  },
  {
    slug: 'account-security',
    title: 'Account security and your data',
    summary: 'Two-factor login, passwords, and deleting your account.',
    category: 'Account',
    body: [
      { type: 'list', items: [
        'Turn on two-factor authentication in Settings → Account → Sign-in & security.',
        'Changing your password signs out every device.',
        'Delete your account from Settings → Account. It permanently removes your quotes, files, PDFs and customers.',
      ] },
    ],
  },
];

export const helpArticle = (slug: string | undefined) => HELP_ARTICLES.find((a) => a.slug === slug);
