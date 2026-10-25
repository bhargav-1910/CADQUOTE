import { FormEvent, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Building2, Phone, Upload, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import AccountSecurityPanel from '@/components/AccountSecurityPanel';
import { useToast } from '@/components/Toast';
import { Button, Field, Input, Textarea } from '@/components/ui';

/** /settings/account: company details used on quotes and PDFs, plus sign-in security. */
const AccountSettings = () => {
  const { user, updateProfile } = useAuth();
  const toast = useToast();
  // Fresh signups land here once, so the first quote already carries their details.
  const location = useLocation();
  const justSignedUp = Boolean((location.state as { justSignedUp?: boolean } | null)?.justSignedUp);
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [brandColor, setBrandColor] = useState('#0284c7');
  const [logo, setLogo] = useState<File | undefined>(undefined);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      return;
    }
    setFullName(user.full_name ?? '');
    setCompanyName(user.company_name ?? '');
    setCompanyAddress(user.company_address ?? '');
    setPhoneNumber(user.phone_number ?? '');
    setGstin(user.gstin ?? '');
    setBrandColor(user.brand_color ?? '#0284c7');
    setLogo(undefined);
    setLogoPreviewUrl(null);
    setError(null);
  }, [user]);

  useEffect(() => {
    if (!logo) {
      setLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(logo);
    setLogoPreviewUrl(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [logo]);

  if (!user) {
    return null;
  }

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await updateProfile({
        full_name: fullName.trim(),
        company_name: companyName.trim(),
        company_address: companyAddress.trim(),
        phone_number: phoneNumber.trim() || undefined,
        gstin: gstin.trim().toUpperCase() || undefined,
        brand_color: brandColor,
        logo,
      });
      toast({ message: 'Account details saved' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      {justSignedUp && (
        <p className="rounded-xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-primary-900 dark:border-primary-500/30 dark:bg-primary-500/10 dark:text-primary-100">
          Welcome to ForgeQuote! Add your company details and logo first. They appear on every quote, PDF and customer page.
        </p>
      )}
      <section className="rounded-2xl border border-edge bg-surface">
        <div className="border-b border-edge px-6 py-5">
          <h1 className="text-xl font-semibold text-ink">Company & profile</h1>
          <p className="mt-0.5 text-sm text-ink-muted">Your details as they appear on quotes and PDF branding.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-5 px-6 py-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_220px]">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label={<span className="inline-flex items-center gap-1.5"><User className="h-3.5 w-3.5" />Full name</span>} required>
                  {(props) => (
                    <Input {...props} autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
                  )}
                </Field>

                <Field label={<span className="inline-flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Company name</span>} required>
                  {(props) => (
                    <Input {...props} autoComplete="organization" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
                  )}
                </Field>
              </div>

              <Field label="Company address" required>
                {(props) => (
                  <Textarea {...props} rows={4} autoComplete="street-address" value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} required />
                )}
              </Field>

              <Field label={<span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />Phone number</span>}>
                {(props) => (
                  <Input {...props} type="tel" autoComplete="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} placeholder="+91 98765 43210" />
                )}
              </Field>

              <Field
                label="GSTIN"
                helper="Shown on quote PDFs; drives CGST/SGST vs IGST breakup when the customer's GSTIN is known."
              >
                {(props) => (
                  <Input
                    {...props}
                    value={gstin}
                    onChange={(e) => setGstin(e.target.value.toUpperCase())}
                    placeholder="27AAPCA1234F1Z5"
                    maxLength={15}
                    className="font-mono"
                  />
                )}
              </Field>

              <div>
                <label htmlFor="brand-color" className="block text-sm font-medium text-ink-secondary">Brand accent color</label>
                <p className="mt-0.5 text-xs text-ink-muted">Used on your quote PDFs and the customer quote page.</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    id="brand-color"
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-10 w-12 cursor-pointer rounded-lg border border-edge-strong bg-surface p-0.5"
                  />
                  <span className="font-mono text-xs text-ink-secondary">{brandColor}</span>
                  {['#0284c7', '#1d4ed8', '#0f766e', '#b91c1c', '#7c3aed', '#0f172a'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBrandColor(preset)}
                      aria-label={`Use ${preset}`}
                      aria-pressed={brandColor === preset}
                      className={`h-8 w-8 rounded-full border-2 transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 ${
                        brandColor === preset ? 'border-ink' : 'border-surface shadow'
                      }`}
                      style={{ backgroundColor: preset }}
                      title={preset}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-edge bg-surface-muted p-4 h-fit">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-2">Company Logo</p>
              <div className="aspect-square w-full rounded-lg border border-edge bg-white flex items-center justify-center overflow-hidden">
                {(logoPreviewUrl || user.company_logo_url) ? (
                  <img
                    src={logoPreviewUrl || user.company_logo_url || ''}
                    alt="Company logo preview"
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <div className="text-center text-ink-muted text-xs px-4">
                    <Upload className="h-5 w-5 mx-auto mb-1" />
                    No logo uploaded
                  </div>
                )}
              </div>
              <label className="mt-3 text-sm text-ink-secondary block">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Upload className="h-3.5 w-3.5" />
                  Upload logo
                </span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  onChange={(e) => setLogo(e.target.files?.[0])}
                  className="mt-1 block w-full text-xs text-ink-secondary file:mr-2 file:rounded-lg file:border file:border-edge-strong file:bg-surface file:px-3 file:py-2 file:text-ink-secondary"
                />
              </label>
            </div>
          </div>

          {error && <p role="alert" className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">{error}</p>}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-edge">
            <Button type="submit" loading={saving}>
              Save changes
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-edge bg-surface">
        <h2 className="px-6 pt-5 text-lg font-semibold text-ink">Sign-in & security</h2>
        <AccountSecurityPanel />
      </section>
    </div>
  );
};

export default AccountSettings;
