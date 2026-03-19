# Bulk Upload System - Developer's Guide

## 🚀 Quick Start (5 minutes)

### 1. View the Implementation
```bash
# Frontend Components
open frontend/src/components/BulkUploadManager.tsx
open frontend/src/components/BatchConfigPanel.tsx
open frontend/src/components/BulkCostEstimator.tsx

# Pages
open frontend/src/pages/BulkQuoteBuilder.tsx

# Backend
open backend/app/api/quotes.py
```

### 2. Access the Feature
```
Frontend: Navigate to http://localhost:3000/quote/bulk
Or click "Bulk Upload" button on home page
```

### 3. Test it
1. Drag-drop 3-5 CAD files
2. Click "Start Processing"
3. Select files for batch config
4. Click "Batch Configure (N)"
5. Choose material, finish, inspection level
6. View cost estimates in charts

---

## 📁 File Structure

```
Quote/
├── BULK_UPLOAD_DOCUMENTATION.md      ← Full API docs
├── BULK_UPLOAD_QUICK_REFERENCE.md     ← Quick ref
├── BULK_UPLOAD_DESIGN_RATIONALE.md    ← Why this design
├── BULK_UPLOAD_DEV_GUIDE.md          ← This file
│
├── frontend/src/
│   ├── components/
│   │   ├── BulkUploadManager.tsx      ← 330 lines (main)
│   │   ├── BatchConfigPanel.tsx       ← 120 lines (config modal)
│   │   └── BulkCostEstimator.tsx      ← 380 lines (visualization)
│   ├── pages/
│   │   └── BulkQuoteBuilder.tsx       ← 60 lines (page)
│   ├── services/
│   │   └── api.ts                     ← +calculateBulkPricing()
│   └── App.tsx                        ← +route /quote/bulk
│
└── backend/app/
    ├── api/
    │   └── quotes.py                  ← +POST /pricing/bulk endpoint
    └── schemas/
        └── schemas.py                 ← +BulkPricingRequest schema
```

---

## 🔧 How to Extend

### Add New Feature: Save/Load Configurations

#### Step 1: Add to BatchConfigPanel
```typescript
// BatchConfigPanel.tsx - Add save button
<button onClick={() => saveConfig(config, "MyConfig")}>
  Save Configuration
</button>
```

#### Step 2: Create Config Storage Service
```typescript
// services/configStorage.ts
export const saveConfig = async (config: BatchConfig, name: string) => {
  // Save to localStorage or backend
  localStorage.setItem(`config_${name}`, JSON.stringify(config));
};

export const loadConfigs = (): Record<string, BatchConfig> => {
  // Load from localStorage
  return Object.keys(localStorage)
    .filter(k => k.startsWith('config_'))
    .reduce((acc, key) => {
      acc[key.replace('config_', '')] = JSON.parse(localStorage[key]);
      return acc;
    }, {});
};
```

#### Step 3: Update BatchConfigPanel to use it
```typescript
const [savedConfigs, setSavedConfigs] = useState(() => loadConfigs());

const handleLoadConfig = (name: string) => {
  const config = savedConfigs[name];
  setConfig(config);
};

return (
  <>
    {/* Existing form */}
    
    {/* Load saved configs */}
    <div>
      {Object.keys(savedConfigs).map(name => (
        <button key={name} onClick={() => handleLoadConfig(name)}>
          Load: {name}
        </button>
      ))}
    </div>
  </>
);
```

### Add New Feature: Export Results to CSV

#### Step 1: Create Export Service
```typescript
// services/exportService.ts
export const exportToCSV = (entries: BulkFileEntry[]): void => {
  const headers = ['Filename', 'Material', 'Quantity', 'Total Cost', 'Lead Time'];
  
  const rows = entries
    .filter(e => e.pricing)
    .map(e => [
      e.filename,
      e.pricing?.material.name,
      e.config?.quantity,
      e.pricing?.price_breakdown.total_price,
      e.pricing?.estimated_lead_time_days,
    ]);
  
  const csv = [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
  
  downloadCSV(csv, 'bulk-quotes.csv');
};

const downloadCSV = (csv: string, filename: string) => {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.URL.revokeObjectURL(url);
};
```

