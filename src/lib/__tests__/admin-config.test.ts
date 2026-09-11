import { describe, it, expect } from 'vitest';
import { isSuperAdmin, isAllowedDomain, SUPER_ADMIN_EMAILS, ALLOWED_EMAIL_DOMAIN } from '../admin-config';

describe('isSuperAdmin', () => {
  it('recognizes super admin emails', () => {
    expect(isSuperAdmin('reformer.ejembi@iworldnetworks.net')).toBe(true);
    expect(isSuperAdmin('jeffery.udoji@iworldnetworks.net')).toBe(true);
    expect(isSuperAdmin('adeolu.oluwabiyi@iworldnetworks.net')).toBe(true);
    expect(isSuperAdmin('mathew.alli@iworldnetworks.net')).toBe(true);
    expect(isSuperAdmin('stella.akinola@iworldnetworks.net')).toBe(true);
    expect(isSuperAdmin('jude.alawode@iworldnetworks.net')).toBe(true);
    expect(isSuperAdmin('olumide.adelaja@iworldnetworks.net')).toBe(true);
    expect(isSuperAdmin('alaka.segun@iworldnetworks.net')).toBe(true);
  });

  it('rejects non-super-admin emails', () => {
    expect(isSuperAdmin('anyone@iworldnetworks.net')).toBe(false);
  });

  it('rejects foreign domain emails', () => {
    expect(isSuperAdmin('reformer.ejembi@gmail.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isSuperAdmin('REFORMER.EJEMBI@IWORLDNETWORKS.NET')).toBe(true);
  });
});

describe('isAllowedDomain', () => {
  it('accepts emails matching the allowed domain', () => {
    expect(isAllowedDomain('user@iworldnetworks.net')).toBe(true);
  });

  it('rejects emails from other domains', () => {
    expect(isAllowedDomain('user@gmail.com')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(isAllowedDomain('USER@IWORLDNETWORKS.NET')).toBe(true);
  });

  it('rejects empty string', () => {
    expect(isAllowedDomain('')).toBe(false);
  });
});

describe('constants', () => {
  it('ALLOWED_EMAIL_DOMAIN is @iworldnetworks.net', () => {
    expect(ALLOWED_EMAIL_DOMAIN).toBe('@iworldnetworks.net');
  });

  it('SUPER_ADMIN_EMAILS contains the current list of privileged admins', () => {
    expect(SUPER_ADMIN_EMAILS).toEqual([
      'reformer.ejembi@iworldnetworks.net',
      'jeffery.udoji@iworldnetworks.net',
      'adeolu.oluwabiyi@iworldnetworks.net',
      'mathew.alli@iworldnetworks.net',
      'stella.akinola@iworldnetworks.net',
      'jude.alawode@iworldnetworks.net',
      'olumide.adelaja@iworldnetworks.net',
      'alaka.segun@iworldnetworks.net',
    ]);
  });
});
