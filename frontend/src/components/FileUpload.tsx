import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, CheckCircle, AlertCircle, Loader2, X } from 'lucide-react';
import type { CADFile, GeometryAnalysis } from '@/types';
import {
  uploadAndProcessCADFile,
  type ProcessedCADUpload,
} from '@/services/uploadWorkflow';

interface FileEntry {
  id: string;
  file: File;
  status: 'uploading' | 'processing' | 'done' | 'error';
  errorMsg?: string;
  cadFile?: CADFile;
  geometry?: GeometryAnalysis;
}

interface FileUploadProps {
  onFilesUploaded: (files: ProcessedCADUpload[]) => void;
}

const FileUpload = ({ onFilesUploaded }: FileUploadProps) => {
  const [entries, setEntries] = useState<FileEntry[]>([]);

  const setEntryState = (id: string, patch: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const processFile = async (entry: FileEntry): Promise<ProcessedCADUpload> => {
    const { id, file } = entry;
    try {
      setEntryState(id, { status: 'uploading' });
      const uploadResult = await uploadAndProcessCADFile(file);
      setEntryState(id, {
        status: 'done',
        cadFile: uploadResult.cadFile,
        geometry: uploadResult.geometry,
      });
      return uploadResult;
    } catch (err) {
      setEntryState(id, {
        status: 'error',
        errorMsg: err instanceof Error ? err.message : 'Failed',
      });
      throw err;
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;

      const newEntries: FileEntry[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        status: 'uploading' as const,
      }));

      setEntries((prev) => [...prev, ...newEntries]);

      const results = await Promise.allSettled(newEntries.map((entry) => processFile(entry)));
      const successfulFiles = results
        .filter((result): result is PromiseFulfilledResult<ProcessedCADUpload> => result.status === 'fulfilled')
        .map((result) => result.value);

      if (successfulFiles.length === acceptedFiles.length) {
        onFilesUploaded(successfulFiles);
      }
    },
    [onFilesUploaded]
  );

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'model/step': ['.step', '.stp'],
      'model/stl': ['.stl'],
      'application/octet-stream': ['.step', '.stp', '.stl'],
    },
    maxSize: 100 * 1024 * 1024,
  });

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasInFlightEntries = entries.some((entry) => entry.status === 'uploading' || entry.status === 'processing');

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
          isDragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
        }`}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center">
            <Upload className="w-8 h-8 text-primary-600" />
          </div>
          <div>
            <p className="text-gray-700 font-medium">
              {isDragActive ? 'Drop your files here' : 'Drag & drop CAD files here'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              or click to browse • STEP, STP, STL • Multiple files supported • Max 100MB each
            </p>
          </div>
        </div>
      </div>

      <p className="text-sm text-gray-500">
        One file opens single-part configuration immediately. Multiple files open shared configuration after all uploaded parts finish processing.
      </p>

      {entries.length > 0 && (
        <div className="space-y-2">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className={`rounded-lg border p-4 flex items-center gap-3 ${
                entry.status === 'done'
                  ? 'bg-green-50 border-green-200'
                  : entry.status === 'error'
                  ? 'bg-red-50 border-red-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <div className="flex-shrink-0">
                {entry.status === 'uploading' || entry.status === 'processing' ? (
                  <Loader2 className="w-5 h-5 text-primary-500 animate-spin" />
                ) : entry.status === 'done' ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className={`font-medium truncate ${
                  entry.status === 'done' ? 'text-green-800'
                  : entry.status === 'error' ? 'text-red-800'
                  : 'text-blue-800'
                }`}>
                  {entry.file.name}
                </p>
                <p className={`text-xs mt-0.5 ${
                  entry.status === 'done' ? 'text-green-600'
                  : entry.status === 'error' ? 'text-red-600'
                  : 'text-blue-600'
                }`}>
                  {entry.status === 'uploading' ? 'Uploading...'
                  : entry.status === 'processing' ? 'Analyzing geometry...'
                  : entry.status === 'done' ? `${entry.file.name.split('.').pop()!.toUpperCase()} • ${formatFileSize(entry.file.size)} • Ready`
                  : entry.errorMsg}
                </p>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {(entry.status === 'done' || entry.status === 'error') && (
                  <button
                    onClick={() => removeEntry(entry.id)}
                    className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {hasInFlightEntries && (
            <div className="mt-3 p-4 bg-primary-50 border border-primary-200 rounded-xl">
              <p className="font-semibold text-primary-900">Preparing your files</p>
              <p className="text-sm text-primary-700 mt-0.5">
                The app will move to configuration automatically when processing finishes.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
