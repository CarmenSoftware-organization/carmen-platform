import api from './api';
import axios from 'axios';

export interface PresignRequest {
  filename: string;
  contentType: string;
  size: number;
  folder?: string;
}

export interface PresignResult {
  uploadUrl: string;
  fileUrl: string;
  method?: string;
  headers?: Record<string, string>;
  expiresIn?: number;
}

const uploadService = {
  // Authenticated request through `api` (adds bearer token + x-app-id; dev /api proxy applies).
  presign: async (req: PresignRequest): Promise<PresignResult> => {
    const res = await api.post('/api/upload/presign', req);
    return res.data.data || res.data;
  },

  // Direct-to-storage upload of the raw bytes.
  // MUST use bare axios, NOT the `api` instance: `api` injects Authorization, x-app-id,
  // and a baseURL that would alter/break the presigned signature.
  putToStorage: async (
    presign: PresignResult,
    file: File,
    onProgress?: (pct: number) => void,
  ): Promise<void> => {
    await axios.request({
      url: presign.uploadUrl,
      method: presign.method || 'PUT',
      data: file,
      headers: presign.headers ?? { 'Content-Type': file.type },
      onUploadProgress: (e) => {
        if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
      },
    });
  },

  // Convenience: presign + upload, returns the final public URL to store in news.image.
  uploadImage: async (
    file: File,
    opts?: { folder?: string; onProgress?: (pct: number) => void },
  ): Promise<string> => {
    const presign = await uploadService.presign({
      filename: file.name,
      contentType: file.type,
      size: file.size,
      folder: opts?.folder,
    });
    await uploadService.putToStorage(presign, file, opts?.onProgress);
    return presign.fileUrl;
  },
};

export default uploadService;
