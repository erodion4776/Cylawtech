import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  Scale, Mail, Lock, ShieldAlert, CheckCircle2, 
  ArrowRight, Loader2
} from 'lucide-react';

export default function Auth() {
  useDocumentTitle('Lex AI - Sign In');
  const navigate = useNavigate();
  const location = useLocation();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const from = (location.state as any)?.from?.pathname || '/lex-ai';

  // Handle Standard Email & Password Auth
  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email.trim() || !password.trim()) {
      setErrorMsg('Please provide both your email address and password.');
      return;
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;

        if (data.user && data.session === null) {
          setSuccessMsg('Registration successful! Please check your email inbox to verify your account.');
          setEmail('');
          setPassword('');
        } else {
          navigate(from, { replace: true });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password,
        });

        if (error) throw error;
        navigate(from, { replace: true });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed. Please verify your credentials.');
    } finally {
      setLoading(false);
    }
  };

  // Handle Google / Gmail OAuth
  const handleGoogleLogin = async () => {
    setErrorMsg(null);
    setGoogleLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}${from}`,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to connect with Google. Please ensure Google is enabled in Supabase.');
      setGoogleLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f9fafb] dark:bg-[#0f0f13] flex flex-col justify-center items-center p-4 font-sans relative">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-32 w-80 h-80 bg-amber-100/40 dark:bg-amber-900/10 rounded-full blur-3xl" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-[#17171c] border border-slate-200 dark:border-slate-800 p-7 sm:p-9 rounded-[2.5rem] shadow-2xl relative z-10"
      >
        {/* Brand Logo Header */}
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-slate-900 dark:bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-md">
            <Scale size={24} className="text-white dark:text-[#B4975A]" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isSignUp ? 'Create Workspace' : 'Welcome to Lex AI'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1 leading-relaxed">
            {isSignUp 
              ? 'Join Nigeria & US legal intelligence workspace.' 
              : 'Sign in to access your consultations and legal drafts.'
            }
          </p>
        </div>

        {/* ONE-CLICK GOOGLE SIGN IN BUTTON */}
        <button
          onClick={handleGoogleLogin}
          disabled={googleLoading}
          type="button"
          className="w-full py-3.5 px-4 bg-white dark:bg-[#202026] hover:bg-slate-50 dark:hover:bg-[#282830] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-white font-bold text-sm rounded-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-sm mb-5 cursor-pointer disabled:opacity-60"
        >
          {googleLoading ? (
            <Loader2 size={18} className="animate-spin text-blue-600" />
          ) : (
            <>
              {/* Official Google SVG Logo */}
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              <span>Continue with Google</span>
            </>
          )}
        </button>

        <div className="relative flex items-center justify-center mb-5">
          <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
          <span className="absolute bg-white dark:bg-[#17171c] px-3 text-[10px] uppercase font-bold text-slate-400">or with email</span>
        </div>

        {/* Standard Email/Password Form */}
        <form onSubmit={handleAuth} className="space-y-3.5">
          <div className="space-y-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Email</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="counsel@example.com"
                className="w-full bg-slate-50 dark:bg-[#202026] border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/25 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full bg-slate-50 dark:bg-[#202026] border border-slate-200 dark:border-slate-800 rounded-xl py-3 pl-10 pr-4 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-blue-500/25 transition-all"
              />
            </div>
          </div>

          {errorMsg && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-xl flex items-start gap-2 text-xs leading-tight">
              <ShieldAlert size={14} className="shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 rounded-xl flex items-start gap-2 text-xs leading-tight">
              <CheckCircle2 size={14} className="shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 dark:bg-blue-600 dark:hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-98 transition-all shadow-lg shadow-slate-900/10"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <span>{isSignUp ? 'Create Free Account' : 'Sign In'}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* Switch Sign in / Sign Up */}
        <div className="mt-6 text-center">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isSignUp ? 'Already have an account?' : "Don't have a workspace yet?"}{' '}
            <button
              onClick={() => {
                setIsSignUp(!isSignUp);
                setErrorMsg(null);
                setSuccessMsg(null);
              }}
              className="font-bold text-blue-500 hover:underline bg-transparent border-0 cursor-pointer"
            >
              {isSignUp ? 'Sign In' : 'Sign Up Free'}
            </button>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
