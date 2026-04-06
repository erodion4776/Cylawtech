import React from 'react';
import { motion } from 'motion/react';
import { Briefcase, MapPin, Clock, DollarSign, ExternalLink, Search, Filter } from 'lucide-react';
import { cn } from '../lib/utils';

const Opportunities = () => {
  const [filter, setFilter] = React.useState('all');
  const [search, setSearch] = React.useState('');

  const jobs = [
    {
      title: "AI Data Trainer (Legal Specialist)",
      company: "Outlier AI",
      location: "Remote",
      type: "Contract",
      pay: "$25 - $45/hr",
      category: "ai",
      desc: "Help train large language models on legal reasoning and Nigerian case law."
    },
    {
      title: "Legal Intern",
      company: "CyAzor Partners",
      location: "Lagos, Nigeria",
      type: "Full-time",
      pay: "Competitive",
      category: "legal",
      desc: "Join our fast-growing legal tech firm and work on cutting-edge digital law projects."
    },
    {
      title: "Remote Paralegal",
      company: "Global Law Hub",
      location: "Remote",
      type: "Part-time",
      pay: "$15 - $25/hr",
      category: "legal",
      desc: "Support international law firms with research and document drafting."
    },
    {
      title: "AI Content Reviewer",
      company: "Mercor",
      location: "Remote",
      type: "Flexible",
      pay: "$20/hr",
      category: "ai",
      desc: "Review and refine AI-generated content for accuracy and professional tone."
    }
  ];

  const filteredJobs = jobs.filter(job => {
    const matchesFilter = filter === 'all' || job.category === filter;
    const matchesSearch = job.title.toLowerCase().includes(search.toLowerCase()) || 
                         job.company.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.1 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 }
  };

  return (
    <div className="pt-24 pb-20 min-h-screen bg-slate-50">
      <section className="px-6 py-16 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8 mb-12">
          <div className="max-w-2xl">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight"
            >
              Opportunity <span className="text-blue-600">Board</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-xl text-slate-600"
            >
              Curated high-impact opportunities in AI training and the modern legal market.
            </motion.p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 w-full md:w-auto">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
              <input 
                type="text" 
                placeholder="Search jobs..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-12 pr-6 py-3 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-blue-600/20 focus:border-blue-600 outline-none transition-all w-full sm:w-64"
              />
            </div>
            <div className="flex bg-white p-1 rounded-xl border border-slate-200">
              {['all', 'ai', 'legal'].map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-6 py-2 rounded-lg text-sm font-bold transition-all",
                    filter === f ? "bg-slate-900 text-white shadow-md" : "text-slate-500 hover:text-slate-900"
                  )}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        <motion.div 
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-1 gap-6"
        >
          {filteredJobs.length > 0 ? (
            filteredJobs.map((job, index) => (
              <motion.div
                key={index}
                variants={itemVariants}
                whileHover={{ scale: 1.01, x: 5 }}
                className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all flex flex-col md:flex-row md:items-center justify-between gap-8 group"
              >
                <div className="flex-grow">
                  <div className="flex items-center gap-3 mb-4">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      job.category === 'ai' ? "bg-blue-50 text-blue-600" : "bg-indigo-50 text-indigo-600"
                    )}>
                      {job.category === 'ai' ? 'AI Training' : 'Legal Tech'}
                    </span>
                    <span className="text-slate-300">•</span>
                    <span className="text-slate-500 text-xs font-medium">{job.type}</span>
                  </div>
                  <h3 className="text-2xl font-bold text-slate-900 mb-2 group-hover:text-blue-600 transition-colors">{job.title}</h3>
                  <p className="text-slate-500 font-bold text-sm mb-4">{job.company}</p>
                  <p className="text-slate-600 text-sm max-w-2xl leading-relaxed">{job.desc}</p>
                </div>

                <div className="flex flex-col sm:flex-row md:flex-col lg:flex-row items-start sm:items-center md:items-start lg:items-center gap-6 md:min-w-[300px]">
                  <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <MapPin size={16} />
                      {job.location}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-sm">
                      <DollarSign size={16} />
                      {job.pay}
                    </div>
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    className="w-full sm:w-auto bg-slate-900 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-lg"
                  >
                    Apply Now <ExternalLink size={16} />
                  </motion.button>
                </div>
              </motion.div>
            ))
          ) : (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-slate-200">
              <Briefcase size={48} className="mx-auto text-slate-200 mb-4" />
              <p className="text-slate-500 font-medium">No opportunities found matching your criteria.</p>
            </div>
          )}
        </motion.div>

        {/* Newsletter / Alert Box */}
        <motion.div 
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-20 bg-blue-600 rounded-[2.5rem] p-12 text-white text-center relative overflow-hidden"
        >
          <div className="relative z-10">
            <h2 className="text-3xl font-bold mb-4">Never Miss an Opportunity</h2>
            <p className="text-blue-100 mb-8 max-w-lg mx-auto">Get notified instantly when new AI training or legal tech jobs are posted.</p>
            <div className="flex flex-col sm:flex-row gap-4 max-w-md mx-auto">
              <input 
                type="email" 
                placeholder="Enter your email"
                className="flex-grow px-6 py-4 rounded-2xl bg-white/10 border border-white/20 text-white placeholder:text-blue-200 outline-none focus:bg-white/20 transition-all"
              />
              <button className="bg-white text-blue-600 px-8 py-4 rounded-2xl font-bold hover:bg-blue-50 transition-all shadow-lg whitespace-nowrap">
                Notify Me
              </button>
            </div>
          </div>
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full translate-x-1/2 -translate-y-1/2 blur-3xl" />
        </motion.div>
      </section>
    </div>
  );
};

export default Opportunities;
