import React from 'react';
import { motion } from 'motion/react';
import { ShoppingBag, FileText, Download, Star, ArrowRight, Search, Filter } from 'lucide-react';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const ResourceStore = () => {
  useDocumentTitle('CyAzor - Resource Store');

  const resources = [
    {
      id: 1,
      title: "Tech Startup Incorporation Guide (Nigeria)",
      price: "$49.99",
      category: "Guides",
      rating: 4.9,
      reviews: 128,
      desc: "A step-by-step framework for navigating CAC registration and foreign investment compliance.",
      tags: ["Nigeria", "Startup", "Corporate"]
    },
    {
      id: 2,
      title: "Standard Employment Contract Template",
      price: "$29.99",
      category: "Templates",
      rating: 4.8,
      reviews: 85,
      desc: "Comprehensive employment agreement with modern IP and non-compete clauses.",
      tags: ["US/Nigeria", "HR", "Employment"]
    },
    {
      id: 3,
      title: "Legal Memo Masterclass",
      price: "$79.99",
      category: "Courses",
      rating: 5.0,
      reviews: 210,
      desc: "Master the IRAC method and professional legal writing for top-tier law firms.",
      tags: ["Writing", "Professional", "Education"]
    },
    {
      id: 4,
      title: "Privacy Policy Generator (GDPR/NDPR)",
      price: "$39.99",
      category: "Tools",
      rating: 4.7,
      reviews: 64,
      desc: "Generate compliant privacy policies for tech products in minutes.",
      tags: ["Tech", "Privacy", "Compliance"]
    }
  ];

  return (
    <div className="pt-24 pb-20 min-h-screen bg-slate-50">
      <section className="px-6 py-12 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#d4af37]/10 text-[#d4af37] rounded-full text-sm font-bold mb-6"
          >
            <ShoppingBag size={16} /> Resource Store
          </motion.div>
          <h1 className="text-4xl md:text-6xl font-bold text-slate-900 mb-6 tracking-tight">
            Premium Legal Assets
          </h1>
          <p className="text-xl text-slate-600 max-w-2xl mx-auto">
            Professional templates, study guides, and frameworks to accelerate your legal career.
          </p>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-col md:flex-row gap-4 mb-12">
          <div className="flex-grow relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
            <input 
              type="text" 
              placeholder="Search resources..." 
              className="w-full pl-12 pr-4 py-4 bg-white border border-slate-200 rounded-2xl focus:ring-2 focus:ring-[#1e3a8a] outline-none shadow-sm"
            />
          </div>
          <button className="flex items-center justify-center gap-2 px-6 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 transition-all shadow-sm">
            <Filter size={20} /> Filters
          </button>
        </div>

        {/* Resource Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {resources.map((res) => (
            <motion.div
              key={res.id}
              whileHover={{ y: -5 }}
              className="bg-white rounded-[2rem] overflow-hidden border border-slate-200 shadow-sm hover:shadow-xl transition-all flex flex-col"
            >
              <div className="p-8 flex-grow">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-12 h-12 bg-slate-100 rounded-xl flex items-center justify-center text-[#1e3a8a]">
                    <FileText size={24} />
                  </div>
                  <span className="px-3 py-1 bg-slate-100 text-slate-600 rounded-full text-[10px] font-bold uppercase tracking-widest">
                    {res.category}
                  </span>
                </div>
                
                <h3 className="text-xl font-bold text-slate-900 mb-3 leading-tight">{res.title}</h3>
                <p className="text-slate-500 text-sm mb-6 line-clamp-2">{res.desc}</p>
                
                <div className="flex items-center gap-4 mb-6">
                  <div className="flex items-center gap-1 text-[#d4af37]">
                    <Star size={16} fill="currentColor" />
                    <span className="text-sm font-bold">{res.rating}</span>
                  </div>
                  <span className="text-slate-400 text-xs">({res.reviews} reviews)</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {res.tags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
                <span className="text-2xl font-bold text-[#1e3a8a]">{res.price}</span>
                <button className="px-6 py-3 bg-[#1e3a8a] text-white rounded-xl font-bold text-sm hover:bg-[#152a63] transition-colors flex items-center gap-2">
                  Add to Cart <ArrowRight size={16} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
};

export default ResourceStore;
