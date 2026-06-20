import { useRef } from 'react';
import { LayoutDashboard, ShoppingCart, SlidersHorizontal, Truck, History } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export type GroupBuyTab = 'overview' | 'orders' | 'caps' | 'shipping' | 'history';

interface TabDef {
  id: GroupBuyTab;
  label: string;
  icon: LucideIcon;
}

const TABS: readonly TabDef[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'caps', label: 'Items & Caps', icon: SlidersHorizontal },
  { id: 'shipping', label: 'Shipping', icon: Truck },
  { id: 'history', label: 'History', icon: History },
];

interface GroupBuyTabsProps {
  active: GroupBuyTab;
  onChange: (tab: GroupBuyTab) => void;
  /** Optional count badges keyed by tab id (e.g. orders total, to-confirm). */
  badges?: Partial<Record<GroupBuyTab, number>>;
}

/**
 * Primary section navigation for the Group Buy command center. Horizontally
 * scrollable on small screens; an accessible tablist so each section is a real
 * tab with aria-selected state. Optional badges surface counts (orders, etc.).
 */
export function GroupBuyTabs({ active, onChange, badges }: GroupBuyTabsProps) {
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // WAI-ARIA tabs keyboard pattern: arrows move + activate, Home/End jump to ends.
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const lastIndex = TABS.length - 1;
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = index === lastIndex ? 0 : index + 1;
    else if (event.key === 'ArrowLeft') nextIndex = index === 0 ? lastIndex : index - 1;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = lastIndex;
    if (nextIndex === null) return;
    event.preventDefault();
    onChange(TABS[nextIndex].id);
    tabRefs.current[nextIndex]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Group buy sections"
      className="flex gap-1 overflow-x-auto rounded-xl border border-gray-200 bg-white p-1 shadow-sm scrollbar-none"
    >
      {TABS.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = tab.id === active;
        const badge = badges?.[tab.id];
        return (
          <button
            key={tab.id}
            ref={(el) => (tabRefs.current[index] = el)}
            type="button"
            role="tab"
            id={`gb-tab-${tab.id}`}
            aria-selected={isActive}
            aria-controls={`gb-tabpanel-${tab.id}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
              isActive
                ? 'bg-brand-400 text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Icon className="h-4 w-4" />
            <span className="whitespace-nowrap">{tab.label}</span>
            {badge != null && badge > 0 && (
              <span
                className={`ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none ${
                  isActive ? 'bg-white text-brand-600' : 'bg-gray-200 text-gray-700'
                }`}
              >
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default GroupBuyTabs;
