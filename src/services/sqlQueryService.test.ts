import { describe, it, expect, vi, beforeEach } from 'vitest';
import sqlQueryService from './sqlQueryService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const mockApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

describe('sqlQueryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getDbObjects unwraps the { data } envelope', async () => {
    const payload = { tables: [], views: [], procedures: [], columns: [] };
    mockApi.get.mockResolvedValue({ data: { data: payload } });
    const result = await sqlQueryService.getDbObjects('T02');
    expect(mockApi.get).toHaveBeenCalledWith('/api/config/T02/sql-query/db-objects');
    expect(result).toEqual(payload);
  });

  it('executeSql posts sql_text to the execute endpoint', async () => {
    const payload = { columns: ['x'], rows: [{ x: 1 }], rowCount: 1, durationMs: 5 };
    mockApi.post.mockResolvedValue({ data: { data: payload } });
    const result = await sqlQueryService.executeSql('T02', 'SELECT 1 AS x');
    expect(mockApi.post).toHaveBeenCalledWith(
      '/api/config/T02/sql-query/execute',
      { sql_text: 'SELECT 1 AS x' },
      { signal: undefined },
    );
    expect(result).toEqual(payload);
  });

  // The signal only aborts the browser's wait on this HTTP request — it does not cancel the
  // query on the tenant database (see the doc comment on executeSql). This test just proves the
  // signal is actually forwarded to axios so SqlWorkbench's abort-on-unmount has an effect.
  it('executeSql forwards an AbortSignal to axios when provided', async () => {
    const payload = { columns: [], rows: [], rowCount: 0, durationMs: 1 };
    mockApi.post.mockResolvedValue({ data: { data: payload } });
    const controller = new AbortController();
    await sqlQueryService.executeSql('T02', 'SELECT 1', controller.signal);
    expect(mockApi.post).toHaveBeenCalledWith(
      '/api/config/T02/sql-query/execute',
      { sql_text: 'SELECT 1' },
      { signal: controller.signal },
    );
  });

  it('saveDdl posts the DDL input to the save endpoint', async () => {
    const input = { name: 'v_x', sql_text: 'SELECT 1', query_type: 'view' as const };
    const payload = { type: 'view', name: 'v_x', schema: 'public', executed_sql: 'CREATE VIEW ...' };
    mockApi.post.mockResolvedValue({ data: { data: payload } });
    const result = await sqlQueryService.saveDdl('T02', input);
    expect(mockApi.post).toHaveBeenCalledWith('/api/config/T02/sql-query/save', input);
    expect(result).toEqual(payload);
  });

  it('getDefinition passes type/schema/name as query params', async () => {
    const payload = { type: 'view', schema: 'public', name: 'v', definition: 'x' };
    mockApi.get.mockResolvedValue({ data: { data: payload } });
    const result = await sqlQueryService.getDefinition('T02', { type: 'view', schema: 'public', name: 'v' });
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api/config/T02/sql-query/db-objects/definition?type=view&schema=public&name=v',
    );
    expect(result).toEqual(payload);
  });

  it('dropObject calls DELETE with query params', async () => {
    mockApi.delete.mockResolvedValue({
      data: { data: { dropped: true, type: 'view', schema: 'public', name: 'v' } },
    });
    const result = await sqlQueryService.dropObject('T02', {
      type: 'view',
      schema: 'public',
      name: 'v',
    });
    expect(mockApi.delete).toHaveBeenCalledWith(
      '/api/config/T02/sql-query/db-objects?type=view&schema=public&name=v',
    );
    expect(result).toEqual({ dropped: true, type: 'view', schema: 'public', name: 'v' });
  });
});
