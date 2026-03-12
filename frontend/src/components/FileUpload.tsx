import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { useNavigate } from 'react-router-dom';
import { Upload, CheckCircle, AlertCircle, Loader2, ArrowRight, X, FileText } from 'lucide-react';
import type { CADFile, GeometryAnalysis } from '@/types';
import { uploadCADFile, getCADFile, getGeometryAnalysis } from '@/services/api';

interface FileEntry {
  id: string;
  file: File;
  status: 'uploading' | 'processing' | 'done' | 'error';
  errorMsg?: string;
  cadFile?: CADFile;
  geometry?: GeometryAnalysis;
}

interface FileUploadProps {
  onFileUploaded: (file: CADFile, geometry: GeometryAnalysis) => void;
}

const FileUpload = ({ onFileUploaded }: FileUploadProps) => {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<FileEntry[]>([]);

  const setEntryState = (id: string, patch: Partial<FileEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const pollForGeometry = async (fileId: string, maxAttempts = 30): Promise<GeometryAnalysis> => {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        return await getGeometryAnalysis(fileId);
      } catch {
        const f = await getCADFile(fileId);
        if (f.processing_status === 'failed') throw new Error(f.processing_error || 'Processing failed');
        if (f.processing_status === 'completed') return await getGeometryAnalysis(fileId);
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    throw new Error('Processing timeout. Please try again.');
  };

  const processFile = async (entry: FileEntry) => {
    const { id, file } = entry;
    try {
      setEntryState(id, { status: 'uploading' });
      const uploadResult = await uploadCADFile(file);
      setEntryState(id, { status: 'processing', cadFile: uploadResult });
      const geometry = await pollForGeometry(uploadResult.id);
      const updatedFile = await getCADFile(uploadResult.id);
      setEntryState(id, { status: 'done', cadFile: updatedFile, geometry });
    } catch (err) {
      setEntryState(id, {
        status: 'error',
        errorMsg: err instanceof Error ? err.message : 'Failed',
      });
    }
  };

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length === 0) return;
      const newEntries: FileEntry[] = acceptedFiles.map((file) => ({
        id: `${Date.now()}-${Math.random()}`,
        file,
        status: 'uploading' as const,
      }));
      setEntries((prev) => [...prev, ...newEntries]);
      newEntries.forEach((entry) => processFile(entry));
    },
    [] // eslint-disable-line react-hooks/exhaustive-deps
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

  const doneEntries = entries.filter(
    (e) => e.status === 'done' && e.cadFile && e.geometry
  );

  const handleQuoteAll = () => {
    if (doneEntries.length < 1) return;
    const files = doneEntries.map((e) => ({
      cadFile: e.cadFile!,
      geometry: e.geometry!,
    }));
    navigate('/quote', { state: { multiFiles: files } });
  };

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
                {entry.status === 'done' && entry.cadFile && entry.geometry && (
                  <button
                    onClick={() => onFileUploaded(entry.cadFile!, entry.geometry!)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 transition-colors"
                  >
                    Use for Quote
                    <ArrowRight className="w-4 h-4" />
                  </button>
                )}
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

          {/* Quote all button — shown when 2+ files are ready */}
          {doneEntries.length >= 2 && (
            <div className="mt-3 p-4 bg-primary-50 border border-primary-200 rounded-xl flex items-center justify-between gap-4">
              <div>
                <p className="font-semibold text-primary-900">
                  {doneEntries.length} files ready
                </p>
                <p className="text-sm text-primary-700 mt-0.5">
                  Configure once and generate a combined quote for all files.
                </p>
              </div>
              <button
                onClick={handleQuoteAll}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors whitespace-nowrap"
              >
                <FileText className="w-4 h-4" />
                Quote All {doneEntries.length} Files
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FileUpload;
