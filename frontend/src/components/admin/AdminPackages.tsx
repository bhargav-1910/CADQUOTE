import { FormEvent, useCallback, useEffect, useState } from 'react';
import { CreditCard, Info, Plus } from 'lucide-react';
import type { PointsPackage } from '@/types';
import { createPointsPackage, getPointsPackages, updatePointsPackage } from '@/services/api';
import { useToast } from '@/components/Toast';
import { Badge, Button, Field, Input, SkeletonList } from '@/components/ui';
import { AdminTable, EmptyState, ErrorState, errorMessage } from './shared';

type Draft = { name: string; points: string; price: string; order: string };

const toDraft = (p: PointsPackage): Draft => ({
  name: p.name,
  points: String(p.points),
  price: (p.price_minor / 100).toString(),
  order: String(p.display_order),
});

const EMPTY_NEW = { code: '', name: '', points: '', price: '', order: '0' };

const AdminPackages = () => {
  const toast = useToast();
  const [packages, setPackages] = useState<PointsPackage[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [error, setError] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_NEW);
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    setError(null);
    getPointsPackages(true)
      .then((rows) => {
        setPackages(rows);
        setDrafts(Object.fromEntries(rows.map((p) => [p.id, toDraft(p)])));
      })
      .catch((err) => setError(errorMessage(err, 'Could not load packages.')));
  }, []);

  useEffect(load, [load]);

  const replace = (updated: PointsPackage) => {
    setPackages((prev) => prev?.map((p) => (p.id === updated.id ? updated : p)) ?? prev);
    setDrafts((prev) => ({ ...prev, [updated.id]: toDraft(updated) }));
  };

  const save = async (pkg: PointsPackage, patch: Parameters<typeof updatePointsPackage>[1], message: string) => {
    setSavingId(pkg.id);
    try {
      replace(await updatePointsPackage(pkg.id, patch));
      toast({ message });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not save the package.') });
    } finally {
      setSavingId(null);
    }
  };

  const saveDraft = (pkg: PointsPackage) => {
    const d = drafts[pkg.id];
    const points = Number(d.points);
    const priceMinor = Math.round(Number(d.price) * 100);
    if (!d.name.trim() || !(points > 0) || !(priceMinor > 0)) {
      toast({ tone: 'error', message: 'Name, points and price are all required and must be above zero.' });
      return;
    }
    save(pkg, { name: d.name.trim(), points, price_minor: priceMinor, display_order: Number(d.order) || 0 }, `${d.name} saved`);
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setCreating(true);
    try {
      const created = await createPointsPackage({
        package_code: form.code.trim().toLowerCase(),
        name: form.name.trim(),
        points: Number(form.points),
        price_minor: Math.round(Number(form.price) * 100),
        currency: 'inr',
        is_active: true,
        display_order: Number(form.order) || 0,
      });
      setPackages((prev) => [...(prev ?? []), created].sort((a, b) => a.display_order - b.display_order));
      setDrafts((prev) => ({ ...prev, [created.id]: toDraft(created) }));
      setForm(EMPTY_NEW);
      toast({ message: `${created.name} created` });
    } catch (err) {
      toast({ tone: 'error', message: errorMessage(err, 'Could not create the package.') });
    } finally {
      setCreating(false);
    }
  };

  const isDirty = (pkg: PointsPackage) => {
    const d = drafts[pkg.id];
    const o = toDraft(pkg);
    return d && (d.name !== o.name || d.points !== o.points || d.price !== o.price || d.order !== o.order);
  };

  const setDraft = (id: string, key: keyof Draft, value: string) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }));

  return (
    <div className="space-y-4">
      <p className="flex gap-2 rounded-xl border border-primary-200 dark:border-primary-500/30 bg-primary-50 dark:bg-primary-500/10 px-4 py-3 text-sm text-primary-800 dark:text-primary-300">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        Packages are what customers will be able to buy once the points system and a payment gateway are switched on. Until then
        nobody sees them, so editing here is safe.
      </p>

      {error ? (
        <ErrorState message={error} onRetry={load} />
      ) : !packages ? (
        <SkeletonList rows={3} />
      ) : packages.length === 0 ? (
        <EmptyState icon={<CreditCard className="h-8 w-8" />} title="No packages yet">
          Create the first one below.
        </EmptyState>
      ) : (
        <AdminTable head={['Package', 'Points', 'Price (₹)', 'Order', 'Status', '']} minWidth={820}>
          {packages.map((pkg) => {
            const d = drafts[pkg.id];
            return (
              <tr key={pkg.id} className={pkg.is_active ? '' : 'opacity-60'}>
                <td className="px-4 py-3">
                  <Input aria-label={`${pkg.id} name`} value={d?.name ?? ''} onChange={(e) => setDraft(pkg.id, 'name', e.target.value)} />
                  <p className="mt-1 font-mono text-xs text-ink-muted">{pkg.id}</p>
                </td>
                <td className="px-4 py-3">
                  <Input aria-label={`${pkg.id} points`} type="number" min={1} value={d?.points ?? ''} onChange={(e) => setDraft(pkg.id, 'points', e.target.value)} className="!w-28 text-right" />
                </td>
                <td className="px-4 py-3">
                  <Input aria-label={`${pkg.id} price`} type="number" min={1} step="0.01" value={d?.price ?? ''} onChange={(e) => setDraft(pkg.id, 'price', e.target.value)} className="!w-32 text-right" />
                </td>
                <td className="px-4 py-3">
                  <Input aria-label={`${pkg.id} display order`} type="number" value={d?.order ?? ''} onChange={(e) => setDraft(pkg.id, 'order', e.target.value)} className="!w-20 text-right" />
                </td>
                <td className="px-4 py-3">{pkg.is_active ? <Badge tone="green">Active</Badge> : <Badge>Hidden</Badge>}</td>
                <td className="px-4 py-3">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" disabled={!isDirty(pkg)} loading={savingId === pkg.id} onClick={() => saveDraft(pkg)}>
                      Save
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={savingId === pkg.id}
                      onClick={() => save(pkg, { is_active: !pkg.is_active }, pkg.is_active ? `${pkg.name} hidden` : `${pkg.name} shown`)}
                    >
                      {pkg.is_active ? 'Hide' : 'Show'}
                    </Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </AdminTable>
      )}

      <form onSubmit={create} className="rounded-2xl border border-edge bg-surface p-4">
        <h2 className="flex items-center gap-2 font-semibold text-ink">
          <Plus className="h-4 w-4" /> New package
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Code" required helper="Lowercase, permanent">
            {(props) => <Input {...props} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="starter" required minLength={2} pattern="[a-z0-9_-]+" />}
          </Field>
          <Field label="Name" required>
            {(props) => <Input {...props} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Starter pack" required minLength={2} />}
          </Field>
          <Field label="Points" required>
            {(props) => <Input {...props} type="number" min={1} value={form.points} onChange={(e) => setForm({ ...form, points: e.target.value })} required />}
          </Field>
          <Field label="Price (₹)" required>
            {(props) => <Input {...props} type="number" min={1} step="0.01" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required />}
          </Field>
          <Field label="Order">
            {(props) => <Input {...props} type="number" value={form.order} onChange={(e) => setForm({ ...form, order: e.target.value })} />}
          </Field>
        </div>
        <div className="mt-4 flex justify-end">
          <Button type="submit" loading={creating}>
            Create package
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AdminPackages;
