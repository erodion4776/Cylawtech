import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Plus, Send, Loader2, MessageSquare, Trash2,
  Scale, Menu, X, Home, Info, Mail,
  Lock, Sparkles, ChevronDown, Copy, Check, Pencil,
  LogOut, User as UserIcon, Paperclip, FileText, Image as ImageIcon,
  Mic, Square, Volume2, ExternalLink, ShieldCheck, AlertTriangle, Globe
} from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient';
import Markdown from 'react-markdown';

const API_BASE = '/api/chat';
const VERIFY_API = '/api/verify';
const DAILY_LIMIT = 15;

// ============================================================
// FILE PROCESSING HELPERS
// ============================================================

async function extractPdfText(file: File): Promise<string> {
  if (!(window as any).pdfjsLib) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Failed to load PDF reader. Check internet connection.'));
      document.head.appendChild(script);
    });
  }

  const pdfjs = (window as any).pdfjsLib;
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    try {
      const workerBlob = new Blob(
        [`importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js');`],
        { type: 'application/javascript' }
      );
      pdfjs.GlobalWorkerOptions.workerSrc = URL.createObjectURL(workerBlob);
    } catch { /* fallback */ }
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(arrayBuffer),
    useWorkerFetch: false,
    isEvalSupported: false,
  });

  const pdf = await loadingTask.promise;
  let fullText = '';
  const maxPages = Math.min(pdf.numPages, 20);

  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map((item: any) => item.str).join(' ').trim();
    if (pageText) fullText += `\n--- [Page ${i} of ${pdf.numPages}] ---\n` + pageText;
  }

  if (!fullText.trim()) {
    throw new Error("This PDF contains scanned images without selectable text. OCR is required.");
  }

  return fullText.trim();
}

async function processImageFile(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDimension = 1600;

        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read file.'));
    reader.readAsDataURL(file);
  });
}

async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// ============================================================
// INTERFACES
// ============================================================

interface Citation {
  text: string;
  url: string | null;
  document_title?: string;
  section?: string | null;
  subsection?: string | null;
  status?: string;
  similarity?: number;
}

interface AttachmentData {
  name: string;
  type: 'image' | 'pdf' | 'text' | 'audio';
  mimeType: string;
  base64?: string;
  extractedText?: string;
}

interface Conversation {
  id: string;
  title: string;
  jurisdiction: string;
  updated_at: string;
}

interface Message {
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  verified_site?: {
    url: string;
    status: string;
    confidence: number;
    warnings?: string[];
  };
}

// ============================================================
// MAIN COMPONENT
// ============================================================

