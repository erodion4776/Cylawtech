import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Send, Loader2, MessageSquare, Trash2,
  Scale, Globe, BookOpen, Brain, Dumbbell, Menu, X
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import Markdown from 'react-markdown';

const API_BASE = '/api/chat';

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

const LexAI: React.FC = () => {
  useDocumentTitle('LexAI - Legal Intelligence');

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us'>('nigeria');
  const [mode, setMode] = useState<'prep' | 'training' | 'practice'>('prep');
  const [sidebarOpen, setSidebarOpen] = useState(true);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

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

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

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

  return (
    <div className="h-screen flex bg-[#f9fafb] overflow-hidden">
      {/* ==================== SIDEBAR ==================== */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-[280px] bg-[#171717] text-white flex flex-col h-full shrink-0"
          >
            {/* New Chat Button */}
            <div className="p-3">
              <button
                onClick={startNewChat}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-white/20 hover:bg-white/10 transition-colors text-sm font-medium"
              >
                <Plus size={18} />
                New Conversation
              </button>
            </div>

            {/* Conversation List */}
            <div className="flex-grow overflow-y-auto px-2 pb-4 space-y-0.5">
              {conversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors group text-left',
                    activeConvId === conv.id
                      ? 'bg-white/15 text-white'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  )}
                >
                  <MessageSquare size={14} className="shrink-0 opacity-60" />
                  <span className="truncate flex-grow">{conv.title}</span>
                  <Trash2
                    size={13}
                    className="shrink-0 opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:text-rose-400 transition-opacity"
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

            {/* Sidebar Footer */}
            <div className="p-3 border-t border-white/10">
              <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-500">
                <Scale size={14} />
                <span>LexAI Legal Intelligence</span>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* ==================== MAIN CHAT AREA ==================== */}
      <div className="flex-grow flex flex-col h-full min-w-0">
        {/* Top Bar */}
        <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
            >
              {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-slate-900 rounded-lg flex items-center justify-center">
                <Scale size={14} className="text-white" />
              </div>
              <span className="font-bold text-sm text-slate-900">LexAI</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Jurisdiction Selector */}
            <select
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value as any)}
              className="text-xs font-medium text-slate-700 bg-slate-100 border-0 rounded-lg px-3 py-1.5 outline-none cursor-pointer"
            >
              <option value="nigeria">🇳🇬 Nigerian Law</option>
              <option value="us">🇺🇸 US Law</option>
            </select>

            {/* Mode Selector */}
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as any)}
              className="text-xs font-medium text-slate-700 bg-slate-100 border-0 rounded-lg px-3 py-1.5 outline-none cursor-pointer"
            >
              <option value="prep">📖 IRAC Prep</option>
              <option value="training">🧠 Draft Critique</option>
              <option value="practice">⚖️ Clause Drafting</option>
            </select>
          </div>
        </header>

        {/* Messages Area */}
        <div className="flex-grow overflow-y-auto">
          {messages.length === 0 ? (
            /* Empty State */
            <div className="h-full flex flex-col items-center justify-center px-6 text-center">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-6">
                <Scale size={28} className="text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">
                How can I assist your legal research?
              </h2>
              <p className="text-slate-500 text-sm max-w-md mb-8">
                Ask questions about {jurLabel}, request analysis using the {modeLabel} framework, or get feedback on your legal drafts.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-lg w-full">
                {[
                  'What are the requirements for company incorporation under Nigerian law?',
                  'Explain the IRAC framework for analyzing contract disputes.',
                  'Draft a non-disclosure agreement clause for a tech startup.',
                  'What are the key provisions of the Nigerian Data Protection Act?',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => {
                      setInput(suggestion);
                      inputRef.current?.focus();
                    }}
                    className="text-left p-4 rounded-xl border border-slate-200 hover:bg-slate-50 text-sm text-slate-700 transition-colors"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            /* Messages */
            <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
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
                      'max-w-[80%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed',
                      msg.role === 'user'
                        ? 'bg-slate-900 text-white rounded-tr-sm'
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-sm shadow-xs'
                    )}
                  >
                    {msg.role === 'assistant' ? (
                      <div className="prose prose-sm max-w-none prose-slate prose-headings:font-bold prose-headings:text-slate-900">
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
                    <div className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin text-slate-500" />
                      <span className="text-sm text-slate-500">Researching legal sources...</span>
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
          )}
        </div>

        {/* Input Bar */}
        <div className="shrink-0 px-4 pb-4 pt-2 bg-[#f9fafb]">
          <div className="max-w-3xl mx-auto">
            <div className="relative bg-white border border-slate-300 rounded-2xl shadow-sm focus-within:border-slate-900 focus-within:shadow-md transition-all">
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
                placeholder="Ask a legal question..."
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
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Send size={16} />
                )}
              </button>
            </div>
            <p className="text-[11px] text-center text-slate-400 mt-2">
              LexAI provides legal intelligence assistance. Always verify critical citations with qualified counsel.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexAI;
