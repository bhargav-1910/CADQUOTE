import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Check, Download, Eye, EyeOff, FileImage, FileText, GitCompare, History, Paperclip, Pencil, Trash2, Upload, X } from 'lucide-react';
import type { Quote, QuoteAttachment, QuoteLineItem, QuoteVersion } from '@/types';
import {
  deleteQuoteAttachment,
  downloadQuoteAttachment,
  extendQuoteValidity,
  getQuote,
  getQuoteVersions,
  listQuoteAttachments,
  renameQuote,
  setQuoteAttachmentShared,
  uploadQuoteAttachment,
} from '@/services/api';
import { useToast } from '@/components/Toast';
import { Badge, Button, Input, StatusPill } from '@/components/ui';

const formatCurrency = (value: number | string) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value));
const formatDate = (value: string | null) =>
  value ? new Date(value).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const errorText = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

// ---------------------------------------------------------------------------
// Quote name: inline rename. The number stays as the reference underneath.
// ---------------------------------------------------------------------------

export const QuoteName = ({ quote, onRenamed }: { quote: Quote; onRenamed: (quote: Quote) => void }) => {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setValue(quote.title ?? '');
    setEditing(true);
  };
  const save = async () => {
    if (value.trim() === (quote.title ?? '')) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      onRenamed(await renameQuote(quote.id, value));
      setEditing(false);
    } catch (err) {
      toast({ tone: 'error', message: errorText(err, 'Could not rename the quote') });
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <form
        className="flex max-w-xl flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <Input
          autoFocus
          value={value}
          maxLength={200}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
          placeholder="e.g. Acme bracket – batch 2"
          aria-label="Quote name"
          className="min-w-0 flex-1 text-lg font-semibold"
        />
        <Button type="submit" size="icon" loading={saving} aria-label="Save name"><Check className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => setEditing(false)} aria-label="Cancel"><X className="h-4 w-4" /></Button>
        <p className="basis-full text-xs text-ink-muted">Shown on the PDF and the customer page. Leave blank to use the quote number only.</p>
      </form>
    );
  }

  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="min-w-0 break-words text-2xl font-bold text-ink">{quote.title || quote.quote_number}</h1>
        <StatusPill status={quote.status} />
        <Button variant="ghost" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={start}>
          {quote.title ? 'Rename' : 'Add a name'}
        </Button>
      </div>
      {quote.title && <p className="mt-0.5 font-mono text-sm text-ink-secondary">{quote.quote_number}</p>}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Version history + "what changed"
// ---------------------------------------------------------------------------

const summariseLines = (items: QuoteLineItem[] | null) =>
  (items ?? []).map((i) => (i.kind === 'note' ? `Note: ${i.label}` : `${i.kind === 'discount' ? '−' : '+'}${formatCurrency(i.amount ?? 0)} ${i.label}`)).join('; ') || '—';

/** Field-by-field differences between two versions, only what changed. */
const diffQuotes = (before: Quote, after: Quote): Array<{ label: string; before: string; after: string }> => {
  const fields: Array<[string, (q: Quote) => string]> = [
    ['Quantity', (q) => `${q.quantity}`],
    ['Material', (q) => q.material.name],
    ['Surface finish', (q) => q.surface_finish.name],
    ['Inspection', (q) => q.inspection_level.name],
    ['Unit price', (q) => formatCurrency(q.unit_price)],
    ['Total', (q) => formatCurrency(q.total_price)],
    ['Lead time', (q) => `${Number(q.estimated_lead_time_days).toFixed(1)} days`],
    ['Extra lines', (q) => summariseLines(q.line_items)],
    ['Tolerance', (q) => q.tolerance_notes || '—'],
    ['Payment terms', (q) => q.payment_terms || '—'],
    ['Delivery', (q) => q.delivery || '—'],
    ['Notes', (q) => q.notes || '—'],
  ];
  return fields
    .map(([label, read]) => ({ label, before: read(before), after: read(after) }))
    .filter((row) => row.before !== row.after);
};

