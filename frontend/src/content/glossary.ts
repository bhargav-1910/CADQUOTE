/**
 * Plain-language definitions shown in info tooltips next to pricing terms.
 * Keep them short (one or two sentences) and true to backend/app/services/pricing.py;
 * the long form lives in the help center (content/help.ts).
 */
export const GLOSSARY = {
  material:
    'Cost of the stock you buy, not just the finished part: the billet or bar sized around the part, at your ₹/kg rate. Optional scrap credit subtracts the resale value of the offcut.',
  machining:
    'Cycle time × machine hourly rate. Cycle time comes from the volume of metal removed, finishing passes over every surface, features like holes and pockets, and tool changes.',
  setup:
    'Fixturing, programming (CAM) and tooling for the job. These are paid once per batch, so they are spread across the quantity. That is why unit price drops as quantity rises.',
  finish:
    'Surface finish charge (anodise, oxide, powder coat, plating…): per part, per kg, per area and any lot charge, from your finish rates.',
  inspection:
    'Quality check for the chosen level (visual, dimensional, CMM). Most levels check every part; First Article Inspection checks one and spreads the cost over the batch.',
  subtotal: 'Cost to make one part before margin: material + machining + setup share + finish + inspection.',
  margin:
    'Your markup on cost, including vendor margin, overheads and platform commission where configured. Change the defaults in Cost Master or per quote.',
  unitPrice: 'Price for one part after margin, with setup costs spread over the quantity.',
  leadTime:
    'Working days to deliver: material procurement, machining hours, finishing, inspection and tolerance buffer. Edit it per quote if your shop floor is busier.',
  tolerance:
    'Tighter tolerance tiers multiply machining time and inspection cost, and add lead-time days. General (±0.1 mm) is the baseline.',
  extras: 'Charges, discounts and notes you add by hand (fixtures, packing, freight, expedite). They are added after the computed price.',
  quantityBreaks: 'Unit price at other quantities. Setup and tooling are shared across the batch, so larger runs cost less per part.',
} as const;

export type GlossaryTerm = keyof typeof GLOSSARY;
