import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiUrl } from '../api/client';

export interface AttachSourcePayload {
  sourceType: 'file' | 'web' | 'paste';
  file?: File;
  fileBuffer?: string; // base64
  originalFilename?: string;
  url?: string;
  title?: string;
  author?: string;
  text?: string;
}

export interface AttachSourceResponse {
  taskId: string;
  dossierId: string;
}

export function useAttachSource(dossierId: string) {
  const queryClient = useQueryClient();

  return useMutation<AttachSourceResponse, Error, AttachSourcePayload>({
    mutationFn: async (payload: AttachSourcePayload) => {
      if (payload.sourceType === 'file' && payload.file) {
        const formData = new FormData();
        formData.append('file', payload.file);
        formData.append('sourceType', 'file');
        if (payload.title) formData.append('title', payload.title);
        if (payload.author) formData.append('author', payload.author);

        const res = await fetch(apiUrl(`/api/books/${dossierId}/append-source`), {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to attach file (${res.status})`);
        }
        return res.json();
      }

      const res = await fetch(apiUrl(`/api/books/${dossierId}/append-source`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceType: payload.sourceType,
          payload: {
            title: payload.title,
            author: payload.author,
            text: payload.text,
            url: payload.url,
            fileBuffer: payload.fileBuffer,
            originalFilename: payload.originalFilename,
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Failed to attach source (${res.status})`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['book', dossierId] });
      queryClient.invalidateQueries({ queryKey: ['book-lifecycle', dossierId] });
      queryClient.invalidateQueries({ queryKey: ['lifecycle', dossierId] });
      queryClient.invalidateQueries({ queryKey: ['chapters', dossierId] });
      queryClient.invalidateQueries({ queryKey: ['dossiers'] });
      queryClient.invalidateQueries({ queryKey: ['books'] });
      queryClient.invalidateQueries({ queryKey: ['import-queue'] });
    },
  });
}

