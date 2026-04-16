import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/src/lib/utils';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinks = [
    { name: 'Home', path: '/' },
    { name: 'AI Training', path: '/ai-training' },
    { name: 'Bar & Beyond', path: '/bar-beyond' },
    { name: 'LexAI', path: '/lex-ai' },
    { name: 'Store', path: '/resource-store' },
    { name: 'Naija Laws', path: '/naija-laws' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  return (
    <nav
      className={cn(
        'fixed top-0 left-0 right-0 z-50 transition-all duration-500 px-6 py-4',
        scrolled ? 'bg-white/90 backdrop-blur-md shadow-lg py-3' : 'bg-transparent'
      )}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2 group">
          <motion.div 
            whileHover={{ rotate: 5, scale: 1.05 }}
            className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center"
          >
            <span className="text-white font-bold text-xl">C</span>
          </motion.div>
          <span className="font-bold text-xl tracking-tight text-slate-900">CyAzor LawTech Solutions</span>
        </Link>

        {/* Desktop Nav */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.path}
              to={link.path}
              className={cn(
                'text-sm font-medium transition-colors relative group py-1',
                location.pathname === link.path ? 'text-blue-600' : 'text-slate-600 hover:text-blue-600'
              )}
            >
              {link.name}
              <motion.span 
                className="absolute bottom-0 left-0 w-full h-0.5 bg-blue-600 origin-left"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: location.pathname === link.path ? 1 : 0 }}
                whileHover={{ scaleX: 1 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              />
            </Link>
          ))}
          <motion.div
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.97 }}
          >
            <Link
              to="/naija-laws"
              className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all shadow-md hover:shadow-xl"
            >
              Join the Waitlist
            </Link>
          </motion.div>
        </div>

        {/* Mobile Menu Toggle */}
        <motion.button
          whileTap={{ scale: 0.9 }}
          className="md:hidden text-slate-900 p-2"
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? <X size={24} /> : <Menu size={24} />}
        </motion.button>
      </div>

      {/* Mobile Nav */}
      <AnimatePresence>
        {isOpen && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="md:hidden fixed inset-y-0 right-0 w-full max-w-xs bg-white shadow-2xl z-[60] p-8 flex flex-col gap-6"
          >
            <div className="flex justify-end">
              <button onClick={() => setIsOpen(false)} className="p-2 text-slate-500">
                <X size={24} />
              </button>
            </div>
            {navLinks.map((link, i) => (
              <motion.div
                key={link.path}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.1 }}
              >
                <Link
                  to={link.path}
                  className={cn(
                    'text-2xl font-bold py-2 block',
                    location.pathname === link.path ? 'text-blue-600' : 'text-slate-600'
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  {link.name}
                </Link>
              </motion.div>
            ))}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
            >
              <Link
                to="/naija-laws"
                className="bg-slate-900 text-white px-6 py-4 rounded-2xl text-center font-bold mt-4 block shadow-lg"
                onClick={() => setIsOpen(false)}
              >
                Join the Waitlist
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsOpen(false)}
            className="md:hidden fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-[55]"
          />
        )}
      </AnimatePresence>
    </nav>
  );
};

export default Navbar;
