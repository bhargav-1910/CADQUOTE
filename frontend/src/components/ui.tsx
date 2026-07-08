/**
 * Shared UI primitives — one source of truth for buttons, cards, badges,
 * status pills and skeletons so every screen renders them identically.
 */
import { ButtonHTMLAttributes, HTMLAttributes, ReactNode, forwardRef } from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Send, FileText, AlertTriangle } from 'lucide-react';
import type { QuoteStatus } from '@/types';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white shadow-sm hover:bg-primary-700 focus-visible:outline-primary-600 disabled:bg-primary-300',
  secondary:
    'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus-visible:outline-gray-400 disabled:text-gray-400',
  ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-gray-400',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600 disabled:bg-red-300',
  success:
    'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-emerald-600 disabled:bg-emerald-300',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2 text-sm rounded-lg gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, className = '', children, disabled, ...rest }, ref) => (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  padded?: boolean;
}

export const Card = ({ padded = true, className = '', children, ...rest }: CardProps) => (
  <div
    className={`rounded-2xl border border-gray-200 bg-white shadow-sm ${padded ? 'p-6' : ''} ${className}`}
    {...rest}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeTone = 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'sky';

const BADGE_TONES: Record<BadgeTone, string> = {
  gray: 'bg-gray-100 text-gray-700 border-gray-200',
  blue: 'bg-primary-50 text-primary-700 border-primary-200',
  green: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  red: 'bg-red-50 text-red-700 border-red-200',
  sky: 'bg-sky-50 text-sky-700 border-sky-200',
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
}

export const Badge = ({ tone = 'gray', className = '', children, ...rest }: BadgeProps) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${BADGE_TONES[tone]} ${className}`}
    {...rest}
  >
    {children}
  </span>
);

// ---------------------------------------------------------------------------
// StatusPill — quote lifecycle states, one visual language everywhere
// ---------------------------------------------------------------------------

const STATUS_CONFIG: Record<QuoteStatus, { label: string; tone: BadgeTone; icon: typeof Clock }> = {
  draft: { label: 'Draft', tone: 'gray', icon: FileText },
  generated: { label: 'Generated', tone: 'blue', icon: FileText },
  sent: { label: 'Sent', tone: 'sky', icon: Send },
  expired: { label: 'Expired', tone: 'amber', icon: Clock },
  accepted: { label: 'Accepted', tone: 'green', icon: CheckCircle2 },
  declined: { label: 'Declined', tone: 'red', icon: XCircle },
};

export const StatusPill = ({ status, className = '' }: { status: QuoteStatus; className?: string }) => {
  const config = STATUS_CONFIG[status] ?? { label: status, tone: 'gray' as BadgeTone, icon: AlertTriangle };
  const Icon = config.icon;
  return (
    <Badge tone={config.tone} className={className}>
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
};

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-lg bg-gray-200 ${className}`} aria-hidden />
);

// ---------------------------------------------------------------------------
// SectionLabel — mono eyebrow used above section headings
// ---------------------------------------------------------------------------

export const SectionLabel = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <p className={`font-mono text-xs font-semibold uppercase tracking-[0.2em] text-sky-700 ${className}`}>
    {children}
  </p>
);
