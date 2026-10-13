import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import {
  Settings as SettingsIcon,
  Key,
  Shield,
  Plus,
  Trash2,
  Power,
  CheckCircle2,
  Copy,
  BookOpen,
  UploadCloud,
  Loader2,
  AlertCircle,
  Menu,
  X,
  PlusCircle,
  ChevronRight,
  ChevronLeft,
  Zap,
  Link as LinkIcon,
  FileText,
  Eye,
  RefreshCw,
  Play,
  ExternalLink,
  Users,
  Ban,
  Crown,
  ArrowUpCircle,
  ArrowDownCircle,
  Activity,
  FileWarning,
} from 'lucide-react';

// ============================================================
// INTERFACES
// ============================================================

interface SystemConfiguration {
  id: string;
  api_enabled: boolean;
  active_model: string;
}

interface ApiKey {
  id: string;
  key: string;
  site: string;
  status: 'active' | 'revoked';
  created_at: string;
}

interface Document {
  id: number | string;
  title: string;
  jurisdiction: string;
  document_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'rejected';
  total_sections: number;
  processed_sections: number;
  error_log?: string | null;
  created_at: string;
  updated_at?: string;
  authority_level?: string | null;
  official_source?: string | null;
  source_url?: string | null;
  url_template?: string | null;
  effective_from?: string | null;
  effective_to?: string | null;
  current_status?: string | null;
  last_verified_at?: string | null;
  verification_source?: string | null;
  version_label?: string | null;
}

interface UserRecord {
  user_id: string;
  email: string;
  trial_messages_used: number;
  trial_limit: number;
  is_subscribed: boolean;
  subscription_tier: string;
  subscription_expires_at: string | null;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  created_at: string;
  updated_at: string;
}

interface QALog {
  id: string;
  benchmark_id: string;
  category: string;
  question_asked: string;
  ai_answer: string;
  what_was_wrong: string;
  why_it_was_wrong: string;
  correct_authority: string;
  general_training_rule: string;
  jurisdiction: string;
  passed: boolean;
  retest_status: string;
  tested_at: string;
}

interface ApiEnvelope<T = any> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
  details?: any;
}

interface PreviewData {
  document: Document & { full_content: string };
  analysis: {
    characters: number;
    pages_detected: number;
    sections_detected: number;
    sections: string[];
    planned_chunks: number;
    chunk_previews: Array<{
      index: number;
      section_number: string | null;
      subsection: string | null;
      source_locator: string;
      content: string;
    }>;
  };
}

type AdminTab = 'home' | 'settings' | 'keys' | 'docs' | 'users' | 'qa';
type IngestMode = 'text' | 'url' | 'file';

const BATCH_SIZE = 10;

// ============================================================
// COMPONENT
// ============================================================

