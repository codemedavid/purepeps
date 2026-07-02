import { describe, it, expect } from 'vitest';
import { toFacebookProfileUrl } from './facebookLink';

describe('toFacebookProfileUrl', () => {
  it('returns null for empty or whitespace-only input', () => {
    expect(toFacebookProfileUrl('')).toBeNull();
    expect(toFacebookProfileUrl('   ')).toBeNull();
  });

  it('returns null for a plain phone number (WhatsApp)', () => {
    expect(toFacebookProfileUrl('09171234567')).toBeNull();
    expect(toFacebookProfileUrl('+63 917 123 4567')).toBeNull();
  });

  it('returns null for non-facebook text', () => {
    expect(toFacebookProfileUrl('just call me')).toBeNull();
  });

  it('adds https:// scheme to a bare facebook.com link', () => {
    expect(toFacebookProfileUrl('fb.com/juan.delacruz')).toBe('https://fb.com/juan.delacruz');
    expect(toFacebookProfileUrl('facebook.com/juan.delacruz')).toBe('https://facebook.com/juan.delacruz');
    expect(toFacebookProfileUrl('www.facebook.com/juan.delacruz')).toBe('https://www.facebook.com/juan.delacruz');
  });

  it('preserves an already-complete facebook URL', () => {
    expect(toFacebookProfileUrl('https://www.facebook.com/juan.delacruz')).toBe(
      'https://www.facebook.com/juan.delacruz'
    );
    expect(toFacebookProfileUrl('http://facebook.com/profile.php?id=100012345')).toBe(
      'http://facebook.com/profile.php?id=100012345'
    );
  });

  it('trims surrounding whitespace before parsing', () => {
    expect(toFacebookProfileUrl('  fb.com/juan.delacruz  ')).toBe('https://fb.com/juan.delacruz');
  });

  it('is case-insensitive when detecting the facebook domain', () => {
    expect(toFacebookProfileUrl('FACEBOOK.COM/juan.delacruz')).toBe('https://FACEBOOK.COM/juan.delacruz');
  });

  it('rejects lookalike domains that merely contain "facebook"', () => {
    expect(toFacebookProfileUrl('notfacebook.com/juan.delacruz')).toBeNull();
    expect(toFacebookProfileUrl('facebook.com.evil.com/juan.delacruz')).toBeNull();
  });
});
