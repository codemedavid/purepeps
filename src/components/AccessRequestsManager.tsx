import { useEffect, useMemo, useState } from 'react';
import { Ban, Check, Clock, RefreshCw, X } from 'lucide-react';
import { useAccessRequests } from '../hooks/useAccessRequests';
import { formatPrice } from '../utils/currency';
import type { AccessStatus } from '../utils/access';

type Filter = 'all' | AccessStatus;

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'pending', label: 'Pending' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'all', label: 'All' },
];

const STATUS_STYLES: Record<AccessStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected: 'bg-red-50 text-red-600 border-red-200',
};

interface AccessRequestsManagerProps {
  /** Called after a successful approve/reject/revoke so parents can refresh derived counts. */
  onChange?: () => void;
}

/** Admin view for reviewing paid group-buy access requests. */
function AccessRequestsManager({ onChange }: AccessRequestsManagerProps) {
  const { requests, loading, error, fetchAll, updateStatus } = useAccessRequests();
  const [filter, setFilter] = useState<Filter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const filtered = useMemo(
    () => (filter === 'all' ? requests : requests.filter((r) => r.status === filter)),
    [requests, filter],
  );

  const handleUpdate = async (id: string, status: AccessStatus) => {
    setBusyId(id);
    setActionError(null);
    const result = await updateStatus(id, status);
    setBusyId(null);
    if (!result.success) {
      setActionError(result.error ?? 'Failed to update access request.');
      return;
    }
    onChange?.();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold text-charcoal-900">Access Requests</h2>
          <p className="text-sm text-charcoal-500">Approve paid members to unlock checkout.</p>
        </div>
        <button
          onClick={() => fetchAll()}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-charcoal-200 text-sm font-medium text-charcoal-700 hover:bg-charcoal-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const count = f.id === 'all' ? requests.length : requests.filter((r) => r.status === f.id).length;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-4 py-2 rounded-full text-sm font-semibold border transition-colors ${
                filter === f.id
                  ? 'bg-sakura-primary text-white border-sakura-primary'
                  : 'bg-white text-charcoal-600 border-charcoal-200 hover:border-sakura-primary/40'
              }`}
            >
              {f.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {error && <div className="text-sm text-red-600">{error}</div>}
      {actionError && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {actionError}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-charcoal-400">
          <Clock className="w-10 h-10 mx-auto mb-3 opacity-50" />
          No {filter === 'all' ? '' : filter} access requests.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {filtered.map((req) => (
            <div key={req.id} className="bg-white border border-charcoal-100 rounded-2xl p-4 flex gap-4">
              <div className="w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-sakura-blush-soft border border-sakura-edge flex items-center justify-center">
                {req.payment_proof_url ? (
                  <a href={req.payment_proof_url} target="_blank" rel="noopener noreferrer">
                    <img src={req.payment_proof_url} alt="Proof" className="w-20 h-20 object-cover" />
                  </a>
                ) : (
                  <span className="text-[10px] text-charcoal-400">No proof</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-charcoal-900 text-sm truncate">{req.email}</span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${STATUS_STYLES[req.status]}`}
                  >
                    {req.status}
                  </span>
                </div>
                <div className="font-mono text-xs text-charcoal-500 mt-1">
                  {formatPrice(Number(req.amount))} · {req.payment_method_name ?? 'Payment'}
                  {req.batch_number != null && (
                    <span className="ml-1.5 inline-block px-1.5 py-0.5 rounded bg-sakura-blush-soft text-sakura-deep border border-sakura-edge">
                      Batch #{req.batch_number}
                    </span>
                  )}
                </div>
                <div className="font-mono text-[11px] text-charcoal-400 mt-0.5">
                  {new Date(req.created_at).toLocaleString('en-PH')}
                </div>
                <div className="flex gap-2 mt-3">
                  {req.status !== 'approved' && (
                    <button
                      onClick={() => handleUpdate(req.id, 'approved')}
                      disabled={busyId === req.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-60"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                  )}
                  {req.status === 'pending' && (
                    <button
                      onClick={() => handleUpdate(req.id, 'rejected')}
                      disabled={busyId === req.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold disabled:opacity-60"
                    >
                      <X className="w-3.5 h-3.5" /> Reject
                    </button>
                  )}
                  {req.status === 'approved' && (
                    <button
                      onClick={() => handleUpdate(req.id, 'rejected')}
                      disabled={busyId === req.id}
                      className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold disabled:opacity-60"
                      title="Revoke this member's access"
                    >
                      <Ban className="w-3.5 h-3.5" /> Revoke
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AccessRequestsManager;
