import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CheckCircle2, KeyRound, Unlink } from 'lucide-react';
import AuthCard from './components/AuthCard';
import KyButton from '../../components/ui/KyButton';
import { KyInput } from '../../components/ui/KyField';
import PasswordChecklist, { isStrongPassword } from './components/PasswordChecklist';
import { resetPassword } from './passwordService';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  if (!token || !email) {
    return (
      <AuthCard title="Reset link not valid" subtitle="The link is missing its security details">
        <div className="text-center">
          <Unlink size={32} className="mx-auto text-red-400" />
          <p className="mt-2 text-sm text-gray-600">This reset link is incomplete or has expired. Request a new one—it only takes a minute.</p>
          <Link to="/forgot-password"><KyButton variant="accent" className="mt-4">Request a New Link</KyButton></Link>
        </div>
      </AuthCard>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isStrongPassword(password)) {
      setError('Your password does not meet all the requirements below yet.');
      return;
    }
    if (password !== confirmation) {
      setError('The two passwords do not match.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await resetPassword(email, token, password);
      setDone(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The password could not be updated.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthCard title="Password updated" subtitle="You can now sign in with your new password">
        <div className="text-center">
          <CheckCircle2 size={40} className="mx-auto text-green-500" />
          <h2 className="mt-3 font-bold text-gray-800">All set</h2>
          <p className="text-sm text-gray-500 mt-1">Your old password and all previous portal sessions are no longer valid.</p>
          <Link to="/login"><KyButton variant="accent" className="mt-5">Go to Sign In</KyButton></Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set a new password" subtitle={`Resetting access for ${email}`}>
      <form onSubmit={submit} className="space-y-4">
        <KyInput label="New password" type="password" placeholder="••••••••••••" value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} />
        <PasswordChecklist password={password} />
        <KyInput label="Confirm password" type="password" placeholder="Repeat it exactly" help="Must match the password above." error={error || undefined} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError(''); }} />
        <KyButton type="submit" loading={loading} className="w-full" icon={<KeyRound size={16} />}>Update Password</KyButton>
      </form>
    </AuthCard>
  );
}
