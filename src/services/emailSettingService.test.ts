import { describe, it, expect, vi, beforeEach } from 'vitest';
import emailSettingService from './emailSettingService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

const BASE = '/api-system/platform/email-settings';

describe('emailSettingService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getAll requests the email-settings endpoint with an explicit perpage', async () => {
    const rows = [{ id: '1', purpose: 'no_reply', from_email: 'a@b.co' }];
    mockApi.get.mockResolvedValue({ data: { data: rows } });
    const result = await emailSettingService.getAll();
    expect(mockApi.get).toHaveBeenCalledWith(`${BASE}?perpage=20`);
    expect(result).toEqual({ data: rows });
  });

  it('sendTest omits the "to" key entirely when no recipient is given', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: true } } });
    await emailSettingService.sendTest('id-1');
    expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/id-1/test`, {});
  });

  it('sendTest omits the "to" key when the recipient is only whitespace', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: true } } });
    await emailSettingService.sendTest('id-1', '   ');
    expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/id-1/test`, {});
  });

  it('sendTest sends a trimmed "to" when a recipient is given', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: true } } });
    await emailSettingService.sendTest('id-1', '  admin@carmen.io  ');
    expect(mockApi.post).toHaveBeenCalledWith(`${BASE}/id-1/test`, { to: 'admin@carmen.io' });
  });

  it('sendTest unwraps the result whether or not it is enveloped', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { sent: false, reason: 'smtp-error' } } });
    await expect(emailSettingService.sendTest('id-1')).resolves.toEqual({
      sent: false,
      reason: 'smtp-error',
    });
    mockApi.post.mockResolvedValue({ data: { sent: true } });
    await expect(emailSettingService.sendTest('id-1')).resolves.toEqual({ sent: true });
  });

  it('update forwards doc_version through to the request body', async () => {
    mockApi.put.mockResolvedValue({ data: { data: { id: 'id-1' } } });
    await emailSettingService.update('id-1', { from_name: 'Carmen', doc_version: 4 });
    expect(mockApi.put).toHaveBeenCalledWith(`${BASE}/id-1`, {
      from_name: 'Carmen',
      doc_version: 4,
    });
  });

  it('create posts to the collection endpoint', async () => {
    mockApi.post.mockResolvedValue({ data: { data: { id: 'new' } } });
    await emailSettingService.create({ purpose: 'no_reply', from_email: 'a@b.co' });
    expect(mockApi.post).toHaveBeenCalledWith(BASE, {
      purpose: 'no_reply',
      from_email: 'a@b.co',
    });
  });

  it('remove deletes by id', async () => {
    mockApi.delete.mockResolvedValue({ data: { data: 'id-1' } });
    await emailSettingService.remove('id-1');
    expect(mockApi.delete).toHaveBeenCalledWith(`${BASE}/id-1`);
  });
});
