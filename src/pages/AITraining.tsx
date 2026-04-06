import React from 'react';
import { motion } from 'motion/react';
import { ExternalLink, PlayCircle, Calculator, Bookmark, BookmarkCheck } from 'lucide-react';
import { cn } from '../lib/utils';
import { useBookmarks } from '../hooks/useBookmarks';

const IncomeCalculator = () => {
  const [hours, setHours] = React.useState(4);
  const [skill, setSkill] = React.useState('intermediate');

  const rates = {
    beginner: 15,
    intermediate: 25,
    expert: 45
  };

  const monthlyEarnings = hours * rates[skill as keyof typeof rates] * 22; // 22 working days

  return (
    <section className="px-6 py-20 bg-slate-900 rounded-[3rem] text-white overflow-hidden relative mb-20">
      <div className="max-w-4xl mx-auto relative z-10">
        <div className="flex items-center justify-center gap-3 mb-6">
          <Calculator className="text-blue-500" size={32} />
          <h2 className="text-3xl md:text-4xl font-bold text-center">AI Income Calculator</h2>
        </div>
        <p className="text-slate-400 mb-12 text-center max-w-lg mx-auto">
          Estimate your potential monthly earnings based on your commitment and skill level.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div className="space-y-8">
            <div>
              <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                Hours per day: {hours}h
              </label>
              <input 
                type="range" 
                min="1" 
                max="12" 
                value={hours} 
                onChange={(e) => setHours(parseInt(e.target.value))}
                className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">
                Skill Level
              </label>
              <div className="grid grid-cols-3 gap-2">
                {['beginner', 'intermediate', 'expert'].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSkill(s)}
                    className={cn(
                      "py-3 rounded-xl font-bold text-sm transition-all border",
                      skill === s ? "bg-blue-600 border-blue-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700"
                    )}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm p-10 rounded-[2rem] border border-slate-700 text-center">
            <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-2">Estimated Monthly Earnings</p>
            <motion.div 
              key={monthlyEarnings}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="text-5xl md:text-7xl font-bold text-blue-400 mb-4"
            >
              ${monthlyEarnings.toLocaleString()}
            </motion.div>
            <p className="text-slate-500 text-sm">Based on 22 working days per month at ${rates[skill as keyof typeof rates]}/hr average rate.</p>
          </div>
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-full h-full opacity-10 pointer-events-none">
        <div className="absolute top-10 left-10 w-64 h-64 bg-blue-500 rounded-full blur-[100px]" />
        <div className="absolute bottom-10 right-10 w-64 h-64 bg-indigo-500 rounded-full blur-[100px]" />
      </div>
    </section>
  );
};

const AITraining = () => {
  const { toggleBookmark, isBookmarked } = useBookmarks();

  const platforms = [
    {
      id: "outlier",
      name: "Outlier AI",
      desc: "Specialized in high-level data labeling and AI training for complex reasoning tasks.",
      link: "#",
      color: "border-blue-200",
      img: "https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&q=80&w=400"
    },
    {
      id: "handshake",
      name: "Handshake AI",
      desc: "Connecting human intelligence with machine learning models for natural language processing.",
      link: "#",
      color: "border-indigo-200",
      img: "https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&q=80&w=400"
    },
    {
      id: "micro",
      name: "Micro AI",
      desc: "Focusing on micro-tasks that power the next generation of computer vision and automation.",
      link: "#",
      color: "border-slate-200",
      img: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&q=80&w=400"
    },
    {
      id: "mercor",
      name: "Mercor AI",
      desc: "The premier platform for technical AI training and specialized software engineering tasks.",
      link: "#",
      color: "border-emerald-200",
      img: "https://images.unsplash.com/photo-1486312338219-ce68d2c6f44d?auto=format&fit=crop&q=80&w=400"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const cardVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] }
    }
  };

  return (
    <div className="pt-24 pb-20">
      <section className="px-6 py-16 max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="max-w-3xl mb-16"
        >
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            Turn Your Expertise into <span className="text-blue-600">Digital Income</span>
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            Master the art of AI training. We provide the roadmap to leverage your professional skills 
            on the world's most advanced AI development platforms.
          </p>
        </motion.div>

        {/* Video Placeholder */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="w-full aspect-video bg-slate-100 rounded-[2rem] mb-20 flex flex-col items-center justify-center border-2 border-slate-200 group cursor-pointer hover:bg-slate-50 transition-all overflow-hidden relative shadow-inner"
        >
          <img 
            src="https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200" 
            alt="AI Training Video" 
            className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:scale-105 transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="relative w-full h-full flex items-center justify-center z-10 bg-slate-900/20 backdrop-blur-[2px]">
            <motion.div
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.9 }}
            >
              <PlayCircle size={80} className="text-white drop-shadow-2xl group-hover:text-blue-400 transition-colors" />
            </motion.div>
            <p className="absolute bottom-10 text-white font-bold tracking-widest uppercase text-xs group-hover:text-blue-200 transition-colors">Watch Introduction</p>
          </div>
        </motion.div>

        <IncomeCalculator />

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 gap-8"
        >
          {platforms.map((platform, index) => (
            <motion.div
              key={index}
              variants={cardVariants}
              whileHover={{ 
                y: -8, 
                boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
                borderColor: "rgba(59, 130, 246, 0.5)"
              }}
              className={`rounded-3xl bg-white border shadow-sm transition-all duration-300 group relative overflow-hidden flex flex-col ${platform.color}`}
            >
              <div className="h-48 overflow-hidden relative">
                <img 
                  src={platform.img} 
                  alt={platform.name} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent"></div>
              </div>
              <div className="p-10 pt-0 -mt-10 relative z-10 flex-grow flex flex-col">
                <div className="flex justify-between items-start mb-4">
                  <h3 className="text-2xl font-bold text-slate-900">{platform.name}</h3>
                  <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleBookmark(platform.id)}
                    className={cn(
                      "p-2 rounded-xl transition-all shadow-md",
                      isBookmarked(platform.id) ? "bg-blue-600 text-white" : "bg-white text-slate-400 hover:text-blue-600"
                    )}
                  >
                    {isBookmarked(platform.id) ? <BookmarkCheck size={20} /> : <Bookmark size={20} />}
                  </motion.button>
                </div>
                <p className="text-slate-600 mb-8 leading-relaxed">
                  {platform.desc}
                </p>
                <motion.a
                  href={platform.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  whileHover={{ x: 5 }}
                  className="mt-auto inline-flex items-center gap-2 bg-slate-900 text-white px-8 py-4 rounded-xl font-bold hover:bg-slate-800 transition-all shadow-md group-hover:shadow-lg"
                >
                  Get Started <ExternalLink size={16} className="group-hover:translate-x-1 transition-transform" />
                </motion.a>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </section>
    </div>
  );
};

export default AITraining;
