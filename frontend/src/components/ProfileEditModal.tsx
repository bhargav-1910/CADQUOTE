import { FormEvent, useEffect, useState } from 'react';
import { Building2, Loader2, Phone, Upload, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import AccountSecurityPanel from '@/components/AccountSecurityPanel';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
}

const ProfileEditModal = ({ open, onClose }: ProfileEditModalProps) => {
  const { user, updateProfile } = useAuth();
  const [fullName, setFullName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [gstin, setGstin] = useState('');
  const [brandColor, setBrandColor] = useState('#0284c7');
  const [logo, setLogo] = useState<File | undefined>(undefined);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) {
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
  }, [open, user]);

  // Deliberately keyed on `open` alone, not `user`: a successful save updates
  // the `user` object from context, which would otherwise re-run an
  // `[open, user]` effect and reset `saved` back to false before the
  // confirmation message ever gets painted.
  useEffect(() => {
    if (open) {
      setSaved(false);
    }
  }, [open]);

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

  if (!open || !user) {
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
      setSaved(true);
      window.setTimeout(onClose, 1100);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-sm">
      <div className="max-h-[90dvh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Profile Settings</h2>
            <p className="text-sm text-slate-500 mt-0.5">Update your public details used in quotes and PDF branding.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-5 px-6 py-6">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_220px]">
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <User className="h-3.5 w-3.5" />
                    Full name
                  </span>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </label>

                <label className="text-sm text-slate-700">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <Building2 className="h-3.5 w-3.5" />
                    Company name
                  </span>
                  <input
                    type="text"
                    value={companyName}
                    onChange={(e) => setCompanyName(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                  />
                </label>
              </div>

              <label className="block text-sm text-slate-700">
                <span className="font-medium">Company address</span>
                <textarea
                  rows={4}
                  value={companyAddress}
                  onChange={(e) => setCompanyAddress(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>

              <label className="text-sm text-slate-700 block">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Phone className="h-3.5 w-3.5" />
                  Phone number
                </span>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>

              <label className="text-sm text-slate-700 block">
                <span className="font-medium">GSTIN</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Shown on quote PDFs; drives CGST/SGST vs IGST breakup when the customer's GSTIN is known.
                </span>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AAPCA1234F1Z5"
                  maxLength={15}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm font-mono focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-100"
                />
              </label>

              <label className="text-sm text-slate-700 block">
                <span className="font-medium">Brand accent color</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Used on your quote PDFs and the customer quote page.
                </span>
                <span className="mt-2 flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-slate-300 bg-white p-0.5"
                  />
                  <span className="font-mono text-xs text-slate-600">{brandColor}</span>
                  {['#0284c7', '#1d4ed8', '#0f766e', '#b91c1c', '#7c3aed', '#0f172a'].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setBrandColor(preset)}
                      className={`h-6 w-6 rounded-full border-2 ${
                        brandColor === preset ? 'border-slate-900' : 'border-white shadow'
                      }`}
                      style={{ backgroundColor: preset }}
                      title={preset}
                    />
                  ))}
                </span>
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 h-fit">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Company Logo</p>
              <div className="aspect-square w-full rounded-lg border border-slate-200 bg-white flex items-center justify-center overflow-hidden">
                {(logoPreviewUrl || user.company_logo_url) ? (
                  <img
                    src={logoPreviewUrl || user.company_logo_url || ''}
                    alt="Company logo preview"
                    className="h-full w-full object-contain p-3"
                  />
                ) : (
                  <div className="text-center text-slate-400 text-xs px-4">
                    <Upload className="h-5 w-5 mx-auto mb-1" />
                    No logo uploaded
                  </div>
                )}
              </div>
              <label className="mt-3 text-sm text-slate-700 block">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  <Upload className="h-3.5 w-3.5" />
                  Upload logo
                </span>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp"
                  onChange={(e) => setLogo(e.target.files?.[0])}
                  className="mt-1 block w-full text-xs text-slate-600 file:mr-2 file:rounded file:border file:border-slate-300 file:bg-white file:px-2 file:py-1 file:text-slate-700"
                />
              </label>
            </div>
          </div>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {saved && (
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Profile saved.
            </p>
          )}

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || saved}
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {saved ? 'Saved' : 'Save Changes'}
            </button>
          </div>
        </form>

        <AccountSecurityPanel />
      </div>
    </div>
  );
};

export default ProfileEditModal;
