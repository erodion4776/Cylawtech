import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Send, Loader2, MessageSquare, Trash2,
  Scale, Globe, BookOpen, Brain, Dumbbell, Menu, X,
  Home, Info, Mail, ShieldAlert, Lock, Sparkles
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import Markdown from 'react-markdown';

const API_BASE = '/api/chat';
const DAILY_LIMIT = 10;

interface Conversation {
  id: string;
  title: string;
  jurisdiction: string;
  mode: string;
  updated_at: string;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
}

interface DailyUsage {
  count: number;
  date: string;
}

const LexAI: React.FC = () => {
  useDocumentTitle('LexAI - Legal Intelligence Studio');
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us'>('nigeria');
  const [mode, setMode] = useState<'prep' | 'training' | 'practice'>('prep');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Daily usage tracking state
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>(() => {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem('lexai_daily_usage');
    if (saved) {
      const parsed = JSON.parse(saved) as DailyUsage;
      if (parsed.date === today) {
        return parsed;
      }
    }
    return { count: 0, date: today };
  });

  const [showPaywall, setShowPaywall] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Persist daily usage changes
  useEffect(() => {
    localStorage.setItem('lexai_daily_usage', JSON.stringify(dailyUsage));
  }, [dailyUsage]);

  // Load conversation list on mount
  useEffect(() => {
    fetchConversations();
  }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}?action=list`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch (e) {
      console.error('Failed to load conversations');
    }
  };

  const loadConversation = async (convId: string) => {
    setActiveConvId(convId);
    setMessages([]);
    try {
      const res = await fetch(`${API_BASE}?action=history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId }),
      });
      const data = await res.json();
      setMessages(data.messages || []);
    } catch (e) {
      console.error('Failed to load messages');
    }
  };

  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    inputRef.current?.focus();
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`${API_BASE}?action=delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation_id: convId }),
    });
    if (activeConvId === convId) startNewChat();
    fetchConversations();
  };

  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    // Check daily limits
    const today = new Date().toISOString().split('T')[0];
    let currentCount = dailyUsage.date === today ? dailyUsage.count : 0;

    if (currentCount >= DAILY_LIMIT) {
      setShowPaywall(true);
      return;
    }

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    // Update message counter
    setDailyUsage({
      count: currentCount + 1,
      date: today
    });

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          conversation_id: activeConvId,
          jurisdiction: jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Federal Law',
          mode,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        if (data.conversation_id && !activeConvId) {
          setActiveConvId(data.conversation_id);
        }
        fetchConversations();
      }
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Unable to connect to the legal intelligence service. Please try again.' },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const jurLabel = jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Law';
  const modeLabel = mode === 'prep' ? 'IRAC Prep' : mode === 'training' ? 'Draft Critique' : 'Clause Drafting';
  const messagesRemaining = Math.max(0, DAILY_LIMIT - dailyUsage.count);

  return (
    <div className="h-screen flex bg-[#f9fafb] overflow-hidden font-sans">
      {/* ==================== DAILY LIMIT LIMITATION MODAL ==================== */}
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
              className="bg-white rounded-[2.5rem] p-10 max-w-lg w-full shadow-2xl text-center border border-slate-200"
            >
              <div className="w-16 h-16 bg-blue-600/10 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
                <Lock size={32} />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-4">Daily Research Limit Reached</h2>
              <p className="text-slate-600 mb-8 text-sm leading-relaxed">
                You have reached your limit of {DAILY_LIMIT} free inquiries for today. Your daily limit will automatically reset tomorrow, or you can unlock unlimited queries instantly.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="p-5 rounded-2xl bg-slate-50 border border-slate-200 text-left">
                  <p className="text-[10px] font-bold text-blue-600 uppercase">Monthly Pass</p>
                  <h4 className="text-2xl font-black text-slate-900">$29<span className="text-xs font-normal text-slate-400">/mo</span></h4>
                </div>
                <div className="p-5 rounded-2xl bg-[#171717] text-white text-left relative overflow-hidden">
                  <p className="text-[10px] font-bold text-[#B4975A] uppercase">Annual Professional</p>
                  <h4 className="text-2xl font-black">$249<span className="text-xs font-normal text-slate-400">/yr</span></h4>
                  <Sparkles size={40} className="absolute -right-2 -bottom-2 opacity-10" />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => navigate('/contact')}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold shadow-lg transition-all"
                >
                  Request Unlimited Professional Access
                </button>
                <button onClick={() => setShowPaywall(false)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors">
                  Dismiss
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== SIDEBAR ==================== */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[280px] bg-[#171717] text-white flex flex-col h-full shrink-0 z-50 shadow-2xl border-r border-white/5"
          >
            {/* New Chat Area */}
            <div className="p-3 border-b border-white/5">
              <button
                onClick={startNewChat}
                className="w-full flex items-center justify-center gap-2.5 px-4 py-3 rounded-xl border border-white/10 hover:bg-white/5 transition-colors text-sm font-medium"
              >
                <Plus size={16} />
                New Conversation
              </button>
            </div>

            {/* Conversation List (Center Sidebar) */}
            <div className="flex-grow overflow-y-auto px-2 py-3 space-y-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors group text-left relative',
                    activeConvId === conv.id
                      ? 'bg-white/10 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  )}
                >
                  <MessageSquare size={14} className="shrink-0 opacity-60" />
                  <span className="truncate flex-grow pr-4">{conv.title}</span>
                  <Trash2
                    size={13}
                    className="shrink-0 absolute right-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-rose-400 transition-opacity"
                    onClick={(e) => deleteConversation(conv.id, e)}
                  />
                </button>
              ))}

              {conversations.length === 0 && (
                <p className="text-xs text-slate-600 text-center mt-8 px-4">
                  No conversations yet. Start a new legal inquiry.
                </p>
              )}
            </div>

            {/* Daily Usage Monitor Status */}
            <div className="mx-3 mb-2 p-3 bg-white/5 rounded-xl border border-white/5">
              <div className="flex justify-between items-center mb-1 text-[11px] font-bold tracking-wider text-slate-400 uppercase">
                <span>Inquiries Today</span>
                <span>{dailyUsage.count} / {DAILY_LIMIT}</span>
              </div>
              <div className="h-1 bg-white/10 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full transition-all duration-300',
                    messagesRemaining === 0 ? 'bg-rose-500' : 'bg-[#B4975A]'
                  )}
                  style={{ width: `${(dailyUsage.count / DAILY_LIMIT) * 100}%` }}
                />
              </div>
            </div>

            {/* ==================== SIDEBAR BOTTOM NAVIGATION ==================== */}
            <div className="p-3 border-t border-white/10 bg-[#0f0f0f] space-y-1">
              {[
                { to: '/', label: 'Home Page', icon: Home },
                { to: '/about', label: 'About LexAI', icon: Info },
                { to: '/contact', label: 'Contact Support', icon: Mail },
                { to: '/saas-admin', label: 'Firm Portal', icon: ShieldAlert },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-100 transition-all"
                >
                  <link.icon size={14} className="shrink-0 opacity-60" />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ==================== MAIN PANEL ==================== */}
      <div className="flex-grow flex flex-col h-full min-w-0 bg-[#fdfdfd]">
        {/* Top Header */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-xl hover:bg-slate-100 text-slate-600 transition-colors"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center">
                <Scale size={15} className="text-white" />
              </div>
              <div>
                <span className="font-bold text-sm text-slate-900 block leading-none">LexAI</span>
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Automated Counsel</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Jurisdiction Selector */}
            <select
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value as any)}
              className="text-xs font-semibold text-slate-700 bg-slate-100 border-0 rounded-xl px-3 py-2 outline-none cursor-pointer hover:bg-slate-200 transition-colors"
            >
              <option value="nigeria">🇳🇬 Nigerian Law</option>
              <option value="us">🇺🇸 US Law</option>
            </select>

            {/* Mode Selector */}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="text-xs font-semibold text-slate-700 bg-slate-100 border-0 rounded-xl px-3 py-2 outline-none cursor-pointer hover:bg-slate-200 transition-colors"
            >
              <option value="prep">📖 IRAC Prep</option>
              <option value="training">🧠 Draft Critique</option>
              <option value="practice">⚖️ Clause Drafting</option>
            </select>
          </div>
        </header>

        {/* Messaging Board */}
        <div className="flex-grow overflow-y-auto">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center px-6 text-center max-w-2xl mx-auto">
              <div className="w-16 h-16 bg-[#171717] text-[#B4975A] rounded-2xl flex items-center justify-center mb-6 shadow-xl shadow-slate-900/10">
                <Scale size={28} />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-2 tracking-tight">
                How can I assist your research?
              </h2>
              <p className="text-slate-500 text-sm mb-8">
                Perform inquiries into {jurLabel} precedents, analyze briefs using {modeLabel}, or get constructive statutory critiques.
              </p>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                {[
                  'What are the requirements for corporate registration under Nigerian law?',
                  'State the statutory rules on real estate transaction compliance.',
                  'Draft a complete non-disclosure clause with liability protections.',
                  'Critique a memorandum of understanding for an investment partnership.',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="text-left p-4 rounded-2xl border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 text-xs font-semibold text-slate-700 transition-all hover:shadow-xs"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Chat Stream */
            <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={cn(
                    'flex gap-4',
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  )}
                >
                  {msg.role === 'assistant' && (
                    <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center shrink-0 mt-1">
                      <Scale size={14} className="text-white" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed shadow-xs border',
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white border-slate-900 rounded-tr-sm'
                        : 'bg-white border-slate-200/80 text-slate-800 rounded-tl-sm'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-slate prose-headings:font-bold prose-headings:text-slate-900 leading-relaxed">
                        <Markdown>{msg.content}</Markdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center shrink-0 mt-1">
                    <Scale size={14} className="text-white" />
                  </div>
                  <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-5 py-4 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <Loader2 size={15} className="animate-spin text-blue-600" />
                      <span className="text-xs text-slate-500 font-medium">Researching legal references...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Message Input Dock */}
        <div className="shrink-0 px-4 pb-4 pt-2 bg-[#f9fafb] border-t border-slate-200/50">
          <div className="max-w-3xl mx-auto">
            <div className="relative bg-white border border-slate-300 rounded-2xl shadow-xs focus-within:border-slate-400 focus-within:shadow-md transition-all">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder="Ask legal inquiry or request critique on your drafted memo..."
                rows={1}
                className="w-full pl-5 pr-14 py-4 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 outline-none resize-none max-h-32"
                style={{ minHeight: '52px' }}
                onInput={(e) => {
                  const target = e.target as HTMLTextAreaElement;
                  target.style.height = '52px';
                  target.style.height = Math.min(target.scrollHeight, 128) + 'px';
                }}
              />
              <button
                onClick={sendMessage}
                disabled={isLoading || !input.trim()}
                className={cn(
                  'absolute right-3 bottom-3 w-9 h-9 rounded-xl flex items-center justify-center transition-all',
                  input.trim() && !isLoading
                    ? 'bg-slate-900 text-white hover:bg-slate-800'
                    : 'bg-slate-100 text-slate-400'
                )}
              >
                {isLoading ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Send size={15} />
                )}
              </button>
            </div>
            
            <div className="flex items-center justify-between px-1.5 mt-2.5 text-[10px] text-slate-400 font-medium">
              <span>{messagesRemaining} complimentary inquiries left today.</span>
              <span>Always verify citations with certified counsel.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexAI;
