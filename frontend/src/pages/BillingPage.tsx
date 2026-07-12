import { useState } from 'react';
import { Check, Mail, Sparkles, Building2, Box } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

interface Plan {
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

const PLANS: Plan[] = [
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

const CONTACT_EMAIL = 'bhargav191007@gmail.com';

const BillingPage = () => {
  const { user } = useAuth();
  const [requested, setRequested] = useState<string | null>(null);

  const isPro = user?.plan === 'pro';
  const currentPlanKey = isPro ? 'pro' : 'free';

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' });

  const onSelectPlan = (plan: Plan) => {
    if (plan.key === currentPlanKey) return;
    setRequested(plan.key);
  };

  return (
    <div className="p-6 lg:p-8 max-w-6xl mx-auto space-y-8">
      <div className="text-center pt-4">
        <h1 className="font-display text-3xl sm:text-4xl font-bold text-slate-900">
          Choose your <span className="text-sky-600">plan</span>
        </h1>
        <p className="mt-2 text-slate-500">Quote faster, win more work. Upgrade when you're ready.</p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm">
          <span className="text-slate-500">Current plan:</span>
          <span className={`font-semibold ${isPro ? 'text-sky-700' : 'text-slate-800'}`}>
            {isPro ? 'Professional' : 'Starter (free)'}
          </span>
          {isPro && (
            <span className="text-xs text-slate-400">
              {user?.plan_expires_at ? `· renews ${formatDate(user.plan_expires_at)}` : '· active'}
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-3 items-stretch">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentPlanKey;
          const Icon = plan.icon;
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl border bg-white p-6 ${
                plan.popular
                  ? 'border-sky-300 shadow-lg shadow-sky-100 ring-1 ring-sky-200'
                  : 'border-slate-200 shadow-sm'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 right-5 rounded-full bg-sky-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Popular
                </span>
              )}

              <div className="flex items-center gap-2.5">
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    plan.popular ? 'bg-sky-600 text-white' : 'bg-slate-900 text-white'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <h2 className="text-lg font-bold text-slate-900">{plan.name}</h2>
              </div>

              <p className="mt-3 text-sm text-slate-500 min-h-[40px]">{plan.blurb}</p>

              <p className="mt-4">
                <span className="font-display text-4xl font-bold text-slate-900">{plan.price}</span>
                {plan.priceSuffix && <span className="text-sm text-slate-500">{plan.priceSuffix}</span>}
              </p>

              <button
                type="button"
                onClick={() => onSelectPlan(plan)}
                disabled={isCurrent}
                className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isCurrent
                    ? 'border border-emerald-300 bg-emerald-50 text-emerald-700 cursor-default'
                    : plan.popular
                    ? 'bg-sky-600 text-white hover:bg-sky-700'
                    : 'border border-slate-300 text-slate-700 hover:bg-slate-50'
                }`}
              >
                {isCurrent ? 'Your current plan' : plan.cta}
              </button>

              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-600">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${plan.popular ? 'text-sky-600' : 'text-emerald-600'}`} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {requested && (
        <div className="mx-auto max-w-2xl rounded-2xl border border-sky-200 bg-sky-50 p-5 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-sky-900">
            <Mail className="w-4 h-4" />
            Online payments are launching soon.
          </p>
          <p className="mt-1 text-sm text-sky-800">
            To activate {requested === 'enterprise' ? 'an Enterprise plan' : 'Professional'} today, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">
              {CONTACT_EMAIL}
            </a>{' '}
            and we'll enable it on your account.
          </p>
        </div>
      )}

      <p className="text-center text-xs text-slate-400">
        Prices exclude GST. Cancel anytime — your quotes and customer records stay accessible.
      </p>
    </div>
  );
};

export default BillingPage;
