import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cookie, Shield, X, ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

const COOKIE_STORAGE_KEY = 'lexai_cookie_consent';

export const CookieConsent: React.FC = () => {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem(COOKIE_STORAGE_KEY);
    if (!consent) {
      // Small delay for smooth entrance
      const timer = setTimeout(() => setShowBanner(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    localStorage.setItem(COOKIE_STORAGE_KEY, 'all');
    setShowBanner(false);
  };

  const handleEssentialOnly = () => {
    localStorage.setItem(COOKIE_STORAGE_KEY, 'essential');
    setShowBanner(false);
  };

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.95 }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-[999] pointer-events-auto"
        >
          <div className="bg-slate-900/95 dark:bg-[#171717]/95 backdrop-blur-md text-white border border-slate-800 dark:border-white/10 p-5 sm:p-6 rounded-3xl shadow-2xl shadow-slate-950/40">
            {/* Top Bar */}
            <div className="flex items-start justify-between gap-3 mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center shrink-0">
                  <Cookie size={18} />
                </div>
                <div>
                  <h4 className="font-bold text-sm text-white leading-tight">Cookie & Privacy Notice</h4>
                  <p className="text-[10px] text-slate-400 font-medium">Lex AI Data Protection</p>
                </div>
              </div>
              <button
                onClick={handleEssentialOnly}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Dismiss"
              >
                <X size={16} />
              </button>
            </div>

            {/* Description */}
            <p className="text-xs text-slate-300 dark:text-slate-400 leading-relaxed mb-4">
              We use cookies to enhance your experience, maintain active chat sessions, and analyze platform usage in compliance with Nigerian & international privacy laws.
            </p>

            {/* Policy Link */}
            <div className="mb-4">
              <Link
                to="/privacy"
                onClick={() => setShowBanner(false)}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors"
              >
                Read our Privacy Policy <ArrowRight size={12} />
              </Link>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleAcceptAll}
                className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white font-bold text-xs rounded-xl shadow-md transition-all text-center"
              >
                Accept All
              </button>
              <button
                onClick={handleEssentialOnly}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 active:scale-95 text-slate-300 hover:text-white font-semibold text-xs rounded-xl border border-slate-700 dark:border-white/10 transition-all text-center"
              >
                Essential Only
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default CookieConsent;
