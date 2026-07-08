import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Building2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';

const SignupPage = () => {
  const { signup } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [companyAddress, setCompanyAddress] = useState('');
  const [logo, setLogo] = useState<File | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStrongPassword = (value: string): boolean => {
    const byteLength = new TextEncoder().encode(value).length;
    return (
      value.length >= 10
      && byteLength <= 72
      && /[A-Z]/.test(value)
      && /[a-z]/.test(value)
      && /\d/.test(value)
      && /[^A-Za-z0-9]/.test(value)
    );
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (!isStrongPassword(password)) {
      setLoading(false);
      setError('Password must be 10-72 bytes and include uppercase, lowercase, number, and special character.');
      return;
    }

    try {
      await signup({
        full_name: fullName,
        email,
        password,
        company_name: companyName,
        company_address: companyAddress,
        logo,
      });
      navigate('/login', { replace: true, state: { justSignedUp: true, email } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] overflow-x-hidden bg-gradient-to-b from-slate-100 via-slate-100 to-slate-200 p-4 sm:p-6">
      <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-xl shadow-slate-200/60 md:grid-cols-2">
        <aside className="relative hidden p-8 md:flex md:flex-col md:justify-between">
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-sky-100/60 via-white to-slate-100" />
          <div>
            <p className="font-display text-3xl text-slate-900">Start with ForgeQuote</p>
            <p className="mt-2 max-w-sm text-sm text-slate-600">Create your secure workspace for professional CNC quotations.</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-5 text-sm text-slate-600">
            Company profile details are used in generated PDF quotations for a branded output.
          </div>
        </aside>

        <form onSubmit={onSubmit} className="flex w-full flex-col justify-center gap-4 p-6 sm:p-9">
          <div className="mb-1 flex items-center gap-2 text-amber-700">
            <Building2 className="h-5 w-5" />
            <span className="text-sm font-medium">Company Registration</span>
          </div>

          <div>
            <h1 className="font-display text-3xl text-slate-900">Create account</h1>
            <p className="mt-1 text-sm text-slate-600">Set up your profile and start quoting.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">
              Full name
              <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-amber-500" />
            </label>
            <label className="block text-sm text-slate-700">
              Email
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-amber-500" />
            </label>
          </div>

          <label className="block text-sm text-slate-700">
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={10} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-amber-500" />
            <p className="mt-1 text-xs text-slate-500">Use 10-72 bytes with uppercase, lowercase, number, and special symbol.</p>
          </label>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block text-sm text-slate-700">
              Company name
              <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-amber-500" />
            </label>
            <label className="block text-sm text-slate-700">
              Company logo (optional)
              <input
                type="file"
                accept=".png,.jpg,.jpeg,.svg,.webp"
                onChange={(e) => setLogo(e.target.files?.[0])}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-slate-700"
              />
            </label>
          </div>

          <label className="block text-sm text-slate-700">
            Company address
            <textarea value={companyAddress} onChange={(e) => setCompanyAddress(e.target.value)} required rows={3} className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-amber-500" />
          </label>

          {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

          <button type="submit" disabled={loading} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-amber-500 py-2.5 font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60">
            {loading ? 'Creating account...' : 'Sign up securely'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </button>

          <p className="text-center text-sm text-slate-600">
            Already have an account? <Link to="/login" className="font-semibold text-amber-700">Login</Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignupPage;
