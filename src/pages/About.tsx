import React from 'react';
import { motion } from 'motion/react';
import { Users, Target, Scale, Brain, Globe, TrendingUp, Zap, Sparkles } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const About = () => {
  useDocumentTitle('LexAI - Powered by CyAzor Tech');

  const values = [
    {
      title: "Legal Precision",
      desc: "Harnessing advanced LLMs to deliver accurate, citation-ready legal analysis.",
      icon: <Scale size={24} />
    },
    {
      title: "Technological Edge",
      desc: "Integrating the latest in AI to give lawyers a speed advantage in research.",
      icon: <Brain size={24} />
    },
    {
      title: "Accessibility",
      desc: "Making complex laws and legal tools accessible to everyone, everywhere.",
      icon: <Globe size={24} />
    },
    {
      title: "Growth Focus",
      desc: "Enabling legal professionals to scale their practice and expertise.",
      icon: <TrendingUp size={24} />
    }
  ];

  return (
    <div className="pt-24 pb-20">
      <section className="px-6 py-16 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center mb-24">
          <motion.div
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          >
            <h1 className="text-5xl md:text-7xl font-black text-slate-900 mb-8 tracking-tighter leading-none">
              The Mind Behind <span className="text-blue-600 underline underline-offset-8">LexAI</span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed font-medium">
              LexAI is the flagship product of **CyAzor Tech**, a pioneer in the intersection of digital growth and legal methodology. 
              Founded by Attorney Cynthia Azor, our goal is to eliminate the friction in legal practice through intelligent automation.
            </p>
            <div className="space-y-6 text-lg text-slate-500 leading-relaxed">
              <p>
                We believe the future of the legal profession belongs to those who can master the relationship between complex human judgment and high-speed artificial intelligence.
              </p>
              <p>
                LexAI represents years of research into legal reasoning frameworks (IRAC), bar examination strategy, and large language model optimization. It’s not just a chat tool; it’s a professional legal workstation.
              </p>
            </div>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            className="relative"
          >
            <div className="aspect-[4/5] bg-slate-100 rounded-[3.5rem] overflow-hidden shadow-2xl border-4 border-slate-100">
              <img 
                src="https://i.ibb.co/hF4k7B2Z/attorney-cynthia-azor-1.png" 
                alt="Attorney Cynthia Azor" 
                className="w-full h-full object-cover object-top"
                referrerPolicy="no-referrer"
              />
            </div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.8 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.5 }}
              className="absolute -bottom-8 -left-8 bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl border border-slate-800 max-w-xs hidden md:block text-white"
            >
              <div className="flex items-center gap-3 mb-4">
                 <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                    <Sparkles size={16} />
                 </div>
                 <span className="font-bold">Founded 2024</span>
              </div>
              <p className="font-bold text-lg mb-2">LexAI Ecosystem</p>
              <p className="text-slate-400 text-xs">Transforming how legal professionals interact with technology.</p>
            </motion.div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-32">
          {[
            {
               title: "Our Mission",
               desc: "To equip legal minds with high-performance AI tools that simplify research and amplify career earnings.",
               icon: <Target size={32} className="text-blue-600" />
            },
            {
               title: "Our Vision",
               desc: "To become the global standard for legal-AI integration in developing and international markets.",
               icon: <Globe size={32} className="text-indigo-600" />
            },
            {
               title: "Our Values",
               desc: "Authority, Precision, and Velocity. We don't just build software; we build leverage.",
               icon: <Zap size={32} className="text-emerald-600" />
            }
          ].map((item, i) => (
            <motion.div 
               key={i}
               initial={{ opacity: 0, y: 30 }}
               whileInView={{ opacity: 1, y: 0 }}
               viewport={{ once: true }}
               transition={{ delay: i * 0.2 }}
               className="p-10 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex flex-col items-center text-center group hover:bg-white hover:shadow-2xl transition-all duration-500"
            >
               <div className="mb-6 group-hover:scale-110 transition-transform">
                  {item.icon}
               </div>
               <h3 className="text-2xl font-black text-slate-900 mb-4">{item.title}</h3>
               <p className="text-slate-500 leading-relaxed font-medium">{item.desc}</p>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default About;
