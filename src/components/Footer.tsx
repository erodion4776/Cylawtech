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
                className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center"
              >
                <span className="text-white font-bold text-xl">C</span>
              </motion.div>
              <span className="font-bold text-xl tracking-tight text-slate-900">CyAzor LawTech Solutions</span>
            </Link>
            <p className="text-slate-500 text-sm leading-relaxed">
              Empowering legal minds with AI and digital opportunities. Clean, structured, and powerful legal technology.
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
              <li><Link to="/ai-training" className="hover:text-blue-600 transition-colors">AI Training</Link></li>
              <li><Link to="/bar-beyond" className="hover:text-blue-600 transition-colors">Bar & Beyond</Link></li>
              <li><Link to="/naija-laws" className="hover:text-blue-600 transition-colors">Digital Naija Laws</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="font-bold text-slate-900 mb-6">Company</h4>
            <ul className="space-y-4 text-sm text-slate-500">
              <li><Link to="/about" className="hover:text-blue-600 transition-colors">About Us</Link></li>
              <li><Link to="/contact" className="hover:text-blue-600 transition-colors">Contact</Link></li>
              <li><Link to="/opportunities" className="hover:text-blue-600 transition-colors">Opportunities</Link></li>
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
          <p className="text-slate-400 text-xs">
            © {new Date().getFullYear()} CyAzor LawTech Solutions. All rights reserved.
          </p>
          <div className="flex items-center gap-2 text-slate-400 text-xs">
            <Mail size={14} />
            <span>contact@cyazor.com</span>
          </div>
        </div>
      </div>
    </motion.footer>
  );
};

export default Footer;