const LexAI: React.FC = () => {
  useDocumentTitle('LexAI - Statutory Intelligence & Verification');
  const navigate = useNavigate();

  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [jurisdiction, setJurisdiction] = useState<'nigeria' | 'us' | 'global'>('nigeria');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showJurisdictionPicker, setShowJurisdictionPicker] = useState(false);

  // Attachments & Voice
  const [attachment, setAttachment] = useState<AttachmentData | null>(null);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<any>(null);

  // Usage & Paywall
  const [dbUsageCount, setDbUsageCount] = useState(0);
  const [showPaywall, setShowPaywall] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, scrollToBottom]);

  // Auth & Init
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setUser(user);
        fetchConversations(user.id);
      }
    });
  }, []);

  const fetchConversations = async (userId: string) => {
    try {
      const res = await fetch(`${API_BASE}?action=list&user_id=${userId}`);
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
        if (data.usage) {
          setDbUsageCount(data.usage.count || 0);
          if (data.usage.count >= DAILY_LIMIT) setShowPaywall(true);
        }
      }
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
    setAttachment(null);
    setDrawerOpen(false);
    inputRef.current?.focus();
  };

  const deleteConversation = async (convId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await fetch(`${API_BASE}?action=delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId }),
      });
      if (activeConvId === convId) startNewChat();
      if (user) fetchConversations(user.id);
    } catch { /* silent */ }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/auth');
  };

  // ==================== VOICE RECORDER ====================
  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      }

      const mediaRecorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        const base64 = await blobToBase64(audioBlob);
        stream.getTracks().forEach((track) => track.stop());

        const ext = mimeType.includes('mp4') ? 'm4a' : 'webm';
        setAttachment({
          name: `voicenote.${ext}`,
          type: 'audio',
          mimeType,
          base64,
        });

        setIsRecording(false);
        setRecordingSeconds(0);
        clearInterval(recordingTimerRef.current);
      };

      mediaRecorder.start(200);
      setIsRecording(true);
      setRecordingSeconds(0);

      recordingTimerRef.current = setInterval(() => {
        setRecordingSeconds((prev) => {
          if (prev >= 120) {
            stopVoiceRecording();
            return 120;
          }
          return prev + 1;
        });
      }, 1000);
    } catch (err) {
      console.error("Mic error:", err);
      alert("Microphone permission is required to record voice notes.");
    }
  };

  const stopVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
  };

  const cancelVoiceRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      mediaRecorderRef.current.stop();
    }
    clearInterval(recordingTimerRef.current);
    setIsRecording(false);
    setRecordingSeconds(0);
    audioChunksRef.current = [];
  };

  // ==================== FILE UPLOADS ====================
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      alert("File size exceeds 20MB limit.");
      return;
    }

    setIsProcessingFile(true);

    try {
      if (file.type.startsWith('audio/') || file.name.match(/\.(mp3|m4a|wav|ogg|aac|webm)$/i)) {
        const base64 = await blobToBase64(file);
        setAttachment({
          name: file.name,
          type: 'audio',
          mimeType: file.type || 'audio/mp3',
          base64,
        });
      } else if (file.type.startsWith('image/')) {
        const { base64, mimeType } = await processImageFile(file);
        setAttachment({
          name: file.name,
          type: 'image',
          mimeType,
          base64,
        });
      } else if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        const extractedText = await extractPdfText(file);
        setAttachment({
          name: file.name,
          type: 'pdf',
          mimeType: 'application/pdf',
          extractedText,
        });
      } else {
        const text = await file.text();
        setAttachment({
          name: file.name,
          type: 'text',
          mimeType: file.type || 'text/plain',
          extractedText: text.substring(0, 15000),
        });
      }
    } catch (err: any) {
      alert(err.message || "Failed to process file.");
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ==================== SEND MESSAGE / VERIFY ====================
  const sendMessage = async (overrideMessage?: string) => {
    const textToSend = (overrideMessage || input).trim();
    if ((!textToSend && !attachment) || isLoading) return;

    if (dbUsageCount >= DAILY_LIMIT) {
      setShowPaywall(true);
      return;
    }

    const currentAttachment = attachment;
    setInput('');
    setAttachment(null);
    if (inputRef.current) inputRef.current.style.height = '48px';

    let displayMsg = textToSend;
    if (currentAttachment?.type === 'audio') {
      displayMsg = `🎙️ *Voice Note attached...*${textToSend ? `\n\n${textToSend}` : ''}`;
    } else if (currentAttachment) {
      displayMsg = `${textToSend}\n\n📎 *Attached: ${currentAttachment.name}*`;
    }

    const updatedMessages: Message[] = [...messages, { role: 'user', content: displayMsg }];
    setMessages(updatedMessages);
    setIsLoading(true);

    // Detect if message is a URL for site verification
    const urlMatch = textToSend.match(/^https?:\/\/[^\s]+$/i);
    const isUrlVerification = Boolean(urlMatch);

    try {
      if (isUrlVerification) {
        // Send to verify endpoint
        const verifyRes = await fetch(VERIFY_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            mode: 'verify_site',
            url: textToSend,
            jurisdiction,
          }),
        });

        const verifyData = await verifyRes.json();
        if (verifyData.success) {
          const statusLabel = verifyData.verification_status.toUpperCase();
          const answerContent = `### Site Verification Report: [${verifyData.final_url}](${verifyData.final_url})
**Status**: \`${statusLabel}\` (Confidence: ${(verifyData.confidence_score * 100).toFixed(1)}%)

**Findings Summary**:
- **Analyzed Blocks**: ${verifyData.chunks_analyzed}
- **Confirmed against Knowledge Base**: ${verifyData.chunks_confirmed}
${verifyData.warnings?.length ? `\n**Warnings:**\n${verifyData.warnings.map((w: string) => `- ${w}`).join('\n')}` : ''}
`;

          const citations: Citation[] = (verifyData.findings || [])
            .filter((f: any) => f.citation_url || f.kb_locator)
            .map((f: any) => ({
              text: f.kb_locator || 'Verified Provision',
              url: f.citation_url,
              status: f.kb_status || 'verified',
              similarity: f.similarity,
            }));

          setMessages((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: answerContent,
              citations,
              verified_site: {
                url: verifyData.final_url,
                status: verifyData.verification_status,
                confidence: verifyData.confidence_score,
                warnings: verifyData.warnings,
              },
            },
          ]);
          setIsLoading(false);
          return;
        }
      }

      // Standard Chat / Retrieval
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: updatedMessages.slice(-6),
          conversation_id: activeConvId,
          jurisdiction: jurisdiction === 'nigeria' ? 'Nigerian Law' : 'US Federal Law',
          user_id: user?.id || 'authenticated_user',
          attachment: currentAttachment,
        }),
      });

      const data = await res.json();

      if (data.paywall) setShowPaywall(true);
      if (data.usage) setDbUsageCount(data.usage.count);

      const assistantReply = data.answer || data.response || data.error || 'No response generated.';
      const citations: Citation[] = Array.isArray(data.citations) ? data.citations : [];

      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: assistantReply,
          citations,
        },
      ]);

      if (data.conversation_id && !activeConvId) {
        setActiveConvId(data.conversation_id);
      }
      if (user) fetchConversations(user.id);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to connect to LexAI. Please check your network connection and try again.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleEdit = (text: string) => {
    const clean = text.split('\n\n📎')[0].split('🎙️ *Voice Note:*')[0];
    setInput(clean.trim());
    if (inputRef.current) {
      inputRef.current.focus();
      inputRef.current.style.height = '48px';
    }
  };

  const messagesRemaining = Math.max(0, DAILY_LIMIT - dbUsageCount);
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
              <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">Daily Quota Reached</h2>
              <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mb-6 leading-relaxed">
                You have reached your free daily allocation of {DAILY_LIMIT} inquiries.
              </p>
              <button onClick={() => navigate('/contact')} className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold text-sm transition-all shadow-lg">
                Upgrade for Unlimited Research
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
                  <p className="text-xs text-slate-600 text-center mt-10 px-4">No conversations stored yet.</p>
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
                  <span>Daily Quota</span>
                  <span>{dbUsageCount} / {DAILY_LIMIT}</span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full transition-all duration-500', messagesRemaining === 0 ? 'bg-rose-500' : 'bg-[#B4975A]')}
                    style={{ width: `${(dbUsageCount / DAILY_LIMIT) * 100}%` }}
                  />
                </div>
              </div>

              <nav className="p-3 border-t border-white/10 bg-[#0f0f0f] space-y-1">
                {user && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 mb-2 text-xs text-slate-300">
                    <UserIcon size={14} className="text-blue-400 shrink-0" />
                    <span className="truncate flex-1 font-medium">{user.email}</span>
                  </div>
                )}

                {[
                  { to: '/', label: 'Home Page', icon: Home },
                  { to: '/saas-admin', label: 'Counsel Admin', icon: ShieldCheck },
                  { to: '/how-it-works', label: 'How It Works', icon: Sparkles },
                  { to: '/about', label: 'About LexAI', icon: Info },
                  { to: '/contact', label: 'Contact Support', icon: Mail }
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

                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 transition-all bg-transparent border-0 cursor-pointer"
                >
                  <LogOut size={14} className="shrink-0" />
                  <span>Sign Out</span>
                </button>
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
                    onClick={() => { setJurisdiction(j.value); setShowJurisdictionPicker(false); }}
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
          </motion.div>
        )}
      </AnimatePresence>

      {showJurisdictionPicker && (
        <div className="fixed inset-0 z-30" onClick={() => setShowJurisdictionPicker(false)} />
      )}

      {/* MESSAGES VIEW */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 py-4">
        {messages.length === 0 ? (
          <div className="min-h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto py-6">
            <div className="w-14 h-14 bg-slate-900 dark:bg-white/10 rounded-2xl flex items-center justify-center mb-4 shadow-sm">
              <Scale size={26} className="text-white dark:text-[#B4975A]" />
            </div>
            
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white mb-2 tracking-tight">
              LexAI Legal Intelligence
            </h2>
            
            <p className="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mb-7 leading-relaxed max-w-md">
              Ask statutory questions, paste legal website URLs for direct verification, or upload documents for admissibility review.
            </p>

            <div className="w-full space-y-2.5">
              {[
                'What are the requirements for computer-generated evidence under Section 84?',
                'Verify the legal text of Section 83 of the Evidence Act 2011.',
                'Paste any legal URL here to cross-check against verified statutes.',
                'Explain competence of witnesses under Section 180.',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  onClick={() => { setInput(suggestion); inputRef.current?.focus(); }}
                  className="w-full text-left p-3.5 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/5 hover:bg-slate-50 dark:hover:bg-white/10 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-200 transition-all active:scale-[0.98] shadow-xs"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6 pb-4">
            {messages.map((msg, idx) => {
              const isUser = msg.role === 'user';
              return (
                <div key={idx} className="space-y-2 group">
                  <div className={cn('flex gap-3', isUser ? 'justify-end' : 'justify-start')}>
                    {!isUser && (
                      <div className="w-7 h-7 bg-slate-900 dark:bg-white/10 rounded-full flex items-center justify-center shrink-0 mt-1">
                        <Scale size={12} className="text-white dark:text-[#B4975A]" />
                      </div>
                    )}
                    <div
                      className={cn(
                        'max-w-[88%] rounded-2xl px-5 py-3.5 text-sm leading-relaxed select-text flex flex-col',
                        isUser
                          ? 'bg-slate-900 dark:bg-blue-600 text-white rounded-tr-md'
                          : 'bg-slate-100 dark:bg-white/5 text-slate-800 dark:text-slate-200 border border-slate-200/50 dark:border-white/5 rounded-tl-md shadow-xs'
                      )}
                    >
                      {isUser ? (
                        <p className="whitespace-pre-wrap leading-relaxed break-words">{msg.content}</p>
                      ) : (
                        <div className="prose prose-sm max-w-none prose-slate dark:prose-invert leading-relaxed break-words overflow-x-auto w-full">
                          <Markdown
                            components={{
                              table: ({node, ...props}) => (
                                <div className="overflow-x-auto w-full my-4 rounded-xl border border-slate-200 dark:border-white/10 shadow-xs">
                                  <table className="min-w-full divide-y divide-slate-200 dark:divide-white/10 text-xs text-left" {...props} />
                                </div>
                              ),
                              th: ({node, ...props}) => (
                                <th className="px-4 py-2 bg-slate-50 dark:bg-white/5 font-bold text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-white/10" {...props} />
                              ),
                              td: ({node, ...props}) => (
                                <td className="px-4 py-2 border-t border-slate-100 dark:border-white/5 text-slate-600 dark:text-slate-400 whitespace-normal" {...props} />
                              ),
                              code: ({node, ...props}) => (
                                <code className="bg-slate-200/60 dark:bg-white/10 px-1 py-0.5 rounded font-mono text-[13px] text-slate-900 dark:text-slate-200 font-medium" {...props} />
                              )
                            }}
                          >
                            {msg.content}
                          </Markdown>
                        </div>
                      )}

                      {/* ==================== CLICKABLE CITATIONS SECTION ==================== */}
                      {!isUser && msg.citations && msg.citations.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-slate-200/50 dark:border-white/10 space-y-1.5">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                            <ShieldCheck size={12} className="text-emerald-500" />
                            Verified Statutory Authorities:
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {msg.citations.map((cite, cIdx) => (
                              <div
                                key={cIdx}
                                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-200/70 dark:bg-white/10 border border-slate-300/60 dark:border-white/10 text-[11px] font-medium"
                              >
                                {cite.url ? (
                                  <a
                                    href={cite.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-semibold"
                                  >
                                    <span>{cite.text}</span>
                                    <ExternalLink size={10} className="shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-slate-700 dark:text-slate-300">{cite.text}</span>
                                )}

                                {cite.status && (
                                  <span
                                    className={cn(
                                      'text-[8px] font-bold px-1.5 py-0.2 rounded uppercase ml-1',
                                      cite.status === 'verified'
                                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                        : cite.status === 'repealed'
                                        ? 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                                        : 'bg-amber-500/20 text-amber-600 dark:text-amber-400'
                                    )}
                                  >
                                    {cite.status}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className={cn('flex items-center gap-3 px-1.5 py-0.5 text-slate-400 dark:text-slate-500', isUser ? 'justify-end' : 'pl-10 justify-start')}>
                    <button
                      onClick={() => handleCopy(msg.content, idx)}
                      className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex items-center gap-1 text-[10px] font-bold bg-transparent border-0 cursor-pointer"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <Check size={11} className="text-emerald-500" />
                          <span className="text-emerald-500 font-bold">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy size={11} />
                          <span>Copy</span>
                        </>
                      )}
                    </button>

                    {isUser && (
                      <button
                        onClick={() => handleEdit(msg.content)}
                        className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-600 dark:hover:text-slate-300 transition-colors flex items-center gap-1 text-[10px] font-bold bg-transparent border-0 cursor-pointer"
                      >
                        <Pencil size={11} />
                        <span>Edit</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            {isLoading && (
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex gap-3"
              >
                <div className="w-7 h-7 bg-slate-900 dark:bg-white/10 rounded-full flex items-center justify-center shrink-0 mt-1">
                  <Scale size={12} className="text-white dark:text-[#B4975A]" />
                </div>
                <div className="bg-slate-100 dark:bg-white/5 border border-slate-200/50 dark:border-white/5 rounded-2xl rounded-tl-md px-4 py-3.5 shadow-xs">
                  <div className="flex items-center gap-2">
                    <Loader2 size={14} className="animate-spin text-blue-600 dark:text-[#B4975A]" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">LexAI is searching statutory library & verifying citations...</span>
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
          
          {/* ATTACHMENT BADGE */}
          <AnimatePresence>
            {attachment && !isRecording && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="mb-2 p-2.5 bg-slate-100 dark:bg-white/10 rounded-xl border border-slate-200 dark:border-white/10 flex items-center justify-between text-xs text-slate-700 dark:text-slate-200 shadow-xs"
              >
                <div className="flex items-center gap-2.5 truncate pr-2">
                  {attachment.type === 'audio' ? (
                    <Volume2 size={16} className="text-purple-500 shrink-0" />
                  ) : attachment.type === 'image' ? (
                    <ImageIcon size={16} className="text-blue-500 shrink-0" />
                  ) : (
                    <FileText size={16} className="text-amber-500 shrink-0" />
                  )}
                  <span className="font-bold truncate">{attachment.name}</span>
                  <span className="text-[10px] text-slate-400 uppercase font-mono">({attachment.type})</span>
                </div>
                <button
                  onClick={() => setAttachment(null)}
                  className="p-1 text-slate-400 hover:text-rose-500 bg-transparent border-0 cursor-pointer"
                >
                  <X size={14} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {/* LIVE RECORDING BAR OR TEXT DOCK */}
          {isRecording ? (
            <div className="bg-rose-500/10 dark:bg-rose-950/40 border border-rose-500/30 rounded-2xl p-3 flex items-center justify-between animate-pulse shadow-sm">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-rose-500 rounded-full animate-ping" />
                <span className="text-xs font-bold text-rose-500">
                  Recording Voice Note ({Math.floor(recordingSeconds / 60)}:{('0' + (recordingSeconds % 60)).slice(-2)})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={cancelVoiceRecording}
                  className="px-3 py-1.5 rounded-xl bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300 text-xs font-semibold hover:bg-slate-300 border-0 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={stopVoiceRecording}
                  className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1.5 border-0 cursor-pointer shadow-md transition-all active:scale-95"
                >
                  <Square size={12} fill="currentColor" /> Stop & Attach
                </button>
              </div>
            </div>
          ) : (
            <div className="relative bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl focus-within:border-slate-400 dark:focus-within:border-white/20 focus-within:bg-white dark:focus-within:bg-white/10 transition-all flex items-center">
              
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.doc,.docx,.mp3,.m4a,.wav,.ogg,.aac,.webm"
                className="hidden"
              />

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessingFile}
                className="pl-3.5 pr-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors bg-transparent border-0 cursor-pointer disabled:opacity-50"
                title="Attach PDF, Document, Photo, or Audio File"
              >
                {isProcessingFile ? <Loader2 size={18} className="animate-spin text-blue-500" /> : <Paperclip size={18} />}
              </button>

              <button
                type="button"
                onClick={startVoiceRecording}
                className="px-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors bg-transparent border-0 cursor-pointer"
                title="Record live voice note"
              >
                <Mic size={18} />
              </button>

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
                placeholder="Ask statutory question, paste website URL to verify, or record voice…"
                rows={1}
                className="w-full py-3.5 pr-12 pl-2 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none resize-none max-h-28"
                style={{ minHeight: '48px' }}
                onInput={(e) => {
                  const t = e.target as HTMLTextAreaElement;
                  t.style.height = '48px';
                  t.style.height = Math.min(t.scrollHeight, 112) + 'px';
                }}
              />
              
              <button
                onClick={() => sendMessage()}
                disabled={isLoading || (!input.trim() && !attachment)}
                className={cn(
                  'absolute right-2 bottom-2 w-8 h-8 rounded-xl flex items-center justify-center transition-all active:scale-90',
                  (input.trim() || attachment) && !isLoading
                    ? 'bg-slate-900 dark:bg-white text-white dark:text-black'
                    : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-600'
                )}
                aria-label="Send Message"
              >
                {isLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              </button>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-center px-1 mt-2 text-[10px] text-slate-400 dark:text-slate-500 gap-1 text-center sm:text-left leading-tight">
            <span>{messagesRemaining} verified statutory inquiries left today.</span>
            <span>LexAI provides grounded statutory analysis. Verify crucial legal steps with qualified counsel.</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexAI;