export const VersionHistory = ({ quote }: { quote: Quote }) => {
  const [versions, setVersions] = useState<QuoteVersion[] | null>(null);
  const [comparing, setComparing] = useState(false);
  const [diff, setDiff] = useState<ReturnType<typeof diffQuotes> | null>(null);

  useEffect(() => {
    getQuoteVersions(quote.id).then(setVersions).catch(() => setVersions([]));
  }, [quote.id]);

  if (!versions || versions.length < 2) return null;
  const index = versions.findIndex((v) => v.id === quote.id);
  const previous = index > 0 ? versions[index - 1] : null;

  const compare = async () => {
    if (!previous) return;
    setComparing(true);
    try {
      setDiff(diffQuotes(await getQuote(previous.id), quote));
    } finally {
      setComparing(false);
    }
  };

  return (
    <section className="space-y-3 rounded-xl border border-edge bg-surface p-6">
      <h2 className="flex items-center gap-2 text-sm font-semibold text-ink">
        <History className="h-4 w-4 text-ink-subtle" />
        Versions
      </h2>
      <ol className="space-y-1">
        {[...versions].reverse().map((v) => (
          <li key={v.id}>
            <Link
              to={`/quotes/${v.id}`}
              aria-current={v.id === quote.id ? 'page' : undefined}
              className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition ${
                v.id === quote.id ? 'bg-primary-500/10 font-semibold text-primary-700 dark:text-primary-300' : 'text-ink-secondary hover:bg-surface-raised'
              }`}
            >
              <span>
                v{v.version}
                {!v.superseded_at && <span className="ml-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">latest</span>}
                <span className="block text-xs font-normal text-ink-muted">{formatDate(v.created_at)}</span>
              </span>
              <span className="text-right">
                <span className="block font-mono">{formatCurrency(v.total_price)}</span>
                {v.customer_viewed_at && <span className="block text-xs font-normal text-ink-muted">viewed by customer</span>}
              </span>
            </Link>
          </li>
        ))}
      </ol>
      {previous && (
        <Button variant="secondary" size="sm" icon={<GitCompare className="h-3.5 w-3.5" />} loading={comparing} onClick={compare} className="w-full">
          What changed since v{previous.version}
        </Button>
      )}
      {diff && (
        diff.length === 0 ? (
          <p className="text-sm text-ink-muted">No differences in price, specification or terms.</p>
        ) : (
          <dl className="divide-y divide-edge rounded-lg border border-edge text-sm">
            {diff.map((row) => (
              <div key={row.label} className="px-3 py-2">
                <dt className="text-xs font-medium text-ink-muted">{row.label}</dt>
                <dd className="mt-0.5 break-words">
                  <span className="text-ink-subtle line-through">{row.before}</span>
                  <span className="mx-1.5 text-ink-subtle">→</span>
                  <span className="font-medium text-ink">{row.after}</span>
                </dd>
              </div>
            ))}
          </dl>
        )
      )}
    </section>
  );
};

// ---------------------------------------------------------------------------
// Expiry: extend validity in one tap (the in-app reminder's action)
// ---------------------------------------------------------------------------

export const ExtendValidity = ({ quote, onExtended }: { quote: Quote; onExtended: (q: Quote) => void }) => {
  const toast = useToast();
  const [busy, setBusy] = useState<number | null>(null);
  if (quote.superseded_at || quote.status === 'accepted' || quote.status === 'declined') return null;

  const extend = async (days: number) => {
    setBusy(days);
    try {
      const updated = await extendQuoteValidity(quote.id, days);
      onExtended(updated);
      toast({ message: `Valid until ${new Date(updated.valid_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` });
    } catch (err) {
      toast({ tone: 'error', message: errorText(err, 'Could not extend the quote') });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <span className="flex w-full items-center gap-1 text-xs font-medium text-ink-secondary">
        <CalendarPlus className="h-3.5 w-3.5" /> Extend:
      </span>
      {[7, 14, 30].map((days) => (
        <Button key={days} variant="secondary" size="sm" loading={busy === days} disabled={busy !== null} onClick={() => extend(days)}>
          +{days} days
        </Button>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// 2D drawings: private by default, per-file "show to customer"
// ---------------------------------------------------------------------------

const formatSize = (bytes: number) => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const QuoteDrawings = ({ quote }: { quote: Quote }) => {
  const toast = useToast();
  const [items, setItems] = useState<QuoteAttachment[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    listQuoteAttachments(quote.id).then(setItems).catch(() => setItems([]));
  }, [quote.id]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const created = await uploadQuoteAttachment(quote.id, file);
        setItems((prev) => [...(prev ?? []), created]);
      }
      toast({ message: files.length === 1 ? 'Drawing attached' : `${files.length} drawings attached` });
    } catch (err) {
      toast({ tone: 'error', message: errorText(err, 'Upload failed') });
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const toggle = async (item: QuoteAttachment) => {
    try {
      const updated = await setQuoteAttachmentShared(quote.id, item.id, !item.share_with_customer);
      setItems((prev) => prev?.map((a) => (a.id === item.id ? updated : a)) ?? prev);
    } catch (err) {
      toast({ tone: 'error', message: errorText(err, 'Could not update the drawing') });
    }
  };

  const remove = async (item: QuoteAttachment) => {
    try {
      await deleteQuoteAttachment(quote.id, item.id);
      setItems((prev) => prev?.filter((a) => a.id !== item.id) ?? prev);
      toast({ message: `Removed ${item.original_filename}` });
    } catch (err) {
      toast({ tone: 'error', message: errorText(err, 'Could not remove the drawing') });
    }
  };

  return (
    <section className="rounded-xl border border-edge bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-ink">
            <Paperclip className="h-5 w-5 text-ink-subtle" />
            Drawings
          </h2>
          <p className="mt-0.5 text-sm text-ink-muted">2D drawings (PDF or image) for tolerances, threads and notes. Private unless you show them to the customer. Shared across all versions.</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          className="sr-only"
          id={`drawings-${quote.id}`}
          onChange={(e) => upload(e.target.files)}
        />
        <Button variant="secondary" icon={<Upload className="h-4 w-4" />} loading={uploading} onClick={() => inputRef.current?.click()}>
          Attach drawing
        </Button>
      </div>

      {items === null ? null : items.length === 0 ? (
        <p className="mt-4 rounded-lg border border-dashed border-edge-strong px-4 py-6 text-center text-sm text-ink-muted">
          No drawings yet. Attach the customer's PDF drawing so tolerances and notes stay with the quote.
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-edge rounded-lg border border-edge">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
              {item.content_type === 'application/pdf' ? <FileText className="h-5 w-5 shrink-0 text-ink-subtle" /> : <FileImage className="h-5 w-5 shrink-0 text-ink-subtle" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{item.original_filename}</span>
                <span className="text-xs text-ink-muted">{formatSize(item.file_size)}</span>
              </span>
              {item.share_with_customer ? <Badge tone="primary">Customer can see</Badge> : <Badge>Private</Badge>}
              <span className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={item.share_with_customer ? `Hide ${item.original_filename} from customer` : `Show ${item.original_filename} to customer`}
                  title={item.share_with_customer ? 'Hide from customer' : 'Show to customer'}
                  onClick={() => toggle(item)}
                >
                  {item.share_with_customer ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Download ${item.original_filename}`} onClick={() => downloadQuoteAttachment(quote.id, item).catch(() => undefined)}>
                  <Download className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" aria-label={`Remove ${item.original_filename}`} onClick={() => remove(item)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

