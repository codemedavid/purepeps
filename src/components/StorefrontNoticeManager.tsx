import { useMemo, useState } from 'react';
import { Archive, BellRing, Copy, Edit3, Plus, Search, Trash2 } from 'lucide-react';
import { useStorefrontNoticesAdmin, type ManagedStorefrontNotice } from '../hooks/useStorefrontNoticesAdmin';
import { createBlankStorefrontNotice, type StorefrontNotice } from '../utils/storefrontNotice';
import { getActionErrorMessage } from '../utils/errorMessage';
import StorefrontNoticeEditor from './StorefrontNoticeEditor';

const statusClasses = {
  draft: 'bg-amber-50 text-amber-700',
  published: 'bg-emerald-50 text-emerald-700',
  archived: 'bg-gray-100 text-gray-600',
};

export default function StorefrontNoticeManager() {
  const {
    notices,
    loading,
    error,
    saveDraft,
    publishNotice,
    archiveNotice,
    deleteNotice,
    duplicateNotice,
  } = useStorefrontNoticesAdmin();
  const [editing, setEditing] = useState<StorefrontNotice | null>(null);
  const [search, setSearch] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return term
      ? notices.filter((notice) => `${notice.internalName} ${notice.title}`.toLowerCase().includes(term))
      : notices;
  }, [notices, search]);

  const perform = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
    } catch (err) {
      setActionError(getActionErrorMessage(err, 'Notice action failed'));
    }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">Loading notices...</div>;

  if (editing) {
    return (
      <StorefrontNoticeEditor
        notice={editing}
        onCancel={() => setEditing(null)}
        onSave={async (draft) => {
          await saveDraft(draft);
          setEditing(null);
        }}
        onPublish={async (draft, asNewVersion) => {
          await publishNotice(draft, asNewVersion);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
      <div className="flex flex-col gap-4 border-b border-gray-100 p-6 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-brand-50 p-2.5"><BellRing className="h-6 w-6 text-brand-400" /></div>
          <div>
            <h2 className="text-xl font-bold text-gray-900">Notice Manager</h2>
            <p className="mt-1 text-sm text-gray-500">Create, target, schedule, publish, and measure storefront notices.</p>
          </div>
        </div>
        <button type="button" onClick={() => setEditing(createBlankStorefrontNotice())} className="inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-2.5 text-sm font-bold text-white hover:bg-gray-800">
          <Plus className="h-4 w-4" /> Create Notice
        </button>
      </div>

      <div className="p-6">
        <label className="relative block max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <span className="sr-only">Search notices</span>
          <input aria-label="Search notices" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notices" className="w-full rounded-xl border border-gray-200 py-2.5 pl-10 pr-3 text-sm focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200" />
        </label>

        {(error || actionError) && <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{actionError ?? error}</p>}

        {filtered.length === 0 ? (
          <div className="py-16 text-center">
            <BellRing className="mx-auto h-10 w-10 text-gray-300" />
            <p className="mt-3 font-medium text-gray-700">No notices found</p>
            <p className="mt-1 text-sm text-gray-500">Create a draft or change your search.</p>
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            {filtered.map((notice) => (
              <NoticeCard
                key={notice.id}
                notice={notice}
                onEdit={() => setEditing({ ...notice, pageIds: [...notice.pageIds] })}
                onDuplicate={() => void perform(() => duplicateNotice(notice))}
                onArchive={() => {
                  if (window.confirm(`Archive “${notice.internalName}”?`)) void perform(() => archiveNotice(notice));
                }}
                onDelete={() => {
                  if (window.confirm(`Permanently delete “${notice.internalName}”?`)) void perform(() => deleteNotice(notice));
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NoticeCard({ notice, onEdit, onDuplicate, onArchive, onDelete }: {
  notice: ManagedStorefrontNotice;
  onEdit: () => void;
  onDuplicate: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  const rate = notice.impressionCount > 0
    ? Math.round((notice.acknowledgementCount / notice.impressionCount) * 100)
    : 0;
  const schedule = notice.startsAt || notice.endsAt
    ? `${notice.startsAt ? formatManilaDate(notice.startsAt) : 'Now'} → ${notice.endsAt ? formatManilaDate(notice.endsAt) : 'No end'}`
    : 'No schedule';
  return (
    <article className="rounded-xl border border-gray-200 p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-gray-900">{notice.internalName}</h3>
            <span className={`rounded-full px-2.5 py-1 text-xs font-bold capitalize ${statusClasses[notice.status]}`}>{notice.status}</span>
            <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs text-gray-600">v{notice.version}</span>
            <span className="rounded-full bg-gray-50 px-2.5 py-1 text-xs capitalize text-gray-600">{notice.style}</span>
          </div>
          <p className="mt-1 truncate text-sm text-gray-600">{notice.title || 'Untitled notice'}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
            <span>{notice.audience.replace('_', ' ')}</span>
            <span>{notice.pageIds.map((page) => page.replace('storefront.', '')).join(', ')}</span>
            <span>{notice.frequency.replace('_', ' ')}</span>
            <span>priority {notice.priority}</span>
            <span>{schedule}</span>
            <span>updated {formatManilaDate(notice.updatedAt)}</span>
            <span>{notice.impressionCount} impressions</span>
            <span>{rate}% acknowledged</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Action label={`Edit ${notice.internalName}`} onClick={onEdit}><Edit3 className="h-4 w-4" /> Edit</Action>
          <Action label={`Duplicate ${notice.internalName}`} onClick={onDuplicate}><Copy className="h-4 w-4" /> Duplicate</Action>
          {notice.status === 'published' && <Action label={`Archive ${notice.internalName}`} onClick={onArchive}><Archive className="h-4 w-4" /> Archive</Action>}
          {notice.status !== 'published' && <Action label={`Delete ${notice.internalName}`} onClick={onDelete} danger><Trash2 className="h-4 w-4" /> Delete</Action>}
        </div>
      </div>
    </article>
  );
}

function formatManilaDate(value: string): string {
  if (!value) return 'not yet';
  return new Intl.DateTimeFormat('en-PH', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function Action({ label, onClick, danger = false, children }: {
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return <button aria-label={label} type="button" onClick={onClick} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${danger ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}>{children}</button>;
}
