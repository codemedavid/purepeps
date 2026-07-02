// Detects a Facebook profile link inside a customer-supplied contact string
// (the "Facebook Link or WhatsApp Number" checkout field) and normalizes it
// into a URL that can be opened directly, so admins are not left guessing
// whether a bare "fb.com/..." string is clickable.

const FACEBOOK_HOST_PATTERN = /^(www\.)?(facebook|fb)\.com$/i;

export function toFacebookProfileUrl(contactMethod: string): string | null {
  const trimmed = contactMethod.trim();
  if (!trimmed) return null;

  const hasScheme = /^https?:\/\//i.test(trimmed);
  const candidate = hasScheme ? trimmed : `https://${trimmed}`;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }

  if (!FACEBOOK_HOST_PATTERN.test(url.hostname)) return null;

  return candidate;
}
