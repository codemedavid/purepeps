import React from 'react';
import { useCategories } from '../hooks/useCategories';

interface SubNavProps {
    selectedCategory: string;
    onCategoryClick: (categoryId: string) => void;
}

const SubNav: React.FC<SubNavProps> = ({ selectedCategory, onCategoryClick }) => {
    const { categories, loading } = useCategories();

    if (loading) {
        return (
            <div className="bg-white/95 backdrop-blur-xl border-b border-gray-100 hidden md:block">
                <div className="container mx-auto px-4 py-4">
                    <div className="flex space-x-3 overflow-x-auto">
                        {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className="animate-pulse bg-gray-100 h-10 w-32 rounded-lg" />
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <nav className="bg-white/95 backdrop-blur-xl sticky top-[69px] sm:top-[81px] z-40 border-b border-gray-100 shadow-soft">
            <div className="container mx-auto px-4">
                <div className="flex items-center gap-2 py-3 sm:py-4 overflow-x-auto scrollbar-hide -mx-4 px-4 pr-8 sm:mx-0 sm:px-0 sm:pr-0 snap-x snap-mandatory">
                    {categories.map((category) => {
                        const isSelected = selectedCategory === category.id;

                        return (
                            <button
                                key={category.id}
                                onClick={() => onCategoryClick(category.id)}
                                className={`
                  shrink-0 snap-start flex items-center space-x-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-lg font-bold whitespace-nowrap
                  transition-all duration-300 text-xs sm:text-sm uppercase tracking-wider
                  ${isSelected
                                        ? 'bg-brand-600 text-white shadow-glow'
                                        : 'bg-white text-charcoal-500 hover:text-brand-600 hover:bg-brand-50 border border-brand-100'
                                    }
                `}
                            >
                                <span>{category.name}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Hide scrollbar for better aesthetics */}
            <style>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
        </nav>
    );
};

export default SubNav;
