import React, { useState, useEffect } from 'react';
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
  Lock, 
  CheckCircle2, 
  Copy, 
  BookOpen,
  UploadCloud,
  Loader2,
  AlertCircle,
  Menu,
  X,
  PlusCircle
} from 'lucide-react';

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
  id: string;
  content: string;
  site: string;
  context: string;
}

export default function AdminSaaS() {
  useDocumentTitle('LexAI - Practice Control Portal');
  const [adminKey, setAdminKey] = useState<string>(localStorage.getItem('lex_admin_key') || '');
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'keys' | 'docs'>('settings');
  const [settings, setSettings] = useState<SystemConfiguration | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Layout & Interaction States
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ingestPanelOpen, setIngestPanelOpen] = useState(false);

  // Ingestion Form State
  const [knowledgeText, setKnowledgeText] = useState('');
  const [knowledgeJur, setKnowledgeJurisdiction] = useState('nigeria');
  const [knowledgeContext, setKnowledgeContext] = useState('general');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (adminKey) validateAndFetch();
  }, [adminKey]);

  const validateAndFetch = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings', {
        headers: { 'x-admin-key': adminKey }
      });
      const data = await res.json();
      if (res.ok) {
        setSettings(data);
        setIsAuth(true);
        localStorage.setItem('lex_admin_key', adminKey);
        fetchData();
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
    try {
      const [keysRes, docsRes] = await Promise.all([
        fetch('/api/admin/keys', { headers: { 'x-admin-key': adminKey } }),
        fetch('/api/admin/documents', { headers: { 'x-admin-key': adminKey } })
      ]);
      if (keysRes.ok) setApiKeys(await keysRes.json());
      if (docsRes.ok) setDocs(await docsRes.json());
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggleSystem = async () => {
    if (!settings) return;
    const updated = !settings.api_enabled;
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ ...settings, api_enabled: updated })
    });
    if (res.ok) setSettings(await res.json());
  };

  const handleCreateKey = async () => {
    const firmName = prompt('Enter Law Firm / Client Name:');
    if (!firmName) return;
    const res = await fetch('/api/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
      body: JSON.stringify({ site: firmName })
    });
    if (res.ok) fetchData();
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Revoke access for this client key?')) return;
    const res = await fetch(`/api/admin/keys/${id}`, {
      method: 'DELETE',
      headers: { 'x-admin-key': adminKey }
    });
    if (res.ok) fetchData();
  };

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleIngestKnowledge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!knowledgeText.trim()) return;

    setIsUploading(true);
    setUploadSuccess(null);
    setUploadError(null);

    try {
      const res = await fetch('/api/embed', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-key': adminKey 
        },
        body: JSON.stringify({
          text: knowledgeText,
          site: knowledgeJur,
          context: knowledgeContext,
          metadata: {
            uploaded_at: new Date().toISOString(),
            source: 'Manual Portal Ingestion'
          }
        })
      });

      const data = await res.json();

      if (res.ok) {
        setUploadSuccess(data.message || 'Legal insights successfully indexed.');
        setKnowledgeText('');
        fetchData();
        setTimeout(() => setIngestPanelOpen(false), 2000);
      } else {
        setUploadError(data.error || 'Failed to feed knowledge to AI.');
      }
    } catch {
      setUploadError('Connection error while sending data.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteDocument = async (id: string) => {
    if (!confirm('Permanently delete this document from LexAI memory?')) return;
    try {
      const res = await fetch(`/api/admin/documents/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      if (res.ok) fetchData();
    } catch {
      alert('Failed to remove document.');
    }
  };

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
            placeholder="••••••••••••••••"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3.5 px-4 text-white mb-4 text-center focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono"
          />
          <button
            onClick={validateAndFetch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3.5 rounded-xl text-sm transition-all"
          >
            {loading ? 'Authenticating...' : 'Access Workspace'}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-300 flex flex-col md:flex-row font-sans relative">

      {/* ==================== MOBILE NAVIGATION BAR ==================== */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-slate-900/90 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center text-white font-black text-xs">LA</div>
          <span className="font-bold text-white text-sm">Counsel Admin</span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-0 cursor-pointer transition-colors"
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {/* ==================== RESPONSIVE SIDEBAR / DRAW PANEL ==================== */}
      <AnimatePresence>
        {(sidebarOpen || window.innerWidth >= 768) && (
          <>
            {/* Backdrop for Mobile */}
            {sidebarOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSidebarOpen(false)}
                className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
              />
            )}

            {/* Sidebar Shell */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className={cn(
                "fixed top-0 bottom-0 left-0 w-64 bg-[#0c0d12] border-r border-slate-900 p-6 flex flex-col justify-between z-50 md:sticky md:top-0 md:h-screen shrink-0 transition-transform md:translate-x-0",
                !sidebarOpen && "hidden md:flex"
              )}
            >
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">LA</div>
                    <span className="font-bold text-white text-base">Counsel Admin</span>
                  </div>
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white md:hidden bg-transparent border-0 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <nav className="space-y-1">
                  {[
                    { id: 'settings', label: 'Practice Status', icon: SettingsIcon },
                    { id: 'keys', label: 'Client Firm Keys', icon: Key },
                    { id: 'docs', label: 'Statutory Library', icon: BookOpen },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => {
                        setActiveTab(tab.id as any);
                        setSidebarOpen(false);
                      }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer active:scale-98',
                        activeTab === tab.id ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900'
                      )}
                    >
                      <tab.icon size={15} /> {tab.label}
                    </button>
                  ))}
                </nav>
              </div>

              <button
                onClick={() => {
                  localStorage.removeItem('lex_admin_key');
                  window.location.reload();
                }}
                className="flex items-center gap-2.5 text-xs font-bold text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer py-2 px-3 hover:bg-rose-500/10 rounded-xl transition-all"
              >
                <Power size={13} /> SIGN OUT
              </button>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ==================== MAIN WORKSPACE ==================== */}
      <main className="flex-grow p-4 sm:p-6 md:p-10 overflow-y-auto max-w-full">
        
        {/* ==================== TAB: SETTINGS ==================== */}
        {activeTab === 'settings' && (
          <div className="max-w-xl mx-auto space-y-6">
            <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Practice Status</h3>
            <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between shadow-xl">
              <div>
                <h4 className="font-bold text-white text-sm sm:text-base">Global AI Intelligence Access</h4>
                <p className="text-xs text-slate-400 mt-0.5">Toggle instant availability across all legal workspaces</p>
              </div>
              <button
                onClick={handleToggleSystem}
                className={cn(
                  "w-12 h-6.5 rounded-full transition-colors relative border-0 cursor-pointer self-start sm:self-auto shrink-0", 
                  settings?.api_enabled ? 'bg-emerald-600' : 'bg-slate-700'
                )}
              >
                <div className={cn("w-4.5 h-4.5 bg-white rounded-full absolute top-1 transition-all", settings?.api_enabled ? 'left-6' : 'left-1')} />
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB: KEYS ==================== */}
        {activeTab === 'keys' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Client Firm Licenses</h3>
              <button 
                onClick={handleCreateKey} 
                className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg"
              >
                <Plus size={15} /> New Client License
              </button>
            </div>

            {/* Desktop Table View */}
            <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                    <th className="p-4">Firm / Client</th>
                    <th className="p-4">Access Key</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {apiKeys.map((k) => (
                    <tr key={k.id} className="hover:bg-slate-950/25 transition-colors">
                      <td className="p-4 font-bold text-white">{k.site}</td>
                      <td className="p-4 font-mono text-xs text-slate-400">
                        {k.key.substring(0, 10)}••••••••••
                        <button onClick={() => handleCopyKey(k.key)} className="ml-2 text-slate-500 hover:text-white inline bg-transparent border-0 cursor-pointer">
                          {copiedKey === k.key ? <CheckCircle2 size={12} className="inline text-emerald-400 animate-pulse" /> : <Copy size={12} className="inline" />}
                        </button>
                      </td>
                      <td className="p-4">
                        <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border', k.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25')}>
                          {k.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {k.status === 'active' && (
                          <button onClick={() => handleRevokeKey(k.id)} className="text-rose-400 hover:text-rose-300 hover:underline text-xs font-bold bg-transparent border-0 cursor-pointer">
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View */}
            <div className="block sm:hidden space-y-3">
              {apiKeys.map((k) => (
                <div key={k.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 relative shadow-md">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white text-sm">{k.site}</span>
                    <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border', k.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25')}>
                      {k.status}
                    </span>
                  </div>
                  <div className="bg-slate-950 p-2.5 rounded-xl flex items-center justify-between border border-slate-800/50">
                    <code className="font-mono text-[10px] text-slate-400">{k.key.substring(0, 10)}••••••••••</code>
                    <button onClick={() => handleCopyKey(k.key)} className="text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer">
                      {copiedKey === k.key ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                    </button>
                  </div>
                  {k.status === 'active' && (
                    <button 
                      onClick={() => handleRevokeKey(k.id)} 
                      className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all"
                    >
                      Revoke Firm Access
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ==================== TAB: DOCS (KNOWLEDGE LIBRARY) ==================== */}
        {activeTab === 'docs' && (
          <div className="max-w-4xl mx-auto space-y-6">
            
            {/* Library Header & Open Ingestion Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Statutory Library</h3>
                <p className="text-xs text-slate-400 mt-1">Manage and audit indexed statutory provisions and case precedents</p>
              </div>
              <button 
                onClick={() => {
                  setUploadSuccess(null);
                  setUploadError(null);
                  setIngestPanelOpen(true);
                }}
                className="bg-blue-600 hover:bg-blue-500 text-white px-5 py-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg shadow-blue-600/15"
              >
                <PlusCircle size={15} /> Teach LexAI New Knowledge
              </button>
            </div>

            {/* Document Library Table/Cards list */}
            <div className="space-y-4">
              {/* Desktop Table View */}
              <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                      <th className="p-4">Jurisdiction</th>
                      <th className="p-4">Context</th>
                      <th className="p-4">Legal Excerpt</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {docs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500">No legal documents indexed yet.</td>
                      </tr>
                    ) : (
                      docs.map((doc) => (
                        <tr key={doc.id} className="group hover:bg-slate-950/20 transition-colors">
                          <td className="p-4 font-bold text-blue-400 uppercase text-xs">{doc.site || 'General'}</td>
                          <td className="p-4 text-slate-500 text-xs font-semibold">{doc.context || 'general'}</td>
                          <td className="p-4 text-slate-400 text-xs line-clamp-2 max-w-lg">{doc.content}</td>
                          <td className="p-4 text-right align-middle">
                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-slate-600 hover:text-rose-400 p-2 transition-colors opacity-0 group-hover:opacity-100 bg-transparent border-0 cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card List View */}
              <div className="block sm:hidden space-y-3">
                {docs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No legal documents indexed yet.</p>
                ) : (
                  docs.map((doc) => (
                    <div key={doc.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2.5 relative shadow-md">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                          {doc.site || 'General'}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {doc.context || 'general'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed line-clamp-4 pr-6">
                        {doc.content}
                      </p>
                      <button
                        onClick={() => handleDeleteDocument(doc.id)}
                        className="absolute right-3 bottom-3 p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 hover:text-rose-300 rounded-xl border-0 cursor-pointer transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* ==================== RESPONSIVE KNOWLEDGE INGESTION SLIDE-OVER PANEL ==================== */}
            <AnimatePresence>
              {ingestPanelOpen && (
                <>
                  {/* Backdrop */}
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                      if (!isUploading) setIngestPanelOpen(false);
                    }}
                    className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs"
                  />

                  {/* Panel Sheet */}
                  <motion.div
                    initial={{ x: '100%' }}
                    animate={{ x: 0 }}
                    exit={{ x: '100%' }}
                    transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                    className="fixed top-0 bottom-0 right-0 w-full sm:max-w-lg bg-slate-900 border-l border-slate-800 p-6 flex flex-col justify-between z-[110] shadow-2xl safe-area-inset-right"
                  >
                    {/* Panel Header */}
                    <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                      <div className="flex items-center gap-2.5">
                        <UploadCloud className="text-blue-500" size={20} />
                        <h4 className="font-bold text-white text-base">Teach LexAI New Knowledge</h4>
                      </div>
                      <button
                        onClick={() => setIngestPanelOpen(false)}
                        className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer transition-colors"
                      >
                        <X size={18} />
                      </button>
                    </div>

                    {/* Scrollable Form Body */}
                    <div className="flex-grow overflow-y-auto py-6 space-y-5 pr-1">
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Input statutes, precedents, or structural rules. The ingestion engine automatically segments and registers the input directly into the statutory library.
                      </p>

                      <form onSubmit={handleIngestKnowledge} className="space-y-4">
                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Jurisdiction Limit</label>
                          <select
                            value={knowledgeJur}
                            onChange={(e) => setKnowledgeJurisdiction(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-xs sm:text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                          >
                            <option value="nigeria">🇳🇬 Nigerian Law Library</option>
                            <option value="us">🇺🇸 US Federal Law Library</option>
                            <option value="global">🌐 General Legal Principles</option>
                          </select>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Legal Context Code</label>
                          <input
                            type="text"
                            value={knowledgeContext}
                            onChange={(e) => setKnowledgeContext(e.target.value)}
                            placeholder="e.g. corporate-tax, contract-disputes"
                            className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-xs sm:text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                          />
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Statutes / Legal Content Text</label>
                          <textarea
                            rows={8}
                            value={knowledgeText}
                            onChange={(e) => setKnowledgeText(e.target.value)}
                            placeholder="Paste legislative clauses, direct citations, standard contract sections, or litigation reasoning..."
                            className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-xs sm:text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed"
                          />
                        </div>

                        {uploadSuccess && (
                          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2 text-xs">
                            <CheckCircle2 size={14} />
                            <span>{uploadSuccess}</span>
                          </div>
                        )}

                        {uploadError && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-center gap-2 text-xs">
                            <AlertCircle size={14} />
                            <span>{uploadError}</span>
                          </div>
                        )}
                      </form>
                    </div>

                    {/* Bottom Action Drawer */}
                    <div className="pt-4 border-t border-slate-800 flex gap-2">
                      <button
                        onClick={() => setIngestPanelOpen(false)}
                        className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border-0 cursor-pointer transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleIngestKnowledge}
                        disabled={isUploading || !knowledgeText.trim()}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-97 transition-all shadow-lg"
                      >
                        {isUploading ? (
                          <><Loader2 size={14} className="animate-spin" /> Indexing Library...</>
                        ) : (
                          'Feed Knowledge'
                        )}
                      </button>
                    </div>
                  </motion.div>
                </>
              )}
            </AnimatePresence>

          </div>
        )}
      </main>
    </div>
  );
}
