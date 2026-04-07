import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate, useLocation, Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileText, Loader2, CheckCircle, Package, Home, ChevronRight, Eye, Settings2 } from 'lucide-react';
import FileUpload from '@/components/FileUpload';
import ModelViewer from '@/components/ModelViewer';
import ConfigurationPanel from '@/components/ConfigurationPanel';
import PricingDisplay from '@/components/PricingDisplay';
import DFXAnalysis from '@/components/DFXAnalysis';
import FilePreviewModal from '@/components/FilePreviewModal';
import { useAuth } from '@/components/AuthProvider';
import type {
  CADFile,
  GeometryAnalysis,
  PricingResponse,
  PricingOverrides,
  ProcessRoutingOperation,
  QuoteConfiguration,
} from '@/types';
import { getInstantPricing, getBatchPricing, createQuote, createCombinedQuote, getQuote, getGeometryAnalysis, getCADFile } from '@/services/api';
import type { ProcessedCADUpload } from '@/services/uploadWorkflow';
import { analyzeDFM } from '@/services/dfm';

interface MultiFileEntry {
  cadFile: CADFile;
  geometry: GeometryAnalysis;
  selected: boolean;
  materialId: string | null;
  surfaceFinishId: string | null;
  inspectionLevelId: string | null;
  quantity: number;
  pricing: PricingResponse | null;
  pricingLoading: boolean;
}

interface EffectiveConfig {
  materialId: string | null;
  surfaceFinishId: string | null;
  inspectionLevelId: string | null;
  quantity: number;
}

interface RFQCommercialFormState {
  rfqNumber: string;
  rfqDate: string;
  quoteDueDate: string;
  toleranceNotes: string;
  hsnCode: string;
  priceValidity: string;
  gst: string;
  delivery: string;
  paymentTerms: string;
}

interface CombinedEditItem {
  cad_file_id: string;
  file_name: string;
  quantity: number;
  material_id?: string;
  surface_finish_id?: string;
  inspection_level_id?: string;
}

const emptyRoutingRow: ProcessRoutingOperation = {
  operation: '',
  process: '',
  machine_type: '',
  setup_time_minutes: 0,
  cycle_time_minutes: 0,
  remarks: '',
};

const createDefaultRFQCommercialState = (): RFQCommercialFormState => ({
  rfqNumber: '',
  rfqDate: '',
  quoteDueDate: '',
  toleranceNotes: '',
  hsnCode: '',
  priceValidity: '',
  gst: '',
  delivery: '',
  paymentTerms: '',
});

const toOptionalString = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const toOptionalDateTimeString = (value: string): string | undefined => {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  // Date inputs return YYYY-MM-DD; backend expects datetime for RFQ dates.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return `${trimmed}T00:00:00`;
  }

  return trimmed;
};

const toDateInputValue = (value?: string | null): string => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
};

const parseCombinedEditItems = (rawNotes?: string | null): CombinedEditItem[] => {
  if (!rawNotes) {
    return [];
  }

  const startTag = '[COMBINED_FILES]';
  const endTag = '[/COMBINED_FILES]';
  const start = rawNotes.indexOf(startTag);
  const end = rawNotes.indexOf(endTag);

  if (start === -1 || end === -1 || end <= start) {
    return [];
  }

  return rawNotes
    .slice(start + startTag.length, end)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((part) => part.trim());

      // v2 format: cad_file_id|filename|qty|line_total|material_id|surface_finish_id|inspection_level_id
      if (parts.length >= 4) {
        return {
          cad_file_id: parts[0],
          file_name: parts[1],
          quantity: Number(parts[2]) || 1,
          material_id: parts[4] || undefined,
          surface_finish_id: parts[5] || undefined,
          inspection_level_id: parts[6] || undefined,
        };
      }

      // v1 format: filename|qty|line_total (no ids available)
      return {
        cad_file_id: '',
        file_name: parts[0] || 'Unknown file',
        quantity: Number(parts[1]) || 1,
      };
    })
    .filter((item) => item.cad_file_id.length > 0);
};

