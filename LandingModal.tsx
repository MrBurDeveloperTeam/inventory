import React, { useEffect, useState } from 'react';
import { supabase } from './supabaseClient';
import { User, Building2, ChevronDown } from 'lucide-react';
import { UserProfile } from './types';

interface LandingModalProps {
  onLogin: (user: UserProfile) => void;
}

const LandingModal: React.FC<LandingModalProps> = ({ onLogin }) => {
  const [view, setView] = useState<'signup' | 'login'>('signup');
  const [accountType, setAccountType] = useState<'individual' | 'company'>('individual');

  // Form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [position, setPosition] = useState('');
  const [companyName, setCompanyName] = useState('');

  // Password states (FIX: no hardcoded passwords)
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UX states
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const inputClass =
    'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#004aad]/20 focus:border-[#004aad] transition-all text-sm';
  const labelClass = 'block text-xs font-semibold text-slate-600 mb-1';

  const resetAuthFields = () => {
    setPassword('');
    setConfirmPassword('');
    setErrorMsg(null);
  };

  // Clear sensitive fields when switching views
  useEffect(() => {
    resetAuthFields();
  }, [view, accountType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setLoading(true);

    try {
      if (!email.trim()) {
        setErrorMsg('Please enter your email.');
        return;
      }
      if (!password) {
        setErrorMsg('Please enter your password.');
        return;
      }

      if (view === 'signup') {
        if (password !== confirmPassword) {
          setErrorMsg('Passwords do not match.');
          return;
        }

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              name,
              account_type: accountType,
              phone,
              position,
              company_name: accountType === 'company' ? companyName : null,
            },
          },
        });

        if (error) throw error;

        if (data.user) {
          const profile: UserProfile = {
            name,
            email: data.user.email || email.trim(),
            accountType,
            phone,
            position,
            companyName: accountType === 'company' ? companyName : undefined,
          };
          onLogin(profile);
        } else {
          // Some projects require email confirmation before session is created
          setErrorMsg('Sign up successful. Please check your email to confirm your account.');
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;

        if (data.user) {
          const inferredAccountType = (data.user.user_metadata?.account_type as any) || (email.trim().toLowerCase() === 'admin123@gmail.com' ? 'admin' : 'individual');
          const profile: UserProfile = {
            name: data.user.user_metadata?.name || data.user.email || 'User',
            email: data.user.email || email.trim(),
            accountType: inferredAccountType,
            phone: data.user.user_metadata?.phone || '',
            position: data.user.user_metadata?.position || '',
            companyName: data.user.user_metadata?.company_name,
          };
          onLogin(profile);
        }
      }
    } catch (err) {
      console.error('Auth error', err);
      setErrorMsg((err as Error).message || 'Authentication failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center">
      <div className="w-full min-h-screen sm:min-h-0 sm:max-w-sm bg-white sm:rounded-[1.5rem] shadow-none sm:shadow-2xl p-6 md:p-8 animate-in fade-in sm:zoom-in-95 duration-300 flex flex-col justify-center">
        {view === 'signup' ? (
          <div className="flex flex-col gap-4">
            <div className="text-center">
              <h2 className="text-lg font-bold text-slate-800">Account Type</h2>
            </div>

            {/* Account Type Toggle */}
            <div className="flex bg-slate-50 p-1 rounded-xl border border-slate-100">
              <button
                type="button"
                onClick={() => setAccountType('individual')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-xs transition-all ${
                  accountType === 'individual'
                    ? 'bg-[#004aad] text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                <User className="w-3.5 h-3.5" /> Individual
              </button>
              <button
                type="button"
                onClick={() => setAccountType('company')}
                className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg font-bold text-xs transition-all ${
                  accountType === 'company'
                    ? 'bg-[#004aad] text-white shadow-md'
                    : 'text-slate-500 hover:bg-slate-200'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" /> Company
              </button>
            </div>

            {!!errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-3">
              {accountType === 'individual' ? (
                <>
                  <div>
                    <label className={labelClass}>Your Name</label>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g. Nour AYACHE"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Your Email</label>
                    <input
                      type="email"
                      className={inputClass}
                      placeholder="e.g. nour@gmail.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                    <p className="text-[10px] text-slate-400 mt-0.5">This will be your login email</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelClass}>Company Name</label>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="e.g. DENTA TECH"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Company Email</label>
                    <input
                      type="email"
                      className={inputClass}
                      placeholder="e.g. hello@denta.tech"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <label className={labelClass}>Name</label>
                    <input
                      type="text"
                      className={inputClass}
                      placeholder="Contact Name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      required
                    />
                  </div>
                </>
              )}

              <div>
                <label className={labelClass}>{accountType === 'individual' ? 'Phone (WhatsApp)' : 'Phone'}</label>
                <input
                  type="tel"
                  className={inputClass}
                  placeholder="e.g. +123..."
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Job Position</label>
                <div className="relative">
                  <select
                    className={`${inputClass} appearance-none pr-8`}
                    value={position}
                    onChange={(e) => setPosition(e.target.value)}
                    required
                  >
                    <option value="">-- Select Position --</option>
                    <option value="Dentist">Dentist</option>
                    <option value="Assistant">Assistant</option>
                    <option value="Clinic Manager">Clinic Manager</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className={labelClass}>Password</label>
                <input
                  type="password"
                  className={inputClass}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <div>
                <label className={labelClass}>Confirm Password</label>
                <input
                  type="password"
                  className={inputClass}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full text-white py-3 rounded-xl font-bold text-base transition-all shadow-lg shadow-blue-100 mt-2 ${
                  loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#004aad] hover:bg-[#003a8a]'
                }`}
              >
                {loading ? 'Signing up…' : 'Sign up'}
              </button>
            </form>

            <div className="text-center pt-1">
              <button
                type="button"
                onClick={() => setView('login')}
                className="text-[#004aad] font-bold text-xs hover:underline"
              >
                Already have an account?
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="text-center">
              <h2 className="text-xl font-bold text-slate-800">Welcome Back</h2>
            </div>

            {!!errorMsg && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className={labelClass}>Email</label>
                <input
                  type="email"
                  className={inputClass}
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">Password</label>
                  <button
                    type="button"
                    className="text-[#004aad] text-[10px] font-bold hover:underline"
                    onClick={() => setErrorMsg('Password reset is not implemented yet.')}
                  >
                    Forgot?
                  </button>
                </div>
                <input
                  type="password"
                  className={inputClass}
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full text-white py-3.5 rounded-xl font-bold text-base transition-all shadow-xl shadow-blue-100 ${
                  loading ? 'bg-slate-400 cursor-not-allowed' : 'bg-[#004aad] hover:bg-[#003a8a]'
                }`}
              >
                {loading ? 'Logging in…' : 'Log in'}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => setView('signup')}
                className="text-[#004aad] font-bold text-xs hover:underline"
              >
                Don't have an account? Sign up
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LandingModal;
