import { useEffect, useState } from 'react';
import { Camera, KeyRound, Save, Trash2, UserRound } from 'lucide-react';
import KyPageHeader from '../../components/ui/KyPageHeader';
import KyButton from '../../components/ui/KyButton';
import { KyInput } from '../../components/ui/KyField';
import ProfileAvatar from '../../components/ProfileAvatar';
import { useAuth } from '../auth/AuthContext';
import { roleLabels } from '../users/types';
import { useToast } from '../../components/ui/KyToast';
import { removePersonalPhoto, updatePersonalPassword, updatePersonalProfile } from './profileService';

export default function MyAccountPage() {
  const { user, refreshUser } = useAuth();
  const { toast } = useToast();
  const [title, setTitle] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [photo, setPhoto] = useState<File | undefined>();
  const [saving, setSaving] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    setTitle(user?.title ?? '');
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
  }, [user]);

  const save = async () => {
    setSaving(true);
    try {
      await updatePersonalProfile({ title, firstName, lastName, photo });
      await refreshUser();
      setPhoto(undefined);
      toast('Your personal profile was updated.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Your profile could not be updated.', 'error');
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    setChanging(true);
    try {
      await updatePersonalPassword(currentPassword, password, confirmation);
      setCurrentPassword(''); setPassword(''); setConfirmation('');
      toast('Your password was changed. Other signed-in devices were disconnected.', 'success');
    } catch (error) {
      toast(error instanceof Error ? error.message : 'Your password could not be changed.', 'error');
    } finally { setChanging(false); }
  };

  const removePhoto = async () => {
    try {
      await removePersonalPhoto();
      await refreshUser();
      toast('Your profile photo was removed.', 'success');
    } catch (error) { toast(error instanceof Error ? error.message : 'The photo could not be removed.', 'error'); }
  };

  return <div className="space-y-6">
    <KyPageHeader title="My Account" subtitle="Personal details and security settings that affect only your account" />
    <div className="grid gap-6 xl:grid-cols-2">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><UserRound size={20} /> Personal profile</h2>
        <p className="mt-1 text-xs text-slate-500">Your role and institutional email remain governed by an authorised administrator.</p>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-center">
          <ProfileAvatar user={user} className="h-20 w-20 text-xl" />
          <div className="min-w-0 flex-1">
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Camera size={16} /> Choose photo
              <input type="file" className="sr-only" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0])} />
            </label>
            {photo && <p className="mt-1 truncate text-xs text-slate-500">Selected: {photo.name}</p>}
            {user?.hasProfilePhoto && <button type="button" onClick={() => void removePhoto()} className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-red-600"><Trash2 size={13} /> Remove</button>}
            <p className="mt-2 text-[11px] text-slate-400">JPG, PNG or WebP · maximum 2 MB.</p>
          </div>
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          <KyInput label="Title" value={title} maxLength={20} onChange={(event) => setTitle(event.target.value)} placeholder="Dr." />
          <KyInput label="First name" required value={firstName} maxLength={80} onChange={(event) => setFirstName(event.target.value)} />
          <KyInput label="Last name" required value={lastName} maxLength={80} onChange={(event) => setLastName(event.target.value)} />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <KyInput label="Institutional email" value={user?.email ?? ''} disabled />
          <KyInput label="Governed role" value={user ? roleLabels[user.role] : ''} disabled />
          {user?.faculty && <KyInput label="Faculty / School" value={user.faculty} disabled />}
          {user?.department && <KyInput label="Department" value={user.department} disabled />}
        </div>
        <div className="mt-5"><KyButton icon={<Save size={16} />} loading={saving} disabled={!firstName.trim() || !lastName.trim()} onClick={() => void save()}>Save personal profile</KyButton></div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800"><KeyRound size={20} /> Password</h2>
        <p className="mt-1 text-xs text-slate-500">Use at least 12 characters with upper and lower case letters, a number and a symbol.</p>
        <div className="mt-5 space-y-4">
          <KyInput label="Current password" type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} />
          <KyInput label="New password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
          <KyInput label="Confirm new password" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        </div>
        <div className="mt-5"><KyButton loading={changing} disabled={!currentPassword || !password || !confirmation} onClick={() => void changePassword()}>Change password</KyButton></div>
      </section>
    </div>
  </div>;
}
