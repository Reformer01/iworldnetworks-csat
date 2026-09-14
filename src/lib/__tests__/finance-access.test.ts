import { describe, it, expect } from 'vitest';
import { canManageFinance, canViewFinance } from '../finance-access';

describe('finance access', () => {
  it('grants full finance rights to super admins', () => {
    expect(canManageFinance('stella.akinola@iworldnetworks.net')).toBe(true);
    expect(canManageFinance('alaka.segun@iworldnetworks.net')).toBe(true);
  });

  it('grants view-only finance rights to Dorcas', () => {
    expect(canViewFinance('dorcas.olayoole@iworldnetworks.net')).toBe(true);
    expect(canManageFinance('dorcas.olayoole@iworldnetworks.net')).toBe(false);
  });

  it('denies finance access to ordinary admins', () => {
    expect(canViewFinance('random.agent@iworldnetworks.net')).toBe(false);
    expect(canManageFinance('random.agent@iworldnetworks.net')).toBe(false);
  });
});
