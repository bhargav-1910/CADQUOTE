# Bulk File Upload & Cost Estimation System

## Overview

The Bulk Upload system enables efficient processing of multiple CAD files at once, with real-time cost estimation and visualization. This document describes the design, implementation, and usage of the system.

## Architecture

### Frontend Components

#### 1. **BulkUploadManager** (`BulkUploadManager.tsx`)
- **Purpose**: Main orchestrator for bulk upload operations
- **Features**:
  - Drag-and-drop multiple file uploads
  - Real-time progress tracking per file
  - Configurable concurrent processing (1-10 files at a time)
  - Pause/Resume functionality
  - File selection for batch operations
  - Status visualization (pending, uploading, processing, done, error)
  
- **Key Properties**:
  ```typescript
  interface BulkFileEntry {
    id: string;                    // Unique identifier
    file: File;                    // File object
    filename: string;              // Original filename
    fileSize: number;              // File size in bytes
    status: BulkFileStatus;        // Current processing status
    progress: number;              // 0-100%
    errorMsg?: string;             // Error message if failed
    cadFile?: CADFile;             // Uploaded CAD file object
    geometry?: GeometryAnalysis;   // Geometry analysis results
    pricing?: PricingResponse;     // Pricing estimate
    config?: BatchConfig;          // Applied configuration
  }
  ```

#### 2. **BatchConfigPanel** (`BatchConfigPanel.tsx`)
- **Purpose**: Apply shared configuration to multiple files at once
- **Features**:
  - Select material from available options
  - Choose surface finish
  - Set inspection level
  - Specify quantity per file
  - Instant application to selected files
  
- **Workflow**:
  1. User selects multiple files (checkboxes in BulkUploadManager)
  2. Click "Batch Configure (N selected)"
  3. Modal opens with configuration options
  4. Settings are applied to all selected files at once
  5. Files transition to "configured" status for pricing

#### 3. **BulkCostEstimator** (`BulkCostEstimator.tsx`)
- **Purpose**: Real-time cost calculation and visualization
- **Features**:
  - **Summary Cards**: Total cost, average lead time, file count, average cost per file
  - **Cost Breakdown Pie Chart**: Visual breakdown of material, machining, finish, and inspection costs
  - **Cost by File Bar Chart**: Individual file cost comparison
  - **Cost Summary Table**: Detailed cost breakdown with percentages
  - **Per-File Breakdown**: Expandable details for each file
  
- **Data Processing**:
  - Batches pricing requests for efficiency
  - Aggregates costs across all files
  - Calculates percentages and metrics
  - Updates in real-time as files are configured

### Backend API

#### New Endpoint: `POST /pricing/bulk`
```python
@router.post("/pricing/bulk", response_model=List[PricingResponse])
async def get_bulk_pricing(request_data: dict, db: AsyncSession)
```

**Request Format**:
```json
{
  "requests": [
    {
      "cad_file_id": "uuid",
      "material_id": "uuid",
      "surface_finish_id": "uuid",
      "inspection_level_id": "uuid",
      "quantity": 1
    },
    ...
  ]
}
```

**Response**: Array of `PricingResponse` objects with complete cost breakdown for each file.

**Benefits**:
- Single API call for multiple pricing requests
- Efficient batch processing
- Reduced network overhead
- Fallback error handling for individual files

### Data Flow

```
User Upload Files
    ↓
BulkUploadManager tracks each file
    ↓
Concurrent processing (configurable 1-10)
    ├─→ File 1: Upload → Processing → Geometry Analysis
    ├─→ File 2: Upload → Processing → Geometry Analysis
    ├─→ File N: Upload → Processing → Geometry Analysis
    ↓
Files transition to "configured" status
    ↓
User applies BatchConfig to selected files
    ↓
BulkCostEstimator calculates pricing
    ├─→ Batch API call with all configured files
    ├─→ Instant cost visualization
    ├─→ Real-time chart updates
    ↓
Results displayed with:
    ├─→ Summary cards (totals, averages, metrics)
    ├─→ Interactive charts
    ├─→ Detailed per-file breakdown
    ↓
Ready for quote creation or export
```

## Usage Guide

### Step 1: Navigate to Bulk Upload
- From home page, click "Bulk Upload" button
- Or navigate to `/quote/bulk`

### Step 2: Upload Files
1. Click upload area or drag-drop CAD files
2. Monitor upload progress in real-time
3. Adjust "Max concurrent" based on system resources
4. Pause/resume as needed

### Step 3: Configure Files
1. **Option A - Individual Configuration**: 
   - Click on a file to configure it manually
   
2. **Option B - Batch Configuration**:
   - Select multiple files (checkboxes on the left)
   - Click "Batch Configure (N)" button
   - Choose material, finish, inspection level, quantity
   - Click "Apply to Selected"

### Step 4: View Cost Estimates
- As files are configured, BulkCostEstimator automatically calculates costs
- Charts update in real-time
- Expand individual files to see detailed breakdown

### Step 5: Create Quotes
- Review final estimates
- Proceed to create batch quotes from the estimator
- Or individual quotes per file

## Configuration Options

### Concurrency Control
- **Min**: 1 (slowest but minimal resource usage)
- **Recommended**: 3-5 (balanced performance)
- **Max**: 10 (maximum throughput)
- Adjustable during processing via pause/resume

### File Support
- **Formats**: STEP (.step, .stp), STL (.stl)
- **Max Size**: 100 MB per file
- **Max Batch**: 100 files per bulk operation

### Configuration Options
- **Material**: Available materials from database
- **Surface Finish**: All active finishes
- **Inspection Level**: Available inspection standards
- **Quantity**: 1-10,000 units per file

