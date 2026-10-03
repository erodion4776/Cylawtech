import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import About from './pages/About';
import Contact from './pages/Contact';
import Legal from './pages/Legal';
import LexAI from './pages/LexAI';
import LexAIStandalone from './pages/LexAIStandalone';
import AdminSaaS from './pages/AdminSaaS';
import PageTransition from './components/PageTransition';
import CookieConsent from './components/CookieConsent'; // <-- IMPORT HERE

const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [pathname]);
  return null;
};

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} className="flex-1 flex flex-col min-h-0 w-full">
        <Routes location={location}>
          <Route path="/lex-ai-embed" element={<LexAIStandalone />} />
          <Route path="/lex-ai" element={<LexAI />} />
          <Route path="/" element={<PageTransition><Home /></PageTransition>} />
          <Route path="/about" element={<PageTransition><About /></PageTransition>} />
          <Route path="/contact" element={<PageTransition><Contact /></PageTransition>} />
          <Route path="/saas-admin" element={<PageTransition><AdminSaaS /></PageTransition>} />
          <Route path="/:type" element={<PageTransition><Legal /></PageTransition>} />
        </Routes>
      </motion.div>
    </AnimatePresence>
  );
};

export default function App() {
  return (
    <Router>
      <ScrollToTop />
      <AppContent />
      <CookieConsent /> {/* <-- MOUNT HERE */}
    </Router>
  );
}

const AppContent = () => {
  const location = useLocation();
  const isChat = location.pathname === '/lex-ai';
  const isEmbed = location.pathname.includes('embed');
  const isAppMode = isChat || isEmbed;

  if (isAppMode) {
    return (
      <div className="fixed inset-0 h-[100dvh] w-full flex flex-col overflow-hidden bg-white dark:bg-[#171717]">
        <AnimatedRoutes />
      </div>
    );
  }

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col bg-white">
      <Navbar />
      <main className="flex-grow">
        <AnimatedRoutes />
      </main>
      <Footer />
    </div>
  );
};
