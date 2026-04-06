import React from 'react';
import { motion } from 'motion/react';
import { BookOpen, Briefcase, Cpu, Heart, ArrowRight, PlayCircle } from 'lucide-react';
import { cn } from '../lib/utils';

const BarBeyond = () => {
  const pillars = [
    {
      title: "Bar Prep",
      desc: "Strategic resources and mentorship to conquer the bar exam with confidence.",
      icon: <BookOpen size={24} />,
      color: "bg-blue-50 text-blue-600",
      img: "https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&q=80&w=400"
    },
    {
      title: "Career Growth",
      desc: "Navigating the modern legal market and building a sustainable professional brand.",
      icon: <Briefcase size={24} />,
      color: "bg-indigo-50 text-indigo-600",
      img: "https://images.unsplash.com/photo-1521737711867-e3b97375f902?auto=format&fit=crop&q=80&w=400"
    },
    {
      title: "AI for Lawyers",
      desc: "Practical applications of artificial intelligence to enhance legal efficiency.",
      icon: <Cpu size={24} />,
      color: "bg-slate-50 text-slate-600",
      img: "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=400"
    },
    {
      title: "Productivity & Wellness",
      desc: "Maintaining peak performance and mental health in a high-pressure industry.",
      icon: <Heart size={24} />,
      color: "bg-rose-50 text-rose-600",
      img: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&q=80&w=400"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const pillarVariants = {
    hidden: { opacity: 0, scale: 0.9, y: 20 },
    visible: { 
      opacity: 1, 
      scale: 1, 
      y: 0,
      transition: { 
        type: "spring",
        damping: 15,
        stiffness: 100
      }
    }
  };

  return (
    <div className="pt-24 pb-20">
      <section className="px-6 py-16 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="lg:w-1/2"
        >
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            Pass the Bar. Build Your Career. <span className="text-blue-600">Go Beyond.</span>
          </h1>
          <p className="text-xl text-slate-600 leading-relaxed">
            CyAzor Bar & Beyond is your ultimate educational hub. We don't just help you pass exams; 
            we prepare you for the future of legal practice in a digital world.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="lg:w-1/2 relative"
        >
          <div className="rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white">
            <img 
              src="https://images.unsplash.com/photo-1505664194779-8beaceb93744?auto=format&fit=crop&q=80&w=1000" 
              alt="Confident Lawyer" 
              className="w-full h-[400px] object-cover"
              referrerPolicy="no-referrer"
            />
          </div>
          <div className="absolute -bottom-6 -right-6 bg-white p-6 rounded-3xl shadow-xl border border-slate-100">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                <Briefcase size={24} />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Career Success</p>
                <p className="text-lg font-bold text-slate-900">Mentorship Ready</p>
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      <section className="px-6 max-w-7xl mx-auto">
        {/* Video Placeholder */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="w-full aspect-video bg-slate-100 rounded-[2rem] mb-20 flex flex-col items-center justify-center border-2 border-slate-200 group cursor-pointer hover:bg-slate-50 transition-colors overflow-hidden relative shadow-xl"
        >
          <img 
            src="https://images.unsplash.com/photo-1521791136064-7986c2923216?auto=format&fit=crop&q=80&w=1200" 
            alt="Bar Prep Video" 
            className="absolute inset-0 w-full h-full object-cover opacity-50 group-hover:scale-105 transition-transform duration-700"
            referrerPolicy="no-referrer"
          />
          <div className="relative w-full h-full flex items-center justify-center z-10 bg-slate-900/10 backdrop-blur-[1px]">
            <motion.div whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}>
              <PlayCircle size={80} className="text-white drop-shadow-2xl group-hover:text-blue-400 transition-colors" />
            </motion.div>
            <p className="absolute bottom-10 text-white font-bold tracking-widest uppercase text-xs group-hover:text-blue-200 transition-colors">Watch Introduction</p>
          </div>
        </motion.div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-20"
        >
          {pillars.map((pillar, index) => (
            <motion.div
              key={index}
              variants={pillarVariants}
              whileHover={{ y: -10, shadow: "0 20px 25px -5px rgb(0 0 0 / 0.1)" }}
              className="rounded-3xl bg-white border border-slate-100 shadow-sm transition-all flex flex-col items-center text-center overflow-hidden group"
            >
              <div className="w-full h-32 overflow-hidden relative">
                <img 
                  src={pillar.img} 
                  alt={pillar.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent"></div>
              </div>
              <div className="p-8 pt-0 -mt-8 relative z-10">
                <motion.div 
                  whileHover={{ rotate: 360 }}
                  transition={{ duration: 0.8 }}
                  className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-6 ${pillar.color} shadow-lg`}
                >
                  {pillar.icon}
                </motion.div>
                <h3 className="text-lg font-bold text-slate-900 mb-3">{pillar.title}</h3>
                <p className="text-slate-500 text-xs leading-relaxed">{pillar.desc}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Future Funnel Box */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="bg-slate-900 rounded-[2.5rem] p-10 md:p-16 text-white overflow-hidden relative shadow-2xl"
        >
          <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold mb-6">Future Career Funnel दिशा (Direction)</h2>
              <p className="text-slate-400 text-lg mb-8 leading-relaxed">
                We are building a comprehensive funnel that takes you from a law student to a 
                tech-savvy legal professional. Stay tuned for our upcoming mentorship programs 
                and digital toolkits.
              </p>
              <motion.button 
                whileHover={{ x: 5 }}
                className="flex items-center gap-2 text-blue-400 font-bold hover:text-blue-300 transition-colors group"
              >
                Join the Community <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
              </motion.button>
            </div>
            <div className="hidden md:block">
              <div className="grid grid-cols-2 gap-4">
                {[1, 2, 3, 4].map((i) => (
                  <motion.div 
                    key={i}
                    initial={{ opacity: 0, scale: 0.8 }}
                    whileInView={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.1 }}
                    className={cn(
                      "h-32 bg-white/5 rounded-2xl border border-white/10",
                      i === 2 && "mt-8",
                      i === 3 && "-mt-8"
                    )}
                  />
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default BarBeyond;
