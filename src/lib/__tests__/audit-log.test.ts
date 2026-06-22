import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAdd = vi.fn();
const mockCollection = vi.fn(() => ({ add: mockAdd }));

vi.mock('@/lib/firebase-admin', () => ({
  getAdminFirestore: vi.fn(() => ({
    collection: mockCollection,
  })),
}));

import { writeAuditLog } from '../audit-log';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('writeAuditLog', () => {
  const baseEntry = {
    action: 'create' as const,
    collection: 'sales_records',
    recordId: 'rec_123',
    userId: 'user_abc',
    userEmail: 'admin@iworldnetworks.net',
  };

  it('writes to sales_audit_log collection', async () => {
    await writeAuditLog(baseEntry);
    expect(mockCollection).toHaveBeenCalledWith('sales_audit_log');
  });

  it('includes a timestamp', async () => {
    await writeAuditLog(baseEntry);
    const writtenData = mockAdd.mock.calls[0][0];
    expect(writtenData.timestamp).toBeDefined();
    expect(typeof writtenData.timestamp).toBe('number');
  });

  it('includes all provided fields', async () => {
    await writeAuditLog(baseEntry);
    const writtenData = mockAdd.mock.calls[0][0];
    expect(writtenData.action).toBe('create');
    expect(writtenData.collection).toBe('sales_records');
    expect(writtenData.recordId).toBe('rec_123');
    expect(writtenData.userId).toBe('user_abc');
    expect(writtenData.userEmail).toBe('admin@iworldnetworks.net');
  });

  it('includes changes when provided', async () => {
    const entry = { ...baseEntry, changes: { mrc: 27500, planCode: 'H-Lite' } };
    await writeAuditLog(entry);
    const writtenData = mockAdd.mock.calls[0][0];
    expect(writtenData.changes).toEqual({ mrc: 27500, planCode: 'H-Lite' });
  });

  it('includes previousState when provided', async () => {
    const entry = { ...baseEntry, previousState: { mrc: 0, accountStatus: 'Active' } };
    await writeAuditLog(entry);
    const writtenData = mockAdd.mock.calls[0][0];
    expect(writtenData.previousState).toEqual({ mrc: 0, accountStatus: 'Active' });
  });

  it('includes metadata when provided', async () => {
    const entry = {
      action: 'import' as const,
      collection: 'sales_records',
      userId: 'user_abc',
      userEmail: 'admin@iworldnetworks.net',
      metadata: { batchId: 'import_123', recordCount: 50, source: 'csv_upload' },
    };
    await writeAuditLog(entry);
    const writtenData = mockAdd.mock.calls[0][0];
    expect(writtenData.metadata).toEqual({
      batchId: 'import_123',
      recordCount: 50,
      source: 'csv_upload',
    });
  });

  it('does not require recordId', async () => {
    const entry = {
      action: 'import' as const,
      collection: 'sales_records',
      userId: 'user_abc',
      userEmail: 'admin@iworldnetworks.net',
    };
    await writeAuditLog(entry);
    const writtenData = mockAdd.mock.calls[0][0];
    expect(writtenData.action).toBe('import');
    expect(writtenData.recordId).toBeUndefined();
  });

  it('handles all audit action types', async () => {
    const actions = ['create', 'update', 'delete', 'import'] as const;
    for (const action of actions) {
      await writeAuditLog({ ...baseEntry, action });
      const writtenData = mockAdd.mock.calls[actions.indexOf(action)][0];
      expect(writtenData.action).toBe(action);
    }
  });
});
