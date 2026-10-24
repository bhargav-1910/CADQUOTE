import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AlertTriangle, ChevronRight } from 'lucide-react';
import type { AdminOverview as Overview } from '@/types';
import { getAdminOverview } from '@/services/api';
import { Skeleton } from '@/components/ui';
import { ErrorState, errorMessage } from './shared';

const PERIODS = [7, 30, 90] as const;

// Validated with the dataviz palette checker against both card surfaces
// (#ffffff light, #111216 dark): lightness band, chroma and 3:1 contrast pass.
const BAR_COLOR = '#0284c7';

const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

const Tile = ({ label, value, sub, onClick, tone }: { label: string; value: number; sub?: string; onClick?: () => void; tone?: 'warn' }) => {
  const body = (
    <>
      <p className="text-xs font-medium text-ink-muted">{label}</p>
      <p className={`mt-1 text-3xl font-bold ${tone === 'warn' && value > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-ink'}`}>
        {value.toLocaleString('en-IN')}
      </p>
      {sub && <p className="mt-1 text-xs text-ink-muted">{sub}</p>}
    </>
  );
  const base = 'rounded-2xl border border-edge bg-surface p-4 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} transition hover:border-edge-strong focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500`}>
      {body}
      <span className="mt-2 flex items-center gap-1 text-xs font-medium text-primary-700 dark:text-primary-300">
        Review <ChevronRight className="h-3 w-3" />
      </span>
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
};

/** One measure per chart: signups and quotes have different scales, so they
 *  get separate small multiples rather than a shared or dual axis. */
const DailyChart = ({ title, data, dataKey }: { title: string; data: Overview['daily']; dataKey: 'signups' | 'quotes' }) => {
  const total = data.reduce((sum, d) => sum + d[dataKey], 0);
  return (
    <figure className="rounded-2xl border border-edge bg-surface p-4">
      <figcaption className="flex items-baseline justify-between">
        <span className="font-semibold text-ink">{title}</span>
        <span className="text-sm text-ink-muted">{total.toLocaleString('en-IN')} total</span>
      </figcaption>
      <div className="mt-3 h-48" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap={2}>
            <CartesianGrid vertical={false} stroke="rgb(var(--fq-edge))" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tick={{ fill: 'rgb(var(--fq-ink-muted))', fontSize: 11 }}
              axisLine={{ stroke: 'rgb(var(--fq-edge-strong))' }}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis allowDecimals={false} tick={{ fill: 'rgb(var(--fq-ink-muted))', fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgb(var(--fq-surface-raised))' }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <div className="rounded-lg border border-edge bg-surface px-3 py-2 text-xs shadow-lg">
                    <p className="text-ink-muted">{shortDate(String(label))}</p>
                    <p className="font-semibold text-ink">
                      {payload[0].value} {dataKey}
                    </p>
                  </div>
                ) : null
              }
            />
            <Bar dataKey={dataKey} fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={24} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Table view for screen readers: the chart itself is not readable. */}
      <table className="sr-only">
        <caption>{title} per day</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.date}>
              <th scope="row">{d.date}</th>
              <td>{d[dataKey]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
};

const AdminOverview = ({ onOpen }: { onOpen: (tab: string) => void }) => {
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getAdminOverview(days)
      .then(setData)
      .catch((err) => setError(errorMessage(err, 'Could not load the overview.')));
  }, [days]);

  useEffect(load, [load]);

  if (error) return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="space-y-4">
      <div role="radiogroup" aria-label="Period" className="inline-flex gap-1 rounded-xl bg-surface-raised p-1">
        {PERIODS.map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={days === value}
            onClick={() => setDays(value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${days === value ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
          >
            Last {value} days
          </button>
        ))}
      </div>

      {!data ? (
        <div role="status" aria-label="Loading" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Users" value={data.users_total} sub={`+${data.users_new} in period`} onClick={() => onOpen('users')} />
            <Tile label="Active users" value={data.users_active} sub="signed in during period" />
            <Tile label="Pro users" value={data.users_pro} sub={`${data.users_total ? Math.round((data.users_pro / data.users_total) * 100) : 0}% of all users`} />
            <Tile label="Suspended" value={data.users_suspended} />
            <Tile label="Quotes created" value={data.quotes_new} sub={`${data.quotes_total.toLocaleString('en-IN')} all time`} />
            <Tile label="Quotes accepted" value={data.quotes_accepted} sub="customer responses in period" />
            <Tile
              label="Failed CAD files"
              value={data.cad_failed}
              sub="uploads in period"
              tone="warn"
              onClick={data.cad_failed > 0 ? () => onOpen('cad') : undefined}
            />
          </div>

          {data.cad_failed > 0 && (
            <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
              <AlertTriangle className="h-4 w-4" />
              {data.cad_failed} upload{data.cad_failed === 1 ? '' : 's'} failed geometry analysis in this period.
            </p>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <DailyChart title="Signups" data={data.daily} dataKey="signups" />
            <DailyChart title="Quotes created" data={data.daily} dataKey="quotes" />
          </div>
        </>
      )}
    </div>
  );
};

export default AdminOverview;
