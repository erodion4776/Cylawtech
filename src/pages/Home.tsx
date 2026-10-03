import React from 'react';
import { motion } from 'motion/react';
import { 
  MessageCircle, BookOpen, FileText, FileSearch, 
  Lightbulb, Clock, ArrowRight, Scale, Shield, 
  Users, Briefcase, GraduationCap, Heart, Lock, 
  CheckCircle2, Sparkles, Globe
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const Home: React.FC = () => {
  useDocumentTitle('Lex AI - Your Nigerian & US Legal AI Assistant');

  return (
    <div className="w-full bg-white text-slate-900 overflow-x-hidden font-sans">

      {/* ==================== HERO SECTION ==================== */}
      <section className="relative pt-28 pb-20 md:pt-36 md:pb-32 px-6 overflow-hidden">
        {/* Background Decorations */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
          <div className="absolute -top-24 -left-24 w-96 h-96 bg-blue-100/40 rounded-full blur-3xl" />
          <div className="absolute top-1/4 -right-24 w-96 h-96 bg-amber-100/40 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 bg-slate-100 border border-slate-200 rounded-full px-4 py-1.5 mb-6 text-xs font-bold text-slate-600 uppercase tracking-wider"
          >
            <Sparkles size={14} className="text-amber-500 animate-pulse" />
            Dual-Jurisdiction Legal Assistant · Nigeria & United States
          </motion.div>

          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="text-4xl md:text-6xl lg:text-7xl font-black tracking-tight mb-6 leading-[1.05]"
          >
            Legal Intelligence. <br />
            <span className="text-blue-600">Reimagined for Nigeria & The US.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-lg md:text-xl text-slate-600 max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            Lex AI is your personal, cross-border legal assistant. Ask legal questions, research Nigerian & US laws, draft contracts, review documents, and get clear, practical guidance — instantly.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Link
              to="/lex-ai"
              className="group w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-8 py-4 rounded-2xl font-bold text-base shadow-xl shadow-slate-900/20 flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              Start a Free Legal Chat
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </Link>
            <Link
              to="/about"
              className="w-full sm:w-auto bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 px-8 py-4 rounded-2xl font-bold text-base shadow-sm flex items-center justify-center transition-all active:scale-95"
            >
              How Lex AI Works
            </Link>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="mt-6 text-xs text-slate-400 uppercase tracking-wider font-bold"
          >
            No signup required · 10 free inquiries daily
          </motion.p>
        </div>
      </section>

      {/* ==================== HOW LEX AI HELPS YOU ==================== */}
      <section className="py-16 md:py-24 px-6 bg-slate-50">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Expert Capabilities</h2>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              A Global Legal Companion on Your Phone
            </h3>
            <p className="text-slate-600 text-lg leading-relaxed">
              Lex AI bridges boundaries, providing instant, structured analysis of complex rules and document drafting across both Nigerian and US legal systems.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              {
                icon: Lightbulb,
                title: 'Understand Legal Issues',
                desc: 'Describe any situation in simple terms. Lex AI helps you understand your legal standing, rights, and responsibilities under Nigerian or US law.',
                color: 'bg-amber-100 text-amber-700'
              },
              {
                icon: BookOpen,
                title: 'Cross-Border Research',
                desc: 'Instantly search statutory provisions, precedents, case law, Supreme Court rulings, and corporate laws from both Nigeria and the United States.',
                color: 'bg-blue-100 text-blue-700'
              },
              {
                icon: FileText,
                title: 'Draft Contracts & Agreements',
                desc: 'Create highly professional NDAs, service agreements, employment contracts, partnership deeds, tenancy contracts, and legal letters.',
                color: 'bg-emerald-100 text-emerald-700'
              },
              {
                icon: FileSearch,
                title: 'Contract & Document Review',
                desc: 'Upload or paste commercial agreements, operating models, or leases to instantly identify risks, loopholes, and standard provisions.',
                color: 'bg-rose-100 text-rose-700'
              },
              {
                icon: MessageCircle,
                title: 'Practical Guided Intakes',
                desc: 'Receive interactive follow-up questions to explore your specific issue, leading to a complete, formal, and structured action plan.',
                color: 'bg-indigo-100 text-indigo-700'
              },
              {
                icon: Clock,
                title: 'Available 24/7',
                desc: 'No expensive consultations or scheduling conflicts. Access international counsel-level advice instantly, whenever you need it.',
                color: 'bg-violet-100 text-violet-700'
              }
            ].map((feature, i) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.05 }}
                className="bg-white border border-slate-200 p-7 rounded-3xl hover:shadow-xl hover:border-slate-300 transition-all"
              >
                <div className={`w-12 h-12 rounded-2xl ${feature.color} flex items-center justify-center mb-5`}>
                  <feature.icon size={22} strokeWidth={2.2} />
                </div>
                <h4 className="font-bold text-lg text-slate-900 mb-2">{feature.title}</h4>
                <p className="text-slate-600 text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== WHO WE SERVE ==================== */}
      <section className="py-16 md:py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Designed for You</h2>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Empowering International & Local Minds
            </h3>
            <p className="text-slate-600 text-lg leading-relaxed">
              Lex AI supports different user workflows, helping you navigate cross-border, corporate, or personal legal questions with ease.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {[
              {
                icon: Briefcase,
                audience: 'For Lawyers & Legal Counsels',
                color: 'bg-blue-600',
                description: 'Drastically accelerate your drafting and research. Easily cross-reference provisions between US and Nigerian statutory requirements.'
              },
              {
                icon: Globe,
                audience: 'For Startup Founders & Businesses',
                color: 'bg-indigo-600',
                description: 'Manage US incorporation (e.g. Delaware LLCs) alongside local CAMA compliance, draft operating agreements, and protect intellectual property.'
              },
              {
                icon: GraduationCap,
                audience: 'For Scholars & Law Students',
                color: 'bg-amber-600',
                description: 'Perfect your academic research, master comparative legal analysis, and study case precedents using clear, structured IRAC reasoning.'
              },
              {
                icon: Heart,
                audience: 'For Individuals & Tenants',
                color: 'bg-rose-600',
                description: 'Know your statutory rights as a tenant, employee, or contract worker in Nigeria or any US state without the burden of expensive fees.'
              }
            ].map((item, i) => (
              <motion.div
                key={item.audience}
                initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="bg-slate-50 border border-slate-200 p-8 rounded-3xl flex items-start gap-5 hover:bg-slate-100 transition-colors"
              >
                <div className={`w-14 h-14 rounded-2xl ${item.color} flex items-center justify-center shrink-0 text-white shadow-md`}>
                  <item.icon size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-xl text-slate-900 mb-2">{item.audience}</h4>
                  <p className="text-slate-600 leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== HOW IT WORKS ==================== */}
      <section className="py-16 md:py-24 px-6 bg-slate-900 text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-30">
          <div className="absolute top-10 right-10 w-80 h-80 bg-blue-500/20 rounded-full blur-3xl" />
          <div className="absolute bottom-10 left-10 w-80 h-80 bg-amber-500/20 rounded-full blur-3xl" />
        </div>

        <div className="max-w-6xl mx-auto relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-16"
          >
            <h2 className="text-sm font-bold text-amber-400 uppercase tracking-widest mb-3">Intuitive Flow</h2>
            <h3 className="text-3xl md:text-5xl font-black mb-4 tracking-tight">
              An Intake Interview. Designed Like ChatGPT.
            </h3>
            <p className="text-slate-400 text-lg leading-relaxed">
              Lex AI behaves like an experienced corporate attorney, gathering your facts sequentially for the most accurate outcome.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {[
              { step: '01', title: 'Pose Inquiry', desc: 'Describe your legal situation, business idea, or dispute in standard plain language.' },
              { step: '02', title: 'Clarify Context', desc: 'Lex AI asks conversational follow-up questions to collect key dates, documents, and business details.' },
              { step: '03', title: 'Structural Analysis', desc: 'Once facts are established, receive a full formal analysis highlighting Issues, Laws, and Applications.' },
              { step: '04', title: 'Take Action', desc: 'Copy professional-grade legal clauses, contract frameworks, or clear action steps to review with your attorney.' },
            ].map((step, i) => (
              <motion.div
                key={step.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="bg-white/5 backdrop-blur-sm border border-white/10 p-6 rounded-3xl relative"
              >
                <div className="text-5xl font-black text-amber-400/30 mb-3">{step.step}</div>
                <h4 className="font-bold text-xl text-white mb-2">{step.title}</h4>
                <p className="text-slate-400 text-sm leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== TRUST & PRIVACY ==================== */}
      <section className="py-16 md:py-24 px-6 bg-white">
        <div className="max-w-6xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-14"
          >
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Confidentiality</h2>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Secure, Compliant, and Dual-Focused
            </h3>
            <p className="text-slate-600 text-lg leading-relaxed">
              Lex AI takes your privacy seriously, delivering secure information backed by robust statutory data.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                icon: Lock,
                title: 'Encrypted & Confidential',
                desc: 'Your consultation histories are stored securely, never sold, and kept strictly private between you and the intelligence engine.',
              },
              {
                icon: Shield,
                title: 'Responsible Information',
                desc: 'Lex AI provides general guidance to prepare you, clearly defining boundaries, and encouraging certified attorney sign-offs.',
              },
              {
                icon: Scale,
                title: 'Multijurisdictional Core',
                desc: 'Fully versed in CAMA 2020, Nigerian Labor Act, US State LLC Guidelines (Delaware/Wyoming), NDAs, and international commercial frameworks.',
              }
            ].map((trust, i) => (
              <motion.div
                key={trust.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.1 }}
                className="text-center p-8 border border-slate-200 rounded-3xl hover:border-slate-300 hover:shadow-lg transition-all"
              >
                <div className="w-14 h-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center mx-auto mb-5">
                  <trust.icon size={22} />
                </div>
                <h4 className="font-bold text-xl text-slate-900 mb-2">{trust.title}</h4>
                <p className="text-slate-600 text-sm leading-relaxed">{trust.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ==================== POPULAR QUESTIONS ==================== */}
      <section className="py-16 md:py-24 px-6 bg-slate-50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center max-w-2xl mx-auto mb-14"
          >
            <h2 className="text-sm font-bold text-blue-600 uppercase tracking-widest mb-3">Intake Examples</h2>
            <h3 className="text-3xl md:text-5xl font-black text-slate-900 mb-4 tracking-tight">
              Common Nigerian & US Inquiries
            </h3>
            <p className="text-slate-600 text-lg leading-relaxed">
              Discover what users research across both legal spectrums inside our playground.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              '"How do I register a company under Nigeria’s CAMA 2020?"',
              '"How do I set up a Delaware LLC as a non-US resident?"',
              '"My landlord locked me out without notice under Nigerian tenancy law. What can I do?"',
              '"What is the difference between an asset purchase and a stock purchase under US corporate law?"',
              '"What are the requirements for employee termination notice under the Nigerian Labor Act?"',
              '"How do I file for a trademark registration with the USPTO?"',
              '"How do I draft a dual-jurisdiction non-disclosure agreement for software development?"',
              '"Can I take legal action for online defamation or breach of commercial trust?"',
            ].map((question, i) => (
              <motion.div
                key={question}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.03 }}
                className="bg-white border border-slate-200 p-5 rounded-2xl flex items-start gap-3 hover:border-blue-500 hover:bg-blue-50/40 transition-all"
              >
                <MessageCircle size={16} className="text-blue-600 shrink-0 mt-0.5" />
                <p className="text-sm text-slate-800 font-medium italic leading-relaxed">{question}</p>
              </motion.div>
            ))}
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mt-10"
          >
            <Link
              to="/lex-ai"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 font-bold text-sm hover:underline"
            >
              Start Your Own Intake Session
              <ArrowRight size={14} />
            </Link>
          </motion.div>
        </div>
      </section>

      {/* ==================== FINAL CTA BAND ==================== */}
      <section className="py-20 md:py-28 px-6 bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
        </div>

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 bg-white/10 border border-white/20 rounded-full px-4 py-1.5 mb-6 text-xs font-bold uppercase tracking-wider">
              <Sparkles size={14} className="text-amber-400" />
              Start Instantly — No Credit Card Required
            </div>
            
            <h2 className="text-4xl md:text-6xl font-black mb-6 tracking-tight leading-tight">
              Experience the Future of <br />
              Dual-Jurisdiction Legal Support.
            </h2>
            <p className="text-slate-300 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
              Consult Lex AI today. Analyze any contract, draft professional documents, or investigate US or Nigerian statutes — completely free up to 10 inquiries daily.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-10">
              <Link
                to="/lex-ai"
                className="group w-full sm:w-auto bg-white hover:bg-slate-100 text-slate-900 px-8 py-4 rounded-2xl font-black text-base shadow-xl flex items-center justify-center gap-2 transition-all active:scale-95"
              >
                Chat with Lex AI Now
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to="/contact"
                className="w-full sm:w-auto bg-white/10 hover:bg-white/15 border border-white/20 text-white px-8 py-4 rounded-2xl font-bold text-base flex items-center justify-center transition-all active:scale-95"
              >
                Enterprise Solutions
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 text-xs text-slate-400 font-medium">
              {['10 complimentary daily runs', 'Delaware & CAMA ready', 'Safe & encrypted'].map((item) => (
                <div key={item} className="flex items-center gap-1.5">
                  <CheckCircle2 size={14} className="text-emerald-400" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* ==================== EXPANEDED LEGAL DISCLAIMER ==================== */}
      <section className="py-8 px-6 bg-amber-50 border-t border-amber-200">
        <div className="max-w-5xl mx-auto flex items-start gap-3">
          <Shield size={18} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-relaxed">
            <strong className="font-bold">Important Notice: </strong> Lex AI provides legal information, statutory references, and automated document generation templates for educational and preparatory assistance. It does not provide formal legal representation, advocacy, or counsel, and does not establish an attorney-client relationship. For binding legal opinions, formal court filings, and litigated disputes, always verify your options and review your citations with a qualified lawyer in Nigeria or the United States.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Home;
