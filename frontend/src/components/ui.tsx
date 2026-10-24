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
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { Loader2, CheckCircle2, XCircle, Clock, Send, FileText, AlertTriangle, Eye, EyeOff } from 'lucide-react';
import type { QuoteStatus } from '@/types';

// ---------------------------------------------------------------------------
// Button
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger' | 'danger-subtle' | 'success';
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white shadow-sm hover:bg-primary-700 focus-visible:outline-primary-600',
  // Landing-page machined orange with dark ink — reserved for the single
  // highest-value CTA on a screen.
  accent: 'bg-accent-400 text-slate-950 shadow-sm hover:bg-accent-300 focus-visible:outline-accent-500',
  secondary:
    'border border-edge-strong bg-surface text-ink-secondary hover:bg-surface-muted hover:text-ink focus-visible:outline-primary-500',
  ghost: 'text-ink-secondary hover:bg-surface-raised hover:text-ink focus-visible:outline-primary-500',
  danger: 'bg-red-600 text-white shadow-sm hover:bg-red-700 focus-visible:outline-red-600',
  // Destructive but not the main action on screen (e.g. "Turn off").
  'danger-subtle':
    'border border-red-300 dark:border-red-500/40 bg-surface text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-500/10 focus-visible:outline-red-600',
  success: 'bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 focus-visible:outline-emerald-600',
};

// Radius follows control size: 8px compact, 12px standard. `icon` is a
// 40px square for icon-only actions (always pass aria-label).
const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs rounded-lg gap-1.5',
  md: 'px-4 py-2.5 text-sm rounded-xl gap-2',
  lg: 'px-6 py-3 text-base rounded-xl gap-2',
  icon: 'h-10 w-10 rounded-lg',
};

/** Button styling for elements that can't be a <button> (e.g. router <Link>). */
export const buttonClasses = (variant: ButtonVariant = 'primary', size: ButtonSize = 'md', className = '') =>
  `inline-flex items-center justify-center whitespace-nowrap font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100 ${BUTTON_VARIANTS[variant]} ${BUTTON_SIZES[size]} ${className}`;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', loading = false, icon, className = '', children, disabled, type = 'button', ...rest }, ref) => (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={buttonClasses(variant, size, className)}
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
    className={`rounded-2xl border border-edge bg-surface shadow-sm ${padded ? 'p-6' : ''} ${className}`}
    {...rest}
  >
    {children}
  </div>
);

// ---------------------------------------------------------------------------
// Badge
// ---------------------------------------------------------------------------

type BadgeTone = 'gray' | 'primary' | 'green' | 'amber' | 'red';

const BADGE_TONES: Record<BadgeTone, string> = {
  gray: 'bg-surface-raised text-ink-secondary border-edge',
  primary: 'bg-primary-50 dark:bg-primary-500/10 text-primary-700 dark:text-primary-300 border-primary-200 dark:border-primary-500/30',
  green: 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-500/30',
  amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-500/30',
  red: 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-500/30',
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
  generated: { label: 'Generated', tone: 'primary', icon: FileText },
  sent: { label: 'Sent', tone: 'primary', icon: Send },
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
  <div className={`animate-pulse rounded-lg bg-fill ${className}`} aria-hidden />
);

/** Loading placeholder for a list or table: rows of text bars in a card. */
export const SkeletonList = ({ rows = 5, className = '' }: { rows?: number; className?: string }) => (
  <div role="status" aria-label="Loading" className={`divide-y divide-edge overflow-hidden rounded-2xl border border-edge bg-surface ${className}`}>
    {Array.from({ length: rows }, (_, index) => (
      <div key={index} className="flex items-center gap-4 px-5 py-4">
        <Skeleton className="h-9 w-9 shrink-0" />
        <Skeleton className="h-4 w-40" />
        <Skeleton className="hidden h-4 w-28 sm:block" />
        <Skeleton className="ml-auto h-4 w-20" />
      </div>
    ))}
  </div>
);

/** Loading placeholder for a detail screen: breadcrumb, title, content cards. */
export const SkeletonPage = () => (
  <div role="status" aria-label="Loading" className="space-y-6 p-4 sm:p-6 lg:p-8">
    <Skeleton className="h-4 w-40" />
    <Skeleton className="h-8 w-72 max-w-full" />
    <div className="grid gap-6 lg:grid-cols-3">
      <Skeleton className="h-72 rounded-2xl lg:col-span-2" />
      <Skeleton className="h-72 rounded-2xl" />
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// SectionLabel — mono eyebrow used above section headings
// ---------------------------------------------------------------------------

export const SectionLabel = ({ children, className = '', ...rest }: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`font-mono text-xs font-semibold uppercase tracking-[0.2em] text-primary-700 dark:text-primary-300 ${className}`} {...rest}>
    {children}
  </p>
);

// ---------------------------------------------------------------------------
// Form primitives — Input / Select / Textarea share one focus + border
// treatment (visible 2px ring, not just a border-color shift).
// ---------------------------------------------------------------------------

const FIELD_BASE =
  'w-full rounded-xl border border-edge-strong bg-surface px-3 py-2.5 text-sm text-ink outline-none transition ' +
  'placeholder:text-ink-subtle focus:border-primary-500 focus:ring-2 focus:ring-primary-500/30 ' +
  'disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-ink-subtle';

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
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-xl text-ink-subtle transition hover:text-ink-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary-500"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    );
  },
);
PasswordInput.displayName = 'PasswordInput';

// ---------------------------------------------------------------------------
// Dialog — native <dialog> + showModal(): the browser supplies Escape to
// close, an inert background (focus can't leave), and top-layer stacking.
// We add backdrop-click close and focus return to the opener.
// ---------------------------------------------------------------------------

export interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; use `labelledBy` instead when a visible heading exists. */
  label?: string;
  labelledBy?: string;
  className?: string;
  children: ReactNode;
}

export const Dialog = ({ open, onClose, label, labelledBy, className = '', children }: DialogProps) => {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!open || !dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      // Also runs when the parent unmounts us mid-open, where the browser's
      // own focus restoration would not.
      opener?.focus?.();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-label={label}
      aria-labelledby={labelledBy}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // Backdrop clicks target the <dialog> itself, outside its box.
        if (event.target !== event.currentTarget) return;
        const r = event.currentTarget.getBoundingClientRect();
        if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) {
          onClose();
        }
      }}
      className={`fq-dialog max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] overflow-y-auto rounded-2xl border border-edge bg-surface p-0 text-ink shadow-2xl backdrop:bg-slate-950/50 backdrop:backdrop-blur-sm ${className}`}
    >
      {open && children}
    </dialog>
  );
};

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
      <label htmlFor={id} className="block text-sm font-medium text-ink-secondary">
        {label}
        {required && <span aria-hidden className="ml-0.5 text-red-500">*</span>}
      </label>
      <div className="mt-1">
        {children({ id, 'aria-describedby': describedBy, 'aria-invalid': error ? true : undefined })}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : helper ? (
        <p id={`${id}-helper`} className="mt-1 text-xs text-ink-muted">
          {helper}
        </p>
      ) : null}
    </div>
  );
};
