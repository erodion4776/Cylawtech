import React from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import Navbar from './components/Navbar';
import Footer from './components/Footer';
import Home from './pages/Home';
import AITraining from './pages/AITraining';
import BarBeyond from './pages/BarBeyond';
import NaijaLaws from './pages/NaijaLaws';
import Opportunities from './pages/Opportunities';
import About from './pages/About';
import Contact from './pages/Contact';
import Legal from './pages/Legal';
import LexAI from './pages/LexAI';
import AdminDashboard from './pages/AdminDashboard';
import ResourceStore from './pages/ResourceStore';
import PageTransition from './components/PageTransition';
import ScrollProgress from './components/ScrollProgress';

// Scroll to top on route change
const ScrollToTop = () => {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
};

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <motion.div key={location.pathname} className="flex-grow flex flex-col">
        <Routes location={location}>
          <Route path="/" element={<PageTransition><Home /></PageTransition>} />
          <Route path="/ai-training" element={<PageTransition><AITraining /></PageTransition>} />
          <Route path="/bar-beyond" element={<PageTransition><BarBeyond /></PageTransition>} />
          <Route path="/naija-laws" element={<PageTransition><NaijaLaws /></PageTransition>} />
          <Route path="/opportunities" element={<PageTransition><Opportunities /></PageTransition>} />
          <Route path="/about" element={<PageTransition><About /></PageTransition>} />
          <Route path="/contact" element={<PageTransition><Contact /></PageTransition>} />
          <Route path="/lex-ai" element={<PageTransition><LexAI /></PageTransition>} />
          <Route path="/admin" element={<PageTransition><AdminDashboard /></PageTransition>} />
          <Route path="/resource-store" element={<PageTransition><ResourceStore /></PageTransition>} />
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
      <ScrollProgress />
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-grow">
          <AnimatedRoutes />
        </main>
        <Footer />
      </div>
    </Router>
  );
}
