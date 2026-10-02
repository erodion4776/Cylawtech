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
  AlertCircle
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

  // New Knowledge Ingestion Form State
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

  // Handle Knowledge Base Text Submission
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
        fetchData(); // Refresh the documents list
      } else {
        setUploadError(data.error || 'Failed to feed knowledge to AI.');
      }
    } catch (err: any) {
      setUploadError('Connection error while sending data to Edge Function.');
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
      if (res.ok) {
        fetchData();
      }
    } catch {
      alert('Failed to remove document.');
    }
  };

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-3xl text-center">
          <div className="w-14 h-14 bg-blue-600/20 text-blue-500 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Shield size={28} />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Practice Control Portal</h2>
          <p className="text-slate-400 text-sm mb-6">Enter master authorization key to continue</p>
          <input
            type="password"
            value={adminKey}
            onChange={(e) => setAdminKey(e.target.value)}
            placeholder="••••••••••••••••"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 px-4 text-white mb-4 text-center focus:ring-2 focus:ring-blue-500 outline-none"
          />
          <button
            onClick={validateAndFetch}
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition-all"
          >
            {loading ? 'Authenticating...' : 'Access Workspace'}
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 flex font-sans">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-900 bg-slate-900/40 p-6 flex flex-col justify-between shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">LA</div>
            <span className="font-bold text-white">Counsel Admin</span>
          </div>

          <nav className="space-y-1.5">
            {[
              { id: 'settings', label: 'Practice Status', icon: SettingsIcon },
              { id: 'keys', label: 'Client Firm Keys', icon: Key },
              { id: 'docs', label: 'Statutory Library', icon: BookOpen },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors border-0 bg-transparent text-left cursor-pointer',
                  activeTab === tab.id ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-900'
                )}
              >
                <tab.icon size={16} /> {tab.label}
              </button>
            ))}
          </nav>
        </div>

        <button
          onClick={() => {
            localStorage.removeItem('lex_admin_key');
            window.location.reload();
          }}
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-rose-400 bg-transparent border-0 cursor-pointer"
        >
          <Power size={14} /> SIGN OUT
        </button>
      </div>

      {/* Main Panel */}
      <main className="flex-grow p-10 overflow-y-auto">
        {activeTab === 'settings' && (
          <div className="max-w-2xl space-y-6">
            <h3 className="text-2xl font-bold text-white mb-4">Workspace Availability</h3>
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl flex items-center justify-between">
              <div>
                <h4 className="font-bold text-white mb-1">Global AI Intelligence Access</h4>
                <p className="text-xs text-slate-400">Toggle instant availability across all legal workspaces</p>
              </div>
              <button
                onClick={handleToggleSystem}
                className={cn("w-14 h-7 rounded-full transition-colors relative border-0 cursor-pointer", settings?.api_enabled ? 'bg-emerald-600' : 'bg-slate-700')}
              >
                <div className={cn("w-5 h-5 bg-white rounded-full absolute top-1 transition-all", settings?.api_enabled ? 'left-8' : 'left-1')} />
              </button>
            </div>
          </div>
        )}

        {activeTab === 'keys' && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-white">Client Firm Licenses</h3>
              <button onClick={handleCreateKey} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 border-0 cursor-pointer">
                <Plus size={16} /> New Client License
              </button>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
                    <th className="p-4">Firm / Client</th>
                    <th className="p-4">Access Key</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {apiKeys.map((k) => (
                    <tr key={k.id}>
                      <td className="p-4 font-bold text-white">{k.site}</td>
                      <td className="p-4 font-mono text-xs text-slate-400">
                        {k.key.substring(0, 10)}••••••••••
                        <button onClick={() => handleCopyKey(k.key)} className="ml-2 text-slate-500 hover:text-white inline bg-transparent border-0 cursor-pointer">
                          {copiedKey === k.key ? <CheckCircle2 size={12} className="inline text-emerald-400" /> : <Copy size={12} className="inline" />}
                        </button>
                      </td>
                      <td className="p-4">
                        <span className={cn('px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase', k.status === 'active' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400')}>
                          {k.status}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {k.status === 'active' && (
                          <button onClick={() => handleRevokeKey(k.id)} className="text-rose-400 hover:underline text-xs font-bold bg-transparent border-0 cursor-pointer">
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'docs' && (
          <div className="space-y-10">
            {/* Jargon-free Knowledge Ingestion Form */}
            <div className="max-w-3xl bg-slate-900 border border-slate-800 rounded-3xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-blue-600/10 text-blue-500 rounded-xl flex items-center justify-center">
                  <UploadCloud size={20} />
                </div>
                <div>
                  <h4 className="font-bold text-white text-lg">Teach LexAI New Knowledge</h4>
                  <p className="text-xs text-slate-400">Add statutory texts or legal precedents to LexAI memory library</p>
                </div>
              </div>

              <form onSubmit={handleIngestKnowledge} className="space-y-5">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Scope Jurisdiction</label>
                    <select
                      value={knowledgeJur}
                      onChange={(e) => setKnowledgeJurisdiction(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                    >
                      <option value="nigeria">🇳🇬 Nigerian Law Library</option>
                      <option value="us">🇺🇸 US Federal Law Library</option>
                      <option value="global">🌐 General Legal Principles</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Legal Context Category</label>
                    <input
                      type="text"
                      value={knowledgeContext}
                      onChange={(e) => setKnowledgeContext(e.target.value)}
                      placeholder="e.g. corporate-tax, contract-disputes"
                      className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">Legal Content / Precedents / Statutes</label>
                  <textarea
                    rows={6}
                    value={knowledgeText}
                    onChange={(e) => setKnowledgeText(e.target.value)}
                    placeholder="Paste standard legislative clauses, judgments, statutory definitions, or legal drafting principles here..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-sm text-slate-200 focus:ring-2 focus:ring-blue-500 outline-none resize-none leading-relaxed"
                  />
                </div>

                {uploadSuccess && (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl flex items-center gap-2 text-xs">
                    <CheckCircle2 size={16} />
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                {uploadError && (
                  <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl flex items-center gap-2 text-xs">
                    <AlertCircle size={16} />
                    <span>{uploadError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isUploading || !knowledgeText.trim()}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold px-6 py-3 rounded-xl text-sm flex items-center gap-2 transition-all border-0 cursor-pointer"
                >
                  {isUploading ? (
                    <><Loader2 size={16} className="animate-spin" /> Digitizing and Indexing...</>
                  ) : (
                    'Feed Knowledge to AI'
                  )}
                </button>
              </form>
            </div>

            {/* Document Library Table */}
            <div>
              <h3 className="text-xl font-bold text-white mb-4">Statutory Document Library</h3>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
                      <th className="p-4">Jurisdiction</th>
                      <th className="p-4">Context</th>
                      <th className="p-4">Legal Excerpt</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {docs.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-slate-500">No legal documents indexed yet.</td>
                      </tr>
                    ) : (
                      docs.map((doc) => (
                        <tr key={doc.id} className="group hover:bg-slate-950/20 transition-colors">
                          <td className="p-4 font-bold text-blue-400 uppercase text-xs">{doc.site || 'General'}</td>
                          <td className="p-4 text-slate-500 text-xs font-semibold">{doc.context || 'general'}</td>
                          <td className="p-4 text-slate-400 text-xs line-clamp-2 max-w-xl">{doc.content}</td>
                          <td className="p-4 text-right align-middle">
                            <button
                              onClick={() => handleDeleteDocument(doc.id)}
                              className="text-slate-600 hover:text-rose-400 transition-colors opacity-0 group-hover:opacity-100 bg-transparent border-0 cursor-pointer"
                            >
                              <Trash2 size={15} />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
