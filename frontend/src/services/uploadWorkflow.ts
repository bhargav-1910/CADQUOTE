import type { CADFile, GeometryAnalysis } from '@/types';
import { getCADFile, getGeometryAnalysis, uploadCADFile } from '@/services/api';

export interface ProcessedCADUpload {
  cadFile: CADFile;
  geometry: GeometryAnalysis;
}

export const pollForGeometry = async (
  fileId: string,
  maxAttempts = 30,
  delayMs = 1000,
): Promise<GeometryAnalysis> => {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    try {
      return await getGeometryAnalysis(fileId);
    } catch {
      const cadFile = await getCADFile(fileId);
      if (cadFile.processing_status === 'failed') {
        throw new Error(cadFile.processing_error || 'Processing failed');
      }

      if (cadFile.processing_status === 'completed') {
        return await getGeometryAnalysis(fileId);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw new Error('Processing timeout. Please try again.');
};

export const uploadAndProcessCADFile = async (file: File): Promise<ProcessedCADUpload> => {
  const uploadedFile = await uploadCADFile(file);
  const geometry = await pollForGeometry(uploadedFile.id);
  const cadFile = await getCADFile(uploadedFile.id);

  return { cadFile, geometry };
};