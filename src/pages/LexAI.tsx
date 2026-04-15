import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { BookOpen, Brain, Dumbbell, ArrowRight, Sparkles, Shield, Lock, Loader2 } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { cn } from '../lib/utils';
import { Link } from 'react-router-dom';
import Markdown from 'react-markdown';

const LexAI = () => {
  useDocumentTitle('CyAzor - LexAI');
  const [mode, setMode] = useState<'preparation' | 'training' | 'practice'>('preparation');
  
  // Training State
  const [userResponse, setUserResponse] = useState('');
  const [feedback, setFeedback] = useState('');
  const [isGrading, setIsGrading] = useState(false);
  const scenario = "Your client is a tech startup looking to incorporate in Nigeria but has foreign investors. What is the most tax-efficient structure, and what regulatory bodies must they register with?";

  // Practice State
  const [chatMessage, setChatMessage] = useState('');
  const [chatHistory, setChatHistory] = useState<{role: 'user' | 'ai', content: string}[]>([
    { role: 'ai', content: "Hello! I am LexAI. Ask me any legal question, and I will search our verified knowledge base." }
  ]);
  const [isChatting, setIsChatting] = useState(false);

  const handleGrade = async () => {
    if (!userResponse) return;
    setIsGrading(true);
    try {
      const res = await fetch('/api/lexai/grade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, userResponse })
      });
      const data = await res.json();
      setFeedback(data.feedback);
    } catch (error) {
      console.error(error);
      setFeedback("Failed to get grading feedback. Please try again.");
    } finally {
      setIsGrading(false);
    }
  };

  const handleChat = async () => {
    if (!chatMessage) return;
    const newMessage = chatMessage;
    setChatMessage('');
    setChatHistory(prev => [...prev, { role: 'user', content: newMessage }]);
    setIsChatting(true);
    
    try {
      const res = await fetch('/api/lexai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: newMessage })
      });
      const data = await res.json();
      setChatHistory(prev => [...prev, { role: 'ai', content: data.response }]);
    } catch (error) {
      console.error(error);
      setChatHistory(prev => [...prev, { role: 'ai', content: "Sorry, I encountered an error connecting to the knowledge base." }]);
    } finally {
      setIsChatting(false);
    }
  };

  const modes = [
    {
      id: 'preparation',
      title: 'Preparation',
      desc: 'Resource Library & Study Guides',
      icon: <BookOpen size={24} />,
      color: 'blue'
    },
    {
      id: 'training',
      title: 'Training',
      desc: 'Scenario-Based Learning',
      icon: <Brain size={24} />,
      color: 'indigo'
    },
    {
      id: 'practice',
      title: 'Practice',
      desc: 'AI Legal Assistant (RAG)',
      icon: <Dumbbell size={24} />,
      color: 'emerald'
    }
  ];

  return (
    <div className="pt-24 pb-20 min-h-screen bg-slate-50">
      <section className="px-6 py-12 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-bold mb-6"
          >
            <Sparkles size={16} /> CyAzor LexAI
          </motion.div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            Developmental Legal Platform
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Select your stage to access tailored tools, resources, and AI-driven scenarios.
          </p>
        </div>

        {/* Mode Selector */}
        <div className="flex flex-wrap justify-center gap-4 mb-16">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id as any)}
              className={cn(
                "flex items-center gap-3 px-8 py-4 rounded-2xl font-bold transition-all border-2",
                mode === m.id 
                  ? `border-${m.color}-600 bg-${m.color}-50 text-${m.color}-700 shadow-md` 
                  : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-xl flex items-center justify-center",
                mode === m.id ? `bg-${m.color}-600 text-white` : "bg-slate-100 text-slate-500"
              )}>
                {m.icon}
              </div>
              <div className="text-left">
                <div className="text-sm uppercase tracking-wider opacity-70">{m.title}</div>
              </div>
            </button>
          ))}
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4 }}
            className="bg-white rounded-[3rem] p-8 md:p-12 shadow-xl border border-slate-100 min-h-[500px]"
          >
            {mode === 'preparation' && (
              <div>
                <h2 className="text-3xl font-bold text-slate-900 mb-6">Resource Library</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="border border-slate-200 rounded-2xl p-6 hover:shadow-md transition-all">
                      <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mb-4">
                        <BookOpen size={24} />
                      </div>
                      <h3 className="font-bold text-lg mb-2">Premium Legal Template {i}</h3>
                      <p className="text-slate-500 text-sm mb-4">Comprehensive guide and framework for modern practice.</p>
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-900">$49.99</span>
                        <button className="text-blue-600 font-bold text-sm hover:underline">Purchase</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {mode === 'training' && (
              <div>
                <h2 className="text-3xl font-bold text-slate-900 mb-6">Scenario-Based Learning</h2>
                <div className="bg-slate-50 rounded-2xl p-8 border border-slate-200">
                  <div className="flex items-center gap-3 mb-4 text-indigo-600 font-bold">
                    <Brain size={24} /> AI Scenario Generator
                  </div>
                  <p className="text-slate-700 mb-6 italic">
                    "{scenario}"
                  </p>
                  <textarea 
                    value={userResponse}
                    onChange={(e) => setUserResponse(e.target.value)}
                    className="w-full h-32 p-4 rounded-xl border border-slate-300 focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none mb-4"
                    placeholder="Type your legal analysis here..."
                  ></textarea>
                  <button 
                    onClick={handleGrade}
                    disabled={isGrading || !userResponse}
                    className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isGrading ? <Loader2 className="animate-spin" size={20} /> : null}
                    {isGrading ? 'Grading...' : 'Submit for AI Grading'}
                  </button>

                  {feedback && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-6 p-6 bg-white rounded-xl border border-indigo-100 shadow-sm"
                    >
                      <h4 className="font-bold text-indigo-900 mb-2">AI Feedback:</h4>
                      <div className="prose prose-sm max-w-none text-slate-700">
                        <Markdown>{feedback}</Markdown>
                      </div>
                    </motion.div>
                  )}
                </div>
              </div>
            )}

            {mode === 'practice' && (
              <div className="flex flex-col h-[600px]">
                <h2 className="text-3xl font-bold text-slate-900 mb-6">AI Legal Assistant (RAG)</h2>
                <div className="flex-grow bg-slate-50 rounded-2xl border border-slate-200 p-6 flex flex-col">
                  <div className="flex-grow overflow-y-auto mb-4 space-y-4 pr-2">
                    {chatHistory.map((msg, idx) => (
                      <div key={idx} className={cn(
                        "p-4 rounded-xl shadow-sm border max-w-[80%]",
                        msg.role === 'ai' 
                          ? "bg-white border-slate-100 mr-auto" 
                          : "bg-emerald-600 text-white border-emerald-700 ml-auto"
                      )}>
                        {msg.role === 'ai' ? (
                          <div className="prose prose-sm max-w-none text-slate-700">
                            <Markdown>{msg.content}</Markdown>
                          </div>
                        ) : (
                          <p>{msg.content}</p>
                        )}
                      </div>
                    ))}
                    {isChatting && (
                      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 max-w-[80%] mr-auto flex items-center gap-2 text-slate-500">
                        <Loader2 className="animate-spin" size={16} /> LexAI is thinking...
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={chatMessage}
                      onChange={(e) => setChatMessage(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleChat()}
                      className="flex-grow px-4 py-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      placeholder="Ask a legal question..."
                    />
                    <button 
                      onClick={handleChat}
                      disabled={isChatting || !chatMessage}
                      className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-emerald-700 transition-colors disabled:opacity-50"
                    >
                      Send
                    </button>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
        
        <div className="mt-12 text-center">
           <Link to="/admin" className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-600 text-sm font-medium transition-colors">
             <Shield size={16} /> Admin Access
           </Link>
        </div>
      </section>
    </div>
  );
};

export default LexAI;
