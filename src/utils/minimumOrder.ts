import type { CartItem, Product } from '../types';

/**
 * Universal ("default") minimum order, and the per-product rules that may
 * override it.
 *
 * WHY THIS REPLACES constants/order.ts's resolveMinOrder
 * That helper answers "what is the minimum for THIS line", letting a selected
 * variation's own minimum win. The client's requirement is the opposite shape:
 * a minimum belongs to the PRODUCT and is met by the combined quantity across
 * its variations — 4 of 10mg plus 3 of 20mg plus 3 of 30mg satisfies a minimum
 * of 10. A per-line rule cannot express that, because no single line reaches
 * the bar. Per-variation enforcement stays available as a deliberate opt-in.
 */

/** Units an admin may pick. Anything else is rejected on read. */
export const MINIMUM_ORDER_UNITS = ['vial', 'piece', 'box', 'kit'] as const;

export type MinimumOrderUnit = (typeof MINIMUM_ORDER_UNITS)[number];

export interface UniversalMinimumOrder {
  /** Whether the site-wide default applies to products that follow it. */
  enabled: boolean;
  quantity: number;
  unit: MinimumOrderUnit;
}

/** `site_settings` keys backing the universal setting. */
export const UNIVERSAL_MINIMUM_KEYS = {
  enabled: 'universal_minimum_order_enabled',
  quantity: 'universal_minimum_order_quantity',
  unit: 'universal_minimum_order_unit',
} as const;

export const UNIVERSAL_MINIMUM_SETTING_KEYS: readonly string[] =
  Object.values(UNIVERSAL_MINIMUM_KEYS);

/**
 * Deliberately OFF.
 *
 * A site-wide minimum that switched itself on when the migration landed would
 * start rejecting carts that were valid a moment earlier, with no admin having
 * asked for it.
 */
export const DEFAULT_UNIVERSAL_MINIMUM: UniversalMinimumOrder = Object.freeze({
  enabled: false,
  quantity: 1,
  unit: 'vial',
});

export interface MinimumOrderRule {
  /** False means no minimum applies; every quantity passes. */
  enforced: boolean;
  /** Only meaningful when `enforced`. */
  quantity: number;
  unit: MinimumOrderUnit;
  /**
   * True when quantities of every variation of the product add together to
   * meet the minimum. False enforces it on each variation separately.
   */
  combineVariations: boolean;
  /** Admin-authored replacement for the generated notice, if any. */
  message: string | null;
}

export interface MinimumOrderSettingRow {
  id: string;
  value: string | null;
}

function isUnit(value: unknown): value is MinimumOrderUnit {
  return MINIMUM_ORDER_UNITS.includes(value as MinimumOrderUnit);
}

/** A positive whole number, or null. Rejects '', 'lots', '2.5', '-1' and NaN. */
function positiveInteger(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) return null;
  return parsed;
}

/** English plural for the four supported units. Only `box` is irregular. */
function pluralize(unit: MinimumOrderUnit, count: number): string {
  if (count === 1) return unit;
  return unit === 'box' ? 'boxes' : `${unit}s`;
}

/** Projects `site_settings` rows onto the universal setting, ignoring junk. */
export function universalMinimumFromRows(
  rows: readonly MinimumOrderSettingRow[] | null | undefined,
): UniversalMinimumOrder {
  const byId = new Map((rows ?? []).map((row) => [row.id, row.value]));

  const quantity = positiveInteger(byId.get(UNIVERSAL_MINIMUM_KEYS.quantity));
  const unit = byId.get(UNIVERSAL_MINIMUM_KEYS.unit);

  return {
    // Only the exact string 'true' switches it on. A missing or malformed row
    // leaves the site behaving as it did before minimums existed.
    enabled: byId.get(UNIVERSAL_MINIMUM_KEYS.enabled) === 'true',
    quantity: quantity ?? DEFAULT_UNIVERSAL_MINIMUM.quantity,
    unit: isUnit(unit) ? unit : DEFAULT_UNIVERSAL_MINIMUM.unit,
  };
}

/** Inverse of {@link universalMinimumFromRows}, for writing the settings. */
export function universalMinimumToRows(
  universal: UniversalMinimumOrder,
): MinimumOrderSettingRow[] {
  return [
    { id: UNIVERSAL_MINIMUM_KEYS.enabled, value: universal.enabled ? 'true' : 'false' },
    { id: UNIVERSAL_MINIMUM_KEYS.quantity, value: String(universal.quantity) },
    { id: UNIVERSAL_MINIMUM_KEYS.unit, value: universal.unit },
  ];
}

/**
 * The minimum that actually applies to one product.
 *
 * Resolution order:
 *   1. `minimum_order_enabled === false` — this product opts out entirely.
 *   2. `use_universal_minimum === false` — the product's own quantity and unit,
 *      which stand even when the universal switch is off. Turning the universal
 *      requirement off stops it applying BY DEFAULT; it does not strip a
 *      minimum an admin set deliberately on one product.
 *   3. Otherwise the universal setting, when enabled.
 *
 * A resolved quantity below 1 enforces nothing, so a half-configured product
 * cannot block a cart.
 */
export function resolveMinimumOrder(
  product: Product,
  universal: UniversalMinimumOrder,
): MinimumOrderRule {
  const message = product.minimum_order_message?.trim() || null;
  const combineVariations = product.enforce_minimum_per_variation !== true;

  const disabled: MinimumOrderRule = {
    enforced: false,
    quantity: 0,
    unit: universal.unit,
    combineVariations,
    message,
  };

  if (product.minimum_order_enabled === false) return disabled;

  const overrides = product.use_universal_minimum === false;

  const quantity = overrides
    ? (product.minimum_order_quantity ?? 0)
    : universal.enabled
      ? universal.quantity
      : 0;

  if (quantity < 1) return disabled;

  const unit = overrides
    ? isUnit(product.minimum_order_unit)
      ? product.minimum_order_unit
      : universal.unit
    : universal.unit;

  return { enforced: true, quantity, unit, combineVariations, message };
}

/**
 * How many units of a product a cart holds.
 *
 * Sums every variation of the product unless `variationId` narrows it to one,
 * which is what per-variation enforcement needs.
 */
export function combinedQuantityFor(
  items: readonly CartItem[],
  productId: string,
  variationId?: string,
): number {
  return items.reduce((total, item) => {
    if (item.product.id !== productId) return total;
    if (variationId != null && item.variation?.id !== variationId) return total;
    return total + Number(item.quantity ?? 0);
  }, 0);
}

/**
 * Whether a quantity satisfies the rule.
 *
 * Zero always passes: a product absent from the cart has not broken a minimum,
 * and treating it as a violation would block every checkout.
 */
export function meetsMinimum(rule: MinimumOrderRule, quantity: number): boolean {
  if (!rule.enforced) return true;
  if (quantity <= 0) return true;
  return quantity >= rule.quantity;
}

/** The notice shown on the product card and detail view, or null when free. */
export function minimumOrderNotice(rule: MinimumOrderRule): string | null {
  if (!rule.enforced) return null;
  if (rule.message) return rule.message;
  return `Minimum order: ${rule.quantity} ${pluralize(rule.unit, rule.quantity)} for this product.`;
}

/** The blocking message shown when a cart line is under the minimum. */
export function minimumOrderShortfall(rule: MinimumOrderRule): string {
  return (
    `This product requires a minimum order of ${rule.quantity} ` +
    `${pluralize(rule.unit, rule.quantity)}. Please update your quantity to continue.`
  );
}