export default function AdminSaaS() {
  useDocumentTitle('LexAI - Practice Control Portal');

  const [adminKey, setAdminKey] = useState<string>(
    localStorage.getItem('lex_admin_key') || ''
  );
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('home');

  // Core Data State
  const [settings, setSettings] = useState<SystemConfiguration | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [qaLogs, setQaLogs] = useState<QALog[]>([]);

  // UI State
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [userActionLoading, setUserActionLoading] = useState<string | null>(null);

  // Ingestion Form State
  const [ingestPanelOpen, setIngestPanelOpen] = useState(false);
  const [ingestMode, setIngestMode] = useState<IngestMode>('text');
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('statute');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [knowledgeJur, setKnowledgeJurisdiction] = useState('nigeria');
  const [authorityLevel, setAuthorityLevel] = useState('primary');
  const [currentStatus, setCurrentStatus] = useState('unverified');
  const [versionLabel, setVersionLabel] = useState('');
  const [officialSource, setOfficialSource] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [verificationSource, setVerificationSource] = useState('');
  const [importUrl, setImportUrl] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Preview State
  const [previewOpen, setPreviewOpen] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

  // Indexing State
  const [isIndexing, setIsIndexing] = useState(false);
  const [indexingDocumentId, setIndexingDocumentId] = useState<number | string | null>(null);
  const [indexingMessage, setIndexingMessage] = useState<string | null>(null);

  // ============================================================
  // API HELPERS
  // ============================================================

  const adminHeaders = useCallback(
    (isJson = false): HeadersInit => ({
      ...(isJson ? { 'Content-Type': 'application/json' } : {}),
      'x-admin-key': adminKey,
    }),
    [adminKey]
  );

  const parseResponse = async <T,>(response: Response): Promise<ApiEnvelope<T>> => {
    const text = await response.text();
    let parsed: any = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = { success: false, error: text || `HTTP ${response.status}` };
    }
    if (!response.ok) {
      return {
        success: false,
        data: null as T,
        error: parsed?.error || parsed?.message || `HTTP ${response.status}`,
        details: parsed?.details,
      };
    }
    return parsed;
  };

  // ============================================================
  // AUTH & DATA FETCHING
  // ============================================================

  useEffect(() => {
    if (adminKey) validateAndFetch();
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    if (isAuth && (activeTab === 'docs' || activeTab === 'users')) {
      interval = setInterval(() => fetchData(), 5000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isAuth, activeTab]);

  const validateAndFetch = async () => {
    if (!adminKey.trim()) {
      setIsAuth(false);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings', { headers: adminHeaders() });
      const result = await parseResponse<SystemConfiguration>(res);
      if (res.ok && result.success) {
        setSettings(result.data);
        setIsAuth(true);
        localStorage.setItem('lex_admin_key', adminKey);
        await fetchData();
      } else {
        setIsAuth(false);
      }
    } catch {
      setIsAuth(false);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!adminKey) return;
    try {
      const [settingsRes, keysRes, docsRes, usersRes, qaRes] = await Promise.all([
        fetch('/api/admin/settings', { headers: adminHeaders() }),
        fetch('/api/admin/keys', { headers: adminHeaders() }),
        fetch('/api/admin/documents', { headers: adminHeaders() }),
        fetch('/api/admin/users', { headers: adminHeaders() }),
        fetch('/api/admin/qa/logs', { headers: adminHeaders() }),
      ]);

      if (settingsRes.ok) {
        const r = await parseResponse<SystemConfiguration>(settingsRes);
        if (r.success) setSettings(r.data);
      }
      if (keysRes.ok) {
        const r = await parseResponse<ApiKey[]>(keysRes);
        if (r.success) setApiKeys(r.data || []);
      }
      if (docsRes.ok) {
        const r = await parseResponse<Document[]>(docsRes);
        if (r.success) setDocs(r.data || []);
      }
      if (usersRes.ok) {
        const r = await parseResponse<UserRecord[]>(usersRes);
        if (r.success) setUsers(r.data || []);
      }
      if (qaRes.ok) {
        const r = await parseResponse<QALog[]>(qaRes);
        if (r.success) setQaLogs(r.data || []);
      }
    } catch (error) {
      console.error('Admin data fetch failed:', error);
    }
  };

  // ============================================================
  // SETTINGS & KEYS HANDLERS
  // ============================================================

  const handleToggleSystem = async () => {
    if (!settings) return;
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: adminHeaders(true),
        body: JSON.stringify({ api_enabled: !settings.api_enabled }),
      });
      const result = await parseResponse<SystemConfiguration>(res);
      if (res.ok && result.success) setSettings(result.data);
      else alert(result.error || 'Unable to update system status.');
    } catch {
      alert('Unable to update system status.');
    }
  };

  const handleCreateKey = async () => {
    const firmName = prompt('Enter Law Firm / Client Name:');
    if (!firmName?.trim()) return;
    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: adminHeaders(true),
        body: JSON.stringify({ site: firmName.trim() }),
      });
      const result = await parseResponse<ApiKey>(res);
      if (res.ok && result.success) {
        await fetchData();
        if (result.data?.key) alert(`Client license created.\n\nAccess key:\n${result.data.key}`);
      } else {
        alert(result.error || 'Unable to create client license.');
      }
    } catch {
      alert('Unable to create client license.');
    }
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Revoke access for this client key?')) return;
    try {
      const res = await fetch(`/api/admin/keys/${id}`, { method: 'DELETE', headers: adminHeaders() });
      const result = await parseResponse(res);
      if (res.ok && result.success) await fetchData();
      else alert(result.error || 'Unable to revoke license.');
    } catch {
      alert('Unable to revoke license.');
    }
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // ============================================================
  // USER MANAGEMENT HANDLERS
  // ============================================================

  const handleUpgradeUser = async (userId: string) => {
    setUserActionLoading(userId);
    try {
      const expires = new Date();
      expires.setMonth(expires.getMonth() + 1);
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: adminHeaders(true),
        body: JSON.stringify({
          is_subscribed: true,
          subscription_tier: 'premium',
          subscription_expires_at: expires.toISOString(),
        }),
      });
      const result = await parseResponse(res);
      if (res.ok && result.success) await fetchData();
      else alert(result.error || 'Failed to upgrade user.');
    } catch {
      alert('Failed to upgrade user.');
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleDowngradeUser = async (userId: string) => {
    if (!confirm('Downgrade this user to free tier?')) return;
    setUserActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: adminHeaders(true),
        body: JSON.stringify({ is_subscribed: false, subscription_tier: 'free' }),
      });
      const result = await parseResponse(res);
      if (res.ok && result.success) await fetchData();
      else alert(result.error || 'Failed to downgrade user.');
    } catch {
      alert('Failed to downgrade user.');
    } finally {
      setUserActionLoading(null);
    }
  };

  const handleBanUser = async (userId: string, currentlyBanned: boolean) => {
    if (!currentlyBanned) {
      const reason = prompt('Reason for banning this user:');
      if (!reason?.trim()) return;
      setUserActionLoading(userId);
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: adminHeaders(true),
          body: JSON.stringify({ is_banned: true, ban_reason: reason.trim() }),
        });
        const result = await parseResponse(res);
        if (res.ok && result.success) await fetchData();
        else alert(result.error || 'Failed to ban user.');
      } catch {
        alert('Failed to ban user.');
      } finally {
        setUserActionLoading(null);
      }
    } else {
      setUserActionLoading(userId);
      try {
        const res = await fetch(`/api/admin/users/${userId}`, {
          method: 'PATCH',
          headers: adminHeaders(true),
          body: JSON.stringify({ is_banned: false }),
        });
        const result = await parseResponse(res);
        if (res.ok && result.success) await fetchData();
        else alert(result.error || 'Failed to unban user.');
      } catch {
        alert('Failed to unban user.');
      } finally {
        setUserActionLoading(null);
      }
    }
  };

  const handleIncreaseTokens = async (userId: string) => {
    const amount = prompt('Enter new message limit (e.g. 50, 100, 500):');
    if (!amount || isNaN(Number(amount))) return;
    setUserActionLoading(userId);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        headers: adminHeaders(true),
        body: JSON.stringify({ trial_limit: Number(amount), trial_messages_used: 0 }),
      });
      const result = await parseResponse(res);
      if (res.ok && result.success) await fetchData();
      else alert(result.error || 'Failed to update token quota.');
    } catch {
      alert('Failed to update token quota.');
    } finally {
      setUserActionLoading(null);
    }
  };

  // ============================================================
  // DOCUMENT INGESTION
  // ============================================================

  const resetIngestForm = () => {
    setDocTitle('');
    setDocType('statute');
    setKnowledgeText('');
    setKnowledgeJurisdiction('nigeria');
    setAuthorityLevel('primary');
    setCurrentStatus('unverified');
    setVersionLabel('');
    setOfficialSource('');
    setSourceUrl('');
    setEffectiveFrom('');
    setEffectiveTo('');
    setVerificationSource('');
    setImportUrl('');
    setSelectedFile(null);
    setUploadError(null);
    setUploadSuccess(null);
  };

  const openIngestPanel = () => {
    resetIngestForm();
    setIngestMode('text');
    setIngestPanelOpen(true);
  };

  const createTextDocument = async () => {
    if (!docTitle.trim()) throw new Error('Please provide a document title.');
    if (knowledgeText.trim().length < 10) throw new Error('Please enter at least 10 characters of legal content.');
    const res = await fetch('/api/admin/documents', {
      method: 'POST',
      headers: adminHeaders(true),
      body: JSON.stringify({
        title: docTitle.trim(),
        document_type: docType,
        jurisdiction: knowledgeJur,
        authority_level: authorityLevel,
        current_status: currentStatus,
        version_label: versionLabel.trim() || null,
        official_source: officialSource.trim() || null,
        source_url: sourceUrl.trim() || null,
        effective_from: effectiveFrom || null,
        effective_to: effectiveTo || null,
        verification_source: verificationSource.trim() || null,
        content: knowledgeText.trim(),
      }),
    });
    const result = await parseResponse<Document>(res);
    if (!res.ok || !result.success) throw new Error(result.error || 'Unable to create document.');
    return result.data;
  };

  const importDocumentUrl = async () => {
    if (!importUrl.trim()) throw new Error('Please enter the official document URL.');
    const res = await fetch('/api/admin/documents/import-url', {
      method: 'POST',
      headers: adminHeaders(true),
      body: JSON.stringify({
        url: importUrl.trim(),
        title: docTitle.trim() || null,
        document_type: docType,
        jurisdiction: knowledgeJur,
        authority_level: authorityLevel,
        current_status: currentStatus,
        version_label: versionLabel.trim() || null,
        official_source: officialSource.trim() || null,
        effective_from: effectiveFrom || null,
        effective_to: effectiveTo || null,
        verification_source: verificationSource.trim() || null,
      }),
    });
    const result = await parseResponse<any>(res);
    if (!res.ok || !result.success) throw new Error(result.error || 'Unable to import URL.');
    return result.data;
  };

  const uploadDocumentFile = async () => {
    if (!selectedFile) throw new Error('Please select a PDF, HTML, or text file.');
    const formData = new FormData();
    formData.append('file', selectedFile);
    if (docTitle.trim()) formData.append('title', docTitle.trim());
    formData.append('document_type', docType);
    formData.append('jurisdiction', knowledgeJur);
    formData.append('authority_level', authorityLevel);
    formData.append('current_status', currentStatus);
    if (versionLabel.trim()) formData.append('version_label', versionLabel.trim());
    if (officialSource.trim()) formData.append('official_source', officialSource.trim());
    if (sourceUrl.trim()) formData.append('source_url', sourceUrl.trim());
    if (effectiveFrom) formData.append('effective_from', effectiveFrom);
    if (effectiveTo) formData.append('effective_to', effectiveTo);
    if (verificationSource.trim()) formData.append('verification_source', verificationSource.trim());
    const res = await fetch('/api/admin/documents/upload', {
      method: 'POST',
      headers: { 'x-admin-key': adminKey },
      body: formData,
    });
    const result = await parseResponse<any>(res);
    if (!res.ok || !result.success) throw new Error(result.error || 'Unable to upload file.');
    return result.data;
  };

  const handleIngestKnowledge = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (isUploading) return;
    setUploadError(null);
    setUploadSuccess(null);
    setIsUploading(true);
    try {
      let result: any;
      if (ingestMode === 'text') result = await createTextDocument();
      else if (ingestMode === 'url') result = await importDocumentUrl();
      else result = await uploadDocumentFile();
      const createdDocument = result?.document || result;
      setUploadSuccess('Document imported successfully. Review the preview before indexing.');
      await fetchData();
      if (createdDocument?.id) await openPreview(createdDocument.id);
      setIngestPanelOpen(false);
      resetIngestForm();
    } catch (error: any) {
      setUploadError(error?.message || 'Unable to register the legal document.');
    } finally {
      setIsUploading(false);
    }
  };

  // ============================================================
  // PREVIEW & INDEXING
  // ============================================================

  const openPreview = async (id: number | string) => {
    setPreviewLoading(true);
    setPreviewOpen(true);
    setPreview(null);
    try {
      const res = await fetch(`/api/admin/documents/${id}/preview`, { headers: adminHeaders() });
      const result = await parseResponse<PreviewData>(res);
      if (res.ok && result.success) {
        setPreview(result.data);
        setSelectedDocument(result.data.document);
      } else {
        throw new Error(result.error || 'Unable to load preview.');
      }
    } catch (error: any) {
      alert(error?.message || 'Unable to load document preview.');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const indexDocument = async (document: Document, reset = false) => {
    if (isIndexing) return;
    setIsIndexing(true);
    setIndexingDocumentId(document.id);
    setIndexingMessage(reset ? 'Preparing document for indexing...' : 'Starting legal knowledge indexing...');
    try {
      let offset = reset ? 0 : Number(document.processed_sections || 0);
      let completed = false;
      let safetyCounter = 0;
      while (!completed && safetyCounter < 500) {
        safetyCounter++;
        setIndexingMessage(offset > 0 ? `Indexing legal knowledge... ${offset} chunks processed` : 'Indexing legal knowledge...');
        const endpoint = `/api/admin/documents/${document.id}/index?offset=${offset}&batch_size=${BATCH_SIZE}${reset && offset === 0 ? '&reset=true' : ''}`;
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: adminHeaders(true),
          body: JSON.stringify({ offset, batch_size: BATCH_SIZE, reset: reset && offset === 0 }),
        });
        const result = await parseResponse<any>(res);
        if (!res.ok || !result.success) throw new Error(result.error || 'Indexing failed.');
        const data = result.data;
        completed = Boolean(data.completed);
        offset = Number(data.next_offset ?? offset);
        await fetchData();
      }
      if (!completed) throw new Error('Indexing stopped after maximum batches.');
      setIndexingMessage('Legal document indexed successfully.');
      await fetchData();
    } catch (error: any) {
      setIndexingMessage(null);
      alert(error?.message || 'Document indexing failed.');
      await fetchData();
    } finally {
      setIsIndexing(false);
      setIndexingDocumentId(null);
    }
  };

  const handleDeleteDocument = async (id: number | string) => {
    if (!confirm('Permanently delete this document and all indexed chunks from LexAI?')) return;
    try {
      const res = await fetch(`/api/admin/documents/${id}`, { method: 'DELETE', headers: adminHeaders() });
      const result = await parseResponse(res);
      if (res.ok && result.success) await fetchData();
      else alert(result.error || 'Failed to remove document.');
    } catch {
      alert('Failed to remove document.');
    }
  };

  // ============================================================
  // AUTH GUARD VIEW
  // ============================================================

  if (!isAuth) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 flex items-center justify-center p-4">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm bg-slate-900 border border-slate-800 p-6 rounded-3xl text-center shadow-2xl">
          <div className="w-12 h-12 bg-blue-600/20 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <Shield size={24} />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Practice Control Portal</h2>
          <p className="text-slate-400 text-xs mb-6 leading-relaxed">Enter master authorization key to continue</p>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') validateAndFetch(); }}
            placeholder="••••••••••••••••"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3.5 px-4 text-white mb-4 text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
          />
          <button
            onClick={validateAndFetch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-sm transition-all"
          >
            {loading ? 'Authenticating...' : 'Access Workspace'}
          </button>
        </motion.div>
      </div>
    );
  }

  // ============================================================
  // FEATURES NAVIGATION
  // ============================================================

  const adminFeatures = [
    { id: 'settings' as AdminTab, label: 'Practice Status', icon: SettingsIcon, desc: 'Enable or disable AI access across all legal workspaces', color: 'from-emerald-500/20 to-emerald-600/5', iconColor: 'text-emerald-400' },
    { id: 'keys' as AdminTab, label: 'Client Firm Licenses', icon: Key, desc: 'Generate or revoke access keys for client law firms', color: 'from-amber-500/20 to-amber-600/5', iconColor: 'text-amber-400', badge: apiKeys.filter((k) => k.status === 'active').length },
    { id: 'docs' as AdminTab, label: 'Statutory Library', icon: BookOpen, desc: 'Manage statutes, amendments, cases and verified legal sources', color: 'from-blue-500/20 to-blue-600/5', iconColor: 'text-blue-400', badge: docs.length },
    { id: 'users' as AdminTab, label: 'User Management', icon: Users, desc: 'View registered users, grant premium access, ban or adjust token limits', color: 'from-purple-500/20 to-purple-600/5', iconColor: 'text-purple-400', badge: users.length },
    { id: 'qa' as AdminTab, label: 'QA Error Logs', icon: FileWarning, desc: 'Review AI errors, training rules, and regression benchmarks', color: 'from-orange-500/20 to-orange-600/5', iconColor: 'text-orange-400', badge: qaLogs.filter((l) => !l.passed).length },
  ];

  const currentFeature = adminFeatures.find((f) => f.id === activeTab);

  // ============================================================
  // MAIN LAYOUT RENDER
  // ============================================================

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-300 flex flex-col md:flex-row font-sans relative">

      {/* MOBILE HEADER */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-slate-800 fixed top-0 inset-x-0 z-40 backdrop-blur-md h-14">
        <div className="flex items-center gap-2 min-w-0">
          {activeTab !== 'home' ? (
            <button onClick={() => setActiveTab('home')} className="p-1.5 -ml-1 rounded-lg hover:bg-slate-800 text-slate-300 bg-transparent border-0 cursor-pointer transition-colors shrink-0">
              <ChevronLeft size={20} />
            </button>
          ) : (
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center text-white font-black text-xs shrink-0">LA</div>
          )}
          <span className="font-bold text-white text-sm truncate">{activeTab === 'home' ? 'Counsel Admin' : currentFeature?.label}</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-0 cursor-pointer transition-colors shrink-0">
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {/* MOBILE SIDEBAR */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden" />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="fixed top-0 bottom-0 left-0 w-72 bg-[#0c0d12] border-r border-slate-900 p-6 flex flex-col justify-between z-50 md:hidden shadow-2xl">
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">LA</div>
                    <span className="font-bold text-white text-base">Counsel Admin</span>
                  </div>
                  <button onClick={() => setSidebarOpen(false)} className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"><X size={18} /></button>
                </div>
                <nav className="space-y-1">
                  <button onClick={() => { setActiveTab('home'); setSidebarOpen(false); }} className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer', activeTab === 'home' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900')}>
                    <Zap size={15} />Dashboard Hub
                  </button>
                  {adminFeatures.map((tab) => (
                    <button key={tab.id} onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }} className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer', activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900')}>
                      <tab.icon size={15} />{tab.label}
                    </button>
                  ))}
                </nav>
              </div>
              <button onClick={() => { localStorage.removeItem('lex_admin_key'); window.location.reload(); }} className="flex items-center gap-2.5 text-xs font-bold text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer py-2 px-3 hover:bg-rose-500/10 rounded-xl transition-all">
                <Power size={13} />SIGN OUT
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* DESKTOP SIDEBAR */}
      <aside className="hidden md:flex sticky top-0 h-screen w-64 bg-[#0c0d12] border-r border-slate-900 p-6 flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">LA</div>
            <span className="font-bold text-white text-base">Counsel Admin</span>
          </div>
          <nav className="space-y-1">
            <button onClick={() => setActiveTab('home')} className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer', activeTab === 'home' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900')}>
              <Zap size={15} />Dashboard Hub
            </button>
            {adminFeatures.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={cn('w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer', activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900')}>
                <tab.icon size={15} />{tab.label}
              </button>
            ))}
          </nav>
        </div>
        <button onClick={() => { localStorage.removeItem('lex_admin_key'); window.location.reload(); }} className="flex items-center gap-2.5 text-xs font-bold text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer py-2 px-3 hover:bg-rose-500/10 rounded-xl transition-all">
          <Power size={13} />SIGN OUT
        </button>
      </aside>

      {/* MAIN VIEWPORT */}
      <main className="flex-grow overflow-y-auto max-w-full pt-14 md:pt-0">
        <div className="p-4 sm:p-6 md:p-10">

          {/* ============== TAB: HOME ============== */}
          {activeTab === 'home' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-6">
              <div>
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Practice Dashboard</h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5">Manage access, users, licenses and verified statutory intelligence.</p>
              </div>

              <div className={cn('p-5 rounded-3xl border flex items-center gap-4 shadow-xl', settings?.api_enabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20')}>
                <div className={cn('w-11 h-11 rounded-2xl flex items-center justify-center shrink-0', settings?.api_enabled ? 'bg-emerald-500/15' : 'bg-rose-500/15')}>
                  <Zap size={20} className={settings?.api_enabled ? 'text-emerald-400' : 'text-rose-400'} />
                </div>
                <div className="min-w-0 flex-grow">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SaaS System Status</p>
                  <p className={cn('text-base font-bold', settings?.api_enabled ? 'text-emerald-400' : 'text-rose-400')}>
                    {settings?.api_enabled ? 'Active and Processing Inquiries' : 'System Offline / Maintenance'}
                  </p>
                </div>
                <button onClick={handleToggleSystem} className={cn('w-11 h-6 rounded-full relative border-0 cursor-pointer shrink-0 transition-colors', settings?.api_enabled ? 'bg-emerald-500' : 'bg-slate-700')}>
                  <div className={cn('w-4 h-4 bg-white rounded-full absolute top-1 transition-all', settings?.api_enabled ? 'left-6' : 'left-1')} />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {adminFeatures.map((feature) => (
                  <button key={feature.id} onClick={() => setActiveTab(feature.id)} className={cn('relative p-5 rounded-3xl bg-gradient-to-br border border-slate-800 text-left cursor-pointer transition-all hover:border-slate-700 hover:scale-[1.01] active:scale-[0.98] group overflow-hidden', feature.color)}>
                    <div className="flex items-start justify-between mb-4">
                      <div className={cn('w-11 h-11 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-center', feature.iconColor)}>
                        <feature.icon size={20} />
                      </div>
                      {feature.badge !== undefined && feature.badge > 0 && (
                        <span className="text-[9px] font-bold bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full">{feature.badge}</span>
                      )}
                    </div>
                    <h4 className="font-bold text-white text-sm mb-1">{feature.label}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed pr-6">{feature.desc}</p>
                    <ChevronRight size={16} className="absolute right-5 bottom-5 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ============== TAB: SETTINGS ============== */}
          {activeTab === 'settings' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6">
              <div className="hidden md:block"><h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Practice Status</h3></div>
              <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between shadow-xl">
                <div>
                  <h4 className="font-bold text-white text-sm sm:text-base">Global AI Intelligence Access</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Toggle availability across all client firm workspaces.</p>
                </div>
                <button onClick={handleToggleSystem} className={cn('w-12 h-7 rounded-full transition-colors relative border-0 cursor-pointer self-start sm:self-auto shrink-0', settings?.api_enabled ? 'bg-emerald-600' : 'bg-slate-700')}>
                  <div className={cn('w-5 h-5 bg-white rounded-full absolute top-1 transition-all', settings?.api_enabled ? 'left-6' : 'left-1')} />
                </button>
              </div>
            </motion.div>
          )}

          {/* ============== TAB: KEYS ============== */}
          {activeTab === 'keys' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block"><h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Client Firm Licenses</h3></div>
                <button onClick={handleCreateKey} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg">
                  <Plus size={15} />New Client License
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                      <th className="p-4">Firm / Client</th><th className="p-4">Access Key</th><th className="p-4">Status</th><th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {apiKeys.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-500">No licenses issued yet.</td></tr>
                    ) : apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-950/25 transition-colors">
                        <td className="p-4 font-bold text-white">{k.site}</td>
                        <td className="p-4 font-mono text-xs text-slate-400">
                          {k.key.substring(0, 10)}••••••••••
                          <button onClick={() => handleCopyKey(k.key)} className="ml-2 text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer">
                            {copiedKey === k.key ? <CheckCircle2 size={12} className="inline text-emerald-400" /> : <Copy size={12} className="inline" />}
                          </button>
                        </td>
                        <td className="p-4">
                          <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border', k.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25')}>{k.status}</span>
                        </td>
                        <td className="p-4 text-right">
                          {k.status === 'active' && <button onClick={() => handleRevokeKey(k.id)} className="text-rose-400 hover:text-rose-300 hover:underline text-xs font-bold bg-transparent border-0 cursor-pointer">Revoke</button>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {/* ============== TAB: DOCUMENTS ============== */}
          {activeTab === 'docs' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Statutory Library</h3>
                  <p className="text-xs text-slate-400 mt-1">Import, verify, preview and index legal authorities into the vector base.</p>
                </div>
                <button onClick={openIngestPanel} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-5 py-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg shadow-blue-600/15">
                  <PlusCircle size={15} />Teach LexAI New Knowledge
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                      <th className="p-4">Jurisdiction</th><th className="p-4">Type</th><th className="p-4">Authority</th><th className="p-4">Title</th><th className="p-4">Progress</th><th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {docs.length === 0 ? (
                      <tr><td colSpan={6} className="p-8 text-center text-slate-500">No legal documents registered.</td></tr>
                    ) : docs.map((doc) => (
                      <tr key={doc.id} className="group hover:bg-slate-950/25 transition-colors">
                        <td className="p-4 font-bold text-blue-400 uppercase text-xs">{doc.jurisdiction === 'nigeria' ? '🇳🇬 NG' : '🇺🇸 US'}</td>
                        <td className="p-4 text-slate-400 text-xs font-semibold capitalize">{doc.document_type}</td>
                        <td className="p-4">
                          <span className={cn('text-[9px] px-2 py-1 rounded-full border uppercase font-bold',
                            doc.authority_level === 'primary' ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' :
                            doc.authority_level === 'secondary' ? 'text-amber-400 bg-amber-500/10 border-amber-500/20' :
                            'text-slate-400 bg-slate-500/10 border-slate-500/20'
                          )}>{doc.authority_level || 'primary'}</span>
                        </td>
                        <td className="p-4 text-slate-200 text-xs font-bold max-w-xs">
                          <button onClick={() => openPreview(doc.id)} className="text-left hover:text-blue-400 transition-colors">{doc.title}</button>
                          {doc.version_label && <div className="text-[9px] text-slate-500 mt-1">{doc.version_label}</div>}
                        </td>
                        <td className="p-4 align-middle">
                          {doc.status === 'processing' ? (
                            <div className="flex items-center gap-2"><Loader2 size={13} className="animate-spin text-blue-500" /><span className="text-[11px] text-blue-400 font-mono">{doc.processed_sections}/{doc.total_sections || '?'}</span></div>
                          ) : doc.status === 'completed' ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/25">Ready</span>
                          ) : doc.status === 'failed' || doc.status === 'rejected' ? (
                            <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/25">{doc.status === 'failed' ? 'Failed' : 'Rejected'}</span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-500/10 px-2.5 py-0.5 rounded-full border border-slate-500/25">Pending</span>
                          )}
                        </td>
                        <td className="p-4 text-right align-middle">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => openPreview(doc.id)} title="Preview" className="text-slate-500 hover:text-blue-400 p-2 bg-transparent border-0 cursor-pointer"><Eye size={14} /></button>
                            {doc.status !== 'completed' && doc.status !== 'rejected' && (
                              <button onClick={() => indexDocument(doc)} disabled={isIndexing} title="Index" className="text-slate-500 hover:text-emerald-400 p-2 bg-transparent border-0 cursor-pointer disabled:opacity-40"><Play size={14} /></button>
                            )}
                            {doc.status === 'completed' && (
                              <button onClick={() => indexDocument(doc, true)} disabled={isIndexing} title="Reindex" className="text-slate-500 hover:text-amber-400 p-2 bg-transparent border-0 cursor-pointer disabled:opacity-40"><RefreshCw size={14} /></button>
                            )}
                            <button onClick={() => handleDeleteDocument(doc.id)} disabled={isIndexing} title="Delete" className="text-slate-600 hover:text-rose-400 p-2 bg-transparent border-0 cursor-pointer"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {isIndexing && (
                <div className="fixed inset-x-4 bottom-4 z-[200] md:left-auto md:right-6 md:max-w-sm">
                  <div className="bg-slate-900 border border-blue-500/30 shadow-2xl rounded-2xl p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 size={20} className="animate-spin text-blue-400" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-white">LexAI is indexing</p>
                        <p className="text-[11px] text-slate-400 truncate">{indexingMessage || 'Processing legal knowledge...'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* ============== TAB: USERS ============== */}
          {activeTab === 'users' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-6xl mx-auto space-y-6">
              <div className="hidden md:block">
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">User Management</h3>
                <p className="text-xs text-slate-400 mt-1">Grant premium access, ban abusive users, increase token limits, and monitor usage.</p>
              </div>

              <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                      <th className="p-4">User</th>
                      <th className="p-4">Tier</th>
                      <th className="p-4">Usage</th>
                      <th className="p-4">Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">No registered users found.</td></tr>
                    ) : users.map((u) => (
                      <tr key={u.user_id} className="hover:bg-slate-950/25 transition-colors">
                        <td className="p-4">
                          <p className="font-bold text-white text-xs truncate max-w-[200px]">{u.email}</p>
                          <p className="text-[9px] text-slate-500 font-mono mt-0.5">{u.user_id.substring(0, 8)}...</p>
                        </td>
                        <td className="p-4">
                          <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border',
                            u.subscription_tier === 'premium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' :
                            u.subscription_tier === 'enterprise' ? 'bg-purple-500/10 text-purple-400 border-purple-500/25' :
                            'bg-slate-500/10 text-slate-400 border-slate-500/25'
                          )}>
                            {u.is_subscribed ? <><Crown size={9} className="inline mr-1" />{u.subscription_tier}</> : 'free'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="text-xs text-slate-300 font-mono">{u.trial_messages_used}/{u.trial_limit}</span>
                        </td>
                        <td className="p-4">
                          {u.is_banned ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/25">
                              <Ban size={9} className="inline mr-1" />Banned
                            </span>
                          ) : u.is_subscribed ? (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">Active</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold uppercase bg-slate-500/10 text-slate-400 border border-slate-500/25">Trial</span>
                          )}
                        </td>
                        <td className="p-4 text-right">
                          <div className="flex justify-end gap-1 flex-wrap">
                            {!u.is_subscribed && (
                              <button onClick={() => handleUpgradeUser(u.user_id)} disabled={userActionLoading === u.user_id}
                                className="text-amber-400 hover:text-amber-300 p-1.5 bg-transparent border-0 cursor-pointer disabled:opacity-40" title="Upgrade to Premium">
                                <ArrowUpCircle size={14} />
                              </button>
                            )}
                            {u.is_subscribed && (
                              <button onClick={() => handleDowngradeUser(u.user_id)} disabled={userActionLoading === u.user_id}
                                className="text-slate-400 hover:text-slate-300 p-1.5 bg-transparent border-0 cursor-pointer disabled:opacity-40" title="Downgrade to Free">
                                <ArrowDownCircle size={14} />
                              </button>
                            )}
                            <button onClick={() => handleIncreaseTokens(u.user_id)} disabled={userActionLoading === u.user_id}
                              className="text-blue-400 hover:text-blue-300 p-1.5 bg-transparent border-0 cursor-pointer disabled:opacity-40" title="Set Message Quota">
                              <Activity size={14} />
                            </button>
                            <button onClick={() => handleBanUser(u.user_id, u.is_banned)} disabled={userActionLoading === u.user_id}
                              className={cn('p-1.5 bg-transparent border-0 cursor-pointer disabled:opacity-40', u.is_banned ? 'text-emerald-400 hover:text-emerald-300' : 'text-rose-400 hover:text-rose-300')}
                              title={u.is_banned ? 'Unban User' : 'Ban User'}>
                              <Ban size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile User Cards */}
              <div className="block sm:hidden space-y-3">
                {users.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No registered users yet.</p>
                ) : users.map((u) => (
                  <div key={u.user_id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs truncate pr-2">{u.email}</span>
                      <span className={cn('px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border shrink-0',
                        u.is_banned ? 'bg-rose-500/10 text-rose-400 border-rose-500/25' :
                        u.is_subscribed ? 'bg-amber-500/10 text-amber-400 border-amber-500/25' :
                        'bg-slate-500/10 text-slate-400 border-slate-500/25'
                      )}>
                        {u.is_banned ? 'Banned' : u.is_subscribed ? u.subscription_tier : 'free'}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">Usage: {u.trial_messages_used}/{u.trial_limit}</div>
                    <div className="flex gap-2">
                      {!u.is_subscribed && <button onClick={() => handleUpgradeUser(u.user_id)} className="flex-1 py-2 bg-amber-500/10 text-amber-400 rounded-xl text-[10px] font-bold border-0 cursor-pointer">Upgrade</button>}
                      {u.is_subscribed && <button onClick={() => handleDowngradeUser(u.user_id)} className="flex-1 py-2 bg-slate-500/10 text-slate-400 rounded-xl text-[10px] font-bold border-0 cursor-pointer">Downgrade</button>}
                      <button onClick={() => handleIncreaseTokens(u.user_id)} className="flex-1 py-2 bg-blue-500/10 text-blue-400 rounded-xl text-[10px] font-bold border-0 cursor-pointer">+Tokens</button>
                      <button onClick={() => handleBanUser(u.user_id, u.is_banned)} className={cn('flex-1 py-2 rounded-xl text-[10px] font-bold border-0 cursor-pointer', u.is_banned ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400')}>
                        {u.is_banned ? 'Unban' : 'Ban'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ============== TAB: QA ERROR LOGS ============== */}
          {activeTab === 'qa' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto space-y-6">
              <div className="hidden md:block">
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">QA Error Logs & Training Rules</h3>
                <p className="text-xs text-slate-400 mt-1">Review AI failures, corrective training rules, and regression test status.</p>
              </div>

              <div className="space-y-3">
                {qaLogs.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center">
                    <FileWarning size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="text-xs text-slate-500">No QA errors logged yet. Errors will appear here when logged via the API.</p>
                  </div>
                ) : qaLogs.map((log) => (
                  <div key={log.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2 shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-orange-400 uppercase">{log.category}</span>
                      <span className={cn('px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border',
                        log.passed ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25'
                      )}>
                        {log.passed ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                    <p className="text-xs text-white font-bold">{log.question_asked}</p>
                    {log.what_was_wrong && <div className="text-[10px] text-rose-400"><strong>Error:</strong> {log.what_was_wrong}</div>}
                    {log.why_it_was_wrong && <div className="text-[10px] text-slate-400"><strong>Why:</strong> {log.why_it_was_wrong}</div>}
                    {log.correct_authority && <div className="text-[10px] text-blue-400"><strong>Correct Authority:</strong> {log.correct_authority}</div>}
                    <div className="text-[10px] text-emerald-400"><strong>Training Rule:</strong> {log.general_training_rule}</div>
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[9px] text-slate-500">{log.jurisdiction.toUpperCase()} · {log.benchmark_id}</span>
                      <span className="text-[9px] text-slate-500">{new Date(log.tested_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

        </div>
      </main>

      {/* ============================================================ */}
      {/* INGESTION DRAWER */}
      {/* ============================================================ */}
      <AnimatePresence>
        {ingestPanelOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { if (!isUploading) setIngestPanelOpen(false); }} className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs" />
            <motion.div initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-0 bottom-0 right-0 w-full sm:max-w-lg bg-slate-900 border-l border-slate-800 flex flex-col z-[110] shadow-2xl">
              <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UploadCloud className="text-blue-500 shrink-0" size={20} />
                  <div>
                    <h4 className="font-bold text-white text-base truncate">Teach LexAI</h4>
                    <p className="text-[10px] text-slate-500">Add legal source for review</p>
                  </div>
                </div>
                <button onClick={() => setIngestPanelOpen(false)} disabled={isUploading} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer shrink-0">
                  <X size={18} />
                </button>
              </div>

              <div className="flex-grow overflow-y-auto p-5 space-y-5">
                <div className="grid grid-cols-3 gap-2">
                  {([{ id: 'text' as IngestMode, label: 'Paste', icon: FileText }, { id: 'url' as IngestMode, label: 'URL', icon: LinkIcon }, { id: 'file' as IngestMode, label: 'File', icon: UploadCloud }]).map((mode) => (
                    <button key={mode.id} type="button" onClick={() => setIngestMode(mode.id)}
                      className={cn('py-3 rounded-xl border flex flex-col items-center gap-1.5 text-[10px] font-bold transition-all',
                        ingestMode === mode.id ? 'bg-blue-600/15 text-blue-400 border-blue-500/30' : 'bg-slate-950 text-slate-500 border-slate-800 hover:text-white'
                      )}>
                      <mode.icon size={16} />{mode.label}
                    </button>
                  ))}
                </div>

                <form id="knowledge-ingest-form" onSubmit={handleIngestKnowledge} className="space-y-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document Title</label>
                    <input type="text" value={docTitle} onChange={(e) => setDocTitle(e.target.value)} placeholder="e.g. Evidence Act 2011"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jurisdiction</label>
                      <select value={knowledgeJur} onChange={(e) => setKnowledgeJurisdiction(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3.5 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="nigeria">🇳🇬 Nigeria</option><option value="us">🇺🇸 US Law</option><option value="global">🌍 Global</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document Type</label>
                      <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3.5 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="constitution">Constitution</option><option value="statute">Statute / Act</option><option value="amendment">Amendment</option>
                        <option value="case">Case</option><option value="judgment">Judgment</option><option value="regulation">Regulation</option>
                        <option value="rule">Rule</option><option value="legal_guidance">Legal Guidance</option><option value="orientation">Orientation</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Authority Level</label>
                      <select value={authorityLevel} onChange={(e) => setAuthorityLevel(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3.5 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="primary">Primary Authority</option><option value="secondary">Secondary Authority</option><option value="orientation">Orientation / Training</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Current Legal Status</label>
                      <select value={currentStatus} onChange={(e) => setCurrentStatus(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3.5 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none">
                        <option value="unverified">Unverified</option><option value="pending_review">Pending Review</option><option value="verified">Verified</option>
                        <option value="partially_verified">Partially Verified</option><option value="amended">Amended</option><option value="superseded">Superseded</option><option value="repealed">Repealed</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Version / Amendment Label</label>
                    <input type="text" value={versionLabel} onChange={(e) => setVersionLabel(e.target.value)} placeholder="e.g. 2011 Act + Evidence Amendment Act 2023"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                  </div>

                  {ingestMode === 'url' && (
                    <div className="space-y-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Official Source URL</label>
                        <input type="url" required value={importUrl} onChange={(e) => setImportUrl(e.target.value)} placeholder="https://official-source.example/document.pdf"
                          className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none" />
                      </div>
                      <div className="p-3 rounded-xl bg-blue-500/5 border border-blue-500/15 text-[10px] text-slate-400 leading-relaxed">
                        LexAI will fetch the source, extract the content and place it in <strong className="text-blue-400">Pending</strong> status for review before indexing.
                      </div>
                    </div>
                  )}

                  {ingestMode === 'file' && (
                    <label className="block border-2 border-dashed border-slate-800 hover:border-blue-500/40 rounded-2xl p-6 text-center cursor-pointer transition-colors">
                      <UploadCloud size={28} className="mx-auto mb-3 text-slate-600" />
                      <p className="text-xs font-bold text-slate-300">{selectedFile ? selectedFile.name : 'Choose legal document'}</p>
                      <p className="text-[10px] text-slate-500 mt-1">PDF, HTML or TXT · maximum 25MB</p>
                      <input type="file" accept=".pdf,.txt,.html,.htm,application/pdf,text/plain,text/html" className="hidden" onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} />
                    </label>
                  )}

                  {ingestMode === 'text' && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Legal Source Content</label>
                      <textarea rows={10} required value={knowledgeText} onChange={(e) => setKnowledgeText(e.target.value)}
                        placeholder="Paste the actual statutory text, judgment, regulation or other source material here..."
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed" />
                    </div>
                  )}

                  <div className="border-t border-slate-800 pt-4 space-y-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Verification Metadata</p>
                    <input type="text" value={officialSource} onChange={(e) => setOfficialSource(e.target.value)} placeholder="Official source / institution" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                    <input type="url" value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="Source URL" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                    <div className="grid grid-cols-2 gap-3">
                      <input type="date" value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                      <input type="date" value={effectiveTo} onChange={(e) => setEffectiveTo(e.target.value)} className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <input type="text" value={verificationSource} onChange={(e) => setVerificationSource(e.target.value)} placeholder="Verification note / source" className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-xs text-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>

                  {uploadSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-start gap-2 text-xs"><CheckCircle2 size={16} className="shrink-0 mt-0.5" /><span>{uploadSuccess}</span></div>
                  )}
                  {uploadError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-start gap-2 text-xs"><AlertCircle size={16} className="shrink-0 mt-0.5" /><span>{uploadError}</span></div>
                  )}
                </form>
              </div>

              <div className="p-4 border-t border-slate-800 flex gap-3 shrink-0 bg-slate-900">
                <button type="button" onClick={() => setIngestPanelOpen(false)} disabled={isUploading} className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border-0 cursor-pointer transition-colors">Cancel</button>
                <button type="submit" form="knowledge-ingest-form" disabled={isUploading} className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 border-0 cursor-pointer transition-all">
                  {isUploading ? (<><Loader2 size={16} className="animate-spin" />Processing...</>) : (<><UploadCloud size={16} />Import for Review</>)}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ============================================================ */}
      {/* PREVIEW MODAL */}
      {/* ============================================================ */}
      <AnimatePresence>
        {previewOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setPreviewOpen(false)} className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm" />
            <motion.div initial={{ opacity: 0, scale: 0.97, y: 15 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97, y: 15 }}
              className="fixed z-[130] inset-3 sm:inset-8 lg:inset-16 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-800 flex items-center justify-between gap-4 shrink-0">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase font-bold tracking-wider text-blue-400">Legal Source Preview</p>
                  <h3 className="text-base sm:text-xl font-black text-white truncate mt-1">{preview?.document?.title || selectedDocument?.title || 'Document Preview'}</h3>
                </div>
                <button onClick={() => setPreviewOpen(false)} className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 border-0 cursor-pointer"><X size={18} /></button>
              </div>

              {previewLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center"><Loader2 size={30} className="animate-spin text-blue-500 mx-auto mb-3" /><p className="text-sm text-slate-400">Extracting document preview...</p></div>
                </div>
              ) : preview ? (
                <>
                  <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { label: 'Jurisdiction', value: preview.document.jurisdiction },
                        { label: 'Type', value: preview.document.document_type },
                        { label: 'Authority', value: preview.document.authority_level || 'primary' },
                        { label: 'Planned Chunks', value: preview.analysis.planned_chunks },
                      ].map((stat) => (
                        <div key={stat.label} className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                          <p className="text-[9px] uppercase text-slate-600 font-bold">{stat.label}</p>
                          <p className="text-xs text-white font-bold mt-1 uppercase">{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-2xl">
                      <div className="flex gap-3">
                        <AlertCircle size={18} className="text-amber-400 shrink-0" />
                        <div>
                          <p className="text-xs font-bold text-amber-400">Verification before legal reliance</p>
                          <p className="text-[10px] text-slate-400 mt-1 leading-relaxed">Imported content is not automatically treated as current law. Confirm authority, jurisdiction, version, effective date and amendments before marking verified.</p>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <span className="text-[10px] bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-full text-slate-400">{preview.analysis.characters.toLocaleString()} characters</span>
                      <span className="text-[10px] bg-slate-950 border border-slate-800 px-3 py-1.5 rounded-full text-slate-400">{preview.analysis.sections_detected} sections detected</span>
                    </div>

                    {preview.analysis.sections.length > 0 && (
                      <div>
                        <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Detected Sections</p>
                        <div className="flex flex-wrap gap-1.5">
                          {preview.analysis.sections.slice(0, 100).map((section) => (
                            <span key={section} className="text-[10px] px-2 py-1 bg-blue-500/10 text-blue-400 border border-blue-500/15 rounded-lg">s.{section}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Extracted Content</p>
                      <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 max-h-72 overflow-y-auto">
                        <pre className="whitespace-pre-wrap font-mono text-[10px] text-slate-400 leading-relaxed">{preview.document.full_content}</pre>
                      </div>
                    </div>

                    <div>
                      <p className="text-[10px] uppercase tracking-wider font-bold text-slate-500 mb-2">Chunking Preview</p>
                      <div className="space-y-2">
                        {preview.analysis.chunk_previews.map((chunk) => (
                          <div key={chunk.index} className="bg-slate-950 border border-slate-800 rounded-xl p-3">
                            <div className="flex items-center justify-between gap-3 mb-2">
                              <span className="text-[9px] font-bold text-blue-400">{chunk.source_locator}</span>
                              <span className="text-[9px] text-slate-600">#{chunk.index + 1}</span>
                            </div>
                            <p className="text-[10px] text-slate-500 leading-relaxed">{chunk.content}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="p-4 border-t border-slate-800 bg-slate-900 flex flex-col sm:flex-row gap-2 shrink-0">
                    <button onClick={() => setPreviewOpen(false)} className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold border-0 cursor-pointer">Close Preview</button>
                    {preview.document.status !== 'completed' && preview.document.status !== 'rejected' && (
                      <button onClick={() => { setPreviewOpen(false); indexDocument(preview.document); }} disabled={isIndexing} className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold border-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"><Play size={14} />Approve & Index</button>
                    )}
                    {preview.document.status === 'completed' && (
                      <button onClick={() => { setPreviewOpen(false); indexDocument(preview.document, true); }} disabled={isIndexing} className="flex-1 py-3 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold border-0 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"><RefreshCw size={14} />Reindex</button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-slate-500 text-sm">No preview available.</div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