#### Step 2: Add Export Button to BulkCostEstimator
```typescript
import { exportToCSV } from '@/services/exportService';

<button 
  onClick={() => exportToCSV(entries)}
  className="px-4 py-2 bg-green-600 text-white rounded"
>
  📥 Export Results
</button>
```

### Modify: Change Concurrency Defaults

```typescript
// BulkUploadManager.tsx
const [maxConcurrent, setMaxConcurrent] = useState(5);  // Changed from 3 to 5
```

### Modify: Add File Size Limit

```typescript
// BulkUploadManager.tsx
const { getRootProps, getInputProps } = useDropzone({
  // ...
  maxSize: 200 * 1024 * 1024,  // Changed from 100MB to 200MB
});
```

### Modify: Change Batch Size Limit

```typescript
// backend/app/schemas/schemas.py
class BulkPricingRequest(BaseModel):
    requests: List[PricingRequest] = Field(..., min_items=1, max_items=200)  # Changed from 100
```

---

## 🐛 Debugging

### Issue: Files Stuck in "Uploading" State

```typescript
// Enable debug logging in BulkUploadManager.tsx
const processFileEntry = async (entry: BulkFileEntry) => {
  try {
    console.log(`[DEBUG] Processing file: ${entry.filename}`);
    updateEntry(entry.id, { status: 'uploading', progress: 20 });
    console.log(`[DEBUG] Uploading: ${entry.filename}`);
    
    const uploadedFile = await uploadCADFile(entry.file);
    console.log(`[DEBUG] Uploaded: ${uploadedFile.id}`);
    
    // ... rest of function
  } catch (err) {
    console.error(`[ERROR] Processing ${entry.filename}:`, err);
  }
};
```

### Issue: Cost Estimation Not Updating

```typescript
// Add logging to BulkCostEstimator.tsx
useEffect(() => {
  console.log('[DEBUG] Configured entries count:', entries.length);
  console.log('[DEBUG] Entries:', entries);
  
  const fetchPricing = async () => {
    const pricingRequests = entries
      .filter((e) => e.geometry && e.config && e.cadFile);
    
    console.log('[DEBUG] Pricing requests:', pricingRequests);
    
    // ... rest of function
  };
  
  fetchPricing();
}, [entries]);
```

### API Testing

```bash
# Test bulk pricing endpoint
curl -X POST http://localhost:8000/api/pricing/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "requests": [
      {
        "cad_file_id": "550e8400-e29b-41d4-a716-446655440000",
        "material_id": "550e8400-e29b-41d4-a716-446655440001",
        "surface_finish_id": "550e8400-e29b-41d4-a716-446655440002",
        "inspection_level_id": "550e8400-e29b-41d4-a716-446655440003",
        "quantity": 5
      }
    ]
  }'
```

---

## 📊 Component State Management

### BulkUploadManager State
```typescript
entries: BulkFileEntry[]        // List of files being processed
selectedIds: Set<string>        // Files selected for batch config
maxConcurrent: number           // Concurrency limit (1-10)
isPaused: boolean              // Processing paused?
showBatchConfig: boolean        // Modal visible?
```

### BulkCostEstimator State
```typescript
stats: AggregatedStats | null   // Calculated cost statistics
loading: boolean                // API call in progress?
error: string | null            // Error message if failed
expandedFiles: Set<string>      // Expanded per-file details
```

### BatchConfigPanel State
```typescript
config: BatchConfig             // Current config selection
materials: Material[]           // Available materials
finishes: SurfaceFinish[]      // Available finishes
inspectionLevels: InspectionLevel[]  // Available levels
loading: boolean               // Fetching options?
```

---

## 🎯 Key Functions Reference

### BulkUploadManager

| Function | Purpose | Usage |
|----------|---------|-------|
| `processFileEntry()` | Upload & process single file | Internal |
| `processQueue()` | Manage concurrent processing | Internal |
| `updateEntry()` | Update file entry state | Internal |
| `toggleSelection()` | Select/deselect file | Internal |
| `selectAll()` / `deselectAll()` | Batch selection | Internal |

### BulkCostEstimator

