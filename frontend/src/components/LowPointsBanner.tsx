import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { getPointsWallet } from '@/services/api';

interface LowPointsBannerProps {
  minRecommended: number;
  contextLabel: string;
}

const LowPointsBanner = ({ minRecommended, contextLabel }: LowPointsBannerProps) => {
  const [balance, setBalance] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPointsWallet()
      .then((wallet) => {
        if (!cancelled) {
          setBalance(wallet.balance_points);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBalance(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const show = useMemo(() => {
    if (balance === null) {
      return false;
    }
    return balance < minRecommended;
  }, [balance, minRecommended]);

  if (!show || balance === null) {
    return null;
  }

  return (
    <div className="rounded-xl border border-orange-300 bg-orange-50/80 px-4 py-3 text-orange-900">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 mt-0.5 text-orange-700" />
        <div className="text-sm">
          <p className="font-semibold">Low points balance</p>
          <p className="mt-0.5">
            You have {balance} points. At least {minRecommended} points are recommended for {contextLabel}.
          </p>
          <Link to="/billing" className="mt-2 inline-block font-semibold text-orange-800 underline underline-offset-2">
            Top up points in Billing
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LowPointsBanner;