## Performance Considerations

### Frontend Optimization
- **Concurrent Processing**: Files processed in parallel, controlled by user setting
- **Lazy Loading**: Charts render only when data available
- **Debounced Updates**: Cost calculations batched to avoid excessive re-renders
- **Progressive Enhancement**: UI remains responsive during processing

### Backend Optimization
- **Batch Pricing API**: Single endpoint handles multiple files
- **Efficient Database Queries**: Cached configuration lookups
- **Error Isolation**: Individual file errors don't halt batch
- **Scalability**: Can handle 100+ files in single request

## Error Handling

### Frontend
- Individual file errors don't affect others
- Clear error messages displayed per file
- Option to remove failed files and retry
- Graceful degradation if API unavailable

### Backend
- Detailed error messages for debugging
- Per-file error tracking
- Fallback to individual pricing if batch fails
- Comprehensive logging

## Best Practices

1. **Organization**
   - Group similar parts together
   - Use batch config for parts with same specs
   - Start with small batches (5-10) before doing 50+

2. **Performance**
   - Adjust concurrency based on file sizes
   - Large files (50+ MB): Use concurrency of 1-2
   - Small files (< 5 MB): Can use concurrency of 5-10

3. **Cost Management**
   - Review per-file costs before batch quote
   - Use cost breakdown pie chart to identify expensive components
   - Consider design changes for high-cost files

4. **Quality Assurance**
   - Verify quantities are correct
   - Check material compatibility
   - Review lead time assumptions
   - Validate with DFM analysis

## Integration Points

### With Existing System
- **File Upload**: Uses existing `uploadCADFile()` API
- **Geometry Analysis**: Leverages existing `pollForGeometry()` logic
- **Pricing Engine**: Reuses `calculate_pricing()` service
- **Quote Creation**: Compatible with existing quote workflow

### Future Enhancements
- **Export**: CSV/Excel export of cost estimates
- **Templates**: Save and reuse batch configurations
- **Scheduling**: Queue uploads for off-peak processing
- **Webhooks**: Notifications when batch completes
- **Import**: Bulk import from spreadsheet
- **Analytics**: Cost trends and patterns across batches

## API Reference

### POST `/pricing/bulk`

**Request**:
```json
{
  "requests": [
    {
      "cad_file_id": "550e8400-e29b-41d4-a716-446655440000",
      "material_id": "550e8400-e29b-41d4-a716-446655440001",
      "surface_finish_id": "550e8400-e29b-41d4-a716-446655440002",
      "inspection_level_id": "550e8400-e29b-41d4-a716-446655440003",
      "quantity": 10
    }
  ]
}
```

**Response**:
```json
[
  {
    "cad_file_id": "550e8400-e29b-41d4-a716-446655440000",
    "file_name": "part_001.step",
    "quantity": 10,
    "material": {...},
    "surface_finish": {...},
    "inspection_level": {...},
    "volume_cm3": 125.5,
    "weight_kg": 0.356,
    "bounding_box": {...},
    "complexity_score": 2.3,
    "price_breakdown": {
      "material_cost": 10.50,
      "machining_cost": 85.20,
      "finish_cost": 15.00,
      "inspection_cost": 5.30,
      "subtotal": 116.00,
      "margin_factor": 1.25,
      "total_price": 1450.00,
      "unit_price": 145.00
    },
    "estimated_lead_time_days": 5.0,
    "pricing_explanation": {...}
  }
]
```

## Troubleshooting

### Files Stuck in "Uploading" State
- Check internet connection
- Verify file size < 100 MB
- Reduce concurrent processing
- Refresh page and retry

### Geometry Processing Fails
- CAD file may be corrupted
- Ensure file format is correct (.step/.stp/.stl)
- Try re-exporting from source software
- Check file permissions

### Cost Estimates Seem High/Low
- Verify material selection
- Check quantity setting
- Review finish & inspection level complexity
- Compare with previous similar parts

### Batch Config Not Applied
- Ensure files are fully processed (status = "configured")
- Check all dropdown selections made
- Verify quantity field has valid value
- Try selecting fewer files and retrying

## Files Modified/Created

### New Files
- `frontend/src/components/BulkUploadManager.tsx` - Main bulk upload component
- `frontend/src/components/BatchConfigPanel.tsx` - Batch configuration modal
- `frontend/src/components/BulkCostEstimator.tsx` - Cost visualization component
- `frontend/src/pages/BulkQuoteBuilder.tsx` - Bulk quote page with help

### Modified Files
- `frontend/src/App.tsx` - Added route for `/quote/bulk`
- `frontend/src/pages/HomePage.tsx` - Added "Bulk Upload" button
- `frontend/src/services/api.ts` - Added `calculateBulkPricing()` function
- `backend/app/schemas/schemas.py` - Added `BulkPricingRequest` schema
- `backend/app/api/quotes.py` - Added `/pricing/bulk` endpoint

## Testing Checklist

- [ ] Single file bulk upload
- [ ] Multiple file upload
- [ ] Concurrent processing with various concurrency levels
- [ ] Pause/resume functionality
- [ ] Batch configuration with multiple files
- [ ] Cost estimation accuracy
- [ ] Chart rendering and interactivity
- [ ] Error handling for failed files
- [ ] Large batch (50+) handling
- [ ] Mobile responsiveness
- [ ] Cross-browser compatibility

## Support & Maintenance

- Monitor API endpoint performance for batch requests
- Track error rates for bulk processing
- Gather user feedback on UX improvements
- Consider caching configuration options
- Regular audit of concurrent processing limits
- Performance monitoring for large batches (100+ files)
