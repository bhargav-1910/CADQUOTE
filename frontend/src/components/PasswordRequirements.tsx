import { Check, X } from 'lucide-react';

/**
 * Live checklist mirroring the server-side password policy.
 *
 * This is a usability aid only — the server re-validates every rule, including
 * the common-password and identity-reuse checks that are not shown here.
 */
export const PASSWORD_MIN_LENGTH = 12;

export interface PasswordRule {
  label: string;
  test: (value: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  { label: `At least ${PASSWORD_MIN_LENGTH} characters`, test: (v) => v.length >= PASSWORD_MIN_LENGTH },
  { label: 'One uppercase letter', test: (v) => /[A-Z]/.test(v) },
  { label: 'One lowercase letter', test: (v) => /[a-z]/.test(v) },
  { label: 'One number', test: (v) => /\d/.test(v) },
  { label: 'One special character', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export const meetsPasswordPolicy = (value: string): boolean =>
  PASSWORD_RULES.every((rule) => rule.test(value));

const PasswordRequirements = ({ value }: { value: string }) => (
  <ul className="grid gap-1.5 sm:grid-cols-2" aria-live="polite">
    {PASSWORD_RULES.map((rule) => {
      const passed = rule.test(value);
      return (
        <li
          key={rule.label}
          className={`flex items-center gap-1.5 text-xs ${passed ? 'text-emerald-700' : 'text-slate-500'}`}
        >
          {passed ? (
            <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />
          ) : (
            <X className="h-3.5 w-3.5 shrink-0" aria-hidden />
          )}
          <span>{rule.label}</span>
          <span className="sr-only">{passed ? ' — met' : ' — not met'}</span>
        </li>
      );
    })}
  </ul>
);

export default PasswordRequirements;
