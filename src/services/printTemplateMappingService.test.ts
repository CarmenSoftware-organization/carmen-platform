import { describe, it, expect, vi, beforeEach } from 'vitest';
import printTemplateMappingService from './printTemplateMappingService';
import api from './api';

vi.mock('./api', () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const mockApi = api as unknown as { get: ReturnType<typeof vi.fn> };

describe('printTemplateMappingService.getAll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApi.get.mockResolvedValue({
      data: { success: true, data: [], paginate: { total: 0, page: 1, perpage: -1, pages: 0 } },
    });
  });

  // The Go micro-report service defaults to perpage=10 and truncates the list
  // when no perpage is sent. This config page must show EVERY mapping, so the
  // service always requests the backend "fetch all" sentinel (perpage=-1).
  it('always requests perpage=-1 so the backend returns every mapping', async () => {
    await printTemplateMappingService.getAll();
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api-system/print-template-mappings?perpage=-1',
    );
  });

  it('keeps perpage=-1 alongside the document_type filter', async () => {
    await printTemplateMappingService.getAll({ document_type: 'PO' });
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api-system/print-template-mappings?perpage=-1&document_type=PO',
    );
  });

  it('keeps perpage=-1 alongside the active_only filter', async () => {
    await printTemplateMappingService.getAll({ active_only: true });
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api-system/print-template-mappings?perpage=-1&active_only=true',
    );
  });

  it('does not send active_only when false', async () => {
    await printTemplateMappingService.getAll({ active_only: false });
    expect(mockApi.get).toHaveBeenCalledWith(
      '/api-system/print-template-mappings?perpage=-1',
    );
  });
});
