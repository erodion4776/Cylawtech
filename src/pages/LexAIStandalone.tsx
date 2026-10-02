import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader2, ShoppingBag, ArrowRight } from 'lucide-react';
import Markdown from 'react-markdown';
import { cn } from '../lib/utils';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const LexAIStandalone: React.FC = () => {
  useDocumentTitle('LexAI Legal Counsel');

  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us'>('nigeria');
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<Array<{ role: 'user' | 'ai'; content: string; suggestedResource?: any }>>([
    { 
      role: 'ai', 
      content: "Welcome. I am your LexAI legal research assistant. How may I assist your inquiries today?" 
    }
  ]);
  const [isChatting, setIsChatting] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatHistory, isChatting]);

  const handleChat = async () => {
    if (!chatMessage.trim() || isChatting) return;
    const msg = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: msg }]);
    setIsChatting(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg,
          site: 'lexai',
          jurisdiction: jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Law'
        })
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Service unavailable');

      setChatHistory(prev => [...prev, { role: 'ai', content: data.response }]);
    } catch (err: any) {
      setChatHistory(prev => [...prev, { role: 'ai', content: err.message || 'Consultation unavailable. Please retry.' }]);
    } finally {
      setIsChatting(false);
    }
  };

  return (
    <div className="h-screen w-full bg-[#F8FAFC] flex flex-col items-center overflow-hidden font-sans">
      {/* Jurisdiction Bar */}
      <div className="w-full bg-white border-b border-slate-200 py-2.5 px-6 flex justify-between items-center z-10">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-[#B4975A] rounded-full animate-pulse" />
          <span className="text-[11px] font-bold text-slate-600 tracking-wider uppercase">
            Legal Intelligence Channel
          </span>
        </div>
        <select
          value={jurisdiction}
          onChange={(e) => setJurisdiction(e.target.value as any)}
          className="text-xs font-bold text-slate-800 bg-transparent outline-none cursor-pointer hover:text-[#B4975A]"
        >
          <option value="nigeria">🇳🇬 NIGERIAN JURISDICTION</option>
          <option value="us">🇺🇸 US JURISDICTION</option>
        </select>
      </div>

      {/* Messages */}
      <div className="flex-grow w-full max-w-3xl overflow-y-auto px-4 pt-6 pb-28">
        <div className="flex flex-col gap-4">
          {chatHistory.map((msg, idx) => (
            <div key={idx} className={cn("flex flex-col", msg.role === 'ai' ? "items-start" : "items-end")}>
              <div className={cn(
                "p-4 shadow-xs max-w-[85%] text-sm leading-relaxed",
                msg.role === 'ai' ? "bg-white border border-slate-200 text-slate-900 rounded-2xl rounded-tl-sm" : "bg-slate-900 text-white rounded-2xl rounded-tr-sm"
              )}>
                <Markdown>{msg.content}</Markdown>
              </div>
            </div>
          ))}
          {isChatting && (
            <div className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl w-fit">
              <Loader2 size={14} className="animate-spin text-[#B4975A]" />
              <span className="text-xs text-slate-500">Consulting statutory sources...</span>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white/90 backdrop-blur-md border-t border-slate-200 flex justify-center">
        <div className="w-full max-w-2xl relative">
          <input
            type="text"
            value={chatMessage}
            onChange={(e) => setChatMessage(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleChat()}
            placeholder="Type your legal inquiry here..."
            className="w-full pl-4 pr-12 py-3.5 bg-slate-100 rounded-xl text-sm outline-none focus:ring-2 focus:ring-[#B4975A]"
          />
          <button
            onClick={handleChat}
            disabled={isChatting || !chatMessage.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-slate-900 text-[#B4975A] rounded-lg flex items-center justify-center disabled:opacity-30"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default LexAIStandalone;
