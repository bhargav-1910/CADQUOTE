import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import type { PointsLedgerEntry, PointsPackage } from '@/types';
import {
  createStripeCheckoutSession,
  getPointsLedger,
  getPointsPackages,
  getPointsWallet,
} from '@/services/api';

const BillingPage = () => {
  const location = useLocation();
  const [walletPoints, setWalletPoints] = useState<number>(0);
  const [packages, setPackages] = useState<PointsPackage[]>([]);
  const [ledger, setLedger] = useState<PointsLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [buyingPackageId, setBuyingPackageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const purchaseStatus = useMemo(() => {
    const status = new URLSearchParams(location.search).get('status');
    if (status === 'success') return 'Points purchase completed. Credits are applied after Stripe webhook confirmation.';
    if (status === 'cancel') return 'Payment was canceled. No points were deducted.';
    return null;
  }, [location.search]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [wallet, pointsPackages, entries] = await Promise.all([
        getPointsWallet(),
        getPointsPackages(),
        getPointsLedger(25),
      ]);
      setWalletPoints(wallet.balance_points);
      setPackages(pointsPackages);
      setLedger(entries);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load billing data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const formatCurrency = (minor: number, currency: string) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency.toUpperCase() }).format(minor / 100);

  const onBuyPoints = async (pkg: PointsPackage) => {
    setBuyingPackageId(pkg.id);
    setError(null);

    try {
      const base = window.location.origin;
      const response = await createStripeCheckoutSession({
        package_id: pkg.id,
        success_url: `${base}/billing?status=success`,
        cancel_url: `${base}/billing?status=cancel`,
      });
      window.location.href = response.checkout_url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start Stripe checkout');
      setBuyingPackageId(null);
    }
  };

  return (
    <div className="space-y-8 py-4">
      <div className="border-l-4 border-[#ff5e07] bg-[#ff5e07]/10 p-4">
        <h4 className="text-mono-label text-xs text-[#ffb59a]">LOW_BALANCE_INTERVENTION</h4>
        <p className="mt-1 text-sm text-[#b9caca]">CREDITS REMAINING: {walletPoints.toLocaleString()}</p>
      </div>

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-mono-label text-xs text-[#00f5ff]">FINANCIAL_PROTOCOLS_V4.2</p>
          <h1 className="mt-2 font-headline text-5xl font-black uppercase tracking-tighter text-[#e9feff]">BILLING_CORE</h1>
        </div>
        <button type="button" onClick={loadData} className="mf-btn-outline px-4 py-2 text-xs font-semibold">REFRESH</button>
      </div>

      {purchaseStatus && <div className="border-l-4 border-[#65f98b] bg-[#65f98b]/10 p-3 text-sm text-[#65f98b]">{purchaseStatus}</div>}
      {error && <div className="border-l-4 border-[#ff5e07] bg-[#ff5e07]/10 p-3 text-sm text-[#ffb59a]">{error}</div>}

      <div className="grid grid-cols-12 gap-8">
        <div className="col-span-12 space-y-6 lg:col-span-4">
          <div className="mf-card p-8">
            <p className="text-mono-label text-xs text-[#00f5ff]">REAL_TIME_TOTAL</p>
            <p className="mt-5 font-headline text-6xl font-light tracking-tighter text-[#e9feff]">{walletPoints.toLocaleString()}</p>
            <p className="mt-2 text-mono-label text-xs text-[#b9caca]">MF_CREDITS_AVAILABLE</p>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-8">
          <div className="border border-[#3a494a]/30 bg-[#171f33]">
            <div className="border-b border-[#3a494a]/20 p-8">
              <h2 className="font-headline text-2xl font-bold uppercase text-[#e9feff]">MANUFACTURING_CREDIT_ACQUISITION</h2>
              <p className="mt-1 text-sm text-[#b9caca]">Select a technical tier to replenish system units.</p>
            </div>

            {loading ? (
              <div className="flex items-center gap-2 p-8 text-[#b9caca]">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading packages...
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3">
                {packages.map((pkg) => (
                  <div key={pkg.id} className="border-r border-[#3a494a]/20 p-8 last:border-r-0 hover:bg-[#222a3d]/40">
                    <h3 className="text-mono-label text-xs text-[#00f5ff]">{pkg.name}</h3>
                    <p className="mt-2 font-headline text-3xl font-black text-[#e9feff]">{formatCurrency(pkg.price_minor, pkg.currency)}</p>
                    <p className="mt-2 text-sm text-[#b9caca]">{pkg.points.toLocaleString()} credits</p>
                    <button
                      type="button"
                      onClick={() => onBuyPoints(pkg)}
                      disabled={buyingPackageId === pkg.id}
                      className="mf-btn-primary mt-6 w-full px-3 py-3 text-xs disabled:opacity-60"
                    >
                      {buyingPackageId === pkg.id ? 'REDIRECTING...' : 'TOP-UP_CORE'}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="border border-[#3a494a]/30 bg-[#131b2e]">
        <div className="border-b border-[#3a494a]/20 px-5 py-4">
          <h2 className="font-headline text-lg font-bold uppercase text-[#e9feff]">TRANSACTION_LOG</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-mono-label text-[11px] text-[#b9caca]">
              <tr>
                <th className="px-4 py-3 text-left">DATE</th>
                <th className="px-4 py-3 text-left">ACTION</th>
                <th className="px-4 py-3 text-right">DELTA</th>
                <th className="px-4 py-3 text-right">BALANCE</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td className="px-4 py-4 text-[#b9caca]" colSpan={4}>No activity yet.</td>
                </tr>
              )}
              {ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-[#3a494a]/20">
                  <td className="px-4 py-3 text-[#b9caca]">{new Date(entry.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3 text-[#dae2fd]">{entry.description || entry.action}</td>
                  <td className={`px-4 py-3 text-right font-semibold ${entry.delta_points >= 0 ? 'text-[#65f98b]' : 'text-[#ffb59a]'}`}>
                    {entry.delta_points >= 0 ? '+' : ''}{entry.delta_points}
                  </td>
                  <td className="px-4 py-3 text-right text-[#dae2fd]">{entry.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default BillingPage;
