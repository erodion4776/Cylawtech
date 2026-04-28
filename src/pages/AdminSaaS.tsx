import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Settings, 
  Key, 
  FileText, 
  Shield, 
  Plus, 
  Trash2, 
  Power, 
  Cpu, 
  AlertCircle,
  CheckCircle2,
  Lock,
  Search,
  ExternalLink,
  ChevronRight,
  Database
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

const API_BASE = '/api/admin';

export default function AdminSaaS() {
  const [adminKey, setAdminKey] = useState<string>(localStorage.getItem('lex_admin_key') || '');
  const [isAuth, setIsAuth] = useState(false);
  const [activeTab, setActiveTab] = useState<'settings' | 'keys' | 'docs'>('settings');
  const [settings, setSettings] = useState<Settings | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (adminKey) {
      validateAndFetch();
    }
  }, [adminKey]);

  const validateAndFetch = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/settings`, {
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
        setError(data.error || "Authorization failed");
      }
    } catch (e: any) {
      setError(`Connection Error: ${e.message || "Unknown error"}`);
      console.error("Admin Auth Error:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchData = async () => {
    if (!adminKey) return;
    try {
      const [keysRes, docsRes] = await Promise.all([
        fetch(`${API_BASE}/keys`, { headers: { 'x-admin-key': adminKey } }),
        fetch(`${API_BASE}/documents`, { headers: { 'x-admin-key': adminKey } })
      ]);
      if (keysRes.ok) setApiKeys(await keysRes.json());
      if (docsRes.ok) setDocs(await docsRes.json());
    } catch (e) {
      console.error("Fetch data error", e);
    }
  };

  const handleUpdateSettings = async (updates: Partial<Settings>) => {
    if (!settings) return;
    try {
      const res = await fetch(`${API_BASE}/settings`, {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-key': adminKey 
        },
        body: JSON.stringify({ ...settings, ...updates })
      });
      if (res.ok) setSettings(await res.json());
    } catch (e) {
      setError("Failed to update settings");
    }
  };

  const handleCreateKey = async (site: string) => {
    try {
      const res = await fetch(`${API_BASE}/keys`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-key': adminKey 
        },
        body: JSON.stringify({ site })
      });
      if (res.ok) fetchData();
    } catch (e) {
      setError("Failed to create key");
    }
  };

  const handleRevokeKey = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/keys/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      if (res.ok) fetchData();
    } catch (e) {
      setError("Failed to revoke key");
    }
  };

  const handleDeleteDoc = async (id: string) => {
    try {
      const res = await fetch(`${API_BASE}/documents/${id}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey }
      });
      if (res.ok) fetchData();
    } catch (e) {
      setError("Failed to delete document");
    }
  };

  if (!isAuth) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md bg-slate-900 border border-slate-800 p-8 rounded-2xl shadow-2xl shadow-blue-900/10"
        >
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600/20 rounded-full flex items-center justify-center border border-blue-500/30">
              <Shield className="text-blue-500 w-8 h-8" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-white text-center mb-2">LexAI SaaS Admin</h1>
          <p className="text-slate-400 text-center mb-8">Enter your master admin key to access the control panel</p>
          
          <div className="space-y-4">
            <div>
              <label className="text-xs uppercase font-bold text-slate-500 mb-1.5 block tracking-widest">Admin Authorization Key</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input 
                  type="password"
                  value={adminKey}
                  onChange={(e) => setAdminKey(e.target.value)}
                  placeholder="••••••••••••••••"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3 pl-10 pr-4 text-white focus:outline-none focus:ring-2 focus:ring-blue-500/50 transition-all font-mono"
                />
              </div>
            </div>
            
            <button 
              onClick={validateAndFetch}
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold py-3 px-6 rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98]"
            >
              {loading ? "Authorizing..." : "Access Dashboard"}
            </button>
            
            {error && (
              <div className="flex items-center gap-2 text-rose-400 text-sm bg-rose-400/10 p-3 rounded-xl border border-rose-400/20">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-slate-300 font-sans flex">
      {/* Sidebar */}
      <div className="w-72 border-r border-slate-900 bg-[#080808] flex flex-col p-6">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="w-8 h-8 bg-blue-600 rounded flex items-center justify-center">
            <Cpu className="text-white w-5 h-5" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight">LexAI Admin</span>
        </div>

        <nav className="space-y-2 flex-grow">
          {[
            { id: 'settings', label: 'System Settings', icon: Settings },
            { id: 'keys', label: 'Client API Keys', icon: Key },
            { id: 'docs', label: 'Knowledge Base', icon: Database },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium ${
                activeTab === tab.id 
                  ? 'bg-blue-600/10 text-blue-400 border border-blue-500/20' 
                  : 'hover:bg-slate-900 text-slate-500 hover:text-slate-300'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="pt-6 border-t border-slate-900">
          <button 
            onClick={() => {
              localStorage.removeItem('lex_admin_key');
              window.location.reload();
            }}
            className="flex items-center gap-2 text-xs font-bold text-slate-600 hover:text-rose-500 transition-colors px-4 py-2"
          >
            <Power className="w-3 h-3" />
            SIGN OUT
          </button>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-grow p-10 overflow-y-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h2 className="text-3xl font-bold text-white mb-1">
              {activeTab === 'settings' && "System Control"}
              {activeTab === 'keys' && "Client Management"}
              {activeTab === 'docs' && "Knowledge Assets"}
            </h2>
            <p className="text-slate-500 text-sm">
              Manage your decentralized AI network from a central interface
            </p>
          </div>
          <div className="flex gap-4">
             {settings && (
               <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-bold ${
                 settings.api_enabled 
                   ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                   : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
               }`}>
                 <div className={`w-1.5 h-1.5 rounded-full ${settings.api_enabled ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
                 {settings.api_enabled ? "SYSTEM LIVE" : "SYSTEM PAUSED"}
               </div>
             )}
          </div>
        </header>

        <AnimatePresence mode="wait">
          {activeTab === 'settings' && (
            <motion.div 
              key="settings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="grid grid-cols-1 md:grid-cols-2 gap-8"
            >
               <div className="bg-[#0c0c0c] border border-slate-900 p-8 rounded-2xl">
                 <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                   <Power className="w-5 h-5 text-blue-500" />
                   API Availability
                 </h3>
                 <p className="text-slate-400 text-sm mb-8">
                   Pause all incoming traffic to the LexAI network across all sites instantly.
                 </p>
                 <div className="flex items-center justify-between p-4 bg-slate-950 rounded-xl border border-slate-900">
                    <span className="font-bold text-slate-300">LexAI Global Status</span>
                    <button 
                      onClick={() => handleUpdateSettings({ api_enabled: !settings?.api_enabled })}
                      className={`relative w-14 h-7 rounded-full transition-colors ${settings?.api_enabled ? 'bg-blue-600' : 'bg-slate-800'}`}
                    >
                      <div className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-all ${settings?.api_enabled ? 'left-8' : 'left-1'}`}></div>
                    </button>
                 </div>
               </div>

               <div className="bg-[#0c0c0c] border border-slate-900 p-8 rounded-2xl">
                 <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                   <Cpu className="w-5 h-5 text-purple-500" />
                   LLM Model Configuration
                 </h3>
                 <p className="text-slate-400 text-sm mb-8">
                   Switch the underlying inference engine for the entire network.
                 </p>
                 <div className="space-y-3">
                   {['gemini-1.5-flash', 'gemini-1.5-pro', 'groq-mixtral-8x7b'].map((model) => (
                     <button 
                       key={model}
                       onClick={() => handleUpdateSettings({ active_model: model })}
                       className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                         settings?.active_model === model 
                           ? 'bg-purple-600/10 border-purple-500/50 text-purple-300' 
                           : 'bg-slate-950 border-slate-900 text-slate-500 hover:border-slate-800'
                       }`}
                     >
                        <span className="font-medium capitalize">{model.replace('-', ' ')}</span>
                        {settings?.active_model === model && <CheckCircle2 className="w-5 h-5" />}
                     </button>
                   ))}
                 </div>
               </div>
            </motion.div>
          )}

          {activeTab === 'keys' && (
            <motion.div 
              key="keys"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <div className="flex justify-between items-center mb-6">
                <div className="relative flex-grow max-w-md">
                   <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                   <input 
                     placeholder="Search sites or keys..."
                     className="w-full bg-[#0c0c0c] border border-slate-900 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-blue-500/50"
                   />
                </div>
                <button 
                  onClick={() => {
                    const site = prompt("Enter site identifier (e.g. lawfirmA):");
                    if (site) handleCreateKey(site);
                  }}
                  className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-6 rounded-xl flex items-center gap-2 transition-all active:scale-95"
                >
                  <Plus className="w-5 h-5" />
                  GENERATE KEY
                </button>
              </div>

              <div className="bg-[#0c0c0c] border border-slate-900 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-[#111] border-bottom border-slate-900">
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Site ID</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Environment Key</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                      <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-900">
                    {apiKeys.map((k) => (
                      <tr key={k.id} className="hover:bg-slate-900/50 transition-colors group">
                        <td className="p-4 font-bold text-white flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                          {k.site}
                        </td>
                        <td className="p-4 font-mono text-xs text-slate-400">
                          <code className="bg-slate-950 p-1 rounded border border-slate-800">
                            {k.key.substring(0, 10)}****************
                          </code>
                        </td>
                        <td className="p-4 text-xs">
                          <span className={`px-2.5 py-1 rounded-full font-bold border ${
                            k.status === 'active' 
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}>
                            {k.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="p-4 text-right">
                          <button 
                            disabled={k.status === 'revoked'}
                            onClick={() => handleRevokeKey(k.id)}
                            className="text-slate-600 hover:text-rose-500 p-2 transition-all opacity-0 group-hover:opacity-100 disabled:opacity-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          )}

          {activeTab === 'docs' && (
            <motion.div 
              key="docs"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
               <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
                 {[
                   { label: 'Total Vectors', value: docs.length, icon: Database, color: 'blue' },
                   { label: 'Indexed Projects', value: new Set(docs.map(d => d.site)).size, icon: ExternalLink, color: 'emerald' },
                   { label: 'Storage Usage', value: '2.4 MB', icon: FileText, color: 'purple' },
                 ].map((stat) => (
                   <div key={stat.label} className="bg-[#0c0c0c] border border-slate-900 p-6 rounded-2xl">
                     <div className="flex justify-between items-start mb-4">
                       <div className={`p-3 rounded-xl bg-${stat.color}-600/10 border border-${stat.color}-500/20`}>
                         <stat.icon className={`w-5 h-5 text-${stat.color}-500`} />
                       </div>
                       <ChevronRight className="w-4 h-4 text-slate-700" />
                     </div>
                     <span className="text-slate-500 text-sm font-bold block mb-1 uppercase tracking-widest">{stat.label}</span>
                     <span className="text-3xl font-bold text-white">{stat.value}</span>
                   </div>
                 ))}
               </div>

               <div className="bg-[#0c0c0c] border border-slate-900 rounded-2xl">
                 <div className="p-6 border-b border-slate-900 flex justify-between items-center">
                    <h3 className="font-bold text-white">Document Registry</h3>
                    <div className="flex gap-3">
                       <button className="text-xs font-bold text-slate-500 hover:text-white transition-colors">Export All</button>
                    </div>
                 </div>
                 <div className="max-h-[500px] overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="sticky top-0 bg-[#0c0c0c] z-10">
                        <tr className="border-b border-slate-900 shadow-sm">
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Client</th>
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest">Preview</th>
                          <th className="p-4 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-900">
                        {docs.map((doc) => (
                          <tr key={doc.id} className="hover:bg-slate-900/50 group">
                            <td className="p-4 align-top">
                              <span className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-[10px] font-bold text-blue-400">
                                {doc.site.toUpperCase()}
                              </span>
                            </td>
                            <td className="p-4">
                              <p className="text-xs text-slate-400 line-clamp-2 max-w-md">
                                {doc.content}
                              </p>
                            </td>
                            <td className="p-4 text-right align-middle">
                               <button 
                                onClick={() => handleDeleteDoc(doc.id)}
                                className="text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                               >
                                 <Trash2 className="w-4 h-4" />
                               </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                 </div>
               </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
