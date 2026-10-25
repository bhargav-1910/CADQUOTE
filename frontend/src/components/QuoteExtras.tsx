import { useEffect, useRef, useState } from 'react';
import { BookmarkPlus, ChevronDown, LayoutTemplate, Minus, Plus, StickyNote, Trash2 } from 'lucide-react';
import type { QuoteLineItem, QuoteTemplate } from '@/types';
import { deleteQuoteTemplate, listQuoteTemplates, saveQuoteTemplate } from '@/services/api';
import { useToast } from '@/components/Toast';
import { Button, Dialog, Field, Input, Select } from '@/components/ui';

const formatINR = (value: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(value);

/** Net effect of manual lines: charges add, discounts subtract, notes don't count. */
export const lineItemsAdjustment = (items: QuoteLineItem[]) =>
  items.reduce((sum, item) => {
    const amount = Number(item.amount) || 0;
    if (item.kind === 'charge') return sum + amount;
    if (item.kind === 'discount') return sum - amount;
    return sum;
  }, 0);

/** Total the customer pays: engine price plus manual lines, never below zero. */
export const adjustedTotal = (engineTotal: number, items: QuoteLineItem[]) => Math.max(engineTotal + lineItemsAdjustment(items), 0);

/** Lines the server will accept: labelled, and charges/discounts with an amount. */
export const cleanLineItems = (items: QuoteLineItem[]): QuoteLineItem[] =>
  items
    .filter((item) => item.label.trim() && (item.kind === 'note' || Number(item.amount) > 0))
    .map((item) => ({ kind: item.kind, label: item.label.trim(), amount: item.kind === 'note' ? null : Number(item.amount) }));

/**
 * Extra charges (fixtures, packing, freight, expedite), discounts, and text
 * notes on top of the computed price. Shown on the PDF and the customer page.
 */
export const LineItemsEditor = ({
  items,
  onChange,
  engineTotal,
}: {
  items: QuoteLineItem[];
  onChange: (items: QuoteLineItem[]) => void;
  engineTotal: number | null;
}) => {
  const update = (index: number, patch: Partial<QuoteLineItem>) =>
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const add = (kind: QuoteLineItem['kind']) => onChange([...items, { kind, label: '', amount: kind === 'note' ? null : '' }]);
  const adjustment = lineItemsAdjustment(items);

  return (
    <section className="rounded-xl border border-edge bg-surface p-5 shadow-sm">
      <h2 className="text-base font-semibold text-ink">Extra charges & discounts</h2>
      <p className="mt-0.5 text-sm text-ink-muted">Fixtures, packing, freight, expedite fees, discounts, or a note line. They appear on the PDF and the customer's page.</p>

      {items.length > 0 && (
        <ul className="mt-4 space-y-2">
          {items.map((item, index) => (
            <li key={index} className="flex flex-wrap items-center gap-2 rounded-lg border border-edge p-2">
              <Select
                aria-label="Line type"
                value={item.kind}
                onChange={(e) => update(index, { kind: e.target.value as QuoteLineItem['kind'], amount: e.target.value === 'note' ? null : item.amount ?? '' })}
                className="!w-32 shrink-0"
              >
                <option value="charge">Charge</option>
                <option value="discount">Discount</option>
                <option value="note">Note</option>
              </Select>
              <Input
                aria-label="Description"
                value={item.label}
                maxLength={200}
                onChange={(e) => update(index, { label: e.target.value })}
                placeholder={item.kind === 'note' ? 'e.g. Deburr all edges' : item.kind === 'discount' ? 'e.g. Repeat-order discount' : 'e.g. Fixture / packing / freight'}
                className="order-last basis-full"
              />
              {item.kind !== 'note' && (
                <div className="relative min-w-0 flex-1">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-ink-muted">₹</span>
                  <Input
                    aria-label="Amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.amount ?? ''}
                    onChange={(e) => update(index, { amount: e.target.value })}
                    className="pl-7 text-right"
                  />
                </div>
              )}
              <Button variant="ghost" size="icon" className="ml-auto" aria-label="Remove line" onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => add('charge')}>Charge</Button>
        <Button variant="secondary" size="sm" icon={<Minus className="h-3.5 w-3.5" />} onClick={() => add('discount')}>Discount</Button>
        <Button variant="secondary" size="sm" icon={<StickyNote className="h-3.5 w-3.5" />} onClick={() => add('note')}>Note</Button>
      </div>

      {engineTotal !== null && adjustment !== 0 && (
        <dl className="mt-4 space-y-1 border-t border-edge pt-3 text-sm">
          <div className="flex justify-between text-ink-secondary"><dt>Computed price</dt><dd className="font-mono">{formatINR(engineTotal)}</dd></div>
          <div className="flex justify-between text-ink-secondary"><dt>Extras</dt><dd className="font-mono">{adjustment > 0 ? '+' : '−'}{formatINR(Math.abs(adjustment))}</dd></div>
          <div className="flex justify-between font-semibold text-ink"><dt>Quote total</dt><dd className="font-mono">{formatINR(adjustedTotal(engineTotal, items))}</dd></div>
        </dl>
      )}
    </section>
  );
};

/**
 * Start a quote from saved defaults, or save the current setup for next time.
 * `buildPayload` snapshots the builder; `onApply` restores one.
 */
export const TemplateMenu = ({
  buildPayload,
  onApply,
}: {
  buildPayload: () => Record<string, unknown>;
  onApply: (payload: Record<string, unknown>) => void;
}) => {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<QuoteTemplate[] | null>(null);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState('');
  const [overwriteId, setOverwriteId] = useState('');
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const load = () => listQuoteTemplates().then(setTemplates).catch(() => setTemplates([]));

  useEffect(() => {
    if (!open) return;
    if (templates === null) load();
    const onPointer = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, templates]);

  const save = async () => {
    const existing = templates?.find((t) => t.id === overwriteId);
    const finalName = existing ? existing.name : name.trim();
    if (!finalName) return;
    setSaving(true);
    try {
      await saveQuoteTemplate(finalName, buildPayload(), existing?.id);
      toast({ message: existing ? `Template "${finalName}" updated` : `Saved template "${finalName}"` });
      setSaveOpen(false);
      setName('');
      setOverwriteId('');
      load();
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not save the template' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (template: QuoteTemplate) => {
    try {
      await deleteQuoteTemplate(template.id);
      setTemplates((prev) => prev?.filter((t) => t.id !== template.id) ?? prev);
      toast({ message: `Deleted template "${template.name}"` });
    } catch (err) {
      toast({ tone: 'error', message: err instanceof Error ? err.message : 'Could not delete the template' });
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button variant="secondary" icon={<LayoutTemplate className="h-4 w-4" />} onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        Templates
        <ChevronDown className="h-4 w-4" />
      </Button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-edge bg-surface p-2 shadow-2xl">
          <p className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-ink-muted">Start from a template</p>
          {templates === null ? (
            <p className="px-3 py-2 text-sm text-ink-muted">Loading…</p>
          ) : templates.length === 0 ? (
            <p className="px-3 py-2 text-sm text-ink-muted">No templates yet. Set up a quote the way you like it, then save it here.</p>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {templates.map((template) => (
                <li key={template.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onApply(template.payload);
                      setOpen(false);
                      toast({ message: `Applied "${template.name}"` });
                    }}
                    className="min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-secondary hover:bg-surface-raised hover:text-ink"
                  >
                    {template.name}
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete template ${template.name}`}
                    onClick={() => remove(template)}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="my-1 border-t border-edge" />
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setSaveOpen(true);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-primary-700 hover:bg-primary-50 dark:text-primary-300 dark:hover:bg-primary-500/10"
          >
            <BookmarkPlus className="h-4 w-4" />
            Save current setup as template
          </button>
        </div>
      )}

      <Dialog open={saveOpen} onClose={() => setSaveOpen(false)} labelledBy="save-template-title" className="max-w-md">
        <div className="space-y-4 p-6">
          <div>
            <h2 id="save-template-title" className="text-lg font-semibold text-ink">Save as template</h2>
            <p className="mt-1 text-sm text-ink-muted">Saves material, finish, inspection, quantity, tolerance, pricing overrides, commercial terms, notes and extra lines. The CAD file and customer are not saved.</p>
          </div>
          {templates && templates.length > 0 && (
            <Field label="Save as">
              {(props) => (
                <Select {...props} value={overwriteId} onChange={(e) => setOverwriteId(e.target.value)}>
                  <option value="">A new template</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>Replace "{t.name}"</option>
                  ))}
                </Select>
              )}
            </Field>
          )}
          {!overwriteId && (
            <Field label="Template name" required>
              {(props) => <Input {...props} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Anodised aluminium brackets" maxLength={120} autoFocus />}
            </Field>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button onClick={save} loading={saving} disabled={!overwriteId && !name.trim()}>Save template</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
};
