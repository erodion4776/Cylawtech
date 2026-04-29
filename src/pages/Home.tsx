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

const SmartPathSelector = () => {
  const [step, setStep] = React.useState(0);
  const [selected, setSelected] = React.useState<string | null>(null);

  const options = [
    { id: 'ai', label: 'Make money with AI', path: '/ai-training', icon: <Brain size={20} /> },
    { id: 'bar', label: 'Pass the Bar', path: '/bar-beyond', icon: <Scale size={20} /> },
    { id: 'law', label: 'Learn Nigerian Law', path: '/naija-laws', icon: <Globe size={20} /> },
    { id: 'career', label: 'Grow legal career', path: '/bar-beyond', icon: <TrendingUp size={20} /> },
  ];

  return (
    <section className="px-6 py-20 max-w-4xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="bg-white rounded-[2.5rem] border border-slate-200 p-10 md:p-16 shadow-2xl relative overflow-hidden"
      >
        <div className="relative z-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-4 text-center">Smart Path Selector</h2>
          <p className="text-slate-600 mb-10 text-center max-w-lg mx-auto">
            Not sure where to start? Tell us what you're looking for and we'll guide you.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {options.map((option) => (
              <motion.button
                key={option.id}
                whileHover={{ scale: 1.02, backgroundColor: '#f8fafc' }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setSelected(option.id)}
                className={cn(
                  "flex items-center gap-4 p-6 rounded-2xl border transition-all text-left",
                  selected === option.id ? "border-blue-600 bg-blue-50 ring-2 ring-blue-600/20" : "border-slate-100 bg-slate-50/50"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-xl flex items-center justify-center transition-colors",
                  selected === option.id ? "bg-blue-600 text-white" : "bg-white text-slate-400 shadow-sm"
                )}>
                  {option.icon}
                </div>
                <span className={cn(
                  "font-bold transition-colors",
                  selected === option.id ? "text-blue-700" : "text-slate-700"
                )}>
                  {option.label}
                </span>
              </motion.button>
            ))}
          </div>

          <AnimatePresence>
            {selected && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-10 flex justify-center"
              >
                <Link
                  to={options.find(o => o.id === selected)?.path || '/'}
                  className="bg-blue-600 text-white px-10 py-4 rounded-full font-bold flex items-center gap-2 hover:bg-blue-700 transition-all shadow-lg"
                >
                  Go to My Path <ArrowRight size={18} />
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        
        {/* Decorative background */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full translate-x-1/2 -translate-y-1/2 blur-3xl opacity-50" />
      </motion.div>
    </section>
  );
};

const MyJourney = () => {
  const { bookmarks } = useBookmarks();
  
  if (bookmarks.length === 0) return null;

  return (
    <section className="px-6 py-12 max-w-7xl mx-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        className="bg-slate-900 rounded-[2rem] p-8 md:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-8 shadow-2xl border border-slate-800"
      >
        <div>
          <h3 className="text-2xl font-bold mb-2">My Journey</h3>
          <p className="text-slate-400">You have {bookmarks.length} saved {bookmarks.length === 1 ? 'tool' : 'tools'} in your collection.</p>
        </div>
        <Link 
          to="/ai-training" 
          className="bg-blue-600 text-white px-8 py-4 rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg flex items-center gap-2"
        >
          View Saved Tools <ArrowRight size={18} />
        </Link>
      </motion.div>
    </section>
  );
};

const OnboardingSteps = () => {
  const steps = [
    { title: "Watch Intro", desc: "Understand how CyAzor empowers your career.", icon: <PlayCircle size={24} /> },
    { title: "Choose Path", desc: "Select AI Training or Legal Growth.", icon: <TrendingUp size={24} /> },
    { title: "Start Earning", desc: "Apply your skills and grow your income.", icon: <DollarSign size={24} /> },
  ];

  return (
    <section className="px-6 py-20 max-w-7xl mx-auto">
      <div className="text-center mb-16">
        <h2 className="text-3xl font-bold text-slate-900 mb-4">Start Here</h2>
        <p className="text-slate-600">Your 3-step roadmap to success on the platform.</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 relative">
        {/* Connecting line for desktop */}
        <div className="hidden md:block absolute top-1/2 left-0 w-full h-0.5 bg-slate-100 -translate-y-1/2 -z-10" />
        
        {steps.map((step, i) => (
          <motion.div 
            key={i}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.2 }}
            className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm text-center relative"
          >
            <div className="w-16 h-16 bg-blue-600 text-white rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg shadow-blue-600/20">
              {step.icon}
            </div>
            <div className="absolute -top-4 -left-4 w-10 h-10 bg-slate-900 text-white rounded-full flex items-center justify-center font-bold border-4 border-white">
              {i + 1}
            </div>
            <h4 className="text-xl font-bold text-slate-900 mb-3">{step.title}</h4>
            <p className="text-slate-500 text-sm leading-relaxed">{step.desc}</p>
          </motion.div>
        ))}
      </div>
    </section>
  );
};

const MicroLearning = () => {
  const tips = [
    { title: "AI Tip of the Day", desc: "Use 'Chain of Thought' prompting to get better reasoning from LLMs.", category: "AI" },
    { title: "Legal Insight", desc: "The new Nigerian Startup Act provides tax incentives for tech-enabled law firms.", category: "Law" },
    { title: "Career Hack", desc: "Build a digital portfolio of your AI-assisted legal research projects.", category: "Career" },
  ];

  return (
    <section className="px-6 py-20 bg-slate-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <div>
            <h2 className="text-3xl font-bold text-slate-900 mb-2">Micro-Learning</h2>
            <p className="text-slate-600">Bite-sized insights to keep you ahead.</p>
          </div>
          <Link to="/ai-training" className="text-blue-600 font-bold text-sm flex items-center gap-2 hover:translate-x-1 transition-transform">
            View All Tips <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {tips.map((tip, i) => (
            <motion.div 
              key={i}
              whileHover={{ y: -5 }}
              className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm relative overflow-hidden group"
            >
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-50 rounded-full translate-x-1/2 -translate-y-1/2 group-hover:scale-150 transition-transform duration-500" />
              <span className="inline-block px-3 py-1 bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-wider rounded-full mb-4 relative z-10">
                {tip.category}
              </span>
              <h4 className="text-xl font-bold text-slate-900 mb-3 relative z-10">{tip.title}</h4>
              <p className="text-slate-600 text-sm leading-relaxed relative z-10">{tip.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

const Home = () => {
  useDocumentTitle('LexAI - Professional Legal Intelligence by CyAzor Tech');

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
            Powered by <Link to="/about" className="text-slate-900 font-bold border-b-2 border-slate-900 hover:text-blue-600 hover:border-blue-600 transition-all">CyAzor Tech</Link>, 
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
                to="/ai-training"
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
                CyAzor Tech introduces LexAI, a revolutionary legal intelligence platform engineered to augment the capabilities of legal researchers, advocates, and solicitors.
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

      <SmartPathSelector />

      <OnboardingSteps />

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
