import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { PLANS } from '@/content/plans';
import { useAuth } from '@/components/AuthProvider';
import LegalFooter from '@/components/LegalFooter';
import { buttonClasses } from '@/components/ui';

const FAQ = [
  {
    q: 'Can I try it before paying?',
    a: 'Yes. Every account starts on Starter, which runs the full flow (pricing, PDF, customer link) on a built-in sample part.',
  },
  {
    q: 'What do I get with Professional?',
    a: 'Quote your own STEP and STL files with exact geometry analysis, your own rates, branded PDFs, customer links, versions, templates and attached drawings.',
  },
  {
    q: 'How are my prices calculated?',
    a: 'From the CAD geometry and your own material, machine and finish rates. Every quote shows each line, and you can see the calculation step by step.',
    link: { to: '/help/understanding-your-price', label: 'How pricing works' },
  },
  {
    q: 'Do prices include GST?',
    a: 'Plan prices exclude GST. Your quotes can show CGST/SGST or IGST based on your and your customer’s GSTIN.',
  },
];

/** Public plans page, so visitors can see prices before signing up. */
const PricingPage = () => {
  const { user } = useAuth();
  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-canvas">
      <header className="border-b border-edge bg-surface-muted">
        <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link to="/" className="text-[17px] font-bold tracking-tight text-ink">ForgeQuote</Link>
          <nav className="flex items-center gap-2">
            <Link to="/help" className={buttonClasses('ghost', 'sm')}>Help</Link>
            {user ? (
              <Link to="/dashboard" className={buttonClasses('secondary', 'sm')}>Open app</Link>
            ) : (
              <>
                <Link to="/login" className={buttonClasses('ghost', 'sm')}>Sign in</Link>
                <Link to="/signup" className={buttonClasses('accent', 'sm')}>Get started</Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1180px] px-4 py-12 sm:px-8 lg:py-16">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-ink sm:text-5xl">Simple pricing for job shops</h1>
          <p className="mx-auto mt-3 max-w-xl text-ink-muted">Start free with the sample part. Upgrade when you're ready to quote your own CAD files.</p>
        </div>

        <div className="mt-10 grid items-stretch gap-5 md:grid-cols-3">
          {PLANS.map((plan) => {
            const Icon = plan.icon;
            const cta = plan.key === 'enterprise'
              ? { to: '/help/plans-and-billing', label: 'Talk to us', variant: 'secondary' as const }
              : { to: user ? '/settings/billing' : '/signup', label: plan.key === 'free' ? 'Start free' : 'Get Professional', variant: plan.popular ? ('accent' as const) : ('secondary' as const) };
            return (
              <section
                key={plan.key}
                className={`relative flex flex-col rounded-2xl border bg-surface p-6 ${plan.popular ? 'border-primary-300 ring-1 ring-primary-200 dark:border-primary-500/40 dark:ring-primary-500/30' : 'border-edge'}`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 right-5 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white">Most popular</span>
                )}
                <div className="flex items-center gap-2.5">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${plan.popular ? 'bg-primary-600 text-white' : 'bg-ink text-surface'}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <h2 className="text-lg font-bold text-ink">{plan.name}</h2>
                </div>
                <p className="mt-3 min-h-[40px] text-sm text-ink-muted">{plan.blurb}</p>
                <p className="mt-4">
                  <span className="text-4xl font-bold text-ink">{plan.price}</span>
                  {plan.priceSuffix && <span className="text-sm text-ink-muted">{plan.priceSuffix}</span>}
                </p>
                <Link to={cta.to} className={buttonClasses(cta.variant, 'md', 'mt-5 w-full')}>{cta.label}</Link>
                <ul className="mt-6 space-y-2.5">
                  {plan.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5 text-sm text-ink-secondary">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
        <p className="mt-4 text-center text-xs text-ink-muted">Prices exclude GST.</p>

        <section className="mx-auto mt-16 max-w-3xl">
          <h2 className="text-2xl font-bold text-ink">Questions</h2>
          <dl className="mt-6 divide-y divide-edge rounded-2xl border border-edge bg-surface">
            {FAQ.map((item) => (
              <div key={item.q} className="p-5">
                <dt className="font-semibold text-ink">{item.q}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
                  {item.a}{' '}
                  {item.link && <Link to={item.link.to} className="font-medium text-primary-700 hover:underline dark:text-primary-300">{item.link.label}</Link>}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
};

export default PricingPage;
