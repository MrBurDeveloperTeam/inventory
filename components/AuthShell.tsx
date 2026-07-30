import React from 'react';
import { Moon, Sun } from 'lucide-react';

type AuthView = 'login' | 'signup';

interface AuthShellProps {
  view: AuthView;
  theme: string;
  onViewChange: (view: AuthView) => void;
  onThemeToggle: () => void;
  children: React.ReactNode;
}

const AuthShell: React.FC<AuthShellProps> = ({
  view,
  theme,
  onViewChange,
  onThemeToggle,
  children,
}) => (
  <div className="min-h-screen bg-slate-100 flex flex-col">
    <header className="sticky top-0 z-50 w-full bg-white/80 backdrop-blur-2xl border-b border-slate-200/50 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
      <div className="w-full flex items-center justify-between py-4 sm:py-5 px-4 sm:px-7">
        <a
          href="https://app.snabbb.com"
          className="font-extrabold text-xl sm:text-2xl tracking-tighter text-slate-900"
          aria-label="Go to App.Snabbb"
        >
          <span className="inline-block -skew-x-[7deg]">App.</span>{' '}
          <span className="inline-block -skew-x-[7deg] text-tiffany-600">Snabbb.</span>
        </a>

        <nav className="flex items-center gap-1 sm:gap-5" aria-label="Authentication navigation">
          <button
            type="button"
            onClick={onThemeToggle}
            className="w-10 h-10 grid place-items-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => onViewChange('login')}
            className={`px-3 sm:px-4 py-2 font-bold text-sm sm:text-base transition-colors ${
              view === 'login' ? 'text-tiffany-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => onViewChange('signup')}
            className="px-4 sm:px-6 py-2.5 bg-tiffany-600 text-white font-bold rounded-xl text-sm shadow-lg shadow-tiffany-600/20 hover:bg-tiffany-700 transition-all"
          >
            Sign Up
          </button>
        </nav>
      </div>
    </header>

    <main className="flex-1 flex items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
      {children}
    </main>

    <footer className="w-full max-w-7xl mx-auto px-6 mt-auto pb-8 sm:pb-12">
      <div className="py-8 sm:py-10 border-t border-slate-200 flex flex-col md:flex-row items-center justify-between gap-6">
        <p className="text-slate-400 text-sm font-bold">© 2026 Snabbb Apps Gallery.</p>
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8">
          {[
            ['Privacy', 'https://app.snabbb.com/privacy'],
            ['Terms', 'https://app.snabbb.com/terms'],
            ['Disclaimer', 'https://app.snabbb.com/disclaimer'],
          ].map(([label, href]) => (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-tiffany-600 transition-colors text-xs font-black uppercase tracking-widest"
            >
              {label}
            </a>
          ))}
        </div>
      </div>
    </footer>
  </div>
);

export default AuthShell;
