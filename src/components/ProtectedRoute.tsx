import React, { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import { Loader2, Scale } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const location = useLocation();

  useEffect(() => {
    // Check current active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    // Listen for real-time login/logout changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Loading state while verifying authentication with Supabase
  if (isAuthenticated === null) {
    return (
      <div className="fixed inset-0 h-[100dvh] w-full flex flex-col items-center justify-center bg-white dark:bg-[#171717] z-[999]">
        <div className="w-12 h-12 bg-slate-900 dark:bg-white/10 rounded-2xl flex items-center justify-center mb-4 shadow-sm animate-pulse">
          <Scale size={24} className="text-white dark:text-[#B4975A]" />
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-widest">
          <Loader2 size={16} className="animate-spin text-blue-600 dark:text-[#B4975A]" />
          <span>Verifying Lex AI Access...</span>
        </div>
      </div>
    );
  }

  // If not logged in, redirect to /auth and remember the page they were trying to visit
  if (!isAuthenticated) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
