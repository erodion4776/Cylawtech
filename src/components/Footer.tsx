import React from 'react';
import { Link } from 'react-router-dom';
import { Mail, Github, Twitter, Linkedin } from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '../lib/utils';

const Footer = () => {
  return (
    <motion.footer 
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="bg-slate-50 border-t border-slate-200 pt-16 pb-8 px-6"
    >
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
          <div className="col-span-1 md:col-span-1">
            <Link to="/" className="flex items-center gap-2 mb-6 group">
              <motion.div 
                whileHover={{ rotate: 5, scale: 1.1 }}
                className="w-10 h-10 bg-slate-900 rounded-lg flex items-center justify-center"
              >
                <span className="text-white font-black text-xl tracking-tighter">LA</span>
              </motion.div>
              <div className="flex flex-col">
                <span className="font-bold text-xl tracking-tight text-slate-900 leading-none">LexAI</span>
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest leading-none">Workspace</span>
              </div>
            </Link>
            <p className="text-slate-500 text-sm leading-relaxed">
              Empowering legal minds with professional legal intelligence.
            </p>
            <div className="flex gap-4 mt-6">
              {[
                { icon: <Twitter size={20} />, color: "hover:text-blue-400 hover:bg-blue-50" },
                { icon: <Linkedin size={20} />, color: "hover:text-blue-700 hover:bg-blue-50" },
                { icon: <Github size={20} />, color: "hover:text-slate-900 hover:bg-slate-100" }
              ].map((social, i) => (
                <motion.a 
                  key={i}
                  href="#" 
                  whileHover={{ y: -5, scale: 1.1 }}
                  className={cn("text-slate-400 p-2 rounded-lg transition-all", social.color)}
                >
                  {social.icon}
                </motion.a>
              ))}
            </div>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-6">Platforms</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link to="/lex-ai" className="hover:text-blue-600 transition-colors">Lex AI Chat</Link></li>
              <li><Link to="/how-it-works" className="hover:text-blue-600 transition-colors">How It Works</Link></li>
              <li><Link to="/about" className="hover:text-blue-600 transition-colors">About LexAI</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link to="/about" className="hover:text-blue-600 transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-blue-600 transition-colors">Contact</Link></li>
              <li><Link to="/how-it-works" className="hover:text-blue-600 transition-colors">How Lex AI Works</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-6">Legal</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link to="/privacy" className="hover:text-blue-600 transition-colors">Privacy Policy</Link></li>
              <li><Link to="/disclaimer" className="hover:text-blue-600 transition-colors">Disclaimer</Link></li>
              <li><Link to="/affiliate-disclosure" className="hover:text-blue-600 transition-colors">Affiliate Disclosure</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-slate-400 text-xs text-center md:text-left leading-relaxed">
            © {new Date().getFullYear()} LexAI Workspace. All rights reserved.<br/>
          </p>
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Mail size={14} />
            <span>contact@lexai.pro</span>
          </div>
        </div>
      </div>
    </motion.footer>
  );
};

export default Footer;
