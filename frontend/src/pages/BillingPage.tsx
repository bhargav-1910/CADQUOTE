import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Mail, Sparkles } from 'lucide-react';
import { buttonClasses } from '@/components/ui';
import { PLANS, type Plan } from '@/content/plans';
import { useAuth } from '@/components/AuthProvider';

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
    <div className="max-w-6xl mx-auto space-y-8">
      <div className="text-center pt-4">
        <h1 className="text-3xl sm:text-4xl font-bold text-ink">
          Choose your <span className="text-primary-600 dark:text-primary-400">plan</span>
        </h1>
        <p className="mt-2 text-ink-muted">Quote faster, win more work. Upgrade when you're ready.</p>

        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-edge bg-surface px-4 py-1.5 text-sm">
          <span className="text-ink-muted">Current plan:</span>
          <span className={`font-semibold ${isPro ? 'text-primary-700 dark:text-primary-300' : 'text-ink'}`}>
            {isPro ? 'Professional' : 'Starter (free)'}
          </span>
          {isPro && (
            <span className="text-xs text-ink-subtle">
              {user?.plan_expires_at ? `· renews ${formatDate(user.plan_expires_at)}` : '· active'}
            </span>
          )}
        </div>
      </div>

      {!isPro && (
        <section className="mx-auto max-w-3xl rounded-2xl border border-edge bg-surface p-5 sm:p-6">
          <h2 className="font-semibold text-ink">You're on Starter (free)</h2>
          <ul className="mt-3 space-y-2 text-sm text-ink-secondary">
            <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />Try the whole flow on the built-in sample part: price it, generate the PDF, share it and record the customer's response.</li>
            <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />Set up your own rates in Cost Master now; they carry over when you upgrade.</li>
            <li className="flex gap-2"><Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" />Upgrade to Professional to quote your own STEP and STL files.</li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/dashboard" className={buttonClasses('secondary', 'sm')}>Try the sample part</Link>
            <Link to="/help/plans-and-billing" className={buttonClasses('ghost', 'sm')}>How upgrading works</Link>
          </div>
        </section>
      )}

      <div className="grid gap-5 md:grid-cols-3 items-stretch">
        {PLANS.map((plan) => {
          const isCurrent = plan.key === currentPlanKey;
          const Icon = plan.icon;
          return (
            <div
              key={plan.key}
              className={`relative flex flex-col rounded-2xl border bg-surface p-6 ${
                plan.popular
                  ? 'border-primary-300 dark:border-primary-500/30 shadow-lg shadow-primary-100 ring-1 ring-primary-200'
                  : 'border-edge shadow-sm'
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 right-5 rounded-full bg-primary-600 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white">
                  Popular
                </span>
              )}

              <div className="flex items-center gap-2.5">
                <span
                  className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                    plan.popular ? 'bg-primary-600 text-white' : 'bg-ink text-surface'
                  }`}
                >
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
              </div>

              <p className="mt-3 text-sm text-ink-muted min-h-[40px]">{plan.blurb}</p>

              <p className="mt-4">
                <span className="text-4xl font-bold text-ink">{plan.price}</span>
                {plan.priceSuffix && <span className="text-sm text-ink-muted">{plan.priceSuffix}</span>}
              </p>

              <button
                type="button"
                onClick={() => onSelectPlan(plan)}
                disabled={isCurrent}
                className={`mt-5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors ${
                  isCurrent
                    ? 'border border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 cursor-default'
                    : plan.popular
                    ? 'bg-primary-600 text-white hover:bg-primary-700'
                    : 'border border-edge-strong text-ink-secondary hover:bg-surface-muted'
                }`}
              >
                {isCurrent ? 'Your current plan' : plan.cta}
              </button>

              <ul className="mt-6 space-y-2.5">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                    <Check className={`w-4 h-4 mt-0.5 shrink-0 ${plan.popular ? 'text-primary-600 dark:text-primary-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>

      {requested && (
        <div className="mx-auto max-w-2xl rounded-2xl border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-500/10 p-5 text-center">
          <p className="flex items-center justify-center gap-2 text-sm font-semibold text-primary-900 dark:text-primary-300">
            <Mail className="w-4 h-4" />
            Online payments are launching soon.
          </p>
          <p className="mt-1 text-sm text-primary-800 dark:text-primary-300">
            To activate {requested === 'enterprise' ? 'an Enterprise plan' : 'Professional'} today, email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold underline">
              {CONTACT_EMAIL}
            </a>{' '}
            and we'll enable it on your account.
          </p>
        </div>
      )}

      <p className="text-center text-xs text-ink-subtle">
        Prices exclude GST. Cancel anytime — your quotes and customer records stay accessible.
      </p>
    </div>
  );
};

export default BillingPage;