| Function | Purpose | Usage |
|----------|---------|-------|
| `fetchPricing()` | Call batch pricing API | Internal |
| `aggregateStats()` | Calculate totals & metrics | Internal |
| `toggleFileExpanded()` | Show/hide file details | Internal |

### API Service

| Function | Purpose | Usage |
|----------|---------|-------|
| `calculateBulkPricing()` | Call /pricing/bulk endpoint | `await calculateBulkPricing(requests)` |

---

## 🧪 Testing Checklist

### Manual Testing
- [ ] Upload 1 file (sanity check)
- [ ] Upload 5 files (normal operation)
- [ ] Upload 20 files (stress test)
- [ ] Pause/resume processing
- [ ] Adjust concurrency during processing
- [ ] Batch configure files
- [ ] Check cost calculations match single file pricing
- [ ] Export results (when implemented)
- [ ] Test error scenarios (invalid file, etc.)

### Edge Cases
- [ ] Very large file (100MB)
- [ ] Very small file (100KB)
- [ ] Mixed file types (STEP + STL)
- [ ] Rapid selection/deselection
- [ ] Configure empty selection
- [ ] Network disconnect during upload
- [ ] Backend timeout during processing

### Cross-Browser
- [ ] Chrome/Edge (Chromium)
- [ ] Firefox
- [ ] Safari
- [ ] Mobile (iOS Safari, Android Chrome)

---

## 📈 Performance Profiling

### Frontend Performance
```typescript
// Add performance markers
console.time('bulk-pricing-api');
const results = await calculateBulkPricing(requests);
console.timeEnd('bulk-pricing-api');

// Should be < 5 seconds for 50 files
```

### Memory Usage
```typescript
// Monitor during large batch uploads
const entries = state.filter(e => e.geometry);  // Check object count
console.log(`Memory usage: ${Math.round(performance.memory.usedJSHeapSize / 1048576)}MB`);
```

---

## 📚 Related Documentation

- **Full API Docs**: `BULK_UPLOAD_DOCUMENTATION.md`
- **Quick Reference**: `BULK_UPLOAD_QUICK_REFERENCE.md`
- **Design Rationale**: `BULK_UPLOAD_DESIGN_RATIONALE.md`

---

## 🆘 Getting Help

### Common Questions

**Q: Where do I add authentication?**
A: Auth is already handled by the API middleware. BulkUploadManager uses same API client that includes auth headers.

**Q: How do I customize the UI?**
A: All components use Tailwind CSS classes. Edit className attributes directly.

**Q: Can I change the default material/finish?**
A: In BatchConfigPanel, update the setConfig defaults in useEffect:
```typescript
if (mats.length > 0) setConfig((c) => ({ ...c, material_id: mats[2].id }));
```

**Q: How do I add webhook notifications?**
A: Add callback after successful batch:
```typescript
if (successfulFiles.length > 0) {
  await notifyWebhook('bulk_upload_complete', { 
    count: successfulFiles.length,
    totalCost: stats.totalCost 
  });
}
```

---

## 🎓 Learning Path

1. **Start Here**: Read this guide
2. **Understand Flow**: Review `BULK_UPLOAD_QUICK_REFERENCE.md` 
3. **Study Design**: Read `BULK_UPLOAD_DESIGN_RATIONALE.md`
4. **Explore Code**: Read source files (components are well-commented)
5. **Extend**: Make modifications using examples above
6. **Deploy**: Test thoroughly before production

---

## ✅ Deployment Checklist

Before deploying to production:

- [ ] Run all tests (manual testing checklist above)
- [ ] Test with real files from customers
- [ ] Load test with 50+ files
- [ ] Monitor error rates
- [ ] Set up performance monitoring
- [ ] Document any custom modifications
- [ ] Plan for scaling (see roadmap in other docs)
- [ ] Set up alerting for API errors
- [ ] Backup any user configurations
- [ ] Test on target browsers/devices

---

## 🚀 Next Steps

1. **Now**: Explore the code, understand how each component works
2. **Soon**: Implement extensions (save configs, export, etc.)
3. **Later**: Add analytics, improve visualization, scale to larger batches
4. **Future**: Integrate with async queue system for enterprise use

Happy coding! 🎉
