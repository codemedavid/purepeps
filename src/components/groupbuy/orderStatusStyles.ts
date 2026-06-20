/**
 * Shared status-badge colors for group-buy batch order rows/detail, mirroring
 * OrdersManager.getStatusColor so the two admin surfaces stay visually
 * consistent. Pure lookup, no React — kept beside the group-buy components.
 */
export function batchStatusColor(status: string | null | undefined): string {
  switch (status) {
    case 'new':
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    case 'confirmed':
      return 'bg-blue-100 text-blue-800 border-blue-300';
    case 'packing':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    case 'out_for_delivery':
      return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    case 'delivered':
      return 'bg-green-100 text-green-800 border-green-300';
    case 'cancelled':
      return 'bg-red-100 text-red-800 border-red-300';
    // legacy statuses
    case 'processing':
      return 'bg-purple-100 text-purple-800 border-purple-300';
    case 'shipped':
      return 'bg-indigo-100 text-indigo-800 border-indigo-300';
    default:
      return 'bg-gray-100 text-gray-700 border-gray-300';
  }
}

export const peso = (value: number | null | undefined): string =>
  `₱${Number(value ?? 0).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

/**
 * Short peso for dense KPI tiles: ₱126k, ₱1.5k, ₱999. Values ≥ 1,000 collapse to
 * a `k` suffix with at most one decimal (trailing `.0` dropped); smaller values
 * round to whole pesos. Use peso() when exact centavos matter.
 */
export const compactPeso = (value: number | null | undefined): string => {
  const amount = Number(value ?? 0);
  if (Math.abs(amount) >= 1000) {
    const thousands = amount / 1000;
    const rounded = Math.round(thousands * 10) / 10;
    return `₱${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}k`;
  }
  return `₱${Math.round(amount)}`;
};

export const formatDateTime = (value: string | null | undefined): string =>
  value
    ? new Date(value).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

export function itemsSummary(
  items: { product_name?: string; variation_name?: string | null; quantity?: number }[] | null | undefined,
): string {
  return (items || [])
    .map(
      (it) =>
        `${it.quantity ?? 1}× ${it.product_name ?? 'Item'}${
          it.variation_name ? ` (${it.variation_name})` : ''
        }`,
    )
    .join(', ');
}
