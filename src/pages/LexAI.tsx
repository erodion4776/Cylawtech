import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Send, Loader2, MessageSquare, Trash2,
  Scale, Menu, X, Home, Info, Mail, ShieldAlert,
  Lock, Sparkles, ChevronDown
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
  useDocumentTitle('Lex AI - Nigerian Legal AI Assistant');
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us'>('nigeria');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showJurisdictionPicker, setShowJurisdictionPicker] = useState(false);

  // Daily usage tracking
  const [dailyUsage, setDailyUsage] = useState<DailyUsage>(() => {
    const today = new Date().toISOString().split('T')[0];
    const saved = localStorage.getItem('lexai_daily_usage');
    if (saved) {
      const parsed = JSON.parse(saved) as DailyUsage;
      if (parsed.date === today) return parsed;
    }
    return { count: 0, date: today };
  });
  const [showPaywall, setShowPaywall] = useState(false);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, isLoading, scrollToBottom]);
  useEffect(() => { localStorage.setItem('lexai_daily_usage', JSON.stringify(dailyUsage)); }, [dailyUsage]);
  useEffect(() => { fetchConversations(); }, []);

  const fetchConversations = async () => {
    try {
      const res = await fetch(`${API_BASE}?action=list`);
      const data = await res.json();
      setConversations(data.conversations || []);
    } catch { /* silent */ }
  };

  const loadConversation = async (convId: string) => {
    setActiveConvId(convId);
    setMessages([]);
    setDrawerOpen(false);
    try {
      const res = await fetch(`${API_BASE}?action=history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId }),
      });
      const data = await res.json();
      setMessages(data.messages || []);
    } catch { /* silent */ }
  };

  const startNewChat = () => {
    setActiveConvId(null);
    setMessages([]);
    setInput('');
    setDrawerOpen(false);
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

  const sendMessage = async (overrideMessage?: string) => {
    const textToSend = (overrideMessage || input).trim();
    if (!textToSend || isLoading) return;

    const today = new Date().toISOString().split('T')[0];
    let currentCount = dailyUsage.date === today ? dailyUsage.count : 0;
    if (currentCount >= DAILY_LIMIT) { setShowPaywall(true); return; }

    setInput('');
    if (inputRef.current) inputRef.current.style.height = '48px';

    // Build current conversation history including the new user message
    const updatedMessages: Message[] = [...messages, { role: 'user', content: textToSend }];
    setMessages(updatedMessages);
    setIsLoading(true);
    setDailyUsage({ count: currentCount + 1, date: today });

    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          messages: updatedMessages, // Sends full conversation memory
          conversation_id: activeConvId,
          jurisdiction: jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Federal Law',
        }),
      });
      const data = await res.json();
      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.error }]);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
        if (data.conversation_id && !activeConvId) setActiveConvId(data.conversation_id);
        fetchConversations();
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Unable to connect to Lex AI. Please check your internet connection and try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const messagesRemaining = Math.max(0, DAILY_LIMIT - (dailyUsage.date === new Date().toISOString().split('T')[0] ? dailyUsage.count : 0));
  const jurLabel = jurisdiction === 'nigeria' ? '🇳🇬 Nigerian Law' : '🇺🇸 US Law';

  return (
    <div className="fixed inset-0 h-[100dvh] w-full flex flex-col overflow-hidden bg-white dark:bg-[#171717] font-sans select-none">

      {/* PAYWALL MODAL */}
      <AnimatePresence>
        {showPaywall && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
            onClick={() => setShowPaywall(false)}
          >
            <motion.div
              initial={{ y: 100, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 100, opacity: 0 }}
              transition={{ type: 'spring', damping: 25, stiffness: 200 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#1e1e1e] rounded-t-3xl sm:rounded-3xl p-6 sm:p-8 w-full max-w-md shadow-2xl text-center"
            >
              <div className="w-12 h-12 bg-blue-600/10 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Lock size={24} />
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Daily Inquiry Limit Reached</h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mb-6 leading-relaxed">
                You have reached your limit of {DAILY_LIMIT} free inquiries for today. Your limit resets automatically tomorrow.
              </p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-[#252525] border border-slate-200 dark:border-slate-700 text-left">
                  <p className="text-[9px] font-bold text-blue-600 uppercase">Monthly Practice</p>
                  <h4 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">$29<span className="text-[10px] font-normal text-slate-400">/mo</span></h4>
                </div>
                <div className="p-4 rounded-2xl bg-[#171717] text-white text-left relative overflow-hidden">
                  <p className="text-[9px] font-bold text-[#B4975A] uppercase">Annual Counsel</p>
                  <h4 className="text-lg sm:text-xl font-black">$249<span className="text-[10px] font-normal text-slate-400">/yr</span></h4>
                  <Sparkles size={28} className="absolute -right-1 -bottom-1 opacity-10" />
                </div>
              </div>
              <button onClick={() => navigate('/contact')} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-sm transition-all shadow-lg">
                Upgrade for Unlimited Access
              </button>
              <button onClick={() => setShowPaywall(false)} className="mt-3 text-xs text-slate-400 hover:text-slate-600">
                Dismiss
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SLIDE-OUT DRAWER */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-[4px]"
            />
            <motion.aside
              initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 260 }}
              className="fixed top-0 left-0 bottom-0 w-[280px] bg-[#171717] z-[110] flex flex-col shadow-2xl safe-area-inset-left"
            >
              <div className="p-3 border-b border-white/5 flex items-center justify-between">
                <button onClick={startNewChat} className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-white/10 hover:bg-white/5 text-white text-sm font-medium transition-colors">
                  <Plus size={16} /> New Chat
                </button>
                <button onClick={() => setDrawerOpen(false)} className="ml-2 p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/5 transition-colors">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5 overscroll-contain">
                {conversations.length === 0 ? (
                  <p className="text-xs text-slate-600 text-center mt-10 px-4">No conversations yet.</p>
                ) : (
                  conversations.map((conv) => (
                    <button
                      key={conv.id}
                      onClick={() => loadConversation(conv.id)}
                      className={cn(
                        'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors group text-left relative',
                        activeConvId === conv.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      )}
                    >
                      <MessageSquare size={14} className="shrink-0 opacity-50" />
                      <span className="truncate flex-1 pr-6">{conv.title}</span>
                      <Trash2
                        size={13}
                        className="shrink-0 absolute right-3 opacity-0 group-hover:opacity-60 active:opacity-100 hover:text-rose-400 transition-opacity"
                        onClick={(e) => deleteConversation(conv.id, e)}
                      />
                    </button>
                  ))
                )}
              </div>

              <div className="mx-3 mb-2 p-3 bg-white/5 rounded-xl border border-white/5">
                <div className="flex justify-between items-center mb-1.5 text-[10px] font-bold tracking-wider text-slate-400 uppercase">
                  <span>Inquiries Today</span>
                  <span>{dailyUsage.count} / {DAILY_LIMIT}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', messagesRemaining === 0 ? 'bg-rose-500' : 'bg-[#B4975A]')}
                    style={{ width: `${(dailyUsage.count / DAILY_LIMIT) * 100}%` }}
                  />
                </div>
              </div>

              <nav className="p-3 border-t border-white/10 bg-[#0f0f0f] space-y-0.5">
                {[
                  { to: '/', label: 'Home Page', icon: Home },
                  { to: '/about', label: 'About LexAI', icon: Info },
                  { to: '/contact', label: 'Contact Support', icon: Mail },
                  { to: '/saas-admin', label: 'Firm Portal', icon: ShieldAlert },
                ].map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    onClick={() => setDrawerOpen(false)}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:bg-white/5 hover:text-slate-100 transition-all active:scale-[0.98]"
                  >
                    <link.icon size={14} className="shrink-0 opacity-60" />
                    <span>{link.label}</span>
                  </Link>
                ))}
              </nav>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* HEADER */}
      <header className="shrink-0 h-14 flex items-center justify-between px-3 bg-white dark:bg-[#171717] border-b border-slate-200 dark:border-white/5 z-30 pt-[env(safe-area-inset-top)]">
        <button
          onClick={() => setDrawerOpen(true)}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors active:scale-95"
          aria-label="Open Menu"
        >
          <Menu size={20} />
        </button>

        <button
          onClick={() => setShowJurisdictionPicker(!showJurisdictionPicker)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 transition-colors active:scale-95"
        >
          <Scale size={14} className="text-slate-600 dark:text-slate-400" />
          <span className="text-sm font-semibold text-slate-800 dark:text-white">{jurLabel}</span>
          <ChevronDown size={14} className={cn('text-slate-400 transition-transform', showJurisdictionPicker && 'rotate-180')} />
        </button>

        <button
          onClick={startNewChat}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 text-slate-700 dark:text-slate-300 transition-colors active:scale-95"
          aria-label="New Chat"
        >
          <Plus size={20} />
        </button>
      </header>

      {/* JURISDICTION PICKER */}
      <AnimatePresence>
        {showJurisdictionPicker && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            className="absolute top-[60px] left-1/2 -translate-x-1/2 z-40 w-[280px] bg-white dark:bg-[#1e1e1e] rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 p-3 space-y-3"
          >
            <div>
              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2 px-1">Jurisdiction</p>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { value: 'nigeria' as const, label: '🇳🇬 Nigerian Law' },
                  { value: 'us' as const, label: '🇺🇸 US Law' },
                ].map((j) => (
                  <button
                    key={j.value}
                    onClick={() => setJurisdiction(j.value)}
                    className={cn(
                      'px-3 py-2.5 rounded-xl text-xs font-semibold transition-all active:scale-95',
                      jurisdiction === j.value
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                        : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-300'
                    )}
                  >
                    {j.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setShowJurisdictionPicker(false)}
              className="w-full py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors"
            >
              Done
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {showJurisdictionPicker && (
        <div className="fixed inset-0 z-30" onClick={() => setShowJurisdictionPicker(false)} />
      )}

      {/* MESSAGES & LANDING VIEW */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-4 py-4">
        {messages.length === 0 ? (
          /* Landing Screen */
          <div className="min-h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-6">
            <div className="w-14 h-14 bg-slate-900 dark:bg-white/10 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Scale size={26} className="text-white dark:text-[#B4975A]" />
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
              Hi, I’m Lex AI. How can I help you today?
            </h2>
            
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mb-7 leading-relaxed max-w-md">
              Your AI legal assistant. Ask legal questions, research legal issues, draft and review contracts and other legal documents, and get practical guidance on your legal matters.
            </p>

            <div className="w-full space-y-2.5">
              {[
                'Help me understand a legal issue.',
                'Research a Nigerian law or legal precedent.',
                'Draft a contract or legal document.',
                'Review a contract or legal document.',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => {
                    setInput(suggestion);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 transition-all active:scale-[0.98] shadow-xs"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Live Chat Stream */
          <div className="max-w-3xl mx-auto space-y-5 pb-4">
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={cn('flex gap-3', msg.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                {msg.role === 'assistant' && (
                  <div className="w-7 h-7 bg-slate-900 dark:bg-white/10 rounded-full flex items-center justify-center shrink-0 mt-1">
                    <Scale size={12} className="text-white dark:text-[#B4975A]" />
                  </div>
                )}
                <div
                  className={cn(
                    'max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-slate-900 dark:bg-blue-600 text-white rounded-tr-md'
                      : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-white/5 rounded-tl-md'
                  )}
                >
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none prose-slate dark:prose-invert prose-headings:font-bold leading-relaxed">
                      <Markdown>{msg.content}</Markdown>
                    </div>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </motion.div>
            ))}

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-7 h-7 bg-slate-900 dark:bg-white/10 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <Scale size={12} className="text-white dark:text-[#B4975A]" />
                </div>
                <div className="bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-2xl rounded-tl-md px-4 py-3.5">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-blue-600 dark:text-[#B4975A]" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">Lex AI is reviewing the details...</span>
                  </div>
                </div>
              </motion.div>
            )}
            <div ref={chatEndRef} />
          </div>
        )}
      </div>

      {/* INPUT DOCK */}
      <div className="shrink-0 px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white dark:bg-[#171717] border-t border-slate-200/50 dark:border-white/5 z-30">
        <div className="max-w-3xl mx-auto">
          <div className="relative bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus-within:border-slate-400 dark:focus-within:border-white/20 focus-within:bg-white dark:focus-within:bg-white/10 transition-all">
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
              placeholder="Ask Lex AI a legal question…"
              rows={1}
              className="w-full pl-4 pr-12 py-3.5 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none max-h-28"
              style={{ minHeight: '48px' }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = '48px';
                t.style.height = Math.min(t.scrollHeight, 112) + 'px';
              }}
            />
            <button
              onClick={() => sendMessage()}
              disabled={isLoading || !input.trim()}
              className={cn(
                'absolute right-2 bottom-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90',
                input.trim() && !isLoading
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                  : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-600'
              )}
              aria-label="Send Message"
            >
              {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center px-1 mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 gap-1 text-center sm:text-left leading-tight">
            <span>{messagesRemaining} free inquiries left today.</span>
            <span>Lex AI provides legal information, not legal representation. Verify important legal advice and citations with a qualified lawyer.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexAI;
