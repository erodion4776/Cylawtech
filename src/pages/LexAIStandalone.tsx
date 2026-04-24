import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  BookOpen, Brain, Dumbbell, Sparkles, Send, Loader2, Globe, Scale, ShoppingBag, ArrowRight
} from 'lucide-react';
import Markdown from 'react-markdown';
import { Link } from 'react-router-dom';
import { cn } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useLocation } from 'react-router-dom';

const LexAIStandalone = () => {
  useDocumentTitle('LexAI Mentor');
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const hideHeader = searchParams.get('hideHeader') === 'true' || searchParams.get('embed') === 'true';

  const [mode, setMode] = useState<'prep' | 'training' | 'practice'>('prep');
  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us'>('nigeria');
  // ... rest of state
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string, suggestedResource?: any}[]>([
    { 
      role: 'ai', 
      content: "Welcome to LexAI. I'm your legal mentor. How can I help you today?" 
    }
  ]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, isChatting]);

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
          stage: mode
        })
      });
      const data = await res.json();
      
      if (data.error) throw new Error(data.error);

      // Simple keyword suggestion
      let suggestedResource = null;
      if (data.response.toLowerCase().includes("premium") || data.response.toLowerCase().includes("guide")) {
        suggestedResource = {
          title: "Legal Drafting Guide",
          price: "$49.99",
          link: "https://cylawtech.netlify.app/resource-store"
        };
      }

      setChatHistory(prev => [...prev, { role: 'ai', content: data.response, suggestedResource }]);
    } catch (error: any) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: 'ai', content: `**Error:** ${error.message || "Connection lost. Please try again."}` }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#F8FAFC] flex flex-col items-center overflow-hidden font-sans">
      {/* Top Status Header */}
      <div className="w-full bg-white border-b border-[#E2E8F0] py-2 px-4 flex justify-center items-center z-10">
        <div className="flex items-center gap-3 w-full max-w-4xl">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[#B4975A] rounded-full animate-pulse" />
            <span className="text-[10px] font-bold text-[#64748B] tracking-[0.2em] uppercase">
              Encrypted Strategy Channel
            </span>
          </div>
          <div className="ml-auto flex items-center gap-4">
             <select 
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value as any)}
              className="text-[10px] font-bold text-[#1E293B] border-none outline-none bg-transparent cursor-pointer hover:text-[#B4975A] transition-colors"
            >
              <option value="nigeria">NG JURISDICTION</option>
              <option value="us">US JURISDICTION</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Chat Container */}
      <div className="flex-grow w-full max-w-3xl overflow-y-auto px-4 pt-8 pb-32 scroll-smooth">
        <div className="flex flex-col gap-6">
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={cn(
              "flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-500",
              msg.role === 'ai' ? "items-start" : "items-end"
            )}>
              <div className={cn(
                "p-4 shadow-sm max-w-[85%] text-sm leading-relaxed",
                msg.role === 'ai' 
                  ? "bg-white border border-[#E2E8F0] text-[#1E293B] rounded-[4px] rounded-tr-[12px] rounded-bl-[12px]" 
                  : "bg-[#0F172A] text-white rounded-[12px]"
              )}>
                <div className={cn(
                   "prose prose-sm max-w-none",
                   msg.role === 'ai' ? "prose-slate" : "prose-invert"
                )}>
                  <Markdown>{msg.content}</Markdown>
                </div>
              </div>
              
              {msg.suggestedResource && (
                <div className="mt-4 w-full max-w-[300px] bg-white border border-[#E2E8F0] border-l-4 border-l-[#B4975A] p-4 shadow-sm rounded-r-lg">
                   <div className="flex items-center gap-2 text-[#B4975A] mb-2">
                      <ShoppingBag size={14} />
                      <p className="text-[10px] font-bold uppercase tracking-widest">Premium Resource</p>
                   </div>
                   <h4 className="font-serif text-[#1E293B] text-sm mb-3 leading-tight font-bold">{msg.suggestedResource.title}</h4>
                   <a 
                    href={msg.suggestedResource.link} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="w-full py-2 bg-[#B4975A] text-white rounded-[4px] flex items-center justify-center gap-2 text-[10px] font-bold hover:bg-[#a3864d] transition-all shadow-sm active:scale-[0.98]"
                   >
                     ACQUIRE NOW <ArrowRight size={12} />
                   </a>
                </div>
              )}
            </div>
          ))}
          
          {isChatting && (
            <div className="flex items-start">
              <div className="p-4 bg-white border border-[#E2E8F0] shadow-sm rounded-[4px] rounded-tr-[12px] rounded-bl-[12px] flex items-center gap-3">
                <div className="flex gap-1.5">
                  <span className="w-1.5 h-1.5 bg-[#B4975A] rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#B4975A] rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1.5 h-1.5 bg-[#B4975A] rounded-full animate-bounce"></span>
                </div>
                <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider">Analyzing Intelligence...</span>
              </div>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Floating Bottom Input Area */}
      <div className="fixed bottom-0 left-0 right-0 p-6 pointer-events-none flex justify-center">
        <div className="w-full max-w-2xl pointer-events-auto">
          <div className="relative bg-white border border-[#E2E8F0] rounded-[8px] shadow-[0_-4px_20px_-1px_rgba(15,23,42,0.08)] overflow-hidden transition-all focus-within:ring-2 focus-within:ring-[#B4975A]/20 focus-within:border-[#B4975A]">
            <input
              type="text"
              value={chatMessage}
              onChange={(e) => setChatMessage(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleChat()}
              placeholder="Enter your legal inquiry..."
              className="w-full pl-5 pr-14 py-4 text-sm text-[#1E293B] bg-transparent outline-none placeholder:text-[#64748B]/50"
            />
            <button 
              onClick={handleChat}
              disabled={isChatting || !chatMessage}
              className="absolute right-3 top-1/2 -track-y-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center bg-[#0F172A] text-[#B4975A] rounded-[4px] disabled:opacity-20 transition-all hover:bg-slate-800"
            >
              {isChatting ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </button>
          </div>
          <div className="flex justify-between items-center px-2 mt-3">
            <p className="text-[9px] text-[#64748B] font-medium tracking-wider">CYAZOR STRATEGY ENGINE</p>
            <div className="flex gap-3 text-[9px] text-[#64748B]">
              <span className="cursor-help opacity-50 hover:opacity-100 transition-opacity uppercase">Privileged</span>
              <span className="cursor-help opacity-50 hover:opacity-100 transition-opacity uppercase">Confidential</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexAIStandalone;
