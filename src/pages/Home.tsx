import React from 'react';
import { motion, AnimatePresence, Variants } from 'motion/react';
import { ArrowRight, Brain, Scale, Globe, Zap, TrendingUp, Shield, PlayCircle, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useBookmarks } from '../hooks/useBookmarks';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const BackgroundMotion = () => (
  <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
    <motion.div
      animate={{
        scale: [1, 1.1, 1],
        rotate: [0, 5, 0],
        x: [0, 20, 0],
        y: [0, 10, 0],
      }}
      transition={{
        duration: 20,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className="absolute -top-1/4 -left-1/4 w-full h-full bg-blue-50/50 rounded-full blur-[120px]"
    />
    <motion.div
      animate={{
        scale: [1, 1.2, 1],
        rotate: [0, -5, 0],
        x: [0, -30, 0],
        y: [0, -20, 0],
      }}
      transition={{
        duration: 25,
        repeat: Infinity,
        ease: "easeInOut"
      }}
      className="absolute -bottom-1/4 -right-1/4 w-full h-full bg-indigo-50/50 rounded-full blur-[120px]"
    />
  </div>
);

const Home = () => {
  useDocumentTitle('LexAI - Professional Legal Intelligence');

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants: Variants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" }
    }
  };

  return (
    <div className="pt-24 relative">
      <BackgroundMotion />
      
      {/* Hero Section */}
      <section className="px-6 py-20 md:py-32 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12 text-center lg:text-left">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="lg:w-3/5"
        >
          <motion.div 
            variants={itemVariants}
            className="inline-flex items-center gap-2 px-4 py-2 mb-8 text-xs font-bold tracking-widest text-slate-900 uppercase bg-slate-100 rounded-full"
          >
            <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
            LexAI is now live
          </motion.div>
          <motion.h1 
            variants={itemVariants}
            className="text-6xl md:text-8xl font-black text-slate-900 mb-8 tracking-tighter leading-[0.9]"
          >
            Professional Legal Intelligence. <span className="text-blue-600">Reimagined.</span>
          </motion.h1>
          <motion.p 
            variants={itemVariants}
            className="text-xl md:text-2xl text-slate-600 mb-12 max-w-2xl mx-auto lg:mx-0 leading-relaxed font-medium"
          >
            Experience the power of LexAI, the industry-leading workstation for legal professionals. 
            we bridge the gap between complex law and seamless technology.
          </motion.p>
          <motion.div 
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-6"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/lex-ai"
                className="w-full sm:w-auto bg-slate-900 text-white px-10 py-5 rounded-full font-black text-lg flex items-center justify-center gap-3 hover:bg-slate-800 transition-all shadow-2xl hover:shadow-black/20"
              >
                Go to AI Playground <Zap size={22} fill="currentColor" />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/about"
                className="w-full sm:w-auto bg-white text-slate-900 border-2 border-slate-100 px-10 py-5 rounded-full font-bold text-lg flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm"
              >
                Learn More
              </Link>
            </motion.div>
          </motion.div>
          
          <motion.div 
            variants={itemVariants}
            className="mt-12 flex items-center justify-center lg:justify-start gap-8 grayscale opacity-50"
          >
            <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Trusted By Professionals At</p>
            {/* Trusted indicators */}
            <div className="flex gap-4 font-bold text-slate-900">
               <span>SUPREME COURT</span>
               <span>•</span>
               <span>LAW SOCIETY</span>
            </div>
          </motion.div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9, rotate: -2 }}
          animate={{ opacity: 1, scale: 1, rotate: 0 }}
          transition={{ duration: 1, delay: 0.4 }}
          className="lg:w-2/5 relative"
        >
          <div className="relative z-10 p-4 bg-white rounded-[3rem] shadow-2xl border-2 border-slate-100">
             <div className="rounded-[2.5rem] overflow-hidden aspect-[4/5] bg-slate-100">
                <img 
                  src="https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&q=80&w=1000" 
                  alt="LexAI Architecture" 
                  className="w-full h-full object-cover"
                />
             </div>
             {/* Floating UI Card */}
             <motion.div 
                animate={{ y: [0, -10, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
                className="absolute -bottom-8 -left-8 bg-white p-6 rounded-3xl shadow-2xl border border-slate-100 max-w-[240px]"
             >
                <div className="flex items-center gap-3 mb-4">
                   <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                      <Scale size={16} className="text-white" />
                   </div>
                   <span className="font-bold text-slate-900">Legal Analyzer</span>
                </div>
                <div className="space-y-2">
                   <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <motion.div 
                        initial={{ width: 0 }}
                        animate={{ width: "85%" }}
                        className="h-full bg-blue-600"
                        transition={{ duration: 2, delay: 1 }}
                      />
                   </div>
                   <p className="text-[10px] text-slate-400 font-bold">PRECEDENT MATCH FOUND</p>
                </div>
             </motion.div>
          </div>
          <div className="absolute -top-12 -right-12 w-64 h-64 bg-blue-200/20 rounded-full blur-3xl -z-10 animate-pulse"></div>
        </motion.div>
      </section>

      {/* Brand Pillar Section */}
      <section className="px-6 py-32 bg-slate-900 text-white overflow-hidden relative">
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">
            <div>
              <h2 className="text-4xl md:text-6xl font-black mb-8 leading-[0.95]">
                Built for the <br /> <span className="text-blue-500 underline underline-offset-8">Law of Tomorrow.</span>
              </h2>
              <p className="text-xl text-slate-400 mb-12 leading-relaxed">
                LexAI is a revolutionary legal intelligence platform engineered to augment the capabilities of legal researchers, advocates, and solicitors.
              </p>
              <div className="grid grid-cols-2 gap-8">
                <div>
                  <h4 className="text-4xl font-black text-blue-500 mb-2">99%</h4>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">Research Speedup</p>
                </div>
                <div>
                  <h4 className="text-4xl font-black text-blue-500 mb-2">24/7</h4>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">AI Availability</p>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { title: "Precision", desc: "Rigorous attention to legal precedents and statutes.", icon: <Shield size={24} /> },
                { title: "Velocity", desc: "Instant answers to complex legal inquiries.", icon: <Zap size={24} /> },
                { title: "Growth", desc: "Monetize your legal expertise with AI training.", icon: <TrendingUp size={24} /> },
                { title: "Authority", desc: "Stay compliant with local Naija laws.", icon: <Globe size={24} /> },
              ].map((pillar, i) => (
                <div key={i} className="p-8 rounded-[2.5rem] bg-white/5 border border-white/10 hover:bg-white/10 transition-all group">
                   <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-blue-600 transition-colors">
                      {pillar.icon}
                   </div>
                   <h4 className="text-xl font-bold mb-2">{pillar.title}</h4>
                   <p className="text-sm text-slate-500 leading-relaxed">{pillar.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
        {/* Decorative mask */}
        <div className="absolute top-0 right-0 w-1/3 h-full bg-blue-600/10 skew-x-12 translate-x-1/2 blur-[100px] pointer-events-none"></div>
      </section>

      {/* LexAI CTA */}
      <section className="px-6 py-32">
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-7xl mx-auto bg-blue-600 rounded-[4rem] p-16 md:p-32 text-center text-white relative overflow-hidden shadow-2xl"
        >
          <div className="relative z-10 max-w-3xl mx-auto">
            <h2 className="text-4xl md:text-7xl font-black mb-8 leading-none">Ready to Test LexAI?</h2>
            <p className="text-blue-100 text-xl font-medium mb-12">
              Join the new era of legal work. Start your free trial in the LexAI Playground today.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                to="/lex-ai"
                className="bg-white text-blue-700 px-12 py-5 rounded-full font-black text-xl hover:bg-blue-50 transition-all shadow-xl"
              >
                Start Legal Chat
              </Link>
              <Link
                to="/contact"
                className="bg-blue-700 text-white px-12 py-5 rounded-full font-black text-xl border-2 border-white/20 hover:bg-blue-800 transition-all"
              >
                Enterprise Solutions
              </Link>
            </div>
          </div>
          
          {/* Decorative mesh */}
          <div className="absolute inset-0 opacity-20 pointer-events-none" 
               style={{backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '40px 40px'}}></div>
        </motion.div>
      </section>
    </div>
  );
};

export default Home;
