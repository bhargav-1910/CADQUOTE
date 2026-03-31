import { FormEvent, useEffect, useState } from 'react';
import { Building2, Loader2, Phone, Upload, User } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

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
  const [logo, setLogo] = useState<File | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !user) {
      return;
    }
    setFullName(user.full_name ?? '');
    setCompanyName(user.company_name ?? '');
    setCompanyAddress(user.company_address ?? '');
    setPhoneNumber(user.phone_number ?? '');
    setLogo(undefined);
    setError(null);
  }, [open, user]);

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
        logo,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[#060e20]/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-3xl border border-[#3a494a] bg-[#171f33] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#3a494a]/60 px-5 py-4">
          <h2 className="font-headline text-lg font-bold uppercase tracking-wider text-[#e9feff]">Operator Profile Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded px-2 py-1 text-sm text-[#b9caca] hover:bg-[#222a3d] hover:text-[#e9feff]"
          >
            Close
          </button>
        </div>

        <form onSubmit={onSubmit} className="space-y-4 px-5 py-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm text-[#b9caca]">
              <span className="inline-flex items-center gap-1.5">
                <User className="h-3.5 w-3.5" />
                Full name
              </span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="mf-input mt-1"
              />
            </label>

            <label className="text-sm text-[#b9caca]">
              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" />
                Company name
              </span>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                required
                className="mf-input mt-1"
              />
            </label>
          </div>

          <label className="block text-sm text-[#b9caca]">
            Company address
            <textarea
              rows={3}
              value={companyAddress}
              onChange={(e) => setCompanyAddress(e.target.value)}
              required
              className="mf-input mt-1"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="text-sm text-[#b9caca]">
              <span className="inline-flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />
                Phone number
              </span>
              <input
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="mf-input mt-1"
              />
            </label>

            <label className="text-sm text-[#b9caca]">
              <span className="inline-flex items-center gap-1.5">
                <Upload className="h-3.5 w-3.5" />
                Company logo
              </span>
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.webp"
                onChange={(e) => setLogo(e.target.files?.[0])}
                className="mf-input mt-1 file:mr-2 file:border-0 file:bg-[#222a3d] file:px-2 file:py-1 file:text-[#dae2fd]"
              />
            </label>
          </div>

          {user.company_logo_url && !logo && (
            <p className="text-xs text-[#b9caca]">Current logo is set. Upload a new file to replace it.</p>
          )}

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <div className="flex items-center justify-end gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="border border-[#3a494a] px-4 py-2 text-sm font-medium text-[#dae2fd] hover:bg-[#222a3d]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="mf-btn-primary inline-flex items-center gap-2 px-4 py-2 text-sm disabled:opacity-60"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProfileEditModal;
