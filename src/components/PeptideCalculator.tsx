import React, { useState, useEffect } from 'react';
import { Calculator, RotateCcw, Syringe, Droplets, FlaskConical, AlertTriangle, ArrowLeft } from 'lucide-react';
import Header from './Header';
import Footer from './Footer';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../hooks/useCart';
import {
    BOTTOM_NAV_CLEARANCE,
    STOREFRONT_PATH,
    storefrontNavigationOptions,
} from '../utils/storefrontNavigation';

interface SyringeOption {
    id: string;
    name: string;
    unitsPerMl: number;
    maxVolume: number;
}

const SYRINGE_OPTIONS: SyringeOption[] = [
    { id: 'u100-1ml', name: 'U-100 Standard (1ml)', unitsPerMl: 100, maxVolume: 1.0 },
    { id: 'u100-0.5ml', name: 'U-100 Small (0.5ml)', unitsPerMl: 100, maxVolume: 0.5 },
    { id: 'u100-0.3ml', name: 'U-100 Micro (0.3ml)', unitsPerMl: 100, maxVolume: 0.3 },
    { id: 'u40-1ml', name: 'U-40 (1ml)', unitsPerMl: 40, maxVolume: 1.0 },
];

const PeptideCalculator: React.FC = () => {
    const [selectedSyringe, setSelectedSyringe] = useState<SyringeOption>(SYRINGE_OPTIONS[0]);
    const [selectedUnit, setSelectedUnit] = useState<'mg' | 'mcg'>('mg');
    const [vialQuantityMg, setVialQuantityMg] = useState<number | ''>('');
    const [waterAddedMl, setWaterAddedMl] = useState<number | ''>('');
    const [desiredDoseMg, setDesiredDoseMg] = useState<number | ''>('');

    const [resultUnits, setResultUnits] = useState<number | null>(null);
    const [resultMgPerUnit, setResultMgPerUnit] = useState<number | null>(null);

    const cart = useCart();
    const navigate = useNavigate();

    useEffect(() => {
        calculate();
    }, [vialQuantityMg, waterAddedMl, desiredDoseMg, selectedSyringe, selectedUnit]);

    const calculate = () => {
        if (vialQuantityMg && waterAddedMl && desiredDoseMg) {
            // Vial quantity is always in mg
            const vialMg = Number(vialQuantityMg);

            // Convert desired dose to mg if needed (1 mg = 1000 mcg)
            const doseMg = selectedUnit === 'mcg' ? Number(desiredDoseMg) / 1000 : Number(desiredDoseMg);

            // 1. Calculate concentration (mg/ml)
            const concentrationMgPerMl = vialMg / Number(waterAddedMl);

            // 2. Calculate volume to inject (ml)
            const volumeToInjectMl = doseMg / concentrationMgPerMl;

            // 3. Convert to Units (based on syringe type)
            // 1ml = unitsPerMl units
            const units = volumeToInjectMl * selectedSyringe.unitsPerMl;

            // Calculate mg per unit (tick mark)
            // Total mg in vial
            // Total units in vial = water (ml) * unitsPerMl
            // mg per unit = Total mg / Total units
            const totalMg = vialMg;
            const totalUnits = Number(waterAddedMl) * selectedSyringe.unitsPerMl;
            const mgPerUnit = totalMg / totalUnits;

            setResultUnits(Number(units.toFixed(1)));
            setResultMgPerUnit(Number(mgPerUnit.toFixed(4))); // 4 decimal places for mg accuracy
        } else {
            setResultUnits(null);
            setResultMgPerUnit(null);
        }
    };

    const handleReset = () => {
        setVialQuantityMg('');
        setWaterAddedMl('');
        setDesiredDoseMg('');
        setResultUnits(null);
        setResultMgPerUnit(null);
    };

    return (
        <div className={`min-h-screen bg-theme-bg font-inter flex flex-col ${BOTTOM_NAV_CLEARANCE}`}>
            <Header
                cartItemsCount={cart.getTotalItems()}
                onCartClick={() => navigate(STOREFRONT_PATH, storefrontNavigationOptions('cart'))}
                onMenuClick={() => navigate(STOREFRONT_PATH, storefrontNavigationOptions('home'))}
            />

            <main className="flex-grow container mx-auto px-4 py-8 md:py-12">
                <div className="max-w-3xl mx-auto">
                    {/* Back Button */}
                    <a
                        href="/"
                        className="inline-flex items-center gap-2 text-gray-600 hover:text-navy-900 mb-6 group"
                    >
                        <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
                        <span className="font-medium">Back to Shop</span>
                    </a>

                    {/* Header Section */}
                    <div className="text-center mb-10">
                        <div className="inline-flex items-center justify-center p-3 bg-navy-50 rounded-full mb-4">
                            <Calculator className="w-8 h-8 text-navy-900" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-theme-text mb-4">Peptide Calculator</h1>
                        <p className="text-gray-500 max-w-lg mx-auto">
                            Easily calculate your peptide dosage. Enter your vial size, the amount of bacteriostatic water added, and your desired dose.
                        </p>
                    </div>

                    <div className="grid md:grid-cols-2 gap-8 items-start">
                        {/* Calculator Card */}
                        <div className="bg-white rounded-2xl shadow-soft border border-gray-100 overflow-hidden">
                            <div className="bg-navy-900 px-6 py-4 border-b border-navy-800">
                                <h2 className="text-white font-medium flex items-center gap-2">
                                    <Calculator className="w-5 h-5 opacity-80" />
                                    Calculator Input
                                </h2>
                            </div>

                            <div className="p-6 md:p-8 space-y-6">
                                {/* Syringe Type Selection */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <Syringe className="w-4 h-4 text-purple-500" />
                                        Syringe Type
                                    </label>
                                    <select
                                        value={selectedSyringe.id}
                                        onChange={(e) => {
                                            const syringe = SYRINGE_OPTIONS.find(s => s.id === e.target.value);
                                            if (syringe) setSelectedSyringe(syringe);
                                        }}
                                        className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-1 focus:ring-navy-900 focus:border-navy-900 transition-all outline-none bg-white text-black appearance-none cursor-pointer"
                                        style={{ backgroundImage: 'url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns=\'http://www.w3.org/2000/svg\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'currentColor\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3e%3cpolyline points=\'6 9 12 15 18 9\'/%3e%3c/svg%3e")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 1rem center', backgroundSize: '1em' }}
                                    >
                                        {SYRINGE_OPTIONS.map((option) => (
                                            <option key={option.id} value={option.id}>
                                                {option.name}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-xs text-gray-400">Select the type of syringe you are using.</p>
                                </div>

                                {/* Vial Quantity */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <FlaskConical className="w-4 h-4 text-gold-500" />
                                        Vial Size (Quantity)
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={vialQuantityMg}
                                            onChange={(e) => setVialQuantityMg(Number(e.target.value))}
                                            placeholder="e.g. 5, 10, 15"
                                            className="w-full pl-4 pr-12 py-3 border border-gray-200 rounded-lg focus:ring-1 focus:ring-navy-900 focus:border-navy-900 transition-all outline-none text-black"
                                        />
                                        <div className="absolute inset-y-0 right-0 flex items-center px-4 bg-gray-50 border-l border-gray-200 rounded-r-lg text-gray-500 text-sm font-medium">
                                            mg
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400">Total amount of peptide in the vial (milligrams).</p>
                                </div>

                                {/* Water Added */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <Droplets className="w-4 h-4 text-blue-500" />
                                        Bacteriostatic Water Added
                                    </label>
                                    <div className="relative">
                                        <input
                                            type="number"
                                            value={waterAddedMl}
                                            onChange={(e) => setWaterAddedMl(Number(e.target.value))}
                                            placeholder="e.g. 1, 2, 3"
                                            className="w-full pl-4 pr-12 py-3 border border-gray-200 rounded-lg focus:ring-1 focus:ring-navy-900 focus:border-navy-900 transition-all outline-none text-black"
                                        />
                                        <div className="absolute inset-y-0 right-0 flex items-center px-4 bg-gray-50 border-l border-gray-200 rounded-r-lg text-gray-500 text-sm font-medium">
                                            ml
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400">Amount of water mixed into the vial (milliliters).</p>
                                </div>

                                {/* Desired Dose */}
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 flex items-center gap-2">
                                        <Syringe className="w-4 h-4 text-red-500" />
                                        Desired Dose
                                    </label>
                                    <div className="flex gap-2">
                                        <div className="relative flex-1">
                                            <input
                                                type="number"
                                                value={desiredDoseMg}
                                                onChange={(e) => setDesiredDoseMg(Number(e.target.value))}
                                                placeholder={selectedUnit === 'mg' ? 'e.g. 0.25, 0.5' : 'e.g. 250, 500'}
                                                className="w-full pl-4 pr-16 py-3 border border-gray-200 rounded-lg focus:ring-1 focus:ring-navy-900 focus:border-navy-900 transition-all outline-none text-black"
                                            />
                                            <div className="absolute inset-y-0 right-0 flex items-center px-4 bg-gray-50 border-l border-gray-200 rounded-r-lg text-gray-500 text-sm font-medium">
                                                {selectedUnit}
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            <button
                                                type="button"
                                                onClick={() => setSelectedUnit('mg')}
                                                className={`px-4 py-3 border rounded-lg font-medium transition-all text-sm ${selectedUnit === 'mg'
                                                    ? 'bg-navy-900 text-white border-navy-900'
                                                    : 'bg-white text-gray-700 border-gray-200 hover:border-navy-900'
                                                    }`}
                                            >
                                                mg
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setSelectedUnit('mcg')}
                                                className={`px-4 py-3 border rounded-lg font-medium transition-all text-sm ${selectedUnit === 'mcg'
                                                    ? 'bg-navy-900 text-white border-navy-900'
                                                    : 'bg-white text-gray-700 border-gray-200 hover:border-navy-900'
                                                    }`}
                                            >
                                                mcg
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-400">The dose you want to administer ({selectedUnit === 'mg' ? 'milligrams' : 'micrograms'}).</p>
                                </div>

                                {/* Reset Button */}
                                <button
                                    onClick={handleReset}
                                    className="w-full py-2 text-sm text-gray-500 hover:text-navy-900 hover:bg-gray-50 rounded-lg transition-colors flex items-center justify-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Reset Calculator
                                </button>
                            </div>
                        </div>

                        {/* Results Card */}
                        <div className={`bg-white rounded-2xl shadow-soft border border-gray-100 overflow-hidden transition-all duration-300 ${resultUnits !== null ? 'opacity-100 translate-y-0' : 'opacity-50 translate-y-4'}`}>
                            <div className="px-6 py-8 bg-gradient-to-r from-blue-600 to-blue-700">
                                <div className="text-center text-white">
                                    <p className="text-5xl md:text-6xl font-black mb-2">{resultUnits || '0'}</p>
                                    <p className="text-lg font-medium opacity-90">Units</p>
                                    <p className="text-sm opacity-75 mt-1">Draw to this mark on your {selectedSyringe.name}</p>
                                </div>
                            </div>

                            <div className="p-6 md:p-8">
                                {resultUnits !== null ? (
                                    <>
                                        {resultUnits > (selectedSyringe.maxVolume * selectedSyringe.unitsPerMl) ? (
                                            <div className="mb-6 p-3 bg-red-50 border border-red-100 rounded-lg flex items-center gap-2 text-left animate-pulse">
                                                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
                                                <p className="text-sm text-red-700 font-medium">
                                                    Warning: This dose ({resultUnits} units) exceeds the capacity of your selected syringe ({selectedSyringe.maxVolume * selectedSyringe.unitsPerMl} units).
                                                </p>
                                            </div>
                                        ) : null}

                                        {/* Horizontal Syringe Visualization */}
                                        <div className="mb-8">
                                            <svg width="100%" height="140" viewBox="0 0 420 140" className="mx-auto" preserveAspectRatio="xMidYMid meet">
                                                <defs>
                                                    <linearGradient id="barrelGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                                                        <stop offset="0%" style={{ stopColor: '#f8fafc', stopOpacity: 1 }} />
                                                        <stop offset="50%" style={{ stopColor: '#ffffff', stopOpacity: 1 }} />
                                                        <stop offset="100%" style={{ stopColor: '#f1f5f9', stopOpacity: 1 }} />
                                                    </linearGradient>
                                                    <linearGradient id="fluidGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                                        <stop offset="0%" style={{ stopColor: '#3b82f6', stopOpacity: 0.9 }} />
                                                        <stop offset="50%" style={{ stopColor: '#2563eb', stopOpacity: 0.95 }} />
                                                        <stop offset="100%" style={{ stopColor: '#1d4ed8', stopOpacity: 0.9 }} />
                                                    </linearGradient>
                                                    <filter id="shadow">
                                                        <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.15" />
                                                    </filter>
                                                    <filter id="innerShadow">
                                                        <feGaussianBlur in="SourceAlpha" stdDeviation="2" />
                                                        <feOffset dx="0" dy="2" result="offsetblur" />
                                                        <feComponentTransfer>
                                                            <feFuncA type="linear" slope="0.3" />
                                                        </feComponentTransfer>
                                                        <feMerge>
                                                            <feMergeNode />
                                                            <feMergeNode in="SourceGraphic" />
                                                        </feMerge>
                                                    </filter>
                                                </defs>

                                                {/* Plunger - Enhanced */}
                                                <g filter="url(#shadow)">
                                                    <rect x="15" y="40" width="18" height="50" rx="4" fill="#2c3e50" />
                                                    <circle cx="24" cy="65" r="10" fill="#34495e" stroke="#2c3e50" strokeWidth="2" />
                                                    <circle cx="24" cy="65" r="4" fill="#95a5a6" opacity="0.6" />
                                                </g>

                                                {/* Barrel - Enhanced with inner shadow */}
                                                <g filter="url(#shadow)">
                                                    <rect x="33" y="35" width="340" height="60" rx="10" fill="url(#barrelGradient)" stroke="#cbd5e1" strokeWidth="2.5" />
                                                    <rect x="35" y="37" width="336" height="56" rx="9" fill="none" stroke="#e2e8f0" strokeWidth="1" opacity="0.6" />
                                                </g>

                                                {/* Measurement scale markings - Improved */}
                                                {Array.from({ length: 11 }, (_, i) => {
                                                    const maxUnits = selectedSyringe.maxVolume * selectedSyringe.unitsPerMl;
                                                    // Reverse the scale: 0 at needle (right), max at plunger (left)
                                                    const unitValue = (maxUnits / 10) * (10 - i);
                                                    const xPos = 43 + (320 * i / 10);
                                                    const isMajorTick = i % 2 === 0;
                                                    return (
                                                        <g key={i}>
                                                            <line
                                                                x1={xPos}
                                                                y1="38"
                                                                x2={xPos}
                                                                y2={isMajorTick ? "28" : "32"}
                                                                stroke={isMajorTick ? "#1e40af" : "#60a5fa"}
                                                                strokeWidth={isMajorTick ? "2" : "1.5"}
                                                            />
                                                            {isMajorTick && (
                                                                <text
                                                                    x={xPos}
                                                                    y="20"
                                                                    fontSize="11"
                                                                    fill="#1e3a8a"
                                                                    textAnchor="middle"
                                                                    fontWeight="700"
                                                                    fontFamily="system-ui, -apple-system, sans-serif"
                                                                >
                                                                    {Math.round(unitValue)}
                                                                </text>
                                                            )}
                                                        </g>
                                                    );
                                                })}

                                                {/* Fluid level - Enhanced with glow, fills from right to left */}
                                                {resultUnits && (
                                                    <>
                                                        <rect
                                                            x={358 - Math.min(320, (resultUnits / (selectedSyringe.maxVolume * selectedSyringe.unitsPerMl)) * 320)}
                                                            y="40"
                                                            width={Math.min(320, (resultUnits / (selectedSyringe.maxVolume * selectedSyringe.unitsPerMl)) * 320)}
                                                            height="50"
                                                            rx="7"
                                                            fill="url(#fluidGradient)"
                                                            filter="url(#innerShadow)"
                                                        />
                                                        {/* Dose indicator line */}
                                                        <line
                                                            x1={358 - Math.min(320, (resultUnits / (selectedSyringe.maxVolume * selectedSyringe.unitsPerMl)) * 320)}
                                                            y1="35"
                                                            x2={358 - Math.min(320, (resultUnits / (selectedSyringe.maxVolume * selectedSyringe.unitsPerMl)) * 320)}
                                                            y2="95"
                                                            stroke="#dc2626"
                                                            strokeWidth="2.5"
                                                            strokeDasharray="4,2"
                                                        />
                                                    </>
                                                )}

                                                {/* Needle tip - Enhanced */}
                                                <g filter="url(#shadow)">
                                                    <path d="M 373 50 L 398 58 L 398 72 L 373 80 Z" fill="#94a3b8" stroke="#64748b" strokeWidth="1.5" />
                                                    <rect x="395" y="60" width="22" height="10" rx="1" fill="#71717a" />
                                                    <line x1="417" y1="63" x2="417" y2="67" stroke="#3f3f46" strokeWidth="1" />
                                                </g>

                                                {/* Capacity label - Enhanced */}
                                                <text x="363" y="115" fontSize="12" fill="#1e40af" textAnchor="end" fontWeight="700" fontFamily="system-ui, -apple-system, sans-serif">
                                                    {selectedSyringe.maxVolume * selectedSyringe.unitsPerMl} units ({selectedSyringe.maxVolume}ml)
                                                </text>
                                            </svg>
                                        </div>

                                        <div className="w-full bg-gray-50 rounded-xl p-4 border border-gray-100 space-y-3">
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500">Volume</span>
                                                <span className="font-semibold text-gray-900">{(resultUnits / selectedSyringe.unitsPerMl).toFixed(2)} ml</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm">
                                                <span className="text-gray-500">Total Concentration</span>
                                                <span className="font-semibold text-gray-900">{resultMgPerUnit && (resultMgPerUnit * selectedSyringe.unitsPerMl).toFixed(2)} mg/ml</span>
                                            </div>
                                            <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-200">
                                                <span className="text-gray-500 font-medium">Each Tick Mark (1 Unit)</span>
                                                <span className="font-bold text-gold-600">{resultMgPerUnit} mg</span>
                                            </div>
                                            {selectedSyringe.unitsPerMl !== 100 && (
                                                <div className="flex justify-between items-center text-sm pt-2 border-t border-gray-200 text-amber-600">
                                                    <span className="font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Note</span>
                                                    <span className="font-semibold">Using U-40 Syringe</span>
                                                </div>
                                            )}
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center text-gray-400 py-10">
                                        <Calculator className="w-16 h-16 mx-auto mb-4 opacity-20" />
                                        <p className="text-lg">Enter values to see results</p>
                                        <p className="text-sm opacity-60 mt-1">Fill in all fields on the left</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="mt-12 p-6 bg-blue-50 rounded-xl border border-blue-100 animate-fadeIn">
                        <h3 className="font-bold text-navy-900 mb-2 flex items-center gap-2">
                            <span className="bg-blue-100 p-1 rounded">ℹ️</span> Disclaimer
                        </h3>
                        <p className="text-sm text-blue-800 leading-relaxed">
                            This calculator is for educational and informational purposes only. It is not intended to be a substitute for professional medical advice, diagnosis, or treatment. Always verify calculations and consult with a qualified healthcare provider before administering any medication or peptide.
                        </p>
                    </div>
                </div>
            </main>

            <Footer />
        </div>
    );
};

export default PeptideCalculator;
