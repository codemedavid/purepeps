import { useMemo, useState } from 'react';
import { Users, RefreshCw, Search, X, Clock, CheckCircle2, Layers, Check } from 'lucide-react';
import type { AccessRequest, AccessStatus } from '../../utils/access';
import type { CatalogTier } from '../../hooks/useTierCatalog';
import { formatPrice } from '../../utils/currency';
import { peso } from './orderStatusStyles';

interface BatchMembersPanelProps {
  batchNumber: number;
  members: AccessRequest[];
  loading: boolean;
  onReload: () => void;
  /** Selectable tiers for the inline corrector. Omit to render the roster read-only. */
  tiers?: CatalogTier[];
  /** Applies a tier change to a member's request. Omit to render the roster read-only. */
  onSetTier?: (id: string, tierId: string, tierName: string) => Promise<{ success: boolean; error?: string }>;
}

type MemberFilter = 'all' | Extract<AccessStatus, 'approved' | 'pending'>;

const FILTERS: readonly { value: MemberFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'approved', label: 'Unlocked' },
  { value: 'pending', label: 'Awaiting review' },
];

const STATUS_CHIP: Record<'approved' | 'pending', { label: string; className: string }> = {
  approved: { label: 'Unlocked', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' },
};

/**
 * Roster of every member who subscribed to the selected group-buy batch — the
 * paid access requests, both approved (checkout unlocked) and pending (paid,
 * awaiting review). Search by email, filter by status, see each member's tier
 * and amount. When `tiers` + `onSetTier` are provided, each row also gets an
 * inline tier corrector so the admin can fix/upgrade access right here.
 */
export function BatchMembersPanel({
  batchNumber,
  members,
  loading,
  onReload,
  tiers,
  onSetTier,
}: BatchMembersPanelProps) {
  const [filter, setFilter] = useState<MemberFilter>('all');
  const [query, setQuery] = useState('');
  // Inline tier corrector: which member row is open, the tier picked, busy + error.
  const canEditTier = Boolean(onSetTier && tiers && tiers.length > 0);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctTierId, setCorrectTierId] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleSetTier = async (id: string) => {
    const tier = tiers?.find((t) => t.id === correctTierId);
    if (!onSetTier || !tier) {
      setActionError('Choose a tier to assign.');
      return;
    }
    setBusyId(id);
    setActionError(null);
    const result = await onSetTier(id, tier.id, tier.name);
    setBusyId(null);
    if (!result.success) {
      setActionError(result.error ?? 'Failed to update access tier.');
      return;
    }
    setCorrectingId(null);
    setCorrectTierId('');
    onReload();
  };

  const counts = useMemo(() => {
    let approved = 0;
    let pending = 0;
    for (const m of members) {
      if (m.status === 'approved') approved += 1;
      else if (m.status === 'pending') pending += 1;
    }
    return { approved, pending };
  }, [members]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => {
      if (filter !== 'all' && m.status !== filter) return false;
      if (q && !m.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [members, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-400">
            <Users className="h-5 w-5" />
          </span>
          <div>
            <h3 className="text-sm font-bold text-gray-900">Batch #{batchNumber} members</h3>
            <p className="text-xs text-gray-500">
              {counts.approved} unlocked · {counts.pending} awaiting review
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onReload}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
              filter === f.value
                ? 'border-brand-400 bg-brand-400 text-white'
                : 'border-gray-200 bg-white text-gray-600 hover:border-brand-200'
            }`}
          >
            {f.label}
          </button>
        ))}
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search email…"
            className="w-48 rounded-lg border border-gray-200 py-2 pl-8 pr-7 text-xs text-gray-800 focus:outline-none focus:ring-2 focus:ring-brand-200"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      {loading && members.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">Loading members…</p>
      ) : visible.length === 0 ? (
        <div className="py-12 text-center text-gray-400">
          <Users className="mx-auto mb-3 h-10 w-10 opacity-40" />
          <p className="text-sm">No members match this view.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {visible.map((m) => {
            const chip = m.status === 'approved' ? STATUS_CHIP.approved : STATUS_CHIP.pending;
            const StatusIcon = m.status === 'approved' ? CheckCircle2 : Clock;
            const isCorrecting = correctingId === m.id;
            return (
              <li key={m.id} className="px-4 py-3">
                <div className="flex items-center gap-3">
                  <StatusIcon
                    className={`h-4 w-4 shrink-0 ${
                      m.status === 'approved' ? 'text-emerald-500' : 'text-amber-500'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-gray-900">{m.email}</p>
                    <p className="truncate text-xs text-gray-500">
                      {m.tier_name ?? 'Legacy access'} · {peso(Number(m.amount))} ·{' '}
                      {new Date(m.created_at).toLocaleDateString('en-PH')}
                    </p>
                  </div>
                  {canEditTier && (
                    <button
                      type="button"
                      onClick={() => {
                        setActionError(null);
                        if (isCorrecting) {
                          setCorrectingId(null);
                          setCorrectTierId('');
                        } else {
                          setCorrectingId(m.id);
                          setCorrectTierId(m.tier_id ?? '');
                        }
                      }}
                      disabled={busyId === m.id}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1 text-[11px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60"
                      title="Change this member's access tier"
                    >
                      <Layers className="h-3.5 w-3.5" /> Change tier
                    </button>
                  )}
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${chip.className}`}
                  >
                    {chip.label}
                  </span>
                </div>
                {isCorrecting && canEditTier && (
                  <div className="mt-2 ml-7 rounded-lg border border-gray-200 bg-gray-50 p-2.5 space-y-2">
                    <label className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-600">
                      <Layers className="h-3.5 w-3.5" /> Assign tier
                    </label>
                    <select
                      value={correctTierId}
                      onChange={(e) => setCorrectTierId(e.target.value)}
                      className="w-full rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800"
                    >
                      <option value="">Choose a tier…</option>
                      {tiers?.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} — {formatPrice(t.price)}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleSetTier(m.id)}
                        disabled={busyId === m.id || !correctTierId}
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-500 disabled:opacity-60"
                      >
                        <Check className="h-3.5 w-3.5" /> Set tier
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCorrectingId(null);
                          setCorrectTierId('');
                        }}
                        disabled={busyId === m.id}
                        className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-60"
                      >
                        Cancel
                      </button>
                    </div>
                    {actionError && <p className="text-[11px] font-medium text-red-600">{actionError}</p>}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default BatchMembersPanel;
