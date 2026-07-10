/**
 * Shared UI primitives — one source of truth for buttons, cards, badges,
 * status pills and skeletons so every screen renders them identically.
 */
import {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
  forwardRef,
  useId,
  useState,
} from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Send, FileText, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { QuoteStatus } from '@/types';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-primary-600 text-white shadow-sm hover:bg-primary-700 focus-visible:outline-primary-600 disabled:bg-primary-300',
  // Landing-page machined orange with dark ink — reserved for the single
  // highest-value CTA on a screen.
  accent:
    'bg-accent-400 text-slate-950 shadow-sm hover:bg-accent-300 focus-visible:outline-accent-500 disabled:bg-accent-200 disabled:text-slate-500',
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

// ---------------------------------------------------------------------------
// Form primitives — Input / Select / Textarea share one focus + border
// treatment (visible 2px ring, not just a border-color shift).
// ---------------------------------------------------------------------------

const FIELD_BASE =
  'w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition ' +
  'placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400';

const FIELD_ERROR = 'border-red-400 focus:border-red-500 focus:ring-red-500/30';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className = '', ...rest }, ref) => (
    <input ref={ref} className={`${FIELD_BASE} ${invalid ? FIELD_ERROR : ''} ${className}`} {...rest} />
  ),
);
Input.displayName = 'Input';

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  invalid?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ invalid = false, className = '', children, ...rest }, ref) => (
    <select ref={ref} className={`${FIELD_BASE} ${invalid ? FIELD_ERROR : ''} ${className}`} {...rest}>
      {children}
    </select>
  ),
);
Select.displayName = 'Select';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ invalid = false, className = '', ...rest }, ref) => (
    <textarea ref={ref} className={`${FIELD_BASE} ${invalid ? FIELD_ERROR : ''} ${className}`} {...rest} />
  ),
);
Textarea.displayName = 'Textarea';

/** Password input with a show/hide toggle. */
export const PasswordInput = forwardRef<HTMLInputElement, InputProps>(
  ({ invalid = false, className = '', ...rest }, ref) => {
    const [visible, setVisible] = useState(false);
    return (
      <div className="relative">
        <input
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={`${FIELD_BASE} ${invalid ? FIELD_ERROR : ''} pr-11 ${className}`}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-slate-400 transition hover:text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

/**
 * Field — label + control + helper/error wiring in one place, so every form
 * gets identical spacing, required markers and aria-describedby for free.
 */
export interface FieldProps {
  label: ReactNode;
  children: (props: { id: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }) => ReactNode;
  helper?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
}

export const Field = ({ label, children, helper, error, required = false, className = '' }: FieldProps) => {
  const id = useId();
  const describedBy = error ? `${id}-error` : helper ? `${id}-helper` : undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700">
        {label}
        {required && <span aria-hidden className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="mt-1">
        {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="mt-1 text-xs text-slate-500">
          {helper}
        </p>
      ) : null}
    </div>
  );
};
