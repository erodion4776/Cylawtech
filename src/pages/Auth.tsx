import React, { useState } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  Scale, Mail, Lock, ShieldAlert, CheckCircle2, 
  ArrowRight, Loader2, Chrome, Facebook
} from 'lucide-react';

export default function Auth() {
  useDocumentTitle('Lex AI - Sign In');
  const navigate = useNavigate();
  const location = useLocation();

  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
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
        // Sign Up
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
        // Log In
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

  // Handle OAuth Social Providers (Google, Facebook, Yahoo)
  const handleSocialLogin = async (provider: 'google' | 'facebook' | 'yahoo') => {
    setErrorMsg(null);
    try {
      // Note: Yahoo is supported via OIDC/OAuth on Supabase
      const { error } = await supabase.auth.signInWithOAuth({
        provider: provider as any,
        options: {
          redirectTo: `${window.location.origin}${from}`,
        }
      });
      if (error) throw error;
    } catch (err: any) {
      setErrorMsg(`Failed to connect with ${provider}. Please try email login.`);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#f9fafb] dark:bg-[#0f0f13] flex flex-col justify-center items-center p-4 font-sans relative">
      {/* Decorative background shapes */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-3xl" />
        <div className="absolute bottom-10 -right-32 w-80 h-80 bg-amber-100/40 dark:bg-amber-900/10 rounded-full blur-3xl" />
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-white dark:bg-[#17171c] border border-slate-200 dark:border-slate-800 p-8 rounded-[2.5rem] shadow-2xl relative z-10"
      >
        {/* Brand Logo Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-slate-900 dark:bg-white/10 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-md">
            <Scale size={24} className="text-white dark:text-[#B4975A]" />
          </div>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isSignUp ? 'Create Workspace' : 'Welcome to Lex AI'}
          </h3>
          <p className="text-slate-500 dark:text-slate-400 text-xs mt-1.5 leading-relaxed">
            {isSignUp 
              ? 'Join professional legal workspace. Set up your credentials below.' 
              : 'Sign in to access statutory libraries, legal research tools, and chat histories.'
            }
          </p>
        </div>

        {/* Social Authentication Row */}
        <div className="grid grid-cols-3 gap-2.5 mb-6">
          {/* Google */}
          <button
            onClick={() => handleSocialLogin('google')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5 bg-transparent cursor-pointer transition-all active:scale-95"
            title="Sign in with Google"
          >
            <Chrome size={18} className="text-[#DB4437]" />
          </button>

          {/* Facebook */}
          <button
            onClick={() => handleSocialLogin('facebook')}
            className="flex items-center justify-center gap-2 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5 bg-transparent cursor-pointer transition-all active:scale-95"
            title="Sign in with Facebook"
          >
            <Facebook size={18} className="text-[#4267B2] fill-current" />
          </button>

          {/* Yahoo */}
          <button
            onClick={() => handleSocialLogin('yahoo')}
            className="flex items-center justify-center gap-1.5 py-3 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-white/5 bg-transparent cursor-pointer transition-all active:scale-95 text-[10px] font-bold text-[#6001d2]"
            title="Sign in with Yahoo"
          >
            <span className="font-serif italic text-base leading-none">Y!</span>
          </button>
        </div>

        <div className="relative flex items-center justify-center mb-6">
          <div className="border-t border-slate-200 dark:border-slate-800 w-full" />
          <span className="absolute bg-white dark:bg-[#17171c] px-3 text-[10px] uppercase font-bold text-slate-400">or use email</span>
        </div>

        {/* Standard Email/Password Form */}
        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 px-1">Email Address</label>
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
            className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-98 transition-all shadow-lg shadow-blue-600/10"
          >
            {loading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <span>{isSignUp ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        {/* View Switcher Footer */}
        <div className="mt-8 text-center">
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
