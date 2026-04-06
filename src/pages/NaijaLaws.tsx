import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Bell, CheckCircle2, Search, Book, ShieldCheck } from 'lucide-react';

const NaijaLaws = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      setSubmitted(true);
      setEmail('');
    }
  };

  const highlights = [
    {
      title: "Instant Search",
      desc: "Find specific laws and sections in seconds with our AI-powered search engine.",
      icon: <Search size={20} />
    },
    {
      title: "Case Law Integration",
      desc: "See relevant court rulings directly alongside statutory provisions.",
      icon: <Book size={20} />
    },
    {
      title: "Verified Content",
      desc: "Access the most up-to-date and accurate database of Nigerian legislation.",
      icon: <ShieldCheck size={20} />
    }
  ];

  return (
    <div className="pt-24 pb-20">
      <section className="px-6 py-16 max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center gap-12 mb-20">
          <div className="lg:w-1/2 text-center lg:text-left">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="inline-flex items-center gap-2 px-4 py-2 bg-amber-50 text-amber-700 rounded-full text-sm font-bold mb-6"
            >
              <Bell size={16} /> Coming Soon
            </motion.div>
            <motion.h1 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.5 }}
              className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight"
            >
              Digital Access to <span className="text-emerald-600">Nigerian Laws</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 1.5, delay: 0.5 }}
              className="text-xl text-slate-600 leading-relaxed"
            >
              We are digitizing the Nigerian legal landscape. Access laws, regulations, and case precedents 
              through a seamless, modern interface designed for the 21st-century lawyer.
            </motion.p>
          </div>
          <motion.div 
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.8 }}
            className="lg:w-1/2 relative"
          >
            <div className="rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white">
              <img 
                src="https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&q=80&w=1000" 
                alt="Nigerian Law" 
                className="w-full h-[400px] object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-emerald-900/20 mix-blend-overlay"></div>
            </div>
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          {highlights.map((item, index) => (
            <motion.div 
              key={index} 
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              whileHover={{ y: -5 }}
              className="p-8 rounded-3xl bg-white border border-slate-100 shadow-sm flex flex-col items-center text-center"
            >
              <div className="w-12 h-12 bg-slate-50 rounded-xl shadow-sm flex items-center justify-center text-blue-600 mb-6">
                {item.icon}
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-3">{item.title}</h3>
              <p className="text-slate-500 text-xs leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Waitlist Box */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          className="max-w-5xl mx-auto bg-white rounded-[2.5rem] border border-slate-200 shadow-2xl overflow-hidden flex flex-col md:flex-row"
        >
          <div className="md:w-1/2 p-10 md:p-16 text-center md:text-left flex flex-col justify-center">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">Join the Waitlist</h2>
            <p className="text-slate-600 mb-10 max-w-lg">
              Be the first to experience the future of Nigerian law. Simple, focused, and powerful.
            </p>
            {/* Form logic remains same */}
            {submitted ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex flex-col items-center md:items-start gap-4 text-emerald-600"
              >
                <CheckCircle2 size={48} />
                <p className="text-xl font-bold">You're on the list!</p>
                <p className="text-slate-500">We'll notify you as soon as we launch.</p>
              </motion.div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-6 w-full max-w-md">
                <div className="relative group">
                  <input
                    type="email"
                    placeholder="Email Address"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all peer placeholder-transparent"
                    id="waitlist-email"
                  />
                  <label 
                    htmlFor="waitlist-email"
                    className="absolute left-6 -top-2.5 bg-white px-2 text-xs font-bold text-blue-600 transition-all peer-placeholder-shown:text-base peer-placeholder-shown:text-slate-400 peer-placeholder-shown:top-4 peer-placeholder-shown:bg-transparent peer-focus:-top-2.5 peer-focus:text-xs peer-focus:text-blue-600 peer-focus:bg-white pointer-events-none"
                  >
                    Email Address
                  </label>
                </div>
                <motion.button
                  type="submit"
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold hover:bg-slate-800 transition-all whitespace-nowrap shadow-lg"
                >
                  Join the Waitlist
                </motion.button>
              </form>
            )}
          </div>
          <div className="md:w-1/2 relative min-h-[300px]">
            <img 
              src="https://images.unsplash.com/photo-1512428559087-560fa5ceab42?auto=format&fit=crop&q=80&w=800" 
              alt="Person using phone" 
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-emerald-600/10 mix-blend-multiply"></div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default NaijaLaws;
