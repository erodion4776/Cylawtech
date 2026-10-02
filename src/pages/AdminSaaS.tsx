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
  Zap
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
  title: string;
  jurisdiction: string;
  document_type: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  total_sections: number;
  processed_sections: number;
  created_at: string;
}

type AdminTab = 'home' | 'settings' | 'keys' | 'docs';

export default function AdminSaaS() {
  useDocumentTitle('LexAI - Practice Control Portal');
  const [adminKey, setAdminKey] = useState<string>(localStorage.getItem('lex_admin_key') || '');
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>('home');
  const [settings, setSettings] = useState<SystemConfiguration | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Layout States
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [ingestPanelOpen, setIngestPanelOpen] = useState(false);

  // Ingestion Form State
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState('statute');
  const [knowledgeText, setKnowledgeText] = useState('');
  const [knowledgeJur, setKnowledgeJurisdiction] = useState('nigeria');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  useEffect(() => {
    if (adminKey) validateAndFetch();
  }, [adminKey]);

  // Periodic polling for background ingestion updates
  useEffect(() => {
    let interval: any;
    if (isAuth && activeTab === 'docs') {
      interval = setInterval(fetchData, 4000);
    }
    return () => clearInterval(interval);
  }, [isAuth, activeTab]);

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

  // ROBUST KNOWLEDGE SUBMISSION HANDLER (Works with Touch & Click)
  const handleIngestKnowledge = async (e?: React.FormEvent | React.MouseEvent) => {
    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    setUploadError(null);
    setUploadSuccess(null);

    // Validation checks with clear user feedback
    if (!docTitle.trim()) {
      setUploadError('Please provide a document title (e.g. Companies & Allied Matters Act).');
      return;
    }

    if (!knowledgeText.trim() || knowledgeText.trim().length < 10) {
      setUploadError('Please enter the statutory text or legal excerpt (minimum 10 characters).');
      return;
    }

    setIsUploading(true);

    try {
      const res = await fetch('/api/admin/documents', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-key': adminKey 
        },
        body: JSON.stringify({
          title: docTitle.trim(),
          document_type: docType,
          jurisdiction: knowledgeJur,
          content: knowledgeText.trim()
        })
      });

      const data = await res.json();

      if (res.ok) {
        setUploadSuccess(data.message || 'Legal knowledge registered! Background indexing started.');
        setDocTitle('');
        setKnowledgeText('');
        fetchData(); // Refresh list immediately
        setTimeout(() => {
          setIngestPanelOpen(false);
          setUploadSuccess(null);
        }, 1500);
      } else {
        setUploadError(data.error || 'Failed to submit knowledge to LexAI.');
      }
    } catch (err: any) {
      setUploadError(`Connection error: ${err.message || 'Check your internet connection.'}`);
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

  // ======= AUTHENTICATION SCREEN =======
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

  // Available Admin Features
  const adminFeatures = [
    { 
      id: 'settings' as AdminTab,
      label: 'Practice Status', 
      icon: SettingsIcon, 
      desc: 'Enable or disable AI access across all legal workspaces',
      color: 'from-emerald-500/20 to-emerald-600/5',
      iconColor: 'text-emerald-400'
    },
    { 
      id: 'keys' as AdminTab,
      label: 'Client Firm Licenses', 
      icon: Key, 
      desc: 'Generate or revoke access keys for client law firms',
      color: 'from-amber-500/20 to-amber-600/5',
      iconColor: 'text-amber-400',
      badge: apiKeys.filter(k => k.status === 'active').length
    },
    { 
      id: 'docs' as AdminTab,
      label: 'Statutory Library', 
      icon: BookOpen, 
      desc: 'Teach LexAI new statutes, case law, and legal precedents',
      color: 'from-blue-500/20 to-blue-600/5',
      iconColor: 'text-blue-400',
      badge: docs.length
    }
  ];

  const currentFeature = adminFeatures.find(f => f.id === activeTab);

  return (
    <div className="min-h-[100dvh] bg-slate-950 text-slate-300 flex flex-col md:flex-row font-sans relative">

      {/* ==================== STICKY MOBILE NAVIGATION BAR ==================== */}
      <header className="flex md:hidden items-center justify-between px-4 py-3 bg-slate-900/95 border-b border-slate-800 fixed top-0 inset-x-0 z-40 backdrop-blur-md h-14">
        <div className="flex items-center gap-2 min-w-0">
          {activeTab !== 'home' ? (
            <button
              onClick={() => setActiveTab('home')}
              className="p-1.5 -ml-1 rounded-lg hover:bg-slate-800 text-slate-300 bg-transparent border-0 cursor-pointer transition-colors shrink-0"
            >
              <ChevronLeft size={20} />
            </button>
          ) : (
            <div className="w-7 h-7 bg-blue-600 rounded flex items-center justify-center text-white font-black text-xs shrink-0">LA</div>
          )}
          <span className="font-bold text-white text-sm truncate">
            {activeTab === 'home' ? 'Counsel Admin' : currentFeature?.label}
          </span>
        </div>
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white border-0 cursor-pointer transition-colors shrink-0"
        >
          {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {/* ==================== DESKTOP SIDEBAR / MOBILE DRAWER ==================== */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs md:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 220 }}
              className="fixed top-0 bottom-0 left-0 w-72 bg-[#0c0d12] border-r border-slate-900 p-6 flex flex-col justify-between z-50 md:hidden shadow-2xl"
            >
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">LA</div>
                    <span className="font-bold text-white text-base">Counsel Admin</span>
                  </div>
                  <button 
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer"
                  >
                    <X size={18} />
                  </button>
                </div>

                <nav className="space-y-1">
                  <button
                    onClick={() => { setActiveTab('home'); setSidebarOpen(false); }}
                    className={cn(
                      'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
                      activeTab === 'home' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900'
                    )}
                  >
                    <Zap size={15} /> Dashboard Hub
                  </button>
                  {adminFeatures.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                      className={cn(
                        'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
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

      {/* ==================== DESKTOP PERMANENT SIDEBAR ==================== */}
      <aside className="hidden md:flex sticky top-0 h-screen w-64 bg-[#0c0d12] border-r border-slate-900 p-6 flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">LA</div>
            <span className="font-bold text-white text-base">Counsel Admin</span>
          </div>

          <nav className="space-y-1">
            <button
              onClick={() => setActiveTab('home')}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
                activeTab === 'home' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-900'
              )}
            >
              <Zap size={15} /> Dashboard Hub
            </button>
            {adminFeatures.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
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
      </aside>

      {/* ==================== MAIN WORKSPACE ==================== */}
      <main className="flex-grow overflow-y-auto max-w-full pt-14 md:pt-0">
        <div className="p-4 sm:p-6 md:p-10">

          {/* ==================== DASHBOARD HUB (MOBILE HOME) ==================== */}
          {activeTab === 'home' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">
              <div>
                <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">Practice Dashboard</h3>
                <p className="text-xs sm:text-sm text-slate-400 mt-1.5">Manage access permissions, licenses, and library indexes.</p>
              </div>

              {/* Status Card */}
              <div className={cn("p-5 rounded-3xl border flex items-center gap-4 shadow-xl", settings?.api_enabled ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20')}>
                <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0", settings?.api_enabled ? 'bg-emerald-500/15' : 'bg-rose-500/15')}>
                  <Zap size={20} className={settings?.api_enabled ? 'text-emerald-400' : 'text-rose-400'} />
                </div>
                <div className="min-w-0 flex-grow">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">SaaS System Status</p>
                  <p className={cn("text-base font-bold", settings?.api_enabled ? 'text-emerald-400' : 'text-rose-400')}>
                    {settings?.api_enabled ? 'Active and Processing Inquiries' : 'System Offline / Maintenance'}
                  </p>
                </div>
                <button onClick={handleToggleSystem} className={cn("w-11 h-6 rounded-full relative border-0 cursor-pointer shrink-0 transition-colors", settings?.api_enabled ? 'bg-emerald-500' : 'bg-slate-700')}>
                  <div className={cn("w-4 h-4 bg-white rounded-full absolute top-1 transition-all", settings?.api_enabled ? 'left-6' : 'left-1')} />
                </button>
              </div>

              {/* Feature Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {adminFeatures.map((feature) => (
                  <button
                    key={feature.id}
                    onClick={() => setActiveTab(feature.id)}
                    className={cn("relative p-5 rounded-3xl bg-gradient-to-br border border-slate-800 text-left cursor-pointer transition-all hover:border-slate-700 hover:scale-[1.01] active:scale-[0.98] group overflow-hidden", feature.color)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={cn("w-11 h-11 rounded-2xl bg-slate-950/80 border border-slate-800 flex items-center justify-center", feature.iconColor)}>
                        <feature.icon size={20} />
                      </div>
                    </div>
                    <h4 className="font-bold text-white text-sm mb-1">{feature.label}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed pr-6">{feature.desc}</p>
                    <ChevronRight size={16} className="absolute right-5 bottom-5 text-slate-600 group-hover:text-white group-hover:translate-x-1 transition-all" />
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {/* ==================== PRACTICE STATUS TAB ==================== */}
          {activeTab === 'settings' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-xl mx-auto space-y-6">
              <div className="hidden md:block">
                <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Practice Status</h3>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-5 sm:p-6 rounded-3xl flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between shadow-xl">
                <div>
                  <h4 className="font-bold text-white text-sm sm:text-base">Global AI Intelligence Access</h4>
                  <p className="text-xs text-slate-400 mt-0.5">Toggle instant availability across all legal workspaces</p>
                </div>
                <button onClick={handleToggleSystem} className={cn("w-12 h-6.5 rounded-full transition-colors relative border-0 cursor-pointer self-start sm:self-auto shrink-0", settings?.api_enabled ? 'bg-emerald-600' : 'bg-slate-700')}>
                  <div className={cn("w-4.5 h-4.5 bg-white rounded-full absolute top-1 transition-all", settings?.api_enabled ? 'left-6' : 'left-1')} />
                </button>
              </div>
            </motion.div>
          )}

          {/* ==================== CLIENT KEYS TAB ==================== */}
          {activeTab === 'keys' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Client Firm Licenses</h3>
                </div>
                <button onClick={handleCreateKey} className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg">
                  <Plus size={15} /> New Client License
                </button>
              </div>

              {/* Desktop Table */}
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
                    {apiKeys.length === 0 ? (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-500">No licenses issued yet.</td></tr>
                    ) : apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-950/25 transition-colors">
                        <td className="p-4 font-bold text-white">{k.site}</td>
                        <td className="p-4 font-mono text-xs text-slate-400">
                          {k.key.substring(0, 10)}••••••••••
                          <button onClick={() => handleCopyKey(k.key)} className="ml-2 text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer">
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

              {/* Mobile Cards */}
              <div className="block sm:hidden space-y-3">
                {apiKeys.length === 0 ? (
                  <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl text-center">
                    <Key size={28} className="mx-auto mb-3 text-slate-600" />
                    <p className="text-xs text-slate-500">No client licenses issued yet.</p>
                  </div>
                ) : apiKeys.map((k) => (
                  <div key={k.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-3 shadow-md">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-sm truncate pr-2">{k.site}</span>
                      <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border shrink-0', k.status === 'active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' : 'bg-rose-500/10 text-rose-400 border-rose-500/25')}>
                        {k.status}
                      </span>
                    </div>
                    <div className="bg-slate-950 p-2.5 rounded-xl flex items-center justify-between border border-slate-800/50">
                      <code className="font-mono text-[10px] text-slate-400 truncate pr-2">{k.key.substring(0, 10)}••••••••••</code>
                      <button onClick={() => handleCopyKey(k.key)} className="text-slate-500 hover:text-white bg-transparent border-0 cursor-pointer shrink-0">
                        {copiedKey === k.key ? <CheckCircle2 size={13} className="text-emerald-400" /> : <Copy size={13} />}
                      </button>
                    </div>
                    {k.status === 'active' && (
                      <button onClick={() => handleRevokeKey(k.id)} className="w-full py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-bold border-0 cursor-pointer transition-all">
                        Revoke Access
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ==================== STATUTORY LIBRARY TAB ==================== */}
          {activeTab === 'docs' && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="hidden md:block">
                  <h3 className="text-xl sm:text-2xl font-black text-white tracking-tight">Statutory Library</h3>
                  <p className="text-xs text-slate-400 mt-1">Manage and audit processed legal frameworks and precedents</p>
                </div>
                <button 
                  onClick={() => { 
                    setUploadSuccess(null); 
                    setUploadError(null); 
                    setIngestPanelOpen(true); 
                  }}
                  className="w-full sm:w-auto bg-blue-600 hover:bg-blue-500 text-white px-5 py-3.5 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg shadow-blue-600/15"
                >
                  <PlusCircle size={15} /> Teach LexAI New Knowledge
                </button>
              </div>

              {/* Desktop Table */}
              <div className="hidden sm:block bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase font-bold tracking-wider">
                      <th className="p-4">Jurisdiction</th>
                      <th className="p-4">Type</th>
                      <th className="p-4">Title</th>
                      <th className="p-4">Progress / Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {docs.length === 0 ? (
                      <tr><td colSpan={5} className="p-8 text-center text-slate-500">No documents registered.</td></tr>
                    ) : docs.map((doc) => (
                      <tr key={doc.id} className="group hover:bg-slate-950/25 transition-colors">
                        <td className="p-4 font-bold text-blue-400 uppercase text-xs">
                          {doc.jurisdiction === 'nigeria' ? '🇳🇬 NIGERIA' : '🇺🇸 US LAW'}
                        </td>
                        <td className="p-4 text-slate-400 text-xs font-semibold capitalize">{doc.document_type}</td>
                        <td className="p-4 text-slate-200 text-xs font-bold max-w-xs truncate">{doc.title}</td>
                        <td className="p-4 align-middle">
                          {doc.status === 'processing' ? (
                            <div className="flex items-center gap-2">
                              <Loader2 size={13} className="animate-spin text-blue-500" />
                              <span className="text-[11px] text-blue-400 font-mono">Indexing ({doc.processed_sections}/{doc.total_sections || '?'})</span>
                            </div>
                          ) : doc.status === 'completed' ? (
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/25">Ready</span>
                          ) : doc.status === 'failed' ? (
                            <span className="text-[10px] font-bold text-rose-400 bg-rose-500/10 px-2.5 py-0.5 rounded-full border border-rose-500/25">Failed</span>
                          ) : (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-500/10 px-2.5 py-0.5 rounded-full border border-slate-500/25">Queued</span>
                          )}
                        </td>
                        <td className="p-4 text-right align-middle">
                          <button onClick={() => handleDeleteDocument(doc.id)} className="text-slate-600 hover:text-rose-400 p-2 bg-transparent border-0 cursor-pointer">
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="block sm:hidden space-y-3">
                {docs.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No legal documents indexed.</p>
                ) : docs.map((doc) => (
                  <div key={doc.id} className="bg-slate-900 border border-slate-800 p-4 rounded-2xl space-y-2.5 relative shadow-md">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold text-blue-400 uppercase tracking-wide bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20 truncate">
                        {doc.jurisdiction === 'nigeria' ? '🇳🇬 NIGERIA' : '🇺🇸 US LAW'}
                      </span>
                      <span className="text-[10px] font-semibold text-slate-500 capitalize">
                        {doc.document_type}
                      </span>
                    </div>
                    <p className="text-xs font-bold text-slate-200 pr-8 line-clamp-1">{doc.title}</p>
                    <div className="flex items-center justify-between pt-1">
                      {doc.status === 'processing' ? (
                        <div className="flex items-center gap-2">
                          <Loader2 size={12} className="animate-spin text-blue-500" />
                          <span className="text-[11px] text-blue-400 font-mono">Indexing ({doc.processed_sections}/{doc.total_sections})</span>
                        </div>
                      ) : (
                        <span className={cn('text-[9px] font-bold uppercase border px-2 py-0.5 rounded-full', 
                          doc.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'
                        )}>{doc.status}</span>
                      )}
                    </div>
                    <button onClick={() => handleDeleteDocument(doc.id)} className="absolute right-3 bottom-3 p-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl border-0 cursor-pointer">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </main>

      {/* ==================== KNOWLEDGE INGESTION SLIDE-OVER DRAWER ==================== */}
      <AnimatePresence>
        {ingestPanelOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }} 
              animate={{ opacity: 1 }} 
              exit={{ opacity: 0 }}
              onClick={() => { if (!isUploading) setIngestPanelOpen(false); }}
              className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-xs"
            />
            <motion.div
              initial={{ x: '100%' }} 
              animate={{ x: 0 }} 
              exit={{ x: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 220 }}
              className="fixed top-0 bottom-0 right-0 w-full sm:max-w-lg bg-slate-900 border-l border-slate-800 flex flex-col z-[110] shadow-2xl"
            >
              {/* Panel Header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-800 shrink-0">
                <div className="flex items-center gap-2.5 min-w-0">
                  <UploadCloud className="text-blue-500 shrink-0" size={20} />
                  <h4 className="font-bold text-white text-base truncate">Teach LexAI Knowledge</h4>
                </div>
                <button 
                  onClick={() => setIngestPanelOpen(false)} 
                  disabled={isUploading}
                  className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white bg-transparent border-0 cursor-pointer shrink-0 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Scrollable Form Body */}
              <div className="flex-grow overflow-y-auto p-5 space-y-4">
                <form 
                  id="knowledge-ingest-form" 
                  onSubmit={handleIngestKnowledge} 
                  className="space-y-4"
                >
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Document Title <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={docTitle}
                      onChange={(e) => setDocTitle(e.target.value)}
                      placeholder="e.g. Companies and Allied Matters Act 2020"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3.5 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jurisdiction</label>
                      <select
                        value={knowledgeJur}
                        onChange={(e) => setKnowledgeJurisdiction(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3.5 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                      >
                        <option value="nigeria">🇳🇬 Nigeria Law</option>
                        <option value="us">🇺🇸 US Law</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Document Type</label>
                      <select
                        value={docType}
                        onChange={(e) => setDocType(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-3.5 text-xs text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                      >
                        <option value="constitution">Constitution</option>
                        <option value="statute">Statute / Act</option>
                        <option value="case">Case Law / Precedent</option>
                        <option value="regulation">Regulation</option>
                        <option value="principle">Legal Principle</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Knowledge Content <span className="text-rose-500">*</span>
                    </label>
                    <textarea
                      rows={8}
                      required
                      value={knowledgeText}
                      onChange={(e) => setKnowledgeText(e.target.value)}
                      placeholder="Paste legislative clauses, judgments, or standard contract sections here..."
                      className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3.5 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed"
                    />
                  </div>

                  {uploadSuccess && (
                    <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-start gap-2 text-xs">
                      <CheckCircle2 size={16} className="shrink-0 mt-0.5" />
                      <span>{uploadSuccess}</span>
                    </div>
                  )}

                  {uploadError && (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-start gap-2 text-xs">
                      <AlertCircle size={16} className="shrink-0 mt-0.5" />
                      <span>{uploadError}</span>
                    </div>
                  )}
                </form>
              </div>

              {/* Bottom Actions Dock */}
              <div className="p-4 border-t border-slate-800 flex gap-3 shrink-0 bg-slate-900">
                <button
                  type="button"
                  onClick={() => setIngestPanelOpen(false)}
                  disabled={isUploading}
                  className="flex-1 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border-0 cursor-pointer transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  form="knowledge-ingest-form"
                  onClick={(e) => handleIngestKnowledge(e)}
                  disabled={isUploading}
                  className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-2 border-0 cursor-pointer active:scale-95 transition-all shadow-lg shadow-blue-600/20"
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={16} className="animate-spin" />
                      <span>Feeding AI...</span>
                    </>
                  ) : (
                    <span>Feed Knowledge</span>
                  )}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
