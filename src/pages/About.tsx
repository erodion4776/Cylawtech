import React from 'react';
import { motion } from 'motion/react';
import { Users, Target, Lightbulb, ShieldCheck } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const About = () => {
  useDocumentTitle('CyAzor - About');

  const values = [
    {
      title: "Innovation",
      desc: "Constantly pushing the boundaries of what's possible in legal technology.",
      icon: <Lightbulb size={24} />
    },
    {
      title: "Integrity",
      desc: "Maintaining the highest ethical standards in every solution we build.",
      icon: <ShieldCheck size={24} />
    },
    {
      title: "Community",
      desc: "Empowering a global network of legal professionals and tech enthusiasts.",
      icon: <Users size={24} />
    },
    {
      title: "Impact",
      desc: "Creating tangible value and career growth for our users.",
      icon: <Target size={24} />
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
            <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-8 tracking-tight">
              About <span className="text-blue-600">CyAzor</span> LawTech Solutions
            </h1>
            <p className="text-lg text-slate-600 mb-6 leading-relaxed">
              CyAzor LawTech Solutions was founded with a singular vision: to modernize the legal industry 
              by integrating cutting-edge technology with traditional legal expertise. We believe that 
              the future of law is digital, and our mission is to ensure that every legal professional 
              has the tools and knowledge to thrive in this new era.
            </p>
            <p className="text-lg text-slate-600 leading-relaxed">
              From AI-driven training programs to comprehensive bar preparation and digital legislative 
              databases, we are building a complete ecosystem for the modern lawyer.
            </p>
          </motion.div>
          <motion.div 
            initial={{ opacity: 0, x: 40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
            className="relative"
          >
            <div className="aspect-square bg-slate-100 rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white">
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
              className="absolute -bottom-8 -left-8 bg-white p-8 rounded-3xl shadow-xl border border-slate-100 max-w-xs hidden md:block"
            >
              <p className="text-slate-900 font-bold text-xl mb-2">10k+</p>
              <p className="text-slate-500 text-sm">Professionals empowered through our platforms.</p>
            </motion.div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-24">
          {[
            {
              title: "Mission",
              desc: "To democratize access to legal technology and empower the next generation of legal professionals with the digital skills necessary to lead in an AI-driven world.",
              img: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&q=80&w=400"
            },
            {
              title: "Vision",
              desc: "A future where legal expertise is seamlessly integrated with technology, creating unprecedented opportunities for growth and innovation.",
              img: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=400"
            },
            {
              title: "Why CyAzor?",
              desc: "We bridge the gap between traditional practice and the digital frontier, providing the structure and power needed to succeed in a modern legal landscape.",
              img: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=400"
            }
          ].map((item, i) => (
            <motion.div 
              key={i}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.2 }}
              whileHover={{ y: -5 }}
              className="rounded-3xl bg-white border border-slate-100 shadow-sm hover:shadow-md transition-all overflow-hidden group"
            >
              <div className="h-40 overflow-hidden relative">
                <img 
                  src={item.img} 
                  alt={item.title} 
                  className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  referrerPolicy="no-referrer"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-white to-transparent"></div>
              </div>
              <div className="p-8 pt-0 -mt-8 relative z-10">
                <h3 className="text-2xl font-bold text-slate-900 mb-4">{item.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">
                  {item.desc}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="mb-24">
          <h2 className="text-3xl font-bold text-slate-900 mb-12 text-center">Our Core Values</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {values.map((value, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                whileHover={{ y: -5, scale: 1.02 }}
                className="p-8 rounded-3xl bg-slate-50 border border-slate-100 text-center transition-all"
              >
                <motion.div 
                  whileHover={{ rotate: 15 }}
                  className="w-12 h-12 bg-white rounded-2xl shadow-sm flex items-center justify-center text-blue-600 mx-auto mb-6"
                >
                  {value.icon}
                </motion.div>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{value.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{value.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
};

export default About;
