import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Calculator } from 'lucide-react';
import { GLOSSARY } from '@/content/glossary';
import { Button, Dialog, buttonClasses } from '@/components/ui';

const inr = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

export interface PriceExplainerNumbers {
  material: number;
  machining: number;
  finish: number;
  inspection: number;
  subtotal: number;
  marginFactor: number;
  unitPrice: number;
  quantity: number;
  engineTotal: number;
  extras: number;
  total: number;
  leadTimeDays: number;
}

/**
 * "How is this price calculated?" — walks through this quote's own numbers,
 * step by step, in plain language. Transparency is the product's pitch, so
 * the explanation lives next to the price, not only in docs.
 */
export const PriceExplainer = ({ numbers, triggerClassName = '' }: { numbers: PriceExplainerNumbers; triggerClassName?: string }) => {
  const [open, setOpen] = useState(false);
  const n = numbers;
  const setupShare = Math.max(n.subtotal - n.material - n.machining - n.finish - n.inspection, 0);
  const steps: Array<{ title: string; text: string; amount: string }> = [
    { title: 'Raw material', text: GLOSSARY.material, amount: inr(n.material) },
    { title: 'Machining', text: GLOSSARY.machining, amount: inr(n.machining) },
    ...(setupShare > 0.5 ? [{ title: 'Setup, programming & tooling (share per part)', text: GLOSSARY.setup, amount: inr(setupShare) }] : []),
    { title: 'Surface finish', text: GLOSSARY.finish, amount: inr(n.finish) },
    { title: 'Inspection', text: GLOSSARY.inspection, amount: inr(n.inspection) },
    { title: 'Cost per part', text: GLOSSARY.subtotal, amount: inr(n.subtotal) },
    { title: `Margin (${Math.round((n.marginFactor - 1) * 100)}%)`, text: GLOSSARY.margin, amount: `→ ${inr(n.unitPrice)} per part` },
    { title: `× ${n.quantity} part${n.quantity === 1 ? '' : 's'}`, text: GLOSSARY.quantityBreaks, amount: inr(n.engineTotal) },
    ...(Math.abs(n.extras) > 0.005
      ? [{ title: 'Extra charges & discounts', text: GLOSSARY.extras, amount: `${n.extras > 0 ? '+' : '−'}${inr(Math.abs(n.extras))}` }]
      : []),
  ];

  return (
    <>
      <Button variant="ghost" size="sm" icon={<Calculator className="h-3.5 w-3.5" />} onClick={() => setOpen(true)} className={triggerClassName}>
        How is this calculated?
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} labelledBy="price-explainer-title" className="max-w-lg">
        <div className="p-6">
          <h2 id="price-explainer-title" className="text-lg font-semibold text-ink">How this price is calculated</h2>
          <p className="mt-1 text-sm text-ink-muted">Every number comes from the CAD geometry and your Cost Master rates. Nothing is a guess you can't trace.</p>
          <ol className="mt-5 space-y-3">
            {steps.map((step, index) => (
              <li key={step.title} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary-500/10 text-xs font-semibold text-primary-700 dark:text-primary-300">{index + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="font-medium text-ink">{step.title}</p>
                    <p className="font-mono text-sm font-semibold text-ink">{step.amount}</p>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-secondary">{step.text}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-5 flex items-center justify-between rounded-xl bg-primary-500/10 px-4 py-3">
            <span className="font-semibold text-ink">Quote total</span>
            <span className="font-mono text-lg font-bold text-ink">{inr(n.total)}</span>
          </div>
          <p className="mt-3 text-xs text-ink-muted">Lead time: {n.leadTimeDays.toFixed(1)} days. {GLOSSARY.leadTime}</p>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <Link to="/help/understanding-your-price" className={buttonClasses('secondary', 'md')} onClick={() => setOpen(false)}>
              Read the full guide
            </Link>
            <Button onClick={() => setOpen(false)}>Done</Button>
          </div>
        </div>
      </Dialog>
    </>
  );
};
