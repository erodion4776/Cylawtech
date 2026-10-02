import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Brain, Dumbbell, ArrowRight, Sparkles, 
  Lock, Loader2, Globe, Scale, Send, ShoppingBag, 
  SplitSquareVertical
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import TipTapEditor from '../components/TipTapEditor';

const LexAI: React.FC = () => {
  useDocumentTitle('LexAI Workspace - Legal Intelligence Studio');
  
  const [mode, setMode] = useState<'prep' | 'training' | 'practice'>('training');
  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us'>('nigeria');
  const [editorOpen, setEditorOpen] = useState(true);
  
  // Usage tracking
  const [usageCount, setUsageCount] = useState<number>(() => {
    const saved = localStorage.getItem('lexai_usage');
    return saved ? parseInt(saved, 10) : 0;
  });
  const [showPaywall, setShowPaywall] = useState(false);

  // Drafting Canvas Content
  const [editorContent, setEditorContent] = useState<string>(
    '<h2>Legal Memorandum</h2><p><strong>ISSUE:</strong> State the key legal issue here.</p><p><strong>APPLICABLE RULE:</strong> Cite relevant statutory provisions and case law.</p><p><strong>ANALYSIS:</strong> Apply the statutory rules to the factual circumstances.</p><p><strong>CONCLUSION:</strong> Formulate the final professional opinion.</p>'
  );

  // Chat State
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{
    role: 'user' | 'ai';
    content: string;
    suggestedResource?: any;
  }>>([
    { 
      role: 'ai', 
      content: "Welcome to **LexAI Legal Studio**. I am your automated legal research partner configured for **Nigerian Law**. Ask any legal question, explore statutory frameworks, or request feedback on your draft." 
    }
  ]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    localStorage.setItem('lexai_usage', usageCount.toString());
  }, [usageCount]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isChatting]);

  const handleChat = async () => {
    if (!chatMessage.trim() || isChatting) return;

    if (usageCount >= 5) {
      setShowPaywall(true);
      return;
    }

    const userText = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: userText }]);
    setIsChatting(true);
    setUsageCount(prev => prev + 1);

    try {
      // Connects to the Supabase Edge Function or proxy
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: userText,
          site: 'lexai',
          jurisdiction: jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Federal Law',
          stage: mode,
          editorContent: mode === 'training' ? editorContent : undefined
        })
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || 'Legal intelligence service temporarily unavailable.');
      }

      let suggestedResource = null;
      const lower = userText.toLowerCase();
      if (lower.includes("incorporat") || lower.includes("tax") || lower.includes("contract") || lower.includes("guide")) {
        suggestedResource = {
          title: "Legal Drafting & Practice Framework",
          price: "$49.99",
          desc: "Complete collection of verified precedent agreements and statutory guidelines.",
          link: "/contact"
        };
      }

      setChatHistory(prev => [...prev, { 
        role: 'ai', 
        content: data.response, 
        suggestedResource 
      }]);
    } catch (err: any) {
      setChatHistory(prev => [...prev, { 
        role: 'ai', 
        content: `${err.message || 'Unable to connect to the legal intelligence engine. Please try again.'}` 
      }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="pt-20 min-h-screen bg-slate-50 flex flex-col relative">
      {/* Subscription Paywall Modal */}
      <AnimatePresence>
        {showPaywall && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md"
          >
            <motion.div 
              initial={{ scale: 0.92, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] p-10 max-w-xl w-full shadow-2xl text-center border border-slate-100"
            >
              <div className="w-16 h-16 bg-blue-600/10 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Lock size={32} />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-4">Complimentary Inquiries Completed</h2>
              <p className="text-slate-600 mb-8 text-sm leading-relaxed">
                You have reached your limit of free legal inquiries. Activate full access to continue researching statutes, analyzing precedents, and getting live drafting critiques.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-left">
                  <p className="text-[10px] font-bold text-blue-600 uppercase">Monthly Practice</p>
                  <h4 className="text-2xl font-black text-slate-900">$29<span className="text-xs font-normal text-slate-400">/mo</span></h4>
                </div>
                <div className="p-5 rounded-2xl bg-slate-900 text-white text-left">
                  <p className="text-[10px] font-bold text-blue-400 uppercase">Annual Firm License</p>
                  <h4 className="text-2xl font-black">$249<span className="text-xs font-normal text-slate-400">/yr</span></h4>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Link to="/contact" className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg hover:bg-blue-500 transition-all">
                  Activate Counsel License
                </Link>
                <button onClick={() => setShowPaywall(false)} className="text-xs text-slate-400 hover:text-slate-600">
                  Continue Exploring
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Top Legal Navigation Bar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-20 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center text-white">
              <Scale size={18} />
            </div>
            <div>
              <h1 className="font-bold text-sm text-slate-900 leading-none">LexAI Studio</h1>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Professional Legal Intelligence</span>
            </div>
          </div>

          <div className="hidden sm:flex bg-slate-100 p-1 rounded-full border border-slate-200">
            <button
              onClick={() => setJurisdiction('nigeria')}
              className={cn("px-3 py-1 rounded-full text-xs font-bold transition-all", jurisdiction === 'nigeria' ? "bg-white text-blue-900 shadow-xs" : "text-slate-500")}
            >
              🇳🇬 Nigerian Law
            </button>
            <button
              onClick={() => setJurisdiction('us')}
              className={cn("px-3 py-1 rounded-full text-xs font-bold transition-all", jurisdiction === 'us' ? "bg-white text-blue-900 shadow-xs" : "text-slate-500")}
            >
              🇺🇸 US Law
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[
              { id: 'prep', label: 'IRAC Prep', icon: <BookOpen size={14} /> },
              { id: 'training', label: 'Draft Critique', icon: <Brain size={14} /> },
              { id: 'practice', label: 'Clause Drafting', icon: <Dumbbell size={14} /> },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setMode(s.id as any)}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                  mode === s.id ? "bg-slate-900 text-white shadow-xs" : "text-slate-500 hover:text-slate-900"
                )}
              >
                {s.icon} <span className="hidden md:inline">{s.label}</span>
              </button>
            ))}
          </div>

          <button 
            onClick={() => setEditorOpen(!editorOpen)}
            className={cn("p-2 rounded-xl border transition-colors", editorOpen ? "bg-blue-50 border-blue-200 text-blue-600" : "bg-white border-slate-200 text-slate-500")}
            title="Toggle Drafting Canvas"
          >
            <SplitSquareVertical size={18} />
          </button>
        </div>
      </header>

      {/* Main Legal Workspace */}
      <div className="flex-grow flex overflow-hidden h-[calc(100vh-135px)]">
        {/* Left Side: TipTap Legal Drafting Canvas */}
        {editorOpen && (
          <div className="w-1/2 p-4 border-r border-slate-200 hidden lg:flex flex-col bg-white">
            <div className="flex items-center justify-between pb-3 mb-2 border-b border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Document Drafting Canvas</span>
              <span className="text-[10px] bg-slate-100 px-2.5 py-1 rounded-full text-slate-600 font-medium">Ready for Counsel Review</span>
            </div>
            <div className="flex-grow overflow-hidden">
              <TipTapEditor content={editorContent} onChange={setEditorContent} />
            </div>
          </div>
        )}

        {/* Right Side: AI Legal Counsel Chat */}
        <div className={cn("flex flex-col h-full bg-slate-50", editorOpen ? "w-full lg:w-1/2" : "w-full max-w-4xl mx-auto")}>
          <div className="flex-grow overflow-y-auto p-6 space-y-6">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={cn("flex flex-col", msg.role === 'ai' ? "items-start" : "items-end")}>
                <div className={cn(
                  "p-5 rounded-2xl max-w-[90%] text-sm leading-relaxed shadow-xs",
                  msg.role === 'ai' ? "bg-white border border-slate-200/80 text-slate-800" : "bg-slate-900 text-white"
                )}>
                  {msg.role === 'ai' ? (
                    <div className="prose prose-sm max-w-none prose-slate">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>

                {msg.suggestedResource && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-3 max-w-[90%] bg-gradient-to-r from-amber-500/10 to-amber-50 border border-amber-300/40 p-4 rounded-2xl"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-amber-800 uppercase tracking-widest flex items-center gap-1.5">
                        <ShoppingBag size={12} /> Practice Resource
                      </span>
                      <span className="font-bold text-xs text-amber-900">{msg.suggestedResource.price}</span>
                    </div>
                    <h5 className="font-bold text-slate-900 text-sm">{msg.suggestedResource.title}</h5>
                    <p className="text-xs text-slate-600 mb-3">{msg.suggestedResource.desc}</p>
                    <Link to={msg.suggestedResource.link} className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">
                      Acquire Framework <ArrowRight size={12} />
                    </Link>
                  </motion.div>
                )}
              </div>
            ))}

            {isChatting && (
              <div className="flex items-center gap-2.5 p-4 bg-white border border-slate-200 rounded-2xl w-fit">
                <Loader2 size={16} className="animate-spin text-blue-600" />
                <span className="text-xs text-slate-600 font-medium">Researching legal precedents and statutes...</span>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Inquiry Input Box */}
          <div className="p-4 bg-white border-t border-slate-200">
            <div className="relative">
              <textarea
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChat();
                  }
                }}
                placeholder="Ask a legal inquiry or request advice on your draft..."
                className="w-full pl-4 pr-12 py-3 bg-slate-100 border-0 rounded-2xl text-sm focus:ring-2 focus:ring-slate-900 outline-none resize-none h-14"
              />
              <button
                type="button"
                onClick={handleChat}
                disabled={isChatting || !chatMessage.trim()}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-9 h-9 bg-slate-900 text-white rounded-xl flex items-center justify-center disabled:opacity-30 hover:bg-slate-800 transition-all"
              >
                <Send size={15} />
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-400 mt-2">
              LexAI provides legal intelligence assistance. Always confirm critical statutory citations with verified counsel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexAI;
