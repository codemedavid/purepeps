import { ShoppingCart, Wallet, Clock, CheckCircle2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BatchKpis } from '../../utils/groupBuyOverview';
import { compactPeso } from './orderStatusStyles';

interface BatchKpiStripProps {
  kpis: BatchKpis;
}

interface Tile {
  label: string;
  value: string;
  icon: LucideIcon;
  accent: string;
  /** Emphasise tiles that demand attention (e.g. orders still to confirm). */
  highlight?: boolean;
  hint?: string;
}

/**
 * At-a-glance KPI strip for the selected batch: live orders, money collected,
 * orders awaiting confirmation, and paid count. Each tile is a labelled group so
 * screen readers announce "<label>: <value>". Numbers come from the pure
 * computeBatchKpis selector.
 */
export function BatchKpiStrip({ kpis }: BatchKpiStripProps) {
  const tiles: Tile[] = [
    {
      label: 'Orders',
      value: String(kpis.activeOrders),
      icon: ShoppingCart,
      accent: 'text-brand-400 bg-brand-50',
      hint: kpis.cancelledOrders > 0 ? `${kpis.cancelledOrders} cancelled` : undefined,
    },
    {
      label: 'Revenue',
      value: compactPeso(kpis.paidRevenue),
      icon: Wallet,
      accent: 'text-sakura-sage bg-sakura-sage-soft',
      hint: kpis.grossRevenue > kpis.paidRevenue ? `${compactPeso(kpis.grossRevenue)} gross` : undefined,
    },
    {
      label: 'To confirm',
      value: String(kpis.toConfirmCount),
      icon: Clock,
      accent: 'text-amber-600 bg-amber-50',
      highlight: kpis.toConfirmCount > 0,
    },
    {
      label: 'Paid',
      value: String(kpis.paidOrders),
      icon: CheckCircle2,
      accent: 'text-blue-600 bg-blue-50',
      hint: kpis.claimOrders > 0 ? `${kpis.claimOrders} claims` : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
      {tiles.map((tile) => {
        const Icon = tile.icon;
        return (
          <div
            key={tile.label}
            role="group"
            aria-label={`${tile.label}: ${tile.value}`}
            className={`rounded-xl border bg-white px-3 py-2.5 shadow-sm transition-colors ${
              tile.highlight ? 'border-amber-300 ring-1 ring-amber-200' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center gap-2">
              <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${tile.accent}`}>
                <Icon className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {tile.label}
              </span>
            </div>
            <p className="mt-1.5 text-xl font-bold text-gray-900 leading-none">{tile.value}</p>
            {tile.hint && <p className="mt-1 text-[11px] text-gray-500">{tile.hint}</p>}
          </div>
        );
      })}
    </div>
  );
}

export default BatchKpiStrip;