const formatINR = (v: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(v);

const getDFXSeverity = (geometry: GeometryAnalysis | null): 'error' | 'warning' | 'ok' => {
  if (!geometry) return 'ok';

  const analysis = analyzeDFM(geometry);
  if (analysis.has_blocking_issue) return 'error';
  if (analysis.score < 80 || analysis.issues.length > 0) return 'warning';
  return 'ok';
};

const buildPricingOverridesPayload = (
  enabled: boolean,
  overrides: PricingOverrides,
): PricingOverrides | undefined => {
  if (!enabled) {
    return undefined;
  }

  const filteredEntries = Object.entries(overrides).filter(([key, value]) => {
    if (typeof value === 'number') {
      return Number.isFinite(value);
    }

    if (key === 'machine_name' && typeof value === 'string') {
      return value.trim().length > 0;
    }

    return false;
  });

  if (filteredEntries.length === 0) {
    return undefined;
  }

  return Object.fromEntries(filteredEntries) as PricingOverrides;
};

const QuoteBuilder = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { quoteId: routeQuoteId } = useParams<{ quoteId?: string }>();
  const { user } = useAuth();

  const initialMultiFiles: ProcessedCADUpload[] =
    location.state?.multiFiles ?? [];
  const editQuoteId: string | undefined = routeQuoteId ?? location.state?.fromQuoteId;

  // Shared config (multi-file mode)
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [surfaceFinishId, setSurfaceFinishId] = useState<string | null>(null);
  const [inspectionLevelId, setInspectionLevelId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState(user?.full_name ?? '');
  const [customerEmail, setCustomerEmail] = useState(user?.email ?? '');
  const [customerCompany, setCustomerCompany] = useState(user?.company_name ?? '');
  const [notes, setNotes] = useState('');

  // Single-file state
  const [config, setConfig] = useState<QuoteConfiguration>({
    cadFile: initialMultiFiles.length === 1 ? initialMultiFiles[0].cadFile : null,
    geometry: initialMultiFiles.length === 1 ? initialMultiFiles[0].geometry : null,
    materialId: null,
    surfaceFinishId: null,
    inspectionLevelId: null,
    quantity: 1,
    customerName: user?.full_name ?? '',
    customerEmail: user?.email ?? '',
    customerCompany: user?.company_name ?? '',
    notes: '',
  });
  const [pricing, setPricing] = useState<PricingResponse | null>(null);
  const [pricingLoading, setPricingLoading] = useState(false);
  const singlePricingRequestVersion = useRef(0);

  // Multi-file state
  const [multiFiles, setMultiFiles] = useState<MultiFileEntry[]>(
    initialMultiFiles.map((f) => ({
      ...f,
      selected: true,
      materialId: null,
      surfaceFinishId: null,
      inspectionLevelId: null,
      quantity: 1,
      pricing: null,
      pricingLoading: false,
    }))
  );
  const [configureIndividually, setConfigureIndividually] = useState(false);
  const [activeMultiFileId, setActiveMultiFileId] = useState<string | null>(
    initialMultiFiles.length > 1 ? initialMultiFiles[0].cadFile.id : null
  );
  const [previewFile, setPreviewFile] = useState<MultiFileEntry | null>(null);
  const isMultiMode = multiFiles.length > 1;
  const pricingRequestVersion = useRef(0);

  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [useQuoteSpecificPricing, setUseQuoteSpecificPricing] = useState(false);
  const [pricingOverrides, setPricingOverrides] = useState<PricingOverrides>({});
  const [rfqCommercialForm, setRfqCommercialForm] = useState<RFQCommercialFormState>(
    createDefaultRFQCommercialState(),
  );
  const [processRouting, setProcessRouting] = useState<ProcessRoutingOperation[]>([{ ...emptyRoutingRow }]);
  const [showProcessRouting, setShowProcessRouting] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [step, setStep] = useState<'upload' | 'configure'>(
    initialMultiFiles.length > 0 ? 'configure' : 'upload'
  );

  const pricingOverridesPayload = useMemo(
    () => buildPricingOverridesPayload(useQuoteSpecificPricing, pricingOverrides),
    [useQuoteSpecificPricing, pricingOverrides]
  );

  const updateRFQField = useCallback(<K extends keyof RFQCommercialFormState>(key: K, value: RFQCommercialFormState[K]) => {
    setRfqCommercialForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const updateRoutingRow = useCallback((index: number, updates: Partial<ProcessRoutingOperation>) => {
    setProcessRouting((prev) =>
      prev.map((row, rowIndex) => (rowIndex === index ? { ...row, ...updates } : row))
    );
  }, []);

  const addRoutingRow = useCallback(() => {
    setProcessRouting((prev) => [...prev, { ...emptyRoutingRow }]);
  }, []);

  const removeRoutingRow = useCallback((index: number) => {
    setProcessRouting((prev) => {
      const next = prev.filter((_, rowIndex) => rowIndex !== index);
      if (next.length === 0) {
        setShowProcessRouting(false);
        return [{ ...emptyRoutingRow }];
      }

      return next;
    });
  }, []);

  useEffect(() => {
    if (!editQuoteId) {
      return;
    }

    let cancelled = false;

    const loadQuoteForEdit = async () => {
      setEditLoading(true);
      setError(null);
      try {
        const existingQuote = await getQuote(editQuoteId);
        const combinedEditItems = parseCombinedEditItems(existingQuote.notes);

        if (combinedEditItems.length > 1) {
          const restoredFiles = await Promise.all(
            combinedEditItems.map(async (item) => {
              const [cadFile, geometry] = await Promise.all([
                getCADFile(item.cad_file_id),
                getGeometryAnalysis(item.cad_file_id),
              ]);

              return {
                cadFile,
                geometry,
                selected: true,
                materialId: item.material_id ?? existingQuote.material.id,
                surfaceFinishId: item.surface_finish_id ?? existingQuote.surface_finish.id,
                inspectionLevelId: item.inspection_level_id ?? existingQuote.inspection_level.id,
                quantity: item.quantity,
                pricing: null,
                pricingLoading: false,
              };
            })
          );

          if (cancelled) {
            return;
          }

          const first = restoredFiles[0];
          const sharedConfig = restoredFiles.every(
            (file) =>
              file.materialId === first.materialId &&
              file.surfaceFinishId === first.surfaceFinishId &&
              file.inspectionLevelId === first.inspectionLevelId &&
              file.quantity === first.quantity
          );

          setConfig({
            cadFile: first.cadFile,
            geometry: first.geometry,
            materialId: first.materialId,
            surfaceFinishId: first.surfaceFinishId,
            inspectionLevelId: first.inspectionLevelId,
            quantity: first.quantity,
            customerName: existingQuote.customer_name ?? user?.full_name ?? '',
            customerEmail: existingQuote.customer_email ?? user?.email ?? '',
            customerCompany: existingQuote.customer_company ?? user?.company_name ?? '',
            notes: existingQuote.notes ?? '',
          });

          setMultiFiles(restoredFiles);
          setActiveMultiFileId(first.cadFile.id);
          setConfigureIndividually(!sharedConfig);

          if (sharedConfig) {
            setMaterialId(first.materialId);
            setSurfaceFinishId(first.surfaceFinishId);
            setInspectionLevelId(first.inspectionLevelId);
            setQuantity(first.quantity);
          }
        } else {
          const geometry = await getGeometryAnalysis(existingQuote.cad_file.id);

          if (cancelled) {
            return;
          }

          const defaultTolerance = existingQuote.tolerance_notes ?? '';
          setConfig({
            cadFile: existingQuote.cad_file,
            geometry,
            materialId: existingQuote.material.id,
            surfaceFinishId: existingQuote.surface_finish.id,
            inspectionLevelId: existingQuote.inspection_level.id,
            quantity: existingQuote.quantity,
            customerName: existingQuote.customer_name ?? user?.full_name ?? '',
            customerEmail: existingQuote.customer_email ?? user?.email ?? '',
            customerCompany: existingQuote.customer_company ?? user?.company_name ?? '',
            notes: existingQuote.notes ?? '',
          });

          setMultiFiles([
            {
              cadFile: existingQuote.cad_file,
              geometry,
              selected: true,
              materialId: existingQuote.material.id,
              surfaceFinishId: existingQuote.surface_finish.id,
              inspectionLevelId: existingQuote.inspection_level.id,
              quantity: existingQuote.quantity,
              pricing: null,
              pricingLoading: false,
            },
          ]);

          setRfqCommercialForm({
            rfqNumber: existingQuote.rfq_number ?? '',
            rfqDate: toDateInputValue(existingQuote.rfq_date),
            quoteDueDate: toDateInputValue(existingQuote.quote_due_date),
            toleranceNotes: defaultTolerance,
            hsnCode: existingQuote.hsn_code ?? '',
            priceValidity: existingQuote.price_validity ?? '',
            gst: existingQuote.gst ?? '',
            delivery: toDateInputValue(existingQuote.delivery),
            paymentTerms: existingQuote.payment_terms ?? '',
          });

          if (existingQuote.process_routing && existingQuote.process_routing.length > 0) {
            setProcessRouting(existingQuote.process_routing);
            setShowProcessRouting(true);
          }

          setStep('configure');
          return;
        }

        const defaultTolerance = existingQuote.tolerance_notes ?? '';

        setRfqCommercialForm({
          rfqNumber: existingQuote.rfq_number ?? '',
          rfqDate: toDateInputValue(existingQuote.rfq_date),
          quoteDueDate: toDateInputValue(existingQuote.quote_due_date),
          toleranceNotes: defaultTolerance,
          hsnCode: existingQuote.hsn_code ?? '',
          priceValidity: existingQuote.price_validity ?? '',
          gst: existingQuote.gst ?? '',
          delivery: toDateInputValue(existingQuote.delivery),
          paymentTerms: existingQuote.payment_terms ?? '',
        });

        if (existingQuote.process_routing && existingQuote.process_routing.length > 0) {
          setProcessRouting(existingQuote.process_routing);
          setShowProcessRouting(true);
        }

        setStep('configure');
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load quote for editing');
        }
      } finally {
        if (!cancelled) {
          setEditLoading(false);
        }
      }
    };

    loadQuoteForEdit();

    return () => {
      cancelled = true;
    };
  }, [editQuoteId, user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    setCustomerName((prev) => prev || user.full_name);
    setCustomerEmail((prev) => prev || user.email);
    setCustomerCompany((prev) => prev || user.company_name);
    setConfig((prev) => ({
      ...prev,
      customerName: prev.customerName || user.full_name,
      customerEmail: prev.customerEmail || user.email,
      customerCompany: prev.customerCompany || user.company_name,
    }));
  }, [user]);

  const hasCompleteConfig = useCallback((cfg: EffectiveConfig) => {
    return Boolean(cfg.materialId && cfg.surfaceFinishId && cfg.inspectionLevelId && cfg.quantity > 0);
  }, []);

  const getEffectiveConfig = useCallback((file: MultiFileEntry): EffectiveConfig => {
    if (configureIndividually) {
      return {
        materialId: file.materialId,
        surfaceFinishId: file.surfaceFinishId,
        inspectionLevelId: file.inspectionLevelId,
        quantity: file.quantity,
      };
    }

    return {
      materialId,
      surfaceFinishId,
      inspectionLevelId,
      quantity,
    };
  }, [configureIndividually, materialId, surfaceFinishId, inspectionLevelId, quantity]);

  const updateMultiFile = useCallback((cadFileId: string, updates: Partial<MultiFileEntry>) => {
    setMultiFiles((prev) =>
      prev.map((file) =>
        file.cadFile.id === cadFileId
          ? { ...file, ...updates }
          : file
      )
    );
  }, []);

  // Single-file pricing
  const calculateSinglePricing = useCallback(async () => {
    if (!config.cadFile || !config.materialId || !config.surfaceFinishId || !config.inspectionLevelId) return;
    const requestVersion = ++singlePricingRequestVersion.current;
    setPricingLoading(true);
    setError(null);
    try {
      const result = await getInstantPricing({
        cad_file_id: config.cadFile.id,
        material_id: config.materialId,
        surface_finish_id: config.surfaceFinishId,
        inspection_level_id: config.inspectionLevelId,
        quantity: config.quantity,
        pricing_overrides: pricingOverridesPayload,
      });
      if (singlePricingRequestVersion.current !== requestVersion) {
        return;
      }
      setPricing(result);
    } catch (err) {
      if (singlePricingRequestVersion.current !== requestVersion) {
        return;
      }
      setError(err instanceof Error ? err.message : 'Failed to calculate pricing');
      setPricing(null);
    } finally {
      if (singlePricingRequestVersion.current === requestVersion) {
        setPricingLoading(false);
      }
    }
  }, [
    config.cadFile,
    config.materialId,
    config.surfaceFinishId,
    config.inspectionLevelId,
    config.quantity,
    pricingOverridesPayload,
  ]);

  useEffect(() => {
    if (!isMultiMode) calculateSinglePricing();
  }, [calculateSinglePricing, isMultiMode]);

  // Multi-file pricing: recalculate selected files when effective config changes
  const multiConfigSignature = useMemo(
    () =>
      multiFiles
        .map(
          (file) =>
            `${file.cadFile.id}:${file.selected ? 1 : 0}:${file.materialId ?? ''}:${file.surfaceFinishId ?? ''}:${file.inspectionLevelId ?? ''}:${file.quantity}`
        )
        .join('|'),
    [multiFiles]
  );

  useEffect(() => {
    if (!isMultiMode || multiFiles.length === 0) return;

    let cancelled = false;
    const requestVersion = ++pricingRequestVersion.current;

    const selectedEntries = multiFiles.filter((file) => file.selected);
    const readyEntries = selectedEntries
      .map((file) => ({ file, config: getEffectiveConfig(file) }))
      .filter(({ config }) => hasCompleteConfig(config));

    setError(null);
    setMultiFiles((prev) =>
      prev.map((file) => {
        if (!file.selected) {
          return { ...file, pricing: null, pricingLoading: false };
        }

        const cfg = getEffectiveConfig(file);
        if (!hasCompleteConfig(cfg)) {
          return { ...file, pricing: null, pricingLoading: false };
        }

        return { ...file, pricing: null, pricingLoading: true };
      })
    );

    if (readyEntries.length === 0) {
      return;
    }

    const fetchAllPricing = async () => {
      let settled: PromiseSettledResult<PricingResponse>[] = [];

      if (!configureIndividually) {
        const sharedCfg = readyEntries[0].config;
        try {
          const batchResult = await getBatchPricing({
            cad_file_ids: readyEntries.map(({ file }) => file.cadFile.id),
            material_id: sharedCfg.materialId!,
            surface_finish_id: sharedCfg.surfaceFinishId!,
            inspection_level_id: sharedCfg.inspectionLevelId!,
            quantity: sharedCfg.quantity,
            pricing_overrides: pricingOverridesPayload,
          });

          settled = readyEntries.map(({ file }) => {
            const found = batchResult.results.find((item) => item.cad_file_id === file.cadFile.id);
            if (found) {
              return { status: 'fulfilled', value: found } as PromiseFulfilledResult<PricingResponse>;
            }
            return {
              status: 'rejected',
              reason: new Error('Missing pricing result'),
            } as PromiseRejectedResult;
          });
        } catch {
          // Fallback for older backends where /pricing/batch is not available.
        }
      }

      if (settled.length === 0) {
        settled = await Promise.allSettled(
          readyEntries.map(({ file, config }) =>
            getInstantPricing({
              cad_file_id: file.cadFile.id,
              material_id: config.materialId!,
              surface_finish_id: config.surfaceFinishId!,
              inspection_level_id: config.inspectionLevelId!,
              quantity: config.quantity,
              pricing_overrides: pricingOverridesPayload,
            })
          )
        );
      }

      if (cancelled || pricingRequestVersion.current !== requestVersion) {
        return;
      }

      const pricingByCadFileId = new Map<string, PricingResponse>();
      settled.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          pricingByCadFileId.set(readyEntries[index].file.cadFile.id, result.value);
        }
      });

      const successCount = pricingByCadFileId.size;
      setMultiFiles((prev) =>
        prev.map((file) => ({
          ...file,
          pricing: file.selected ? pricingByCadFileId.get(file.cadFile.id) ?? null : null,
          pricingLoading: false,
        }))
      );

      if (successCount === 0) {
        setError('Failed to calculate pricing');
      } else if (successCount < readyEntries.length) {
        setError('Some files could not be priced. Please review and retry.');
      }
    };

    fetchAllPricing().catch(() => {
      if (cancelled || pricingRequestVersion.current !== requestVersion) {
        return;
      }
      setError('Failed to calculate pricing');
      setMultiFiles((prev) => prev.map((f) => ({ ...f, pricingLoading: false })));
    });

    return () => {
      cancelled = true;
    };
  }, [
    isMultiMode,
    multiConfigSignature,
    configureIndividually,
    getEffectiveConfig,
    hasCompleteConfig,
    pricingOverridesPayload,
  ]);

  useEffect(() => {
    if (!isMultiMode) return;

    const selectedFiles = multiFiles.filter((file) => file.selected);
    if (selectedFiles.length === 0) {
      setActiveMultiFileId(null);
      return;
    }

    if (!activeMultiFileId || !selectedFiles.some((file) => file.cadFile.id === activeMultiFileId)) {
      setActiveMultiFileId(selectedFiles[0].cadFile.id);
    }
  }, [isMultiMode, multiConfigSignature, activeMultiFileId, multiFiles]);

  const handleFilesUploaded = (files: ProcessedCADUpload[]) => {
    setError(null);
    setPricing(null);
    setUseQuoteSpecificPricing(false);
    setPricingOverrides({});

    if (files.length === 1) {
      const [file] = files;
      setConfig((prev) => ({ ...prev, cadFile: file.cadFile, geometry: file.geometry }));
      setMultiFiles([{
        ...file,
        selected: true,
        materialId: null,
        surfaceFinishId: null,
        inspectionLevelId: null,
        quantity: 1,
        pricing: null,
        pricingLoading: false,
      }]);
      setActiveMultiFileId(file.cadFile.id);
    } else {
      setConfig((prev) => ({ ...prev, cadFile: null, geometry: null }));
      setMultiFiles(files.map((file) => ({
        ...file,
        selected: true,
        materialId: null,
        surfaceFinishId: null,
        inspectionLevelId: null,
        quantity: 1,
        pricing: null,
        pricingLoading: false,
      })));
      setActiveMultiFileId(files[0]?.cadFile.id ?? null);
    }

    setStep('configure');
  };

  const handleCreateSingleQuote = async () => {
    if (!config.cadFile || !pricing) return;
    setCreating(true);
    setError(null);
    try {
      const routingPayload = processRouting
        .filter((row) => row.operation.trim() || row.process.trim() || row.machine_type.trim())
        .map((row) => ({
          operation: row.operation.trim(),
          process: row.process.trim(),
          machine_type: row.machine_type.trim(),
          setup_time_minutes: Number(row.setup_time_minutes) || 0,
          cycle_time_minutes: Number(row.cycle_time_minutes) || 0,
          remarks: toOptionalString(row.remarks ?? ''),
        }));

      const quote = await createQuote({
        cad_file_id: config.cadFile.id,
        material_id: config.materialId!,
        surface_finish_id: config.surfaceFinishId!,
        inspection_level_id: config.inspectionLevelId!,
        quantity: config.quantity,
        pricing_overrides: {
          ...(pricingOverridesPayload ?? {}),
          machine_name: toOptionalString(pricingOverrides.machine_name ?? ''),
        },
        customer_name: config.customerName || undefined,
        customer_email: config.customerEmail || undefined,
        customer_company: config.customerCompany || undefined,
        rfq_number: toOptionalString(rfqCommercialForm.rfqNumber),
        rfq_date: toOptionalDateTimeString(rfqCommercialForm.rfqDate),
        quote_due_date: toOptionalDateTimeString(rfqCommercialForm.quoteDueDate),
        tolerance_notes: toOptionalString(rfqCommercialForm.toleranceNotes),
        hsn_code: toOptionalString(rfqCommercialForm.hsnCode),
        process_routing: routingPayload.length > 0 ? routingPayload : undefined,
        price_validity: toOptionalString(rfqCommercialForm.priceValidity),
        gst: toOptionalString(rfqCommercialForm.gst),
        delivery: toOptionalString(rfqCommercialForm.delivery),
        payment_terms: toOptionalString(rfqCommercialForm.paymentTerms),
        notes: config.notes || undefined,
        auto_send_email: false,
      });
      navigate(`/quotes/${quote.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
    } finally {
      setCreating(false);
    }
  };

  const handleCreateBatchQuotes = async () => {
    const selectedFiles = multiFiles.filter((file) => file.selected);
    if (selectedFiles.length === 0) {
      setError('Select at least one file to generate quote');
      return;
    }

    setCreating(true);
    setError(null);
    try {
      const routingPayload = processRouting
        .filter((row) => row.operation.trim() || row.process.trim() || row.machine_type.trim())
        .map((row) => ({
          operation: row.operation.trim(),
          process: row.process.trim(),
          machine_type: row.machine_type.trim(),
          setup_time_minutes: Number(row.setup_time_minutes) || 0,
          cycle_time_minutes: Number(row.cycle_time_minutes) || 0,
          remarks: toOptionalString(row.remarks ?? ''),
        }));

      const items = selectedFiles.map((file) => {
        const cfg = getEffectiveConfig(file);
        if (!hasCompleteConfig(cfg)) {
          throw new Error(`Incomplete configuration for ${file.cadFile.original_filename}`);
        }

        return {
          cad_file_id: file.cadFile.id,
          material_id: cfg.materialId!,
          surface_finish_id: cfg.surfaceFinishId!,
          inspection_level_id: cfg.inspectionLevelId!,
          quantity: cfg.quantity,
        };
      });

      const quote = await createCombinedQuote({
        items,
        pricing_overrides: {
          ...(pricingOverridesPayload ?? {}),
          machine_name: toOptionalString(pricingOverrides.machine_name ?? ''),
        },
        customer_name: customerName || undefined,
        customer_email: customerEmail || undefined,
        customer_company: customerCompany || undefined,
        rfq_number: toOptionalString(rfqCommercialForm.rfqNumber),
        rfq_date: toOptionalDateTimeString(rfqCommercialForm.rfqDate),
        quote_due_date: toOptionalDateTimeString(rfqCommercialForm.quoteDueDate),
        tolerance_notes: toOptionalString(rfqCommercialForm.toleranceNotes),
        hsn_code: toOptionalString(rfqCommercialForm.hsnCode),
        process_routing: routingPayload.length > 0 ? routingPayload : undefined,
        price_validity: toOptionalString(rfqCommercialForm.priceValidity),
        gst: toOptionalString(rfqCommercialForm.gst),
        delivery: toOptionalString(rfqCommercialForm.delivery),
        payment_terms: toOptionalString(rfqCommercialForm.paymentTerms),
        notes: notes || undefined,
        auto_send_email: false,
      });

      navigate(`/quotes/${quote.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create quote');
    } finally {
      setCreating(false);
    }
  };

  const resetToUpload = () => {
    setMultiFiles([]);
    setMaterialId(null);
    setSurfaceFinishId(null);
    setInspectionLevelId(null);
    setQuantity(1);
    setCustomerName('');
    setCustomerEmail('');
    setCustomerCompany('');
    setNotes('');
    setConfig({
      cadFile: null, geometry: null, materialId: null, surfaceFinishId: null,
      inspectionLevelId: null, quantity: 1,
      customerName: '', customerEmail: '', customerCompany: '', notes: '',
    });
    setPricing(null);
    setConfigureIndividually(false);
    setActiveMultiFileId(null);
    setUseQuoteSpecificPricing(false);
    setPricingOverrides({});
    setRfqCommercialForm(createDefaultRFQCommercialState());
    setProcessRouting([{ ...emptyRoutingRow }]);
    setShowProcessRouting(false);
    setStep('upload');
  };

  // Shared customer form fields
  const formFields = [
    {
      label: 'Name', type: 'text', placeholder: 'Customer name',
      value: isMultiMode ? customerName : config.customerName,
      onChange: (v: string) => isMultiMode ? setCustomerName(v) : setConfig((p) => ({ ...p, customerName: v })),
    },
    {
      label: 'Email', type: 'email', placeholder: 'customer@company.com',
      value: isMultiMode ? customerEmail : config.customerEmail,
      onChange: (v: string) => isMultiMode ? setCustomerEmail(v) : setConfig((p) => ({ ...p, customerEmail: v })),
    },
    {
      label: 'Company', type: 'text', placeholder: 'Company name',
      value: isMultiMode ? customerCompany : config.customerCompany,
      onChange: (v: string) => isMultiMode ? setCustomerCompany(v) : setConfig((p) => ({ ...p, customerCompany: v })),
    },
  ];

  const customerForm = (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">Customer Information (Optional)</h2>
      <div className="space-y-4">
        {formFields.map(({ label, type, placeholder, value, onChange }) => (
          <div key={label}>
            <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
            <input
              type={type} value={value} placeholder={placeholder}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>
        ))}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
          <textarea
            value={isMultiMode ? notes : config.notes}
            onChange={(e) => isMultiMode ? setNotes(e.target.value) : setConfig((p) => ({ ...p, notes: e.target.value }))}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            placeholder="Any special requirements or notes..."
          />
        </div>
      </div>
    </div>
  );

  const rfqAndCommercialForm = (
    <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">RFQ and Part Details</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RFQ Number</label>
            <input type="text" value={rfqCommercialForm.rfqNumber} onChange={(e) => updateRFQField('rfqNumber', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="RFQ-2026-001" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">RFQ Date</label>
            <input type="date" value={rfqCommercialForm.rfqDate} onChange={(e) => updateRFQField('rfqDate', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Quote Due Date</label>
            <input type="date" value={rfqCommercialForm.quoteDueDate} onChange={(e) => updateRFQField('quoteDueDate', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Tolerance Notes (Part-wise)</label>
            <textarea value={rfqCommercialForm.toleranceNotes} onChange={(e) => updateRFQField('toleranceNotes', e.target.value)} rows={3} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Part A: +/- 0.05mm, Part B: +/- 0.10mm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
            <input type="text" value={rfqCommercialForm.hsnCode} onChange={(e) => updateRFQField('hsnCode', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="8479" />
          </div>
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-semibold text-gray-900">Process Routing</h3>
          {!showProcessRouting && (
            <button type="button" onClick={() => setShowProcessRouting(true)} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Add Process</button>
          )}
        </div>
        {showProcessRouting && (
          <div className="space-y-3">
            {processRouting.map((row, index) => (
              <div key={`${index}-${row.operation}-${row.process}`} className="border border-gray-200 rounded-lg p-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <input type="text" value={row.operation} onChange={(e) => updateRoutingRow(index, { operation: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Operation" />
                  <input type="text" value={row.process} onChange={(e) => updateRoutingRow(index, { process: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Process" />
                  <input type="text" value={row.machine_type} onChange={(e) => {
                    const machineType = e.target.value;
                    updateRoutingRow(index, { machine_type: machineType });
                    if (index === 0) {
                      setPricingOverrides((prev) => ({ ...prev, machine_name: machineType }));
                    }
                  }} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Machine Type" />
                  <input type="number" min={0} step="0.1" value={row.setup_time_minutes} onChange={(e) => updateRoutingRow(index, { setup_time_minutes: Number(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Setup Time (minutes)" />
                  <input type="number" min={0} step="0.1" value={row.cycle_time_minutes} onChange={(e) => updateRoutingRow(index, { cycle_time_minutes: Number(e.target.value) || 0 })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Cycle Time (minutes)" />
                  <input type="text" value={row.remarks ?? ''} onChange={(e) => updateRoutingRow(index, { remarks: e.target.value })} className="w-full px-3 py-2 border border-gray-300 rounded-lg" placeholder="Remarks" />
                </div>
                <div className="mt-2 flex justify-end gap-3">
                  <button type="button" onClick={() => removeRoutingRow(index)} className="text-xs text-red-600 hover:text-red-700">Remove row</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addRoutingRow} className="px-3 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50">Add Process Row</button>
          </div>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold text-gray-900 mb-3">Vendor and Commercial Terms</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Price Validity</label>
            <select value={rfqCommercialForm.priceValidity} onChange={(e) => updateRFQField('priceValidity', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Select validity</option>
              <option value="30 days">30 days</option>
              <option value="45 days">45 days</option>
              <option value="60 days">60 days</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">GST</label>
            <select value={rfqCommercialForm.gst} onChange={(e) => updateRFQField('gst', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Select GST</option>
              <option value="0%">0%</option>
              <option value="5%">5%</option>
              <option value="12%">12%</option>
              <option value="18%">18%</option>
              <option value="28%">28%</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Delivery</label>
            <input type="date" value={rfqCommercialForm.delivery} onChange={(e) => updateRFQField('delivery', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Payment Terms</label>
            <select value={rfqCommercialForm.paymentTerms} onChange={(e) => updateRFQField('paymentTerms', e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white">
              <option value="">Select payment terms</option>
              <option value="Advance 100%">Advance 100%</option>
              <option value="50% Advance, 50% Before Dispatch">50% Advance, 50% Before Dispatch</option>
              <option value="Net 15 days">Net 15 days</option>
              <option value="Net 30 days">Net 30 days</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );

  const selectedMultiFiles = multiFiles.filter((f) => f.selected);
  const activeMultiFile = multiFiles.find((file) => file.cadFile.id === activeMultiFileId) ?? null;
  const multiTotal = selectedMultiFiles.reduce((sum, f) => sum + Number(f.pricing?.price_breakdown.total_price ?? 0), 0);
  const pricedFileCount = selectedMultiFiles.filter((f) => f.pricing !== null).length;
  const pendingFileCount = Math.max(selectedMultiFiles.length - pricedFileCount, 0);
  const allMultiPriced = selectedMultiFiles.length > 0 && selectedMultiFiles.every((f) => f.pricing !== null);
  const anyMultiLoading = selectedMultiFiles.some((f) => f.pricingLoading);
  const allSelected = multiFiles.length > 0 && multiFiles.every((file) => file.selected);

  if (editLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm text-gray-500">
        <Link to="/workspace" className="flex items-center gap-1 hover:text-gray-900 transition-colors">
          <Home className="w-3.5 h-3.5" />
          Home
        </Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <Link to="/quotes" className="hover:text-gray-900 transition-colors">My Quotes</Link>
        <ChevronRight className="w-3.5 h-3.5" />
        <span className="text-gray-900 font-medium">New Quote</span>
      </nav>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editQuoteId
              ? 'Edit Quote'
              : isMultiMode
              ? `New Quote — ${multiFiles.length} Files`
              : 'New Quote'}
          </h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {isMultiMode
              ? 'Choose files, configure shared or individual settings, and generate all quotes together.'
              : 'Upload your CAD file and configure options'}
          </p>
        </div>
          {step === 'configure' && (
          <button
            onClick={resetToUpload}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 border border-gray-200 px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Start Over
          </button>
        )}
      </div>

      {/* Progress steps — single-file only */}
      {!isMultiMode && (
        <div className="flex items-center gap-2">
          {(['upload', 'configure'] as const).map((s, i) => {
            const steps = ['upload', 'configure'] as const;
            const currentIdx = steps.indexOf(step);
            const isDone = i < currentIdx;
            const isCurrentStep = step === s;
            const labels = ['Upload File', 'Configure & Price'];
            return (
              <div key={s} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
                      isDone
                        ? 'bg-green-500 text-white'
                        : isCurrentStep
                        ? 'bg-primary-600 text-white'
                        : 'bg-gray-100 text-gray-400'
                    }`}
                  >
                    {isDone ? <CheckCircle className="w-4 h-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-sm font-medium ${
                      isCurrentStep ? 'text-primary-700' : isDone ? 'text-green-600' : 'text-gray-400'
                    }`}
                  >
                    {labels[i]}
                  </span>
                </div>
                {i < 1 && (
                  <div className={`h-px w-10 mx-1 ${isDone ? 'bg-green-400' : 'bg-gray-200'}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      {/* Upload step */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload CAD File</h2>
          <FileUpload onFilesUploaded={handleFilesUploaded} />
        </div>
      )}

      {/* Single-file configure */}
      {step === 'configure' && !isMultiMode && config.cadFile && (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">3D Preview</h2>
              <ModelViewer
                fileId={config.cadFile.id}
                fileFormat={config.cadFile.file_format}
                geometry={config.geometry || undefined}
              />
              {config.geometry && (
                <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                  {[
                    { label: 'Volume', value: `${config.geometry.volume.toFixed(2)} cm³` },
                    { label: 'Surface Area', value: `${config.geometry.surface_area.toFixed(2)} cm²` },
                    { label: 'Complexity', value: config.geometry.complexity_score.toFixed(2) },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-lg p-3">
                      <p className="text-gray-500">{label}</p>
                      <p className="font-semibold text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>
              )}

              {config.geometry && getDFXSeverity(config.geometry) !== 'ok' && (
                <div
                  className={`mt-4 rounded-lg border p-3 text-sm ${
                    getDFXSeverity(config.geometry) === 'error'
                      ? 'bg-red-50 border-red-200 text-red-800'
                      : 'bg-yellow-50 border-yellow-200 text-yellow-800'
                  }`}
                >
                  {getDFXSeverity(config.geometry) === 'error'
                    ? 'DFX Error: This model has manufacturability risks that can block production quality.'
                    : 'DFX Warning: This model may increase machining risk, cost, or lead time.'}
                </div>
              )}
            </div>

            {config.geometry && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">DFX Analysis</h2>
                <DFXAnalysis geometry={config.geometry} />
              </div>
            )}

            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Configuration</h2>
              <ConfigurationPanel
                materialId={config.materialId}
                surfaceFinishId={config.surfaceFinishId}
                inspectionLevelId={config.inspectionLevelId}
                quantity={config.quantity}
                quoteSpecificPricingEnabled={useQuoteSpecificPricing}
                onQuoteSpecificPricingEnabledChange={setUseQuoteSpecificPricing}
                pricingOverrides={pricingOverrides}
                onPricingOverridesChange={setPricingOverrides}
                onMaterialChange={(id) => setConfig((p) => ({ ...p, materialId: id }))}
                onSurfaceFinishChange={(id) => setConfig((p) => ({ ...p, surfaceFinishId: id }))}
                onInspectionLevelChange={(id) => setConfig((p) => ({ ...p, inspectionLevelId: id }))}
                onQuantityChange={(qty) => setConfig((p) => ({ ...p, quantity: qty }))}
              />
            </div>
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 self-start">
            <PricingDisplay pricing={pricing} loading={pricingLoading} />
            {customerForm}
            {rfqAndCommercialForm}
            <button
              onClick={handleCreateSingleQuote}
              disabled={!pricing || creating}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating
                ? <><Loader2 className="w-5 h-5 animate-spin" />Generating Quote...</>
                : <><FileText className="w-5 h-5" />Generate Quote</>}
            </button>
          </div>
        </div>
      )}

      {/* Multi-file configure */}
      {step === 'configure' && isMultiMode && (
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-100 flex items-center gap-2">
                <Package className="w-5 h-5 text-primary-600" />
                <h2 className="text-lg font-semibold text-gray-900">Files ({selectedMultiFiles.length}/{multiFiles.length} selected)</h2>
              </div>

              <div className="divide-y divide-gray-100 max-h-[60vh] overflow-y-auto">
                {multiFiles.map((entry, i) => (
                  <div
                    key={entry.cadFile.id}
                    className={`px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 ${
                      configureIndividually && activeMultiFileId === entry.cadFile.id ? 'bg-primary-50/60' : ''
                    }`}
                  >
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={entry.selected}
                        onChange={(e) => {
                          const selected = e.target.checked;
                          updateMultiFile(entry.cadFile.id, { selected, pricing: null, pricingLoading: false });
                        }}
                        className="w-4 h-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                      />
                    </label>

                    <span className="w-6 h-6 flex-shrink-0 rounded-full bg-primary-100 text-primary-700 text-xs font-bold flex items-center justify-center">
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0 w-full">
                      <p className="font-medium text-gray-900 truncate">{entry.cadFile.original_filename}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {entry.cadFile.file_format.toUpperCase()} &bull;{' '}
                        {entry.geometry.volume.toFixed(2)} cm³ &bull;{' '}
                        complexity {entry.geometry.complexity_score.toFixed(2)}
                      </p>
                    </div>
                    <div className="flex w-full sm:w-auto items-center justify-between sm:justify-end gap-3">
                      {configureIndividually && entry.selected && (
                        <button
                          onClick={() => setActiveMultiFileId(entry.cadFile.id)}
                          className={`px-2.5 py-1.5 text-xs font-medium rounded border whitespace-nowrap ${
                            activeMultiFileId === entry.cadFile.id
                              ? 'text-primary-700 bg-primary-100 border-primary-300'
                              : 'text-gray-700 bg-white border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          Configure
                        </button>
                      )}

                      <button
                        onClick={() => setPreviewFile(entry)}
                        className="px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded border border-blue-200 flex items-center gap-1 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>3D Preview</span>
                      </button>

                      <div className="text-right flex-shrink-0 min-w-[110px]">
                        {!entry.selected ? (
                          <span className="text-xs text-gray-400">Excluded</span>
                        ) : entry.pricingLoading ? (
                          <Loader2 className="w-4 h-4 text-primary-500 animate-spin ml-auto" />
                        ) : entry.pricing ? (
                          <>
                            <p className="font-semibold text-gray-900">
                              {formatINR(entry.pricing.price_breakdown.total_price)}
                            </p>
                            <p className="text-xs text-gray-400">
                              {formatINR(entry.pricing.price_breakdown.unit_price)}/unit
                            </p>
                          </>
                        ) : (
                          <span className="text-xs text-gray-400">— configure →</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="px-4 sm:px-6 py-4 bg-primary-50 border-t border-primary-100 flex justify-between items-center gap-3">
                <div>
                  <p className="font-semibold text-primary-900">Grand Total ({pricedFileCount}/{selectedMultiFiles.length} selected priced)</p>
                  {pendingFileCount > 0 && (
                    <p className="text-xs text-primary-700 mt-0.5">
                      Waiting for pricing for {pendingFileCount} file{pendingFileCount === 1 ? '' : 's'}.
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold text-primary-700">{formatINR(multiTotal)}</p>
                  {anyMultiLoading && (
                    <p className="text-xs text-primary-600">Updating...</p>
                  )}
                </div>
              </div>
            </div>

            {customerForm}
            {rfqAndCommercialForm}
          </div>

          <div className="space-y-6 lg:sticky lg:top-6 self-start">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                    <Settings2 className="w-4 h-4 text-gray-500" />
                    {configureIndividually ? 'Individual Configuration' : 'Shared Configuration'}
                  </h2>
                  <p className="text-sm text-gray-500">
                    {configureIndividually
                      ? 'Configure each selected file separately.'
                      : `Applies to all selected files (${selectedMultiFiles.length}).`}
                  </p>
                </div>
              </div>

              <div className="mb-4 rounded-lg border border-gray-200 p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">Include files in this quote run</p>
                  <button
                    type="button"
                    onClick={() => {
                      const nextSelected = !allSelected;
                      setMultiFiles((prev) =>
                        prev.map((file) => ({
                          ...file,
                          selected: nextSelected,
                          pricing: null,
                          pricingLoading: false,
                        }))
                      );
                    }}
                    className="text-xs font-medium text-primary-700 hover:text-primary-800"
                  >
                    {allSelected ? 'Deselect all' : 'Select all'}
                  </button>
                </div>

                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800">Configure individually</p>
                  <button
                    type="button"
                    onClick={() => setConfigureIndividually((prev) => !prev)}
                    className={`inline-flex items-center rounded-full h-7 w-12 p-1 transition-colors ${
                      configureIndividually ? 'bg-primary-600' : 'bg-gray-300'
                    }`}
                    aria-pressed={configureIndividually}
                  >
                    <span
                      className={`h-5 w-5 rounded-full bg-white transition-transform ${
                        configureIndividually ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {configureIndividually && activeMultiFile && (
                <div className="mb-4 rounded-lg bg-primary-50 border border-primary-100 p-3">
                  <p className="text-xs text-primary-700">Editing</p>
                  <p className="text-sm font-semibold text-primary-900 truncate">{activeMultiFile.cadFile.original_filename}</p>
                </div>
              )}

              <ConfigurationPanel
                materialId={configureIndividually ? (activeMultiFile?.materialId ?? null) : materialId}
                surfaceFinishId={configureIndividually ? (activeMultiFile?.surfaceFinishId ?? null) : surfaceFinishId}
                inspectionLevelId={configureIndividually ? (activeMultiFile?.inspectionLevelId ?? null) : inspectionLevelId}
                quantity={configureIndividually ? (activeMultiFile?.quantity ?? 1) : quantity}
                quoteSpecificPricingEnabled={useQuoteSpecificPricing}
                onQuoteSpecificPricingEnabledChange={setUseQuoteSpecificPricing}
                pricingOverrides={pricingOverrides}
                onPricingOverridesChange={setPricingOverrides}
                onMaterialChange={(id) => {
                  if (configureIndividually) {
                    if (!activeMultiFileId) return;
                    updateMultiFile(activeMultiFileId, { materialId: id });
                    return;
                  }
                  setMaterialId(id);
                }}
                onSurfaceFinishChange={(id) => {
                  if (configureIndividually) {
                    if (!activeMultiFileId) return;
                    updateMultiFile(activeMultiFileId, { surfaceFinishId: id });
                    return;
                  }
                  setSurfaceFinishId(id);
                }}
                onInspectionLevelChange={(id) => {
                  if (configureIndividually) {
                    if (!activeMultiFileId) return;
                    updateMultiFile(activeMultiFileId, { inspectionLevelId: id });
                    return;
                  }
                  setInspectionLevelId(id);
                }}
                onQuantityChange={(qty) => {
                  if (configureIndividually) {
                    if (!activeMultiFileId) return;
                    updateMultiFile(activeMultiFileId, { quantity: qty });
                    return;
                  }
                  setQuantity(qty);
                }}
                disabled={configureIndividually && !activeMultiFile}
              />
            </div>

            <button
              onClick={handleCreateBatchQuotes}
              disabled={!allMultiPriced || anyMultiLoading || creating}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Generating Combined Quote...</>
              ) : anyMultiLoading ? (
                <><Loader2 className="w-5 h-5 animate-spin" />Calculating Prices...</>
              ) : (
                <><FileText className="w-5 h-5" />Generate One Quote ({selectedMultiFiles.length} Files)</>
              )}
            </button>
          </div>

          {previewFile && (
            <FilePreviewModal
              cadFile={previewFile.cadFile}
              geometry={previewFile.geometry}
              onClose={() => setPreviewFile(null)}
            />
          )}
        </div>
      )}
    </div>
  );
};

export default QuoteBuilder;
