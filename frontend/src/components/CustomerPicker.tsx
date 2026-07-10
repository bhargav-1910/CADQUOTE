import { useEffect, useRef, useState } from 'react';
import { Check, Loader2, Search, X } from 'lucide-react';
import type { Customer } from '@/types';
import { listCustomers } from '@/services/api';

interface CustomerPickerProps {
  /** Currently linked customer, if one was picked. */
  selected: Customer | null;
  onSelect: (customer: Customer) => void;
  onClear: () => void;
}

/**
 * Search-as-you-type picker over existing customers. Picking one fills the
 * quote's customer fields and links the CRM record; typing new details in
 * the fields below simply creates a new customer on quote creation.
 */
const CustomerPicker = ({ selected, onSelect, onClear }: CustomerPickerProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const data = await listCustomers(query.trim());
        if (!cancelled) {
          setResults(data.slice(0, 8));
          setOpen(true);
        }
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  useEffect(() => {
    const onClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <Check className="w-4 h-4 text-primary-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-primary-900 truncate">{selected.name}</p>
            <p className="text-xs text-primary-700 truncate">
              {[selected.company, selected.email].filter(Boolean).join(' · ') || 'Linked customer'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="shrink-0 text-primary-400 hover:text-primary-700"
          aria-label="Unlink customer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 animate-spin" />
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Search existing customers…"
          className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          {results.map((customer) => (
            <li key={customer.id}>
              <button
                type="button"
                onClick={() => {
                  onSelect(customer);
                  setQuery('');
                  setOpen(false);
                }}
                className="w-full px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
              >
                <p className="text-sm font-medium text-gray-900">{customer.name}</p>
                <p className="text-xs text-gray-500">
                  {[customer.company, customer.email].filter(Boolean).join(' · ') || 'No contact details'}
                  {customer.quote_count > 0 && ` · ${customer.quote_count} quote${customer.quote_count === 1 ? '' : 's'}`}
                </p>
              </button>
            </li>
          ))}
        </ul>
      )}

      {open && !searching && query.trim() && results.length === 0 && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-xs text-gray-500 shadow-lg">
          No matching customers — fill in the fields below and a new record is created with the quote.
        </div>
      )}
    </div>
  );
};

export default CustomerPicker;
