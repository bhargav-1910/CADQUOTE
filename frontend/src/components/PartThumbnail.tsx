import { useEffect, useState } from 'react';
import { Box } from 'lucide-react';
import { fetchFileThumbnailBlob } from '@/services/api';

/**
 * Small rendered preview of a CAD part. Thumbnails live behind an
 * authenticated endpoint, so they're fetched as blobs (a plain <img> can't
 * send the bearer token). Object URLs are cached per file for the session.
 */
const urlCache = new Map<string, string>();
const failed = new Set<string>();

interface PartThumbnailProps {
  fileId: string | null | undefined;
  className?: string;
}

const PartThumbnail = ({ fileId, className = 'w-9 h-9' }: PartThumbnailProps) => {
  const [url, setUrl] = useState<string | null>(fileId ? urlCache.get(fileId) ?? null : null);

  useEffect(() => {
    if (!fileId || urlCache.has(fileId) || failed.has(fileId)) {
      setUrl(fileId ? urlCache.get(fileId) ?? null : null);
      return;
    }
    let cancelled = false;
    fetchFileThumbnailBlob(fileId)
      .then((blob) => {
        const objectUrl = URL.createObjectURL(blob);
        urlCache.set(fileId, objectUrl);
        if (!cancelled) setUrl(objectUrl);
      })
      .catch(() => {
        failed.add(fileId);
      });
    return () => {
      cancelled = true;
    };
  }, [fileId]);

  if (!url) {
    return (
      <span className={`${className} rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center shrink-0`}>
        <Box className="w-4 h-4" />
      </span>
    );
  }

  return (
    <span className={`${className} rounded-lg bg-white border border-gray-200 overflow-hidden flex items-center justify-center shrink-0`}>
      <img src={url} alt="" className="w-full h-full object-contain" />
    </span>
  );
};

export default PartThumbnail;
