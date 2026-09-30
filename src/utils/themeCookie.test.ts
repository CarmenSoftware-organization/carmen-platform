import { afterEach, describe, expect, it, vi } from 'vitest';
import { syncThemeCookie, themeCookieDomain } from './themeCookie';

describe('themeCookieDomain', () => {
  it('scopes a subdomain to its parent so the sso. sibling can read it', () => {
    expect(themeCookieDomain('platform.carmenblue.cloud')).toBe('.carmenblue.cloud');
    expect(themeCookieDomain('app.carmenblue.cloud')).toBe('.carmenblue.cloud');
    expect(themeCookieDomain('dev.blueledgers.com')).toBe('.blueledgers.com');
  });

  it('returns null where there is no meaningful parent domain', () => {
    expect(themeCookieDomain('localhost')).toBeNull();
    expect(themeCookieDomain('carmenblue.cloud')).toBeNull();
    expect(themeCookieDomain('192.168.1.10')).toBeNull();
    expect(themeCookieDomain('[::1]')).toBeNull();
  });
});

describe('syncThemeCookie', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function captureCookieWrites(): string[] {
    const writes: string[] = [];
    vi.spyOn(document, 'cookie', 'set').mockImplementation((value) => {
      writes.push(value);
    });
    return writes;
  }

  it('writes an explicit light/dark choice with a one-year lifetime', () => {
    const writes = captureCookieWrites();

    syncThemeCookie('dark');

    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain('carmen_theme=dark');
    expect(writes[0]).toContain('path=/');
    expect(writes[0]).toContain('SameSite=Lax');
    expect(writes[0]).toContain(`max-age=${365 * 24 * 60 * 60}`);
  });

  it('clears the cookie for "system" so the login page follows the OS', () => {
    const writes = captureCookieWrites();

    syncThemeCookie('system');

    expect(writes[0]).toContain('carmen_theme=;');
    expect(writes[0]).toContain('max-age=0');
  });
});
