import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BookOpen, Brain, Dumbbell, ArrowRight, Sparkles, Shield, 
  Lock, Loader2, Globe, Scale, Send, FileText, ShoppingBag,
  ExternalLink, Info
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';
import TipTapEditor from '../components/TipTapEditor';

const LexAI = () => {
  useDocumentTitle('CyAzor - LexAI Workspace');
  const [mode, setMode] = useState<'prep' | 'training' | 'practice'>('prep');
  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us'>('nigeria');
  
  // Editor State
  const [editorContent, setEditorContent] = useState('<h2>Legal Memo</h2><p>Issue: ...</p><p>Rule: ...</p><p>Analysis: ...</p><p>Conclusion: ...</p>');

  // Chat State
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string, suggestedResource?: any}[]>([
    { 
      role: 'ai', 
      content: "Welcome to your LexAI Workspace. I'm your legal mentor. I've set our focus to **Nigerian Law** and **Prep Mode**. How can I help you structure your IRAC framework today?" 
    }
  ]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory]);

  const handleChat = async () => {
    if (!chatMessage) return;
    const newMessage = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: newMessage }]);
    setIsChatting(true);
    
    try {
      const res = await fetch('/.netlify/functions/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          message: newMessage,
          jurisdiction,
          stage: mode,
          editorContent
        })
      });
      const data = await res.json();
      
      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.response) {
        throw new Error("Empty response from AI");
      }
      
      // Check for keywords to suggest resources
      let suggestedResource = null;
      const lowerResponse = data.response.toLowerCase();
      if (lowerResponse.includes("premium") || lowerResponse.includes("guide")) {
        suggestedResource = {
          title: "Premium Legal Drafting Guide",
          price: "$49.99",
          desc: "Master the art of legal writing with our comprehensive framework.",
          link: "/resource-store"
        };
      }

      setChatHistory(prev => [...prev, { role: 'ai', content: data.response, suggestedResource }]);
    } catch (error: any) {
      console.error(error);
      const errorMsg = error.message || "I'm having trouble connecting to my knowledge base. Please try again.";
      setChatHistory(prev => [...prev, { role: 'ai', content: `**Error:** ${errorMsg}\n\nPlease try again.` }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="pt-20 min-h-screen bg-white flex flex-col">
      {/* Header / Toolbar */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-4 sticky top-20 z-40">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#1e3a8a] rounded-lg flex items-center justify-center text-white">
              <Scale size={18} />
            </div>
            <span className="font-bold text-slate-900">LexAI Workspace</span>
          </div>
          
          {/* Jurisdiction Toggle */}
          <div className="flex bg-slate-100 p-1 rounded-full border border-slate-200">
            <button 
              onClick={() => setJurisdiction('nigeria')}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                jurisdiction === 'nigeria' ? "bg-white text-[#1e3a8a] shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Globe size={14} /> Nigeria Law
            </button>
            <button 
              onClick={() => setJurisdiction('us')}
              className={cn(
                "px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-2",
                jurisdiction === 'us' ? "bg-white text-[#1e3a8a] shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              <Globe size={14} /> US Law
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Stage Selector */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
            {[
              { id: 'prep', label: 'Prep', icon: <BookOpen size={14} /> },
              { id: 'training', label: 'Training', icon: <Brain size={14} /> },
              { id: 'practice', label: 'Practice', icon: <Dumbbell size={14} /> },
            ].map((s) => (
              <button
                key={s.id}
                onClick={() => setMode(s.id as any)}
                className={cn(
                  "px-4 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2",
                  mode === s.id ? "bg-[#1e3a8a] text-white shadow-md" : "text-slate-500 hover:text-slate-700"
                )}
              >
                {s.icon} {s.label}
              </button>
            ))}
          </div>
          
          <Link to="/resource-store" className="p-2 text-slate-500 hover:text-[#d4af37] transition-colors">
            <ShoppingBag size={20} />
          </Link>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="flex-grow flex flex-col overflow-hidden h-[calc(100vh-140px)]">
        {/* Full Width: AI Mentor Chat */}
        <div className="w-full max-w-4xl mx-auto border-x border-slate-200 flex flex-col bg-slate-50 h-full">
          <div className="p-4 border-b border-slate-200 bg-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-slate-700">AI Mentor Online</span>
            </div>
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {mode} Mode
            </div>
          </div>

          <div className="flex-grow overflow-y-auto p-4 space-y-6">
            {chatHistory.map((msg, idx) => (
              <div key={idx} className={cn(
                "flex flex-col",
                msg.role === 'ai' ? "items-start" : "items-end"
              )}>
                <div className={cn(
                  "p-4 rounded-2xl shadow-sm max-w-[90%] text-sm leading-relaxed",
                  msg.role === 'ai' 
                    ? "bg-white border border-slate-100 text-slate-700" 
                    : "bg-[#1e3a8a] text-white"
                )}>
                  {msg.role === 'ai' ? (
                    <div className="prose prose-sm max-w-none prose-slate">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}
                </div>
                
                {/* Suggested Resource Card */}
                {msg.suggestedResource && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="mt-3 w-full max-w-[90%] bg-gradient-to-br from-white to-slate-50 border-2 border-[#d4af37]/30 rounded-2xl p-4 shadow-md"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2 text-[#d4af37]">
                        <ShoppingBag size={16} />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Suggested Resource</span>
                      </div>
                      <span className="text-sm font-bold text-[#1e3a8a]">{msg.suggestedResource.price}</span>
                    </div>
                    <h4 className="font-bold text-slate-900 text-sm mb-1">{msg.suggestedResource.title}</h4>
                    <p className="text-slate-500 text-xs mb-3">{msg.suggestedResource.desc}</p>
                    <Link 
                      to={msg.suggestedResource.link}
                      className="w-full py-2 bg-[#d4af37] text-white rounded-lg text-xs font-bold flex items-center justify-center gap-2 hover:bg-[#c4a132] transition-colors"
                    >
                      View in Store <ArrowRight size={14} />
                    </Link>
                  </motion.div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          <div className="p-4 bg-white border-t border-slate-200">
            <div className="relative">
              <textarea
                value={chatMessage}
                onChange={(e) => setChatMessage(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleChat();
                  }
                }}
                placeholder="Ask your mentor..."
                className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-2xl text-sm focus:ring-2 focus:ring-[#1e3a8a] resize-none h-12"
              />
              <button 
                onClick={handleChat}
                disabled={isChatting || !chatMessage}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#1e3a8a] text-white rounded-xl flex items-center justify-center disabled:opacity-50 transition-all hover:scale-105"
              >
                {isChatting ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
            <p className="text-[10px] text-center text-slate-400 mt-2">
              LexAI can make mistakes. Verify important legal information.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexAI;
