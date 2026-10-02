import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { 
  Settings, Key, FileText, Shield, Plus, Trash2, 
  Power, Cpu, Lock, CheckCircle2, Copy, BookOpen
} from 'lucide-react';

interface Settings {
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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
    <div className="min-h-screen bg-slate-950 text-slate-300 flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-slate-900 bg-slate-900/40 p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-8">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-sm">LA</div>
            <span className="font-bold text-white">Counsel Admin</span>
          </div>

          <nav className="space-y-1.5">
            {[
              { id: 'settings', label: 'Practice Status', icon: Settings },
              { id: 'keys', label: 'Client Firm Keys', icon: Key },
              { id: 'docs', label: 'Statutory Library', icon: BookOpen },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={cn(
                  'w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-colors',
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
          className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-rose-400"
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
                className={cn("w-14 h-7 rounded-full transition-colors relative", settings?.api_enabled ? 'bg-emerald-600' : 'bg-slate-700')}
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
              <button onClick={handleCreateKey} className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2">
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
                        <button onClick={() => handleCopyKey(k.key)} className="ml-2 text-slate-500 hover:text-white inline">
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
                          <button onClick={() => handleRevokeKey(k.id)} className="text-rose-400 hover:underline text-xs font-bold">
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
          <div>
            <h3 className="text-2xl font-bold text-white mb-6">Statutory Document Library</h3>
            <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500 text-xs uppercase">
                    <th className="p-4">Jurisdiction</th>
                    <th className="p-4">Legal Excerpt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {docs.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="p-8 text-center text-slate-500">No legal documents indexed yet.</td>
                    </tr>
                  ) : (
                    docs.map((doc) => (
                      <tr key={doc.id}>
                        <td className="p-4 font-bold text-blue-400 uppercase text-xs">{doc.site || 'General'}</td>
                        <td className="p-4 text-slate-400 text-xs line-clamp-2">{doc.content}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
