import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Mail, Wrench } from 'lucide-react';
import AuthCard from './components/AuthCard';
import KyButton from '../../components/ui/KyButton';
import { KyInput } from '../../components/ui/KyField';
import { requestPasswordReset } from './passwordService';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [developmentUrl, setDevelopmentUrl] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setError('Please enter a valid institutional email address.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const result = await requestPasswordReset(email.trim());
      setDevelopmentUrl(result.development_url ?? '');
      setSent(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The reset request could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthCard
        title="Check your email"
        subtitle={email}
        footer={<Link to="/login" className="text-xs font-semibold text-kyu-blue hover:underline inline-flex items-center gap-1"><ArrowLeft size={12} /> Back to Sign In</Link>}
      >
        <div className="text-center">
          <CheckCircle2 size={32} className="mx-auto text-green-500" />
          <p className="mt-2 text-sm text-gray-600">If an eligible account exists for <span className="font-semibold">{email}</span>, a secure reset link has been issued. It expires in 30 minutes and works once.</p>
        </div>

        {developmentUrl && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <p className="font-bold flex items-center gap-1.5"><Wrench size={14} /> Development testing shortcut</p>
            <p className="mt-1">Email delivery is currently logged by the development server. Use this secure one-time link to test the complete flow in the portal.</p>
            <a href={developmentUrl} className="mt-3 inline-flex rounded-lg bg-kyu-blue px-3 py-2 font-bold text-white hover:bg-kyu-blue-dark">Open password reset</a>
          </div>
        )}
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="We will issue a secure, one-time reset link"
      footer={<Link to="/login" className="text-xs font-semibold text-kyu-blue hover:underline inline-flex items-center gap-1"><ArrowLeft size={12} /> Back to Sign In</Link>}
    >
      <form onSubmit={submit} className="space-y-4">
        <KyInput
          label="Institutional Email"
          type="email"
          placeholder="name@kyu.ac.ug"
          help="Use the email your account was created with."
          error={error || undefined}
          value={email}
          onChange={(event) => { setEmail(event.target.value); setError(''); }}
        />
        <KyButton type="submit" loading={loading} className="w-full" icon={<Mail size={16} />}>Send Reset Link</KyButton>
      </form>
    </AuthCard>
  );
}
