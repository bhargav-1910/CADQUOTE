import { Box, Building2, Sparkles } from 'lucide-react';

/** Plan catalogue shown in Billing (signed in) and on the public Pricing page. */
export interface Plan {
  key: 'free' | 'pro' | 'enterprise';
  name: string;
  price: string;
  priceSuffix?: string;
  blurb: string;
  features: string[];
  cta: string;
  popular?: boolean;
  icon: typeof Box;
}

export const PLANS: Plan[] = [
  {
    key: 'free',
    name: 'Starter',
    price: '₹0',
    blurb: 'Try the full quoting flow on the built-in sample part.',
    features: [
      'Sample part quoting, end to end',
      'Geometry analysis & DFM checks',
      'PDF preview and download',
      'Share link with customer response',
    ],
    cta: 'Included on signup',
    icon: Box,
  },
  {
    key: 'pro',
    name: 'Professional',
    price: '₹1,999',
    priceSuffix: '/month',
    blurb: 'For job shops quoting real customer work every day.',
    features: [
      'Unlimited CAD uploads (STEP & STL)',
      'Exact B-rep hole & setup detection',
      'Customer records with win-rate stats',
      'Branded PDF quotes with your logo',
      'Share links, responses & manual marking',
      'Quote versions, templates & 2D drawings',
      'Priority support',
    ],
    cta: 'Get Professional',
    popular: true,
    icon: Sparkles,
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: 'Custom',
    blurb: 'For manufacturers needing tailored workflows and volume.',
    features: [
      'Everything in Professional',
      'Multiple team members',
      'Vendor routing & custom machine rates',
      'Onboarding & dedicated support',
    ],
    cta: 'Contact sales',
    icon: Building2,
  },
];
