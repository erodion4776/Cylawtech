import React from 'react';
import { useParams } from 'react-router-dom';

const Legal = () => {
  const { type } = useParams();
  
  const content: Record<string, { title: string; body: string }> = {
    'privacy': {
      title: 'Privacy Policy',
      body: 'This Privacy Policy describes how CyAzor LawTech Solutions collects, uses, and shares your personal information when you use our website and services. We are committed to protecting your privacy and ensuring that your personal data is handled securely and in accordance with applicable laws.'
    },
    'disclaimer': {
      title: 'Disclaimer',
      body: 'The information provided on this website is for general informational purposes only and does not constitute legal advice. CyAzor LawTech Solutions is not a law firm and does not provide legal representation. Use of our platforms does not create an attorney-client relationship.'
    },
    'affiliate-disclosure': {
      title: 'Affiliate Disclosure',
      body: 'Some of the links on this website are affiliate links, which means that we may earn a commission if you click on the link or make a purchase using the link. When you make a purchase, the price you pay will be the same whether you use the affiliate link or go directly to the vendor\'s website using a non-affiliate link.'
    }
  };

  const page = content[type || 'privacy'];

  if (!page) {
    return (
      <div className="pt-24 pb-20 px-6 text-center">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">404 - Page Not Found</h1>
        <p className="text-slate-600">The legal page you are looking for does not exist.</p>
      </div>
    );
  }

  return (
    <div className="pt-24 pb-20">
      <section className="px-6 py-16 max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-8">{page.title}</h1>
        <div className="prose prose-slate max-w-none">
          <p className="text-lg text-slate-600 leading-relaxed mb-6">
            Last updated: {new Date().toLocaleDateString()}
          </p>
          <p className="text-lg text-slate-600 leading-relaxed">
            {page.body}
          </p>
          <div className="mt-12 space-y-6">
            <h2 className="text-2xl font-bold text-slate-900">1. Introduction</h2>
            <p className="text-slate-600 leading-relaxed">
              Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.
            </p>
            <h2 className="text-2xl font-bold text-slate-900">2. Terms of Use</h2>
            <p className="text-slate-600 leading-relaxed">
              Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Legal;
