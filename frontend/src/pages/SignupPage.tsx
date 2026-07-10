import { FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Box, Building2 } from 'lucide-react';
import { useAuth } from '@/components/AuthProvider';
import { Button, Field, Input, PasswordInput, Textarea } from '@/components/ui';

const blueprintGrid = {
  backgroundImage:
    'linear-gradient(to right, rgba(143,174,245,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(143,174,245,0.05) 1px, transparent 1px)',
  backgroundSize: '36px 36px',
};

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
    <div className="flex min-h-[100dvh] items-center overflow-x-hidden bg-[#0A0A0C] p-4 sm:p-6" style={blueprintGrid}>
      <div className="mx-auto grid w-full max-w-5xl overflow-hidden rounded-2xl border border-slate-800 bg-[#0E0E11] shadow-2xl shadow-black/60 md:grid-cols-2">
        <aside className="relative hidden border-r border-slate-800/80 p-8 md:flex md:flex-col md:justify-between">
          <div>
            <Link to="/" className="flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-sky-700 text-white">
                <Box className="h-5 w-5" />
              </span>
              <span className="font-display text-2xl text-white">ForgeQuote</span>
            </Link>
            <p className="mt-6 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-[#8FAEF5]">
              SEC-00 // New Workspace
            </p>
            <h2 className="mt-3 max-w-sm font-display text-3xl leading-tight text-white">
              Set up your <span className="text-[#A8C2FF]">quoting desk.</span>
            </h2>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              Create your secure workspace for professional CNC quotations.
            </p>
          </div>
          <div className="rounded-xl border border-slate-800 bg-[#131317] p-4">
            <p className="font-mono text-[11px] uppercase tracking-wider text-slate-500">Branded output</p>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-400">
              Company profile details are used in generated PDF quotations for a branded output.
            </p>
          </div>
        </aside>

        <form onSubmit={onSubmit} className="flex w-full flex-col justify-center gap-4 bg-white p-6 sm:p-9">
          <div className="mb-1 flex items-center gap-2 text-sky-700">
            <Building2 className="h-5 w-5" />
            <span className="font-mono text-xs font-semibold uppercase tracking-[0.2em]">Company Registration</span>
          </div>

          <div>
            <h1 className="font-display text-3xl text-slate-900">Create account</h1>
            <p className="mt-1 text-sm text-slate-600">Set up your profile and start quoting.</p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Full name" required>
              {(props) => (
                <Input
                  {...props}
                  type="text"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Email" required>
              {(props) => (
                <Input
                  {...props}
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              )}
            </Field>
          </div>

          <Field
            label="Password"
            required
            helper="Use 10-72 bytes with uppercase, lowercase, number, and special symbol."
          >
            {(props) => (
              <PasswordInput
                {...props}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={10}
                required
              />
            )}
          </Field>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Company name" required>
              {(props) => (
                <Input
                  {...props}
                  type="text"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  required
                />
              )}
            </Field>
            <Field label="Company logo (optional)">
              {(props) => (
                <Input
                  {...props}
                  type="file"
                  accept=".png,.jpg,.jpeg,.svg,.webp"
                  onChange={(e) => setLogo(e.target.files?.[0])}
                  className="file:mr-2 file:rounded-md file:border-0 file:bg-slate-100 file:px-2 file:py-1 file:text-slate-700"
                />
              )}
            </Field>
          </div>

          <Field label="Company address" required>
            {(props) => (
              <Textarea
                {...props}
                value={companyAddress}
                onChange={(e) => setCompanyAddress(e.target.value)}
                required
                rows={3}
              />
            )}
          </Field>

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <Button type="submit" variant="accent" size="lg" loading={loading} className="mt-1 w-full">
            {loading ? 'Creating account…' : 'Sign up securely'}
            {!loading && <ArrowRight className="h-4 w-4" />}
          </Button>

          <p className="text-center text-sm text-slate-600">
            Already have an account?{' '}
            <Link to="/login" className="font-semibold text-sky-700 hover:text-sky-800">
              Login
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
};

export default SignupPage;
