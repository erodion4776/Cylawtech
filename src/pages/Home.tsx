import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowRight, Brain, Scale, Globe, Zap, TrendingUp, Shield, PlayCircle, DollarSign } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useBookmarks } from '../hooks/useBookmarks';

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
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.6, ease: [0.4, 0, 0.2, 1] }
    }
  };

  return (
    <div className="pt-24 relative">
      <BackgroundMotion />
      
      {/* Hero Section */}
      <section className="px-6 py-20 md:py-32 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12">
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="lg:w-1/2 text-center lg:text-left"
        >
          <motion.span 
            variants={itemVariants}
            className="inline-block px-4 py-1.5 mb-6 text-xs font-bold tracking-widest text-blue-600 uppercase bg-blue-50 rounded-full"
          >
            The Future of Law & Technology
          </motion.span>
          <motion.h1 
            variants={itemVariants}
            className="text-5xl md:text-7xl font-bold text-slate-900 mb-6 tracking-tight"
          >
            Empowering Legal Minds with <span className="text-blue-600">AI & Digital Opportunities</span>
          </motion.h1>
          <motion.p 
            variants={itemVariants}
            className="text-xl text-slate-600 mb-10 max-w-2xl mx-auto lg:mx-0 leading-relaxed"
          >
            Bridge the gap between traditional legal practice and the digital frontier. 
            Confidence, structure, and power in every step of your legal journey.
          </motion.p>
          <motion.div 
            variants={itemVariants}
            className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4"
          >
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/ai-training"
                className="w-full sm:w-auto bg-slate-900 text-white px-8 py-4 rounded-full font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg hover:shadow-xl"
              >
                Explore AI Training <ArrowRight size={18} />
              </Link>
            </motion.div>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.97 }}>
              <Link
                to="/bar-beyond"
                className="w-full sm:w-auto bg-white text-slate-900 border border-slate-200 px-8 py-4 rounded-full font-bold flex items-center justify-center gap-2 hover:bg-slate-50 transition-all shadow-sm hover:shadow-md"
              >
                See Bar & Beyond
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.4 }}
          className="lg:w-1/2 relative"
        >
          <div className="relative z-10 rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white bg-slate-100">
            <img 
              src="https://i.ibb.co/hF4k7B2Z/attorney-cynthia-azor-1.png" 
              alt="Attorney Cynthia Azor" 
              className="w-full h-[500px] object-cover object-top"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
          </div>
          {/* Floating AI Elements */}
          <motion.div 
            animate={{ y: [0, -20, 0] }}
            transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
            className="absolute -top-6 -right-6 bg-white p-4 rounded-2xl shadow-xl z-20 border border-slate-100"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center text-blue-600">
                <Brain size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">AI Analysis</p>
                <p className="text-sm font-bold text-slate-900">98% Accuracy</p>
              </div>
            </div>
          </motion.div>
          <div className="absolute -bottom-10 -left-10 w-64 h-64 bg-blue-400/20 rounded-full blur-3xl -z-10"></div>
        </motion.div>
      </section>

      <SmartPathSelector />

      <MyJourney />

      {/* Quick Highlights Section */}
      <section className="px-6 py-20 bg-slate-50/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto">
          <motion.div 
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={containerVariants}
            className="grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            {[
              {
                title: "AI Training",
                desc: "Master the tools reshaping the legal industry.",
                icon: <Brain size={24} />,
                path: "/ai-training",
                color: "text-blue-600 bg-blue-100",
                img: "https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=400"
              },
              {
                title: "Bar & Beyond",
                desc: "Strategic resources for exam success and career growth.",
                icon: <Scale size={24} />,
                path: "/bar-beyond",
                color: "text-indigo-600 bg-indigo-100",
                img: "https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=400"
              },
              {
                title: "Naija Laws",
                desc: "Digital access to Nigerian legislation and case law.",
                icon: <Globe size={24} />,
                path: "/naija-laws",
                color: "text-emerald-600 bg-emerald-100",
                img: "https://images.unsplash.com/photo-1523292562811-8fa7962a78c8?auto=format&fit=crop&q=80&w=400"
              }
            ].map((item, idx) => (
              <motion.div
                key={idx}
                variants={itemVariants}
                whileHover={{ y: -10, shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }}
                className="bg-white rounded-3xl shadow-sm border border-slate-100 flex flex-col items-start transition-all duration-300 overflow-hidden group"
              >
                <div className="w-full h-40 overflow-hidden relative">
                  <img 
                    src={item.img} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent"></div>
                </div>
                <div className="p-8 pt-0 -mt-8 relative z-10">
                  <motion.div 
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className={cn("w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shadow-lg", item.color)}
                  >
                    {item.icon}
                  </motion.div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-500 text-sm mb-6 leading-relaxed">
                    {item.desc}
                  </p>
                  <Link to={item.path} className="text-blue-600 font-bold text-sm flex items-center gap-2 hover:translate-x-1 transition-transform mt-auto">
                    Learn More <ArrowRight size={16} />
                  </Link>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      <MicroLearning />

      {/* Featured Path Box */}
      <section className="px-6 py-20">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="max-w-5xl mx-auto bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-2xl flex flex-col md:flex-row"
        >
          <div className="md:w-1/2 p-12 flex flex-col justify-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-8">Choose Your Growth Path</h2>
            <div className="space-y-6">
              <motion.div 
                whileHover={{ x: 10 }}
                className="p-6 rounded-2xl bg-slate-50 border border-slate-100 text-left group cursor-pointer"
              >
                <h4 className="text-xl font-bold text-slate-900 mb-2">AI Income Path</h4>
                <p className="text-slate-500 text-sm mb-4">Learn how to turn your professional expertise into digital assets.</p>
                <Link to="/ai-training" className="inline-flex items-center gap-2 text-blue-600 font-bold text-sm">
                  Explore Path <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
              <motion.div 
                whileHover={{ x: 10 }}
                className="p-6 rounded-2xl bg-slate-50 border border-slate-100 text-left group cursor-pointer"
              >
                <h4 className="text-xl font-bold text-slate-900 mb-2">Legal Career Growth</h4>
                <p className="text-slate-500 text-sm mb-4">Strategic mentorship and resources for the modern legal market.</p>
                <Link to="/bar-beyond" className="inline-flex items-center gap-2 text-blue-600 font-bold text-sm">
                  Explore Path <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
                </Link>
              </motion.div>
            </div>
          </div>
          <div className="md:w-1/2 relative min-h-[400px]">
            <img 
              src="https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&q=80&w=800" 
              alt="Collaboration" 
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-blue-600/10 mix-blend-multiply"></div>
          </div>
        </motion.div>
      </section>

      {/* About the Platform Section */}
      <section className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-3xl md:text-4xl font-bold text-slate-900 mb-4"
          >
            About CyAzor Ecosystem
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-slate-600 max-w-2xl mx-auto"
          >
            A unified approach to legal education, technology integration, and professional development.
          </motion.p>
        </div>

        <motion.div 
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={containerVariants}
          className="grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          {[
            {
              title: "AI Training Hub",
              desc: "Master the art of AI training and digital income generation.",
              icon: <Brain size={24} />,
              color: "bg-blue-50 text-blue-600",
              path: "/ai-training",
              img: "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=400"
            },
            {
              title: "Legal Growth Hub",
              desc: "Comprehensive resources for bar prep and career advancement.",
              icon: <TrendingUp size={24} />,
              color: "bg-indigo-50 text-indigo-600",
              path: "/bar-beyond",
              img: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?auto=format&fit=crop&q=80&w=400"
            },
            {
              title: "Naija Law Access",
              desc: "Digitizing the Nigerian legal landscape for modern practitioners.",
              icon: <Globe size={24} />,
              color: "bg-emerald-50 text-emerald-600",
              path: "/naija-laws",
              img: "https://images.unsplash.com/photo-1521791136064-7986c2923216?auto=format&fit=crop&q=80&w=400"
            }
          ].map((item, index) => (
            <motion.div key={index} variants={itemVariants}>
              <Link
                to={item.path}
                className="rounded-3xl border border-slate-100 hover:border-blue-200 transition-all group bg-white shadow-sm block h-full overflow-hidden"
              >
                <div className="h-48 overflow-hidden">
                  <img 
                    src={item.img} 
                    alt={item.title} 
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                    referrerPolicy="no-referrer"
                  />
                </div>
                <div className="p-8">
                  <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-6 transition-transform group-hover:scale-110 shadow-md", item.color)}>
                    {item.icon}
                  </div>
                  <h4 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h4>
                  <p className="text-slate-500 text-sm leading-relaxed mb-6">{item.desc}</p>
                  <span className="text-blue-600 font-bold text-sm flex items-center gap-2 group-hover:translate-x-1 transition-transform">
                    Explore Hub <ArrowRight size={16} />
                  </span>
                </div>
              </Link>
            </motion.div>
          ))}
        </motion.div>
      </section>

      <OnboardingSteps />

      {/* Call to Action */}
      <section className="px-6 py-20">
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-5xl mx-auto bg-gradient-to-br from-blue-600 to-indigo-700 rounded-[2.5rem] p-12 md:p-20 text-center text-white relative overflow-hidden shadow-2xl"
        >
          <div className="relative z-10">
            <h2 className="text-3xl md:text-5xl font-bold mb-6">Unlock Future Legal Solutions</h2>
            <p className="text-blue-100 text-lg mb-10 max-w-xl mx-auto">
              Join thousands of professionals who are already transforming their careers with CyAzor.
            </p>
            <motion.div whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}>
              <Link
                to="/contact"
                className="bg-white text-blue-700 px-10 py-4 rounded-full font-bold hover:bg-blue-50 transition-all inline-block shadow-lg"
              >
                Get Started Today
              </Link>
            </motion.div>
          </div>
          {/* Decorative elements */}
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.1, 0.2, 0.1]
            }}
            transition={{ duration: 10, repeat: Infinity }}
            className="absolute top-0 left-0 w-64 h-64 bg-white rounded-full -translate-x-1/2 -translate-y-1/2 blur-3xl"
          />
          <motion.div 
            animate={{ 
              scale: [1, 1.3, 1],
              opacity: [0.2, 0.3, 0.2]
            }}
            transition={{ duration: 12, repeat: Infinity }}
            className="absolute bottom-0 right-0 w-64 h-64 bg-blue-400 rounded-full translate-x-1/2 translate-y-1/2 blur-3xl"
          />
        </motion.div>
      </section>
    </div>
  );
};

export default Home;
