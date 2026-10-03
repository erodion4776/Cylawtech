import React from 'react';
import { motion } from 'motion/react';
import { 
  MessageCircle, Scale, Sparkles, FileCheck2, 
  BookOpen, Zap, Shield, ArrowRight, Lightbulb, 
  Clock, CheckCircle2, Globe, FileSearch, Users,
  Search, FilePen
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const HowItWorks: React.FC = () => {
  useDocumentTitle('How Lex AI Works - Nigerian & US Legal Assistant');

  return (
    <div className="w-full bg-white text-slate-900 overflow-x-hidden font-sans">

      {/* ==================== HERO ==================== */}
      <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 px-6 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl" />
          <div className="absolute top-1/4 -right-24 w-96 h-96 bg-amber-100/50 rounded-full blur-3xl" />
        </div>

        <div className="max-w-5xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-4 py-1.5 mb-6 text-xs font-bold text-slate-600 uppercase tracking-wider"
          >
            <Sparkles size={14} className="text-amber-500 animate-pulse" />
            Behind the Scenes
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-6 leading-[1.05]"
          >
            How Lex AI Works
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-600 max-w-3xl mx-auto mb-10 leading-relaxed"
          >
            Lex AI combines modern artificial intelligence with specialized legal expertise. Here's a transparent, step-by-step look at how it understands your questions, researches the law, and delivers clear, useful guidance for both Nigerian and United States legal matters.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
          >
            <Link
              to="/lex-ai"
              className="group inline-flex items-center gap-2 bg-slate-900 hover:bg-slate-800 text-white px-7 py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-slate-900/20 transition-all active:scale-95"
            >
              Try Lex AI Now
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ==================== THE 4-STEP WORKFLOW ==================== */}
      <section className="py-16 md:py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">The Lex AI Workflow</h2>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Four Simple Steps From Question to Answer
            </h3>
            <p className="text-slate-600 text-lg leading-relaxed">
              Instead of giving you a quick, generic answer, Lex AI acts like an experienced lawyer. It listens, asks clarifying questions, then delivers meaningful insight.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                step: '01',
                title: 'Ask Your Legal Question',
                desc: 'Describe your legal issue or request in your own natural language. There is no need for legal jargon. Lex AI can understand questions about contracts, disputes, business formation, tenancy, employment, intellectual property, and more.',
                icon: MessageCircle,
                color: 'bg-blue-600'
              },
              {
                step: '02',
                title: 'Lex AI Asks Clarifying Questions',
                desc: 'Just like a professional lawyer, Lex AI gathers context first. It asks follow-up questions about parties involved, dates, written documents, and the outcome you want. This ensures your answer is based on your real situation, not just a generic response.',
                icon: Search,
                color: 'bg-amber-600'
              },
              {
                step: '03',
                title: 'Deep Research & Legal Analysis',
                desc: 'Lex AI searches through its extensive legal knowledge library (including Nigerian CAMA 2020, the 1999 Constitution, Labor Acts, US corporate laws, and international legal frameworks) to analyze your situation and apply relevant statutes.',
                icon: BookOpen,
                color: 'bg-emerald-600'
              },
              {
                step: '04',
                title: 'Get Clear, Actionable Guidance',
                desc: 'Receive a complete, structured legal analysis including the key legal issues, the applicable laws, how those laws apply to your facts, and practical next steps you can take or discuss with a certified attorney.',
                icon: FileCheck2,
                color: 'bg-rose-600'
              }
            ].map((item, i) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="bg-white border border-slate-200 p-8 rounded-3xl hover:shadow-xl hover:border-slate-300 transition-all"
              >
                <div className="flex items-center gap-3 mb-5">
                  <div className={`w-12 h-12 rounded-2xl ${item.color} flex items-center justify-center text-white shadow-md`}>
                    <item.icon size={22} />
                  </div>
                  <span className="text-3xl font-black text-slate-200">{item.step}</span>
                </div>
                <h4 className="font-bold text-xl text-slate-900 mb-3">{item.title}</h4>
                <p className="text-slate-600 text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== CAPABILITIES ==================== */}
      <section className="py-16 md:py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">What Lex AI Can Do</h2>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Trained for Real Legal Work
            </h3>
            <p className="text-slate-600 text-lg leading-relaxed">
              Lex AI is specifically engineered to assist with everyday legal tasks, from basic questions to professional-grade document generation.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Lightbulb,
                title: 'Legal Issue Analysis',
                desc: 'Describe any legal problem and get a structured breakdown of your rights, risks, and options.'
              },
              {
                icon: FileSearch,
                title: 'Statute & Case Research',
                desc: 'Search Nigerian statutes, Supreme Court rulings, US federal laws, and state regulations instantly.'
              },
              {
                icon: FilePen,
                title: 'Draft Legal Documents',
                desc: 'Generate contracts, NDAs, affidavits, employment agreements, and demand letters.'
              },
              {
                icon: Shield,
                title: 'Contract Review',
                desc: 'Spot risks, loopholes, missing provisions, and vague clauses in your contracts and agreements.'
              },
              {
                icon: Globe,
                title: 'Dual Jurisdiction Support',
                desc: 'Switch between Nigerian Law and US Law workflows seamlessly to get context-specific advice.'
              },
              {
                icon: Clock,
                title: 'Available 24/7',
                desc: 'Instant answers at any time, with no appointment booking, no office hours, no waiting rooms.'
              }
            ].map((cap, i) => (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="bg-slate-50 border border-slate-200 p-6 rounded-3xl hover:bg-white hover:shadow-lg hover:border-slate-300 transition-all"
              >
                <div className="w-11 h-11 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 text-white">
                  <cap.icon size={20} />
                </div>
                <h4 className="font-bold text-base text-slate-900 mb-2">{cap.title}</h4>
                <p className="text-slate-600 text-sm leading-relaxed">{cap.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== FAQ ==================== */}
      <section className="py-16 md:py-24 px-6 bg-slate-50">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-14"
          >
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Common Questions</h2>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Frequently Asked
            </h3>
          </motion.div>

          <div className="space-y-4">
            {[
              {
                q: 'Is Lex AI a replacement for a real lawyer?',
                a: 'No. Lex AI provides legal information and research assistance, but it does not replace a licensed lawyer. For court representation, formal filings, or binding legal advice, always consult a qualified attorney.'
              },
              {
                q: 'Can Lex AI handle both Nigerian and US legal questions?',
                a: 'Yes. Lex AI is specifically trained on both Nigerian legal frameworks (such as CAMA 2020, the 1999 Constitution, and the Nigerian Labor Act) and US laws (including corporate law, federal statutes, and state-level regulations like Delaware LLC rules).'
              },
              {
                q: 'Are my conversations with Lex AI private?',
                a: 'Yes. All your consultations are encrypted and private. We never sell your data or share it with advertisers or third parties.'
              },
              {
                q: 'Do I need to pay to use Lex AI?',
                a: 'Lex AI is free to use for up to 10 legal inquiries per day. Professional plans with unlimited access are available for lawyers, firms, and businesses.'
              }
            ].map((item, i) => (
              <motion.div
                key={item.q}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
                className="bg-white border border-slate-200 p-6 rounded-2xl hover:border-slate-300 transition-all"
              >
                <h4 className="font-bold text-slate-900 mb-2 flex items-start gap-2">
                  <Zap size={16} className="text-blue-600 mt-0.5 shrink-0" />
                  {item.q}
                </h4>
                <p className="text-slate-600 text-sm leading-relaxed pl-6">{item.a}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== FINAL CTA ==================== */}
      <section className="py-20 md:py-28 px-6 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight leading-tight">
              Ready to Try Lex AI?
            </h2>
            <p className="text-slate-300 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
              Experience intelligent legal assistance built for Nigeria and the United States. Start your first conversation now — it's free.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link
                to="/lex-ai"
                className="group w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-900 px-8 py-4 rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                Chat with Lex AI Now
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default HowItWorks;
