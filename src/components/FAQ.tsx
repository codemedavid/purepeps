import React, { useState } from 'react';
import { ChevronDown, ChevronUp, FlaskConical, Package, CreditCard, Truck, ArrowLeft, HelpCircle } from 'lucide-react';
import { useFAQs } from '../hooks/useFAQs';

const categoryIcons: { [key: string]: React.ReactElement } = {
    'PRODUCT & USAGE': <FlaskConical className="w-5 h-5" />,
    'ORDERING & PACKAGING': <Package className="w-5 h-5" />,
    'PAYMENT METHODS': <CreditCard className="w-5 h-5" />,
    'SHIPPING & DELIVERY': <Truck className="w-5 h-5" />,
};

const categoryColors: { [key: string]: string } = {
    'PRODUCT & USAGE': 'text-black border-navy-900 bg-gold-50/50',
    'ORDERING & PACKAGING': 'text-black border-navy-900 bg-gold-50/50',
    'PAYMENT METHODS': 'text-black border-navy-900 bg-gold-50/50',
    'SHIPPING & DELIVERY': 'text-black border-navy-900 bg-gold-50/50',
};

const FAQ: React.FC = () => {
    const { faqs, categories, loading } = useFAQs();
    const [openItems, setOpenItems] = useState<Set<string>>(new Set());
    const [activeCategory, setActiveCategory] = useState<string | null>(null);

    const toggleItem = (id: string) => {
        setOpenItems(prev => {
            const newSet = new Set(prev);
            if (newSet.has(id)) {
                newSet.delete(id);
            } else {
                newSet.add(id);
            }
            return newSet;
        });
    };

    const filteredFAQs = activeCategory
        ? faqs.filter(faq => faq.category === activeCategory)
        : faqs;

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-navy-900 border-t-transparent rounded-full" />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b-4 border-navy-900 sticky top-0 z-10 shadow-sm">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex items-center gap-4">
                        <a
                            href="/"
                            className="p-2 hover:bg-gray-100 rounded-lg transition-colors group"
                        >
                            <ArrowLeft className="w-5 h-5 text-gray-600 group-hover:text-navy-900" />
                        </a>
                        <div className="flex items-center gap-2">
                            <HelpCircle className="w-6 h-6 text-black" />
                            <h1 className="text-xl md:text-2xl font-bold text-black">Frequently Asked Questions</h1>
                        </div>
                    </div>
                </div>
            </div>

            <div className="container mx-auto px-4 py-8 max-w-4xl">
                {/* Category Filter */}
                <div className="flex flex-wrap gap-2 mb-8">
                    <button
                        onClick={() => setActiveCategory(null)}
                        className={`px-6 py-2.5 rounded-full text-sm font-bold transition-all border shadow-sm ${activeCategory === null
                            ? 'bg-navy-900 text-black border-navy-900 shadow-md transform scale-105'
                            : 'bg-white text-black border-navy-900 hover:bg-navy-50'
                            }`}
                    >
                        All
                    </button>
                    {categories.map(category => (
                        <button
                            key={category}
                            onClick={() => setActiveCategory(category)}
                            className={`px-4 py-2.5 rounded-full text-xs md:text-sm font-bold transition-all flex items-center gap-2 border shadow-sm ${activeCategory === category
                                ? 'bg-navy-900 text-white border-navy-900 shadow-md transform scale-105'
                                : 'bg-white text-black border-navy-900 hover:bg-navy-50 hover:text-black'
                                }`}
                        >
                            <span className={activeCategory === category ? 'text-black' : 'text-black'}>
                                {categoryIcons[category]}
                            </span>
                            {category}
                        </button>
                    ))}
                </div>

                {/* FAQ Items by Category */}
                {(activeCategory ? [activeCategory] : categories).map(category => (
                    <div key={category} className="mb-10">
                        {/* Section Header */}
                        <div className="flex items-center gap-3 mb-6 px-4 py-3 rounded-lg border border-navy-900 bg-white shadow-sm w-full">
                            <span className="text-black">
                                {categoryIcons[category] || <HelpCircle className="w-5 h-5" />}
                            </span>
                            <h2 className="font-bold text-sm md:text-base uppercase tracking-wide text-black">{category}</h2>
                        </div>

                        <div className="space-y-4">
                            {filteredFAQs
                                .filter(faq => faq.category === category)
                                .map(faq => (
                                    <div
                                        key={faq.id}
                                        className="bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all duration-200"
                                    >
                                        <button
                                            onClick={() => toggleItem(faq.id)}
                                            className="w-full px-6 py-5 flex items-start justify-between text-left group gap-4"
                                        >
                                            <span className="font-bold text-black text-base md:text-lg group-hover:text-black transition-colors leading-snug">
                                                {faq.question}
                                            </span>
                                            {openItems.has(faq.id) ? (
                                                <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 text-gray-400 group-hover:text-navy-900 flex-shrink-0 transition-colors mt-1" />
                                            )}
                                        </button>
                                        {openItems.has(faq.id) && (
                                            <div className="px-6 pb-6 pt-0">
                                                <div className="h-px w-full bg-gray-100 mb-4"></div>
                                                <p className="text-black whitespace-pre-line leading-relaxed text-base">
                                                    {faq.answer}
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default FAQ;
