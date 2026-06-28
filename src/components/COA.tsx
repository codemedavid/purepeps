import React, { useState, useEffect } from 'react';
import { Shield, Award, CheckCircle, X, ExternalLink, Download, Sparkles, ArrowLeft, Copy, Check, FileText } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useCOAPageSetting } from '../hooks/useCOAPageSetting';

interface COAReport {
  id: string;
  product_name: string;
  batch: string;
  test_date: string;
  purity_percentage: number;
  quantity: string;
  task_number: string;
  verification_key: string;
  image_url: string;
  featured: boolean;
  laboratory: string;
}

const isPdf = (url?: string | null): boolean =>
  !!url && url.split('?')[0].toLowerCase().endsWith('.pdf');

const COA: React.FC = () => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [coaReports, setCOAReports] = useState<COAReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  useEffect(() => {
    fetchCOAReports();
  }, []);

  const fetchCOAReports = async () => {
    try {
      const { data, error } = await supabase
        .from('coa_reports')
        .select('*')
        .order('test_date', { ascending: false });

      if (error) throw error;
      setCOAReports(data || []);
    } catch (error) {
      console.error('Error fetching COA reports:', error);
    } finally {
      setLoading(false);
    }
  };

  // ... (inside component)
  const { coaPageEnabled, loading: settingLoading } = useCOAPageSetting();

  // ... (after loading check)
  if (settingLoading || loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!coaPageEnabled) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center p-8">
          <Shield className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Lab Reports Unavailable</h1>
          <p className="text-gray-600 mb-6">The COA page is currently disabled.</p>
          <a href="/" className="px-6 py-2 bg-sky-500 text-white rounded-lg hover:bg-sky-600 transition-colors">
            Return Home
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-blue-50 to-cyan-50">
      {/* Hero Section - Mobile Optimized */}
      <div className="relative overflow-hidden bg-gradient-to-r from-sky-100 to-blue-100 py-6 md:py-12">
        <div className="absolute top-0 left-0 w-48 h-48 md:w-64 md:h-64 bg-sky-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30"></div>
        <div className="absolute bottom-0 right-0 w-48 h-48 md:w-64 md:h-64 bg-blue-300 rounded-full mix-blend-multiply filter blur-3xl opacity-30"></div>

        {/* Back Button */}
        <a
          href="/"
          className="absolute top-4 left-4 z-20 flex items-center gap-2 bg-white/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-md border border-sky-200 text-gray-700 hover:text-sky-600 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back</span>
        </a>

        <div className="relative container mx-auto px-4">
          <div className="text-center max-w-4xl mx-auto">
            <div className="inline-flex items-center gap-1.5 md:gap-2 bg-white/90 backdrop-blur-md px-3 py-1.5 md:px-6 md:py-3 rounded-full shadow-cute mb-3 md:mb-6 border-2 border-sky-200">
              <Shield className="w-3.5 h-3.5 md:w-5 md:h-5 text-sky-500" />
              <span className="text-xs md:text-sm font-bold text-sky-600">Lab Verified</span>
            </div>

            <h1 className="font-outfit text-2xl md:text-4xl lg:text-5xl font-bold mb-2 md:mb-4 text-gray-800 px-2">
              <span className="bg-gradient-to-r from-sky-500 to-blue-600 bg-clip-text text-transparent">
                Lab Reports
              </span>
              <Sparkles className="inline-block w-5 h-5 md:w-8 md:h-8 text-yellow-400 ml-2 mb-1 animate-pulse" />
            </h1>

            <p className="text-sm md:text-lg text-gray-600 mb-4 md:mb-6 px-4">
              Independently <strong className="text-sky-600">lab tested</strong> for purity &amp; concentration
            </p>

            <div className="flex flex-wrap justify-center gap-2 md:gap-4 text-xs md:text-sm px-2">
              <div className="flex items-center gap-1.5 md:gap-2 bg-white/80 backdrop-blur-sm px-2.5 py-1.5 md:px-4 md:py-2 rounded-full shadow-md border border-sky-200">
                <CheckCircle className="w-3.5 h-3.5 md:w-5 md:h-5 text-green-500" />
                <span className="font-medium text-gray-700">99%+ Purity</span>
              </div>
              <div className="flex items-center gap-1.5 md:gap-2 bg-white/80 backdrop-blur-sm px-2.5 py-1.5 md:px-4 md:py-2 rounded-full shadow-md border border-sky-200">
                <Award className="w-3.5 h-3.5 md:w-5 md:h-5 text-blue-500" />
                <span className="font-medium text-gray-700">Certified</span>
              </div>
              <div className="flex items-center gap-1.5 md:gap-2 bg-white/80 backdrop-blur-sm px-2.5 py-1.5 md:px-4 md:py-2 rounded-full shadow-md border border-sky-200">
                <Shield className="w-3.5 h-3.5 md:w-5 md:h-5 text-sky-500" />
                <span className="font-medium text-gray-700">Verified</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* COA Reports Grid - Mobile Optimized */}
      <div className="container mx-auto px-3 md:px-4 py-6 md:py-12">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 max-w-6xl mx-auto">
          {coaReports.length === 0 ? (
            <div className="col-span-2 text-center py-20">
              <Shield className="w-20 h-20 text-gray-300 mx-auto mb-4" />
              <p className="text-xl text-gray-500">No lab reports available yet.</p>
            </div>
          ) : (
            coaReports.map((report) => (
              <div
                key={report.id}
                className="bg-white rounded-2xl md:rounded-3xl shadow-cute hover:shadow-glow transition-all duration-300 overflow-hidden border-2 border-sky-100 hover:border-sky-200 transform hover:-translate-y-1 md:hover:-translate-y-2"
              >
                {/* Report Image - Mobile Optimized */}
                <div
                  className="relative cursor-pointer group"
                  onClick={() => setSelectedImage(report.image_url)}
                >
                  {isPdf(report.image_url) ? (
                    <div className="w-full h-48 sm:h-56 md:h-64 lg:h-80 bg-gradient-to-br from-sky-50 to-blue-50 flex flex-col items-center justify-center gap-2">
                      <FileText className="w-16 h-16 md:w-20 md:h-20 text-sky-400" />
                      <p className="text-sm md:text-base font-bold text-sky-600">PDF Lab Report</p>
                      <p className="text-xs text-gray-500">Tap to view full report</p>
                    </div>
                  ) : (
                    <img
                      src={report.image_url}
                      alt={`${report.product_name} Certificate of Analysis`}
                      className="w-full h-48 sm:h-56 md:h-64 lg:h-80 object-cover object-top"
                      onError={(e) => {
                        // Fallback if image doesn't exist
                        (e.target as HTMLImageElement).src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="300"%3E%3Crect fill="%23f0f9ff" width="400" height="300"/%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%230ea5e9" font-size="20" font-family="Arial"%3ECOA Image Coming Soon%3C/text%3E%3C/svg%3E';
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-sky-600/0 group-hover:bg-sky-600/10 transition-all duration-300 flex items-center justify-center">
                    <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/95 backdrop-blur-sm px-3 py-1.5 md:px-4 md:py-2 rounded-xl md:rounded-2xl shadow-lg">
                      <p className="text-xs md:text-sm font-bold text-sky-600 flex items-center gap-1.5 md:gap-2">
                        <ExternalLink className="w-3 h-3 md:w-4 md:h-4" />
                        View full report
                      </p>
                    </div>
                  </div>
                </div>

                {/* Report Details - Mobile Optimized */}
                <div className="p-4 md:p-6">
                  <div className="flex items-center justify-between mb-3 md:mb-4 gap-2">
                    <h3 className="text-base md:text-xl font-bold text-gray-800">{report.product_name}</h3>
                    {report.featured && (
                      <span className="bg-gradient-to-r from-sky-100 to-blue-100 text-sky-700 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-[10px] md:text-xs font-bold border border-sky-300 whitespace-nowrap">
                        ✓ VERIFIED
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 md:space-y-3 mb-4 md:mb-6">
                    <div className="flex items-center justify-between py-1.5 md:py-2 border-b border-sky-100">
                      <span className="text-xs md:text-sm text-gray-600 font-medium">Purity:</span>
                      <span className="text-sm md:text-base font-bold text-green-600">{report.purity_percentage}%</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 md:py-2 border-b border-sky-100">
                      <span className="text-xs md:text-sm text-gray-600 font-medium">Quantity:</span>
                      <span className="text-sm md:text-base font-bold text-sky-600">{report.quantity}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 md:py-2 border-b border-sky-100">
                      <span className="text-xs md:text-sm text-gray-600 font-medium">Test Date:</span>
                      <span className="text-xs md:text-sm text-gray-800">{new Date(report.test_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).toUpperCase()}</span>
                    </div>
                    <div className="flex items-center justify-between py-1.5 md:py-2 border-b border-sky-100">
                      <span className="text-xs md:text-sm text-gray-600 font-medium">Task:</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs md:text-sm text-gray-800 font-mono">#{report.task_number}</span>
                        <button
                          onClick={() => handleCopy(report.task_number, `${report.id}-task`)}
                          className="p-1 hover:bg-sky-50 rounded-full transition-colors"
                          title="Copy Task Number"
                        >
                          {copiedId === `${report.id}-task` ? (
                            <Check className="w-3.5 h-3.5 text-green-500" />
                          ) : (
                            <Copy className="w-3.5 h-3.5 text-sky-400" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 md:space-y-3">
                    <button
                      onClick={() => setSelectedImage(report.image_url)}
                      className="w-full flex items-center justify-center gap-1.5 md:gap-2 bg-white text-sky-600 border-2 border-sky-400 hover:border-sky-500 hover:bg-sky-50 px-3 py-2 md:px-4 md:py-3 rounded-xl md:rounded-2xl text-sm md:text-base font-medium transition-all duration-300"
                    >
                      <Download className="w-4 h-4 md:w-5 md:h-5" />
                      View Full Report
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Info Section - Mobile Optimized */}
        <div className="mt-6 md:mt-12 max-w-4xl mx-auto">
          <div className="bg-gradient-to-r from-sky-50 to-blue-50 rounded-2xl md:rounded-3xl p-4 md:p-6 lg:p-8 border-2 border-sky-200 shadow-cute">
            <div className="flex flex-col md:flex-row items-start gap-3 md:gap-4">
              <div className="flex-shrink-0">
                <div className="w-10 h-10 md:w-12 md:h-12 bg-gradient-to-br from-sky-400 to-blue-500 rounded-xl md:rounded-2xl flex items-center justify-center">
                  <Shield className="w-5 h-5 md:w-6 md:h-6 text-white" />
                </div>
              </div>
              <div className="flex-1">
                <h3 className="text-base md:text-xl font-bold text-gray-800 mb-2 md:mb-3">Independent Laboratory Testing</h3>
                <p className="text-sm md:text-base text-gray-700 leading-relaxed">
                  We partner with top-tier third-party laboratories to ensure the highest quality standards.
                  Each batch is rigorously tested for purity and concentration using HPLC and Mass Spectrometry.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Image Modal - Mobile Optimized */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-2 md:p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative w-full max-w-5xl">
            <button
              onClick={() => setSelectedImage(null)}
              className="absolute -top-10 md:-top-12 right-0 bg-white/95 hover:bg-white text-gray-800 rounded-full p-2 md:p-2.5 transition-all shadow-lg"
            >
              <X className="w-5 h-5 md:w-6 md:h-6" />
            </button>
            {isPdf(selectedImage) ? (
              <div className="bg-white rounded-2xl md:rounded-3xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
                <iframe
                  src={selectedImage}
                  title="Certificate of Analysis"
                  className="w-full h-[70vh] md:h-[80vh]"
                />
                <a
                  href={selectedImage}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 px-4 py-3 text-sm md:text-base font-medium text-sky-600 hover:text-sky-700 hover:bg-sky-50 transition-colors"
                >
                  <ExternalLink className="w-4 h-4 md:w-5 md:h-5" />
                  Open PDF in new tab
                </a>
              </div>
            ) : (
              <img
                src={selectedImage}
                alt="Certificate of Analysis"
                className="w-full h-auto rounded-2xl md:rounded-3xl shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default COA;

