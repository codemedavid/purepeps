import React, { useMemo, useState } from 'react';
import { ArrowLeft, FlaskConical, Syringe, Thermometer, Clock, ChevronDown, ChevronUp, BookOpen, FileText, Eye, Search, X } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import { useProtocols, type Protocol } from '../hooks/useProtocols';
import ProtocolFileViewer from './ProtocolFileViewer';
import { useFeatureFlagsContext } from '../contexts/FeatureFlagsContext';
import {
    BOTTOM_NAV_CLEARANCE,
    STOREFRONT_PATH,
    storefrontNavigationOptions,
} from '../utils/storefrontNavigation';
import {
    ALL_CATEGORIES_SLUG,
    filterProtocols,
    isDisplayableProtocol,
    protocolCategoryOptions,
} from '../utils/protocolCategories';

const ProtocolGuide: React.FC = () => {
    const { cartItems } = useCart();
    const { protocols, loading } = useProtocols();
    const { flags } = useFeatureFlagsContext();
    const [expandedProtocol, setExpandedProtocol] = useState<string | null>(null);
    const [viewingProtocol, setViewingProtocol] = useState<Protocol | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<string>(ALL_CATEGORIES_SLUG);
    const [searchQuery, setSearchQuery] = useState('');

    const toggleProtocol = (id: string) => {
        setExpandedProtocol(expandedProtocol === id ? null : id);
    };

    const navigate = useNavigate();

    const handleBackToHome = () => {
        navigate(STOREFRONT_PATH, storefrontNavigationOptions('home'));
    };

    // Everything a reader could be shown: active, and carrying real content
    // (a text protocol needs dosing, a file/image protocol needs its file).
    const displayableProtocols = useMemo(
        () => protocols.filter(isDisplayableProtocol),
        [protocols],
    );

    // One option per category MEANING, not per distinct string an admin typed —
    // which is what used to list "Weight Loss" twice.
    const categoryOptions = useMemo(
        () => protocolCategoryOptions(protocols),
        [protocols],
    );

    const filteredProtocols = useMemo(
        () => filterProtocols(protocols, { categorySlug: selectedCategory, query: searchQuery }),
        [protocols, selectedCategory, searchQuery],
    );

    // Distinguishes "this shop has no protocols" from "your filter matched
    // none". Only the second is the reader's to fix.
    const isFiltering = selectedCategory !== ALL_CATEGORIES_SLUG || searchQuery.trim() !== '';
    const hasAnyProtocols = displayableProtocols.length > 0;

    return (
        <div className={`min-h-screen bg-gradient-to-br from-[#FADADD] via-[#FDF5F7] to-white ${BOTTOM_NAV_CLEARANCE}`}>
            <Header
                cartItemsCount={cartItems.reduce((sum, item) => sum + item.quantity, 0)}
                onCartClick={() => navigate(STOREFRONT_PATH, storefrontNavigationOptions('cart'))}
                onMenuClick={handleBackToHome}
            />

            <main className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Back Button */}
                <button
                    onClick={handleBackToHome}
                    className="flex items-center gap-2 text-charcoal-600 hover:text-rose-500 transition-colors mb-6 group"
                >
                    <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                    <span className="text-sm font-medium">Back to Home</span>
                </button>

                {/* Header */}
                <div className="text-center mb-10">
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/80 backdrop-blur-sm border border-brand-200 shadow-soft mb-4">
                        <BookOpen className="w-4 h-4 text-rose-500" />
                        <span className="text-xs font-medium text-charcoal-700 uppercase tracking-widest">Protocol Guide</span>
                    </div>
                    <h1 className="font-heading text-3xl sm:text-4xl font-bold text-charcoal-900 mb-3">
                        Peptide Protocol Guide
                    </h1>
                    <p className="text-charcoal-600 max-w-2xl mx-auto">
                        General dosage guidelines and protocols for peptides. Always consult with a healthcare professional before use.
                    </p>
                </div>



                {/* General Guidelines */}
                <div className="bg-white rounded-2xl shadow-soft border border-brand-100 p-6 mb-8">
                    <h2 className="font-heading text-xl font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
                        <Syringe className="w-5 h-5 text-rose-500" />
                        General Injection Guidelines
                    </h2>
                    <ul className="space-y-3 text-sm text-charcoal-700">
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 flex-shrink-0"></span>
                            <span><strong>Reconstitution:</strong> Use bacteriostatic water. Add slowly along the vial wall, don't shake.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 flex-shrink-0"></span>
                            <span><strong>Injection sites:</strong> Rotate between abdomen, thigh, and upper arm.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 flex-shrink-0"></span>
                            <span><strong>Needle size:</strong> 29-31 gauge insulin syringes for subcutaneous injections.</span>
                        </li>
                        <li className="flex items-start gap-2">
                            <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 flex-shrink-0"></span>
                            <span><strong>Timing:</strong> Most peptides are best taken on an empty stomach or before bed.</span>
                        </li>
                    </ul>
                </div>

                {/* Storage Guidelines */}
                <div className="bg-white rounded-2xl shadow-soft border border-brand-100 p-6 mb-8">
                    <h2 className="font-heading text-xl font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
                        <Thermometer className="w-5 h-5 text-rose-500" />
                        Storage Guidelines
                    </h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                        <div className="bg-brand-50 rounded-xl p-4">
                            <p className="font-semibold text-charcoal-800 mb-1">Lyophilized (Powder)</p>
                            <p className="text-charcoal-600">Store at -20°C for long-term. Stable at 2-8°C for weeks.</p>
                        </div>
                        <div className="bg-brand-50 rounded-xl p-4">
                            <p className="font-semibold text-charcoal-800 mb-1">Reconstituted</p>
                            <p className="text-charcoal-600">Refrigerate at 2-8°C. Use within 14-28 days depending on peptide.</p>
                        </div>
                    </div>
                </div>

                {/* Protocol Cards */}
                <h2 className="font-heading text-xl font-semibold text-charcoal-900 mb-4 flex items-center gap-2">
                    <FlaskConical className="w-5 h-5 text-rose-500" />
                    Peptide Protocols
                </h2>

                {/* Search + category filter. Both narrow the same list, so a
                    query inside a category is an AND, not a reset. */}
                <div className="mb-6 flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1">
                        <label htmlFor="protocol-search" className="block text-sm font-medium text-charcoal-600 mb-2">
                            Search protocols
                        </label>
                        <div className="relative">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-charcoal-400 pointer-events-none" aria-hidden="true" />
                            <input
                                id="protocol-search"
                                type="search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Peptide name, category or note…"
                                className="w-full pl-10 pr-10 py-3 rounded-xl bg-white border border-brand-200 text-charcoal-800 shadow-soft focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all"
                            />
                            {searchQuery !== '' && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    aria-label="Clear search"
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-charcoal-400 hover:text-rose-500 transition-colors"
                                >
                                    <X className="w-4 h-4" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="sm:w-64">
                        <label htmlFor="protocol-category" className="block text-sm font-medium text-charcoal-600 mb-2">
                            Filter by Category
                        </label>
                        <select
                            id="protocol-category"
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="w-full px-4 py-3 rounded-xl bg-white border border-brand-200 text-charcoal-800 font-medium shadow-soft focus:ring-2 focus:ring-rose-500 focus:border-transparent transition-all cursor-pointer"
                        >
                            {categoryOptions.map((option) => (
                                <option key={option.slug} value={option.slug}>
                                    {option.slug === ALL_CATEGORIES_SLUG ? `📋 ${option.name}` : option.name}
                                    {` (${option.count})`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <p className="text-xs text-charcoal-500 -mt-4 mb-6">{filteredProtocols.length} protocol(s) found</p>

                {loading ? (
                    <div className="flex items-center justify-center py-12">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                    </div>
                ) : filteredProtocols.length === 0 ? (
                    <div className="bg-white rounded-2xl shadow-soft border border-brand-100 p-8 text-center">
                        {hasAnyProtocols || isFiltering ? (
                            <>
                                <p className="text-charcoal-500">No protocols match your search or category.</p>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSearchQuery('');
                                        setSelectedCategory(ALL_CATEGORIES_SLUG);
                                    }}
                                    className="mt-3 text-sm font-semibold text-rose-500 hover:text-rose-600 transition-colors"
                                >
                                    Clear filters
                                </button>
                            </>
                        ) : (
                            <p className="text-charcoal-500">
                                Protocol guides are being added. Please check back soon.
                            </p>
                        )}
                    </div>
                ) : (
                    <div className="space-y-4">
                        {filteredProtocols.map((protocol) => (
                            <div
                                key={protocol.id}
                                className="bg-white rounded-2xl shadow-soft border border-brand-100 overflow-hidden"
                            >
                                <button
                                    onClick={() => toggleProtocol(protocol.id)}
                                    className="w-full p-5 flex items-center justify-between text-left hover:bg-brand-50/50 transition-colors"
                                >
                                    <div>
                                        <span className="text-xs font-medium text-rose-500 uppercase tracking-wider">{protocol.category}</span>
                                        <h3 className="font-heading text-lg font-semibold text-charcoal-900 mt-1">{protocol.name}</h3>
                                    </div>
                                    {expandedProtocol === protocol.id ? (
                                        <ChevronUp className="w-5 h-5 text-charcoal-400" />
                                    ) : (
                                        <ChevronDown className="w-5 h-5 text-charcoal-400" />
                                    )}
                                </button>

                                {expandedProtocol === protocol.id && (
                                    <div className="px-5 pb-5 border-t border-brand-100">
                                        {/* Image content */}
                                        {protocol.content_type === 'image' && protocol.file_url && (
                                            <div className="mt-4">
                                                <img
                                                    src={protocol.file_url}
                                                    alt={`${protocol.name} protocol`}
                                                    className="w-full max-w-2xl mx-auto rounded-xl shadow-sm"
                                                />
                                            </div>
                                        )}

                                        {/* File content — opens in-site rather than
                                            handing the customer off to the file host. */}
                                        {protocol.content_type === 'file' && protocol.file_url && (
                                            <div className="mt-4">
                                                <button
                                                    type="button"
                                                    onClick={() => setViewingProtocol(protocol)}
                                                    className="w-full text-left flex items-center gap-3 p-4 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors group"
                                                >
                                                    <div className="w-12 h-12 bg-white rounded-lg flex items-center justify-center shadow-sm">
                                                        <FileText className="w-6 h-6 text-rose-500" />
                                                    </div>
                                                    <div className="flex-1">
                                                        <p className="text-sm font-semibold text-charcoal-800">{protocol.name} Protocol</p>
                                                        <p className="text-xs text-charcoal-500">Click to view</p>
                                                    </div>
                                                    <Eye className="w-5 h-5 text-charcoal-400 group-hover:text-rose-500 transition-colors" />
                                                </button>
                                            </div>
                                        )}

                                        {/* Text content (original) */}
                                        {(!protocol.content_type || protocol.content_type === 'text') && (
                                            <>
                                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4 mb-4">
                                                    <div className="bg-brand-50 rounded-xl p-3">
                                                        <p className="text-xs text-charcoal-500 uppercase tracking-wider">Dosage</p>
                                                        <p className="text-sm font-semibold text-charcoal-800 mt-1">{protocol.dosage}</p>
                                                    </div>
                                                    <div className="bg-brand-50 rounded-xl p-3">
                                                        <p className="text-xs text-charcoal-500 uppercase tracking-wider flex items-center gap-1">
                                                            <Clock className="w-3 h-3" /> Frequency
                                                        </p>
                                                        <p className="text-sm font-semibold text-charcoal-800 mt-1">{protocol.frequency}</p>
                                                    </div>
                                                    <div className="bg-brand-50 rounded-xl p-3">
                                                        <p className="text-xs text-charcoal-500 uppercase tracking-wider">Duration</p>
                                                        <p className="text-sm font-semibold text-charcoal-800 mt-1">{protocol.duration}</p>
                                                    </div>
                                                </div>

                                                {protocol.notes && protocol.notes.length > 0 && (
                                                    <div className="mb-4">
                                                        <p className="text-xs text-charcoal-500 uppercase tracking-wider mb-2">Protocol Notes</p>
                                                        <ul className="space-y-2">
                                                            {protocol.notes.map((note, idx) => (
                                                                <li key={idx} className="flex items-start gap-2 text-sm text-charcoal-700">
                                                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 mt-2 flex-shrink-0"></span>
                                                                    {note}
                                                                </li>
                                                            ))}
                                                        </ul>
                                                    </div>
                                                )}

                                                {protocol.storage && (
                                                    <div className="bg-amber-50 rounded-xl p-3">
                                                        <p className="text-xs text-amber-700 flex items-center gap-1">
                                                            <Thermometer className="w-3 h-3" />
                                                            <strong>Storage:</strong> {protocol.storage}
                                                        </p>
                                                    </div>
                                                )}
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}

                {/* CTA — hidden when the calculator is switched off, so it
                    never sends a customer to a page that redirects home. */}
                {flags.calculator && (
                    <div className="text-center mt-10">
                        <a
                            href="/calculator"
                            className="inline-flex items-center gap-2 px-6 py-3 bg-rose-500 hover:bg-rose-600 text-white font-semibold rounded-2xl shadow-lg transition-all"
                        >
                            <FlaskConical className="w-4 h-4" />
                            Use Peptide Calculator
                        </a>
                    </div>
                )}
            </main>

            <Footer />

            {viewingProtocol?.file_url && (
                <ProtocolFileViewer
                    name={viewingProtocol.name}
                    fileUrl={viewingProtocol.file_url}
                    onClose={() => setViewingProtocol(null)}
                />
            )}
        </div>
    );
};

export default ProtocolGuide;
