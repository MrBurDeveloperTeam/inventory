
import React, { useEffect, useState } from 'react';
import { User, Mail, Phone, Briefcase, Building2, LogOut, ArrowLeft, ShieldCheck, Upload, Camera } from 'lucide-react';
import { UserProfile } from './types';

interface ProfilePageProps {
  user: UserProfile;
  onLogout: () => void;
  onBack: () => void;
  onUpdateImages: (payload: { type: 'avatar' | 'background'; file: File; previewUrl: string }) => Promise<void>;
}

const ProfilePage: React.FC<ProfilePageProps> = ({ user, onLogout, onBack, onUpdateImages }) => {
  const [avatarPreview, setAvatarPreview] = useState<string | undefined>(user.avatarUrl);
  const [backgroundPreview, setBackgroundPreview] = useState<string | undefined>(user.backgroundUrl);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'avatar' | 'background' | null>(null);

  useEffect(() => {
    setAvatarPreview(user.avatarUrl);
    setBackgroundPreview(user.backgroundUrl);
  }, [user.avatarUrl, user.backgroundUrl]);

  const detailItemClass = "flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100 transition-all hover:bg-white hover:shadow-sm";

  const readFileAsDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>, type: 'avatar' | 'background') => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setUploadError('Please choose an image under 5MB.');
      event.target.value = '';
      return;
    }

    try {
      setUploading(type);
      const dataUrl = await readFileAsDataUrl(file);
      setUploadError(null);
      if (type === 'avatar') setAvatarPreview(dataUrl);
      else setBackgroundPreview(dataUrl);
      await onUpdateImages({ type, file, previewUrl: dataUrl });
    } catch (err: any) {
      console.error('Profile image upload failed', err);
      const message = err?.message ? `Failed to upload the image: ${err.message}` : 'Failed to upload the image. Please try again.';
      setUploadError(message);
    } finally {
      setUploading(null);
    }
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-2xl mx-auto w-full px-4 pt-5 pb-8">
      <div className="mb-8 flex items-center justify-between">
        <button 
          onClick={onBack}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-white transition-all font-bold text-sm shadow-sm border border-transparent hover:border-slate-100"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] shadow-xl shadow-slate-200/50 overflow-hidden border border-slate-100">
        {/* Profile Header */}
        <div 
          className="px-8 pt-16 pb-12 text-white flex flex-col items-center gap-5 relative overflow-hidden"
          style={{
            backgroundImage: backgroundPreview ? `url(${backgroundPreview})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundColor: '#004aad'
          }}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-[#004aad]/20 to-[#004aad] pointer-events-none" />

          <div className="absolute top-4 right-4">
            <label
              htmlFor="background-upload"
              className="flex items-center gap-2 px-3 py-2 rounded-full bg-white/90 text-[#004aad] text-xs font-bold uppercase tracking-[0.10em] shadow-lg shadow-blue-500/20 cursor-pointer hover:bg-white"
            >
              <Upload className="w-4 h-4" /> Change cover
            </label>
            <input
              id="background-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'background')}
            />
          </div>

          <div className="relative">
            <div className="w-28 h-28 rounded-full bg-white/15 backdrop-blur-md flex items-center justify-center border-4 border-white/50 text-3xl font-black shadow-xl overflow-hidden">
              {avatarPreview ? (
                <img src={avatarPreview} alt={`${user.name} avatar`} className="w-full h-full object-cover" />
              ) : (
                user.name.split(' ').map(n => n[0]).join('').toUpperCase()
              )}
            </div>
            <label
              htmlFor="avatar-upload"
              className="absolute -bottom-1 -right-1 w-9 h-9 rounded-full bg-white text-[#004aad] border-2 border-white shadow-lg flex items-center justify-center cursor-pointer hover:scale-105 transition-transform"
              title="Upload profile image"
            >
              <Camera className="w-4 h-4" />
            </label>
            <input
              id="avatar-upload"
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileChange(e, 'avatar')}
            />
          </div>
          <div className="text-center relative z-10">
            <h2 className="text-2xl font-bold">{user.name}</h2>
            <p className="text-white/90 text-md font-medium">{user.position}</p>
          </div>
        </div>

        {/* Profile Details */}
        <div className="p-8 md:p-10 flex flex-col gap-6">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
            {uploadError && (
              <span className="text-[11px] font-semibold text-rose-500 bg-rose-50 border border-rose-100 px-3 py-1 rounded-full">
                {uploadError}
              </span>
            )}
            {uploading && !uploadError && (
              <span className="text-[11px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                Uploading {uploading === 'avatar' ? 'profile' : 'cover'} image...
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className={detailItemClass}>
              <div className="bg-blue-100 p-2.5 rounded-xl text-blue-600">
                <Mail className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">Email Address</span>
                <span className="text-sm font-bold text-slate-700 truncate max-w-[180px]">{user.email}</span>
              </div>
            </div>

            <div className={detailItemClass}>
              <div className="bg-emerald-100 p-2.5 rounded-xl text-emerald-600">
                <Phone className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">Phone Number</span>
                <span className="text-sm font-bold text-slate-700">{user.phone}</span>
              </div>
            </div>

            <div className={detailItemClass}>
              <div className="bg-purple-100 p-2.5 rounded-xl text-purple-600">
                <User className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">Account Type</span>
                <span className="text-sm font-bold text-slate-700 capitalize">{user.accountType}</span>
              </div>
            </div>

            <div className={detailItemClass}>
              <div className="bg-orange-100 p-2.5 rounded-xl text-orange-600">
                <Briefcase className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">Job Role</span>
                <span className="text-sm font-bold text-slate-700">{user.position}</span>
              </div>
            </div>
          </div>

          {user.accountType === 'company' && (
            <div className={`${detailItemClass} w-full`}>
              <div className="bg-slate-200 p-2.5 rounded-xl text-slate-600">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-[0.1em]">Company Organization</span>
                <span className="text-sm font-bold text-slate-700">{user.companyName}</span>
              </div>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-100">
            <button 
              onClick={onLogout}
              className="w-full flex items-center justify-center gap-3 py-4 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 transition-all font-black uppercase text-xs tracking-[0.2em] border border-rose-100"
            >
              <LogOut className="w-5 h-5" /> Sign out of account
            </button>
          </div>
        </div>
      </div>
      
      <p className="text-center text-[10px] text-slate-400 mt-8 font-medium uppercase tracking-widest">
        DentaStock Pro v2.5.0 • Clinical Inventory Management
      </p>
    </div>
  );
};

export default ProfilePage;
