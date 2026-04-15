import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Shield, Upload, Settings, Database, DollarSign } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const AdminDashboard = () => {
  useDocumentTitle('CyAzor - Admin Dashboard');
  const [activeTab, setActiveTab] = useState('resources');

  return (
    <div className="pt-24 pb-20 min-h-screen bg-slate-900 text-slate-300">
      <section className="px-6 py-12 max-w-7xl mx-auto">
        <div className="flex items-center gap-4 mb-12">
          <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
            <Shield size={32} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            <p className="text-slate-400">Manage LexAI Resources, Prompts, and Vector Store</p>
          </div>
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          {/* Sidebar */}
          <div className="w-full md:w-64 space-y-2">
            {[
              { id: 'resources', label: 'Resource Library', icon: <Upload size={20} /> },
              { id: 'prompts', label: 'Master Prompts', icon: <Settings size={20} /> },
              { id: 'vector', label: 'Vector Store (RAG)', icon: <Database size={20} /> },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-medium transition-colors ${
                  activeTab === tab.id ? 'bg-blue-600 text-white' : 'hover:bg-slate-800 text-slate-400'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {/* Content */}
          <div className="flex-grow bg-slate-800 rounded-3xl p-8 border border-slate-700">
            {activeTab === 'resources' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">Upload Resource</h2>
                <div className="space-y-6 max-w-2xl">
                  <div>
                    <label className="block text-sm font-medium mb-2">Resource Title</label>
                    <input type="text" className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g., Tech Startup Incorporation Guide" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Price ($)</label>
                    <div className="relative">
                      <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" size={20} />
                      <input type="number" className="w-full bg-slate-900 border border-slate-700 rounded-xl pl-12 pr-4 py-3 text-white focus:ring-2 focus:ring-blue-500 outline-none" placeholder="49.99" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Upload File (PDF/DOCX)</label>
                    <div className="border-2 border-dashed border-slate-600 rounded-xl p-8 text-center hover:bg-slate-700/50 transition-colors cursor-pointer">
                      <Upload className="mx-auto mb-4 text-slate-400" size={32} />
                      <p className="text-sm">Click to browse or drag and drop</p>
                    </div>
                  </div>
                  <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
                    Publish Resource
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'prompts' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">Master System Prompts</h2>
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-indigo-400">Training Mode Prompt</label>
                    <textarea rows={5} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-indigo-500 outline-none resize-none" defaultValue="You are an expert legal evaluator. Generate a complex legal scenario. When the user responds, grade their answer based on professional standards, highlighting strengths and areas for improvement."></textarea>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-emerald-400">Practice Mode Prompt (RAG)</label>
                    <textarea rows={5} className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 text-white focus:ring-2 focus:ring-emerald-500 outline-none resize-none" defaultValue="You are LexAI, a helpful legal assistant. Use the provided context to answer the user's question. If the user's query matches a 'Premium Product' tag, naturally recommend that digital product at the end of your response."></textarea>
                  </div>
                  <button className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold hover:bg-blue-700 transition-colors">
                    Save Prompts
                  </button>
                </div>
              </div>
            )}

            {activeTab === 'vector' && (
              <div>
                <h2 className="text-2xl font-bold text-white mb-6">Supabase Vector Store Management</h2>
                <div className="bg-slate-900/50 rounded-2xl p-6 border border-slate-700 mb-6">
                  <h3 className="font-bold text-white mb-2">Upload Knowledge Document</h3>
                  <p className="text-sm text-slate-400 mb-4">Documents uploaded here will be chunked, embedded, and stored in Supabase for RAG.</p>
                  
                  <div className="flex gap-4 mb-4">
                    <select className="bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-white outline-none">
                      <option value="general">Tag: General Knowledge</option>
                      <option value="premium">Tag: Premium Product</option>
                    </select>
                    <input type="file" className="text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
                  </div>
                  <button className="bg-emerald-600 text-white px-6 py-2 rounded-xl font-bold hover:bg-emerald-700 transition-colors">
                    Process & Embed
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminDashboard;
