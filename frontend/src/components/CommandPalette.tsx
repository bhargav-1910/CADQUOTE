import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search,
  Upload,
  Layers,
  FolderOpen,
  Settings,
  CreditCard,
  Moon,
  FileText,
  CornerDownLeft,
  LifeBuoy,
  UserCog,
} from 'lucide-react';
import type { QuoteListItem } from '@/types';
import { listQuotes } from '@/services/api';
import { Dialog } from '@/components/ui';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onToggleTheme: () => void;
}

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  run: () => void;
  section: 'Navigate' | 'Actions' | 'Quotes';
}

const CommandPalette = ({ open, onClose, onToggleTheme }: CommandPaletteProps) => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [highlighted, setHighlighted] = useState(0);
  const [quotes, setQuotes] = useState<QuoteListItem[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setHighlighted(0);
    requestAnimationFrame(() => inputRef.current?.focus());
    listQuotes(0, 50)
      .then(setQuotes)
      .catch(() => setQuotes([]));
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const go = (path: string) => () => {
      onClose();
      navigate(path);
    };
    const base: PaletteItem[] = [
      { id: 'nav-dashboard', label: 'Dashboard', hint: 'Upload hub & activity', icon: Upload, run: go('/dashboard'), section: 'Navigate' },
      { id: 'nav-new-quote', label: 'New quote', hint: 'Upload CAD and price', icon: Layers, run: go('/quotes/new'), section: 'Navigate' },
      { id: 'nav-quotes', label: 'Quotes', hint: 'All quotations', icon: FolderOpen, run: go('/quotes'), section: 'Navigate' },
      { id: 'nav-cost-master', label: 'Cost Master', hint: 'Rates, materials, finishes', icon: Settings, run: go('/settings/rates'), section: 'Navigate' },
      { id: 'nav-billing', label: 'Billing', hint: 'Plan and upgrades', icon: CreditCard, run: go('/settings/billing'), section: 'Navigate' },
      { id: 'nav-account', label: 'Account settings', hint: 'Company details, logo, security', icon: UserCog, run: go('/settings/account'), section: 'Navigate' },
      { id: 'nav-help', label: 'Help center', hint: 'Guides and how pricing works', icon: LifeBuoy, run: go('/help'), section: 'Navigate' },
      {
        id: 'action-theme',
        label: 'Toggle dark mode',
        hint: 'Switch light / dark theme',
        icon: Moon,
        run: () => {
          onToggleTheme();
          onClose();
        },
        section: 'Actions',
      },
    ];

    const quoteItems: PaletteItem[] = quotes.map((quote) => ({
      id: `quote-${quote.id}`,
      label: quote.title || quote.quote_number,
      hint: `${quote.title ? `${quote.quote_number} · ` : ''}${quote.customer_name ?? 'No customer'} · ${quote.status}`,
      icon: FileText,
      run: go(`/quotes/${quote.id}`),
      section: 'Quotes',
    }));

    return [...base, ...quoteItems];
  }, [quotes, navigate, onClose, onToggleTheme]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Without a query, show nav/actions plus the 5 most recent quotes.
      return items.filter((item) => item.section !== 'Quotes').concat(
        items.filter((item) => item.section === 'Quotes').slice(0, 5),
      );
    }
    return items.filter(
      (item) => item.label.toLowerCase().includes(q) || (item.hint ?? '').toLowerCase().includes(q),
    );
  }, [items, query]);

  useEffect(() => {
    setHighlighted((prev) => Math.min(prev, Math.max(filtered.length - 1, 0)));
  }, [filtered.length]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setHighlighted((prev) => Math.min(prev + 1, filtered.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setHighlighted((prev) => Math.max(prev - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        filtered[highlighted]?.run();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, filtered, highlighted, onClose]);

  let lastSection: string | null = null;

  return (
    <Dialog open={open} onClose={onClose} label="Command palette" className="mt-[14vh] max-w-xl overflow-hidden">
      <div>
        <div className="flex items-center gap-2.5 px-4 border-b border-edge">
          <Search className="w-4 h-4 text-ink-subtle shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search quotes, pages, actions…"
            className="w-full py-3.5 text-sm bg-transparent outline-none border-0 focus:ring-0 text-ink"
            style={{ boxShadow: 'none' }}
          />
          <kbd className="shrink-0 text-[10px] font-semibold text-ink-subtle border border-edge rounded-lg px-1.5 py-0.5">ESC</kbd>
        </div>

        <div className="max-h-[46vh] overflow-y-auto py-1.5">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-sm text-ink-muted text-center">No matches for “{query}”.</p>
          )}
          {filtered.map((item, index) => {
            const sectionHeader = item.section !== lastSection ? item.section : null;
            lastSection = item.section;
            const Icon = item.icon;
            return (
              <div key={item.id}>
                {sectionHeader && (
                  <p className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-ink-subtle">
                    {sectionHeader}
                  </p>
                )}
                <button
                  type="button"
                  onClick={item.run}
                  onMouseEnter={() => setHighlighted(index)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left ${
                    index === highlighted ? 'bg-primary-50 dark:bg-primary-500/10' : ''
                  }`}
                >
                  <span
                    className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      index === highlighted ? 'bg-primary-600 text-white' : 'bg-surface-raised text-ink-muted'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink truncate">{item.label}</span>
                    {item.hint && <span className="block text-xs text-ink-muted truncate">{item.hint}</span>}
                  </span>
                  {index === highlighted && <CornerDownLeft className="w-3.5 h-3.5 text-ink-subtle shrink-0" />}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </Dialog>
  );
};

export default CommandPalette;
