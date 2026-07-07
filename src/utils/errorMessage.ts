/**
 * Normalizes any thrown value into a human-readable message for the admin UI.
 *
 * The reason this exists: Supabase's `PostgrestError` is a PLAIN OBJECT
 * (`{ message, details, hint, code }`), NOT an `instanceof Error`. Handlers that
 * did `err instanceof Error ? err.message : 'Action failed'` therefore threw away
 * the real reason — e.g. the group-buy cap trigger's
 * "Group buy limit reached ... (cap 50, already reserved 45, you requested 10)."
 * — and showed a useless generic message. This surfaces the actual cause.
 */
export function getActionErrorMessage(error: unknown, fallback = 'Action failed'): string {
  if (error instanceof Error) {
    const message = error.message.trim();
    return message.length > 0 ? message : fallback;
  }

  if (typeof error === 'string') {
    const message = error.trim();
    return message.length > 0 ? message : fallback;
  }

  // Supabase / Postgrest and similar plain error objects: stitch together the
  // populated parts (message, details, hint) without repeating any of them.
  if (error !== null && typeof error === 'object') {
    const { message, details, hint } = error as {
      message?: unknown;
      details?: unknown;
      hint?: unknown;
    };
    const parts = [message, details, hint]
      .filter((part): part is string => typeof part === 'string' && part.trim().length > 0)
      .map((part) => part.trim());
    const unique = parts.filter((part, index) => parts.indexOf(part) === index);
    if (unique.length > 0) {
      return unique.join(' ');
    }
  }

  return fallback;
}
