import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Mail, MessageSquare, Send, CheckCircle2, Loader2 } from 'lucide-react';

const Contact = () => {
  const [formData, setFormData] = useState({
    email: '',
    message: ''
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'submitted'>('idle');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.email && formData.message) {
      setStatus('submitting');
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      setStatus('submitted');
      setFormData({ email: '', message: '' });
    }
  };

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
  };

  return (
    <div className="pt-24 pb-20">
      <section className="px-6 py-16 max-w-7xl mx-auto flex flex-col lg:flex-row items-center gap-16">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="lg:w-1/2 text-center lg:text-left"
        >
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-8 tracking-tight">
            Stay <span className="text-blue-600">Connected</span>
          </h1>
          <p className="text-xl text-slate-600 mb-12 leading-relaxed max-w-2xl mx-auto lg:mx-0">
            Have questions about our platforms or want to explore partnership opportunities? 
            We'd love to hear from you.
          </p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 max-w-2xl mx-auto lg:mx-0">
            <div className="flex items-center gap-4 group cursor-pointer">
              <motion.div whileHover={{ scale: 1.2, rotate: 10 }} className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-600 shadow-sm">
                <Mail size={20} />
              </motion.div>
              <span className="text-slate-600 font-medium group-hover:text-blue-600 transition-colors">contact@cyazor.com</span>
            </div>
            <div className="flex items-center gap-4 group cursor-pointer">
              <motion.div whileHover={{ scale: 1.2, rotate: -10 }} className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <MessageSquare size={20} />
              </motion.div>
              <span className="text-slate-600 font-medium group-hover:text-indigo-600 transition-colors">Support 24/7</span>
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.4, 0, 0.2, 1] }}
          className="lg:w-1/2 w-full bg-white rounded-[2.5rem] p-8 md:p-12 border border-slate-200 shadow-2xl overflow-hidden relative"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50 rounded-bl-[5rem] -z-10"></div>
          <AnimatePresence mode="wait">
            {status === 'submitted' ? (
              <motion.div 
                key="success"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="flex flex-col items-center justify-center text-center py-8"
              >
                <motion.div 
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12, stiffness: 200 }}
                  className="w-20 h-20 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mb-6 shadow-inner"
                >
                  <CheckCircle2 size={40} />
                </motion.div>
                <h3 className="text-2xl font-bold text-slate-900 mb-2">Message Sent!</h3>
                <p className="text-slate-500">Thank you for reaching out. We'll get back to you shortly.</p>
                <motion.button 
                  whileHover={{ scale: 1.05 }}
                  onClick={() => setStatus('idle')}
                  className="mt-8 text-blue-600 font-bold hover:underline"
                >
                  Send another message
                </motion.button>
              </motion.div>
            ) : (
              <motion.form 
                key="form"
                variants={containerVariants}
                initial="hidden"
                animate="visible"
                onSubmit={handleSubmit} 
                className="space-y-6 text-left"
              >
                <motion.div variants={itemVariants}>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Email Address</label>
                  <input
                    type="email"
                    required
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
                    placeholder="john@example.com"
                  />
                </motion.div>
                <motion.div variants={itemVariants}>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Message</label>
                  <textarea
                    required
                    rows={4}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="w-full px-6 py-4 rounded-2xl bg-slate-50 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all resize-none"
                    placeholder="How can we help you?"
                  ></textarea>
                </motion.div>
                <motion.div variants={itemVariants}>
                  <motion.button
                    type="submit"
                    disabled={status === 'submitting'}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {status === 'submitting' ? (
                      <>Processing <Loader2 className="animate-spin" size={18} /></>
                    ) : (
                      <>Send Message <Send size={18} /></>
                    )}
                  </motion.button>
                </motion.div>
              </motion.form>
            )}
          </AnimatePresence>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-24 rounded-[3rem] overflow-hidden shadow-2xl border-8 border-white relative h-[400px]"
        >
          <img 
            src="https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200" 
            alt="Office Workspace" 
            className="w-full h-full object-cover"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-slate-900/20 flex items-center justify-center">
            <div className="text-center text-white p-8 backdrop-blur-md bg-white/10 rounded-3xl border border-white/20">
              <h3 className="text-3xl font-bold mb-2">Visit Our Workspace</h3>
              <p className="text-white/80">Innovation happens here every day.</p>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
};

export default Contact;
