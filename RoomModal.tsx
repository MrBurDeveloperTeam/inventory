import React, { useState, useMemo } from 'react';
import {
  X,
  Package,
  Search,
  Plus,
  Minus,
  Trash2,
  Edit3,
  ChevronDown,
  FileDown,
  FileSpreadsheet,
  FileUp,
  Scan,
  Upload,
  Camera,
  Loader2,
  AlertCircle,
  Calendar,
  Activity,
  ArrowDownLeft,
  ArrowRight,
  History,
  Clock,
  Tag,
  Truck,
  FileText,
  Layers,
  Map as MapIcon
} from 'lucide-react';
import { Room, Item, ActivityLog, Category, UOM, ItemBatch } from './types';
import { CATEGORIES, UOMS } from './constants';
import { filesToImages } from './src/utils/fileHelpers';
import { extractDataFromImage } from './services/geminiService';

interface RoomModalProps {
  room: Room;
  allRooms: Room[];
  logs: ActivityLog[];
  onClose: () => void;
  onUpdateName: (id: string, name: string) => void;
  onReceive: (roomId: string, itemData: Partial<Item>, qty: number, price: number, purchaseDate: string, expiry?: string) => void;
  onReceiveBatch?: (roomId: string, items: Array<{ itemData: Partial<Item>; qty: number; price: number; purchaseDate: string; expiry?: string }>) => void;
  onUpdateQty: (roomId: string, itemId: string, delta: number) => void;
  onUpdateBatchQty: (roomId: string, itemId: string, batchIndex: number, delta: number) => void;
  onTransfer: (fromRoomId: string, toRoomId: string, itemId: string, quantity: number, batchIndex?: number) => void;
  onDeleteItem: (roomId: string, itemId: string) => void;
  onUpdateItem: (roomId: string, itemId: string, itemData: Partial<Item>) => void;
  onUpdateBatch: (roomId: string, itemId: string, batchId: string, batchData: Partial<ItemBatch>) => void;
  readOnly?: boolean;
}

const RoomModal: React.FC<RoomModalProps> = ({ room, allRooms, logs, onClose, onUpdateName, onReceive, onReceiveBatch, onUpdateQty, onUpdateBatchQty, onTransfer, onDeleteItem, onUpdateItem, onUpdateBatch, readOnly = false }) => {
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveMode, setReceiveMode] = useState<'existing' | 'new' | 'edit'>('existing');
  const [selectedItemIdx, setSelectedItemIdx] = useState<string>('');
  const [formData, setFormData] = useState<Partial<Item>>({
    name: '', brand: '', category: 'consumables', uom: 'box', code: '', vendor: '', description: ''
  });
  const [receiveQty, setReceiveQty] = useState(0);
  const [receivePrice, setReceivePrice] = useState(0);
  const [showProductList, setShowProductList] = useState(false);
  const [productSearch, setProductSearch] = useState('');
  const [deleteProductConfirm, setDeleteProductConfirm] = useState<{name: string, brand: string} | null>(null);

  const handleDeleteGlobalProduct = (name: string, brand: string) => {
    setDeleteProductConfirm({ name, brand });
  };

  const confirmDeleteGlobalProduct = () => {
    if (!deleteProductConfirm) return;
    const { name, brand } = deleteProductConfirm;

    allRooms.forEach(r => {
      const itemsToDelete = r.items.filter(i => i.name === name && i.brand === brand);
      itemsToDelete.forEach(item => {
        onDeleteItem(r.id, item.id);
      });
    });
    setSelectedItemIdx('');
    setFormData({ name: '', brand: '', category: 'consumables', uom: 'pcs', code: '', vendor: '', description: '' });
    setDeleteProductConfirm(null);
  };
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expiry, setExpiry] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [openBatchRows, setOpenBatchRows] = useState<Record<string, boolean>>({});
  const toggleBatchRow = (id: string) => {
    setOpenBatchRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const [openDetailRows, setOpenDetailRows] = useState<Record<string, boolean>>({});
  const toggleDetailRow = (key: string) => {
    setOpenDetailRows(prev => {
      const newState = !prev[key];
      // If we are closing the detail row, also close the batch row
      if (!newState) {
        setOpenBatchRows(prevBatch => {
          if (!prevBatch[key]) return prevBatch;
          const newBatch = { ...prevBatch };
          delete newBatch[key];
          return newBatch;
        });
      }
      return { ...prev, [key]: newState };
    });
  };
  const [transferContext, setTransferContext] = useState<{ item: Item; toRoomId: string; batchIndex?: number; availableQty: number } | null>(null);
  const [transferQty, setTransferQty] = useState(0);
  const targetRoomName = transferContext ? (allRooms.find(r => r.id === transferContext.toRoomId)?.name || 'Selected room') : '';
  const [bulkTransferContext, setBulkTransferContext] = useState<{ item: Item; toRoomId: string } | null>(null);
  const [deleteContext, setDeleteContext] = useState<{ item: Item; batchIndex?: number } | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [localRoomName, setLocalRoomName] = useState(room.name);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [activeRelocateKey, setActiveRelocateKey] = useState<string | null>(null);


  // Sync local name with prop if it changes externally
  React.useEffect(() => {
    setLocalRoomName(room.name);
  }, [room.name]);

  const handleRoomNameBlur = () => {
    const trimmedNewName = localRoomName.trim();

    // 1. Basic check: non-empty and changed
    if (trimmedNewName && trimmedNewName !== room.name) {
      // 2. Uniqueness check: check allRooms excluding current room
      const isDuplicate = allRooms.some(r =>
        r.id !== room.id &&
        r.name.toLowerCase() === trimmedNewName.toLowerCase()
      );

      if (isDuplicate) {
        setErrorModal({
          title: 'Existing Room Name',
          message: `A room named "${trimmedNewName}" already exists. Please choose a unique name.`
        });
        setLocalRoomName(room.name); // Revert to original
      } else {
        onUpdateName(room.id, trimmedNewName);
      }
    } else {
      setLocalRoomName(room.name); // Reset if empty or unchanged
    }
  };

  const handleRoomNameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    }
  };

  const [isExcelPreviewActive, setIsExcelPreviewActive] = useState(false);
  const [excelPreviewData, setExcelPreviewData] = useState<(Partial<Item> & { purchaseDate?: string, quantity?: number, price?: number })[]>([]);

  // Excel Helpers
  const parseExcelNumber = (val: unknown, fallback: number): number => {
    if (typeof val === 'number') return val;
    if (typeof val === 'string') {
      const parsed = parseFloat(val.replace(/[^0-9.-]/g, ''));
      return isNaN(parsed) ? fallback : parsed;
    }
    return fallback;
  };

  const readExcelValue = (row: any, keys: string[]): any => {
    for (const key of keys) {
      if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
        return row[key];
      }
      const lowerKey = key.toLowerCase();
      const actualKey = Object.keys(row).find(k => k.toLowerCase() === lowerKey);
      if (actualKey) return row[actualKey];
    }
    return undefined;
  };

  const parseExcelDate = (val: any, XLSX: any): string | null => {
    if (!val) return null;
    if (typeof val === 'string') {
      const parsed = new Date(val);
      if (!isNaN(parsed.getTime())) return parsed.toISOString().split('T')[0];
      return null;
    }
    if (typeof val === 'number') {
      const date = XLSX.SSF.parse_date_code(val);
      if (date) {
        return new Date(Date.UTC(date.y, date.m - 1, date.d)).toISOString().split('T')[0];
      }
    }
    return null;
  };

  const normalizeExcelCategory = (val: any): Category => {
    const str = String(val || '').toLowerCase().trim();
    const match = CATEGORIES.find(c => c.label.toLowerCase() === str || c.id === str);
    return match ? (match.id as Category) : 'consumables';
  };

  const normalizeExcelUom = (val: any): UOM => {
    const str = String(val || '').toLowerCase().trim();
    if (['box', 'pcs', 'pack', 'bottle', 'roll'].includes(str)) return str as UOM;
    return 'box';
  };

  const safeSheetName = (name: string) => name.replace(/[\\/?*[\]]/g, '').substring(0, 31);
  const safeFileName = (name: string) => name.replace(/[^a-z0-9]/gi, '_').toLowerCase();

  const exportRoomExcel = async () => {
    try {
      const XLSX = await import('xlsx');
      const data = room.items.map(item => ({
        'Product Name': item.name,
        'Brand': item.brand,
        'Category': item.category,
        'Description': item.description,
        'Quantity': item.quantity,
        'Unit Price': item.price,
        'Total Value': item.quantity * item.price,
        'UOM': item.uom,
        'Code/SKU': item.code,
        'Vendor': item.vendor,
        'Purchase Date': item.createdAt ? new Date(item.createdAt).toISOString().split('T')[0] : '',
        'Expiry Date': item.expiryDate || 'N/A'
      }));

      const worksheet = XLSX.utils.json_to_sheet(data);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(room.name));
      XLSX.writeFile(workbook, `${safeFileName(room.name)}_stock_${new Date().toISOString().split('T')[0]}.xlsx`);
    } catch (err) {
      console.error('Failed to export Excel:', err);
    }
  };

  const downloadRoomPDF = async () => {
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');

      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

      // Header
      doc.setFillColor(77, 150, 120);
      doc.rect(0, 0, doc.internal.pageSize.getWidth(), 20, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(14);
      doc.setFont('helvetica', 'bold');
      doc.text(room.name + ' — Stock Report', 14, 13);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(today, doc.internal.pageSize.getWidth() - 14, 13, { align: 'right' });

      // Table
      const rows = room.items.map(item => [
        item.brand || '-',
        item.name + (item.description ? `\n${item.description}` : ''),
        item.code || '-',
        String(item.quantity),
        (item.uom || '').toUpperCase(),
        `$${item.price.toFixed(2)}`,
        `$${(item.price * item.quantity).toFixed(2)}`,
        item.vendor || '-',
        item.category || '-',
        item.expiryDate || '-',
      ]);

      autoTable(doc, {
        head: [['Brand', 'Product', 'Code', 'Qty', 'UOM', 'Unit Price', 'Total', 'Vendor', 'Category', 'Expires']],
        body: rows,
        startY: 24,
        styles: { fontSize: 8, cellPadding: 2.5 },
        headStyles: { fillColor: [77, 150, 120], textColor: 255, fontStyle: 'bold', fontSize: 8 },
        alternateRowStyles: { fillColor: [245, 250, 248] },
        columnStyles: {
          0: { cellWidth: 22 },
          1: { cellWidth: 50 },
          2: { cellWidth: 20 },
          3: { cellWidth: 12, halign: 'center' },
          4: { cellWidth: 14, halign: 'center' },
          5: { cellWidth: 20, halign: 'right' },
          6: { cellWidth: 22, halign: 'right', textColor: [39, 174, 96], fontStyle: 'bold' },
          7: { cellWidth: 28 },
          8: { cellWidth: 22 },
          9: { cellWidth: 22 },
        },
      });

      // Footer
      const pageCount = (doc as any).internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.getWidth() / 2, doc.internal.pageSize.getHeight() - 5, { align: 'center' });
      }

      doc.save(`${safeFileName(room.name)}_stock_${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (err) {
      console.error('Failed to download PDF:', err);
    }
  };

  const importRoomExcel = async (file: File) => {
    try {
      const XLSX = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) throw new Error('The Excel file does not contain a worksheet.');

      const worksheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '', raw: false });
      const today = new Date().toISOString().split('T')[0];
      
      const parsedItems: (Partial<Item> & { purchaseDate?: string, quantity?: number, price?: number })[] = [];

      rows.forEach(row => {
        const name = String(readExcelValue(row, ['Product', 'Product Name', 'Name', 'Item']) || '').trim();
        if (!name) return;

        const quantity = Math.max(0, parseExcelNumber(readExcelValue(row, ['Quantity', 'Qty', 'QTY']), 0));
        if (quantity <= 0) return;

        const explicitUnitPrice = parseExcelNumber(readExcelValue(row, ['Unit Price', 'Price', 'Purchase Price']), NaN);
        const total = parseExcelNumber(readExcelValue(row, ['Total', 'Total Price', 'Amount']), 0);
        const unitPrice = Number.isFinite(explicitUnitPrice) ? explicitUnitPrice : quantity > 0 ? total / quantity : 0;
        const purchaseDate = parseExcelDate(readExcelValue(row, ['Purchase Date', 'Date']), XLSX) || today;
        const expiryDate = parseExcelDate(readExcelValue(row, ['Expires', 'Expiry', 'Expiry Date', 'Expiration Date']), XLSX) || undefined;

        parsedItems.push({
          name,
          brand: String(readExcelValue(row, ['Brand']) || '').trim(),
          code: String(readExcelValue(row, ['Code', 'SKU', 'Item Code']) || '').trim(),
          uom: normalizeExcelUom(readExcelValue(row, ['UOM', 'Unit', 'Unit of Measure'])),
          vendor: String(readExcelValue(row, ['Vendor', 'Supplier']) || '').trim(),
          category: normalizeExcelCategory(readExcelValue(row, ['Category'])),
          description: String(readExcelValue(row, ['Description', 'Notes']) || '').trim(),
          expiryDate,
          quantity,
          price: unitPrice,
          purchaseDate
        });
      });

      if (parsedItems.length === 0) {
        setErrorModal({
          title: 'No Items Imported',
          message: 'The Excel file did not contain valid rows. Please include at least Product and Quantity columns.'
        });
      } else {
        setExcelPreviewData(parsedItems);
        setIsExcelPreviewActive(true);
      }
    } catch (err) {
      console.error('Failed to import room Excel:', err);
      setErrorModal({
        title: 'Excel Import Failed',
        message: err instanceof Error ? err.message : 'Unable to read this Excel file. Please check the file and try again.'
      });
    }
  };

  const excelInputRef = React.useRef<HTMLInputElement>(null);

  // OCR State
  const [isOCRActive, setIsOCRActive] = useState(false);
  const [ocrStep, setOcrStep] = useState<'upload' | 'camera' | 'camera_preview' | 'processing' | 'review'>('upload');
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [ocrResult, setOcrResult] = useState<(Partial<Item> & { purchaseDate?: string })[] | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        },
        audio: false
      });
      setStream(s);
      setOcrStep('camera');
    } catch (err) {
      console.error("Camera access error:", err);
      // Fallback to any camera if environment fails
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        setStream(s);
        setOcrStep('camera');
      } catch (innerErr) {
        alert("Could not access camera. Please check permissions.");
      }
    }
  };

  React.useEffect(() => {
    if (ocrStep === 'camera' && stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [ocrStep, stream]);

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setOcrStep('upload');
  };

  const processCapturedImage = async (imageString: string) => {
    setOcrStep('processing');
    setOcrStatusText('Preparing image for analysis...');
    setOcrProgress(0);
    try {
      setOcrImage(imageString);

      // Parse Base64
      const match = imageString.match(/^data:(.+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image format");

      const mimeType = match[1];
      const base64Data = match[2];

      const extractedItems = await extractDataFromImage(base64Data, mimeType);

      setOcrStatusText('Processing results...');

      // Map to Item format
      const parsed = extractedItems.map(i => ({
        name: i.product,
        quantity: i.quantity || 1,
        price: i.price || 0,
        brand: i.brand || '',
        code: i.sku || '',
        uom: (i.uom as UOM) || 'box',
        category: (i.category as Category) || 'consumables',
        vendor: i.vendor || '',
        expiryDate: i.expiryDate || undefined,
        purchaseDate: i.purchaseDate || new Date().toISOString().split('T')[0],
        description: i.description || ''
      }));

      setOcrResult(parsed);
      setOcrStep('review');
    } catch (err) {
      console.error(err);
      setOcrStatusText('Analysis Failed');
      alert('Failed to analyze image. Please try again.');
      setOcrStep('upload');
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        setOcrImage(dataUrl);

        // Stop the camera but don't start processing yet
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
        }
        setOcrStep('camera_preview');
      }
    }
  };

  const filteredItems = useMemo(() => {
    return room.items.filter(i =>
      i.name.toLowerCase().includes(roomSearch.toLowerCase()) ||
      i.brand.toLowerCase().includes(roomSearch.toLowerCase()) ||
      i.code.toLowerCase().includes(roomSearch.toLowerCase())
    );
  }, [room.items, roomSearch]);

  const itemsByCategory = useMemo<Record<string, Item[]>>(() => {
    const groups: Record<string, Item[]> = {};
    filteredItems.forEach(item => {
      const cat = (item.category || 'uncategorized').toUpperCase();
      if (!groups[cat]) groups[cat] = [];
      groups[cat].push(item);
    });
    return groups;
  }, [filteredItems]);
  
  const globalProducts = useMemo(() => {
    const products: Item[] = [];
    const seen = new Set<string>();

    allRooms.forEach(r => {
      r.items.forEach(item => {
        const key = `${item.name.toLowerCase()}|${item.brand.toLowerCase()}`;
        if (!seen.has(key)) {
          seen.add(key);
          products.push(item);
        }
      });
    });

    return products.sort((a, b) => a.name.localeCompare(b.name));
  }, [allRooms]);



  const handleProductSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    setSelectedItemIdx(val);
    if (val === 'new') {
      setReceiveMode('new');
      setFormData({ name: '', brand: '', category: 'consumables', uom: 'box', code: '', vendor: '', description: '' });
    } else if (val === 'edit') {
      setReceiveMode('edit');
    } else if (val !== '') {
      setReceiveMode('existing');
      // Look in globalProducts first
      const item = globalProducts[parseInt(val)];
      if (item) {
        setFormData({ 
          ...item,
          quantity: 0, // Reset quantity for receiving
          price: item.price // Default to last known price
        });
      }
    }
  };

  const handleEditItem = (item: Item) => {
    setReceiveMode('edit');
    setEditingBatchId(null);
    setFormData({ ...item });
    setReceiveQty(item.quantity);
    setReceivePrice(item.price);
    setHasExpiry(!!item.expiryDate);
    setExpiry(item.expiryDate || '');
    setSelectedItemIdx(room.items.findIndex(i => i.id === item.id).toString());
    setIsReceiving(true);
  };

  const handleEditBatch = (item: Item, batch: ItemBatch) => {
    setReceiveMode('edit');
    setEditingBatchId(batch.id);
    setFormData({ ...item });
    setReceiveQty(batch.qty);
    setReceivePrice(batch.unitPrice);
    setHasExpiry(!!batch.expiryDate);
    setExpiry(batch.expiryDate || '');
    setSelectedItemIdx(room.items.findIndex(i => i.id === item.id).toString());
    setIsReceiving(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (receiveMode === 'edit') {
      const itemIndex = parseInt(selectedItemIdx);
      const originalItem = room.items[itemIndex];
      if (originalItem) {
        if (editingBatchId) {
          onUpdateBatch(room.id, originalItem.id, editingBatchId, {
            qty: receiveQty,
            unitPrice: receivePrice,
            expiryDate: hasExpiry ? expiry : null
          });
        } else {
          onUpdateItem(room.id, originalItem.id, {
            ...formData,
            quantity: receiveQty,
            price: receivePrice,
            expiryDate: hasExpiry ? expiry : null
          });
        }
      }
    } else {
      onReceive(room.id, formData, receiveQty, receivePrice, purchaseDate, hasExpiry ? expiry : undefined);
    }
    setIsReceiving(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ name: '', brand: '', category: 'consumables', uom: 'box', code: '', vendor: '', description: '' });
    setReceiveQty(0);
    setReceivePrice(0);
    setPurchaseDate(new Date().toISOString().split('T')[0]);
    setExpiry('');
    setHasExpiry(false);
    setSelectedItemIdx('');
    setIsReceiving(false);
  };

  const openTransferModal = (item: Item, toRoomId: string, batchIndex?: number, availableQty?: number) => {
    const qty = availableQty ?? item.quantity;
    setTransferContext({ item, toRoomId, batchIndex, availableQty: qty });
    setTransferQty(qty);
  };

  const handleRelocateSelect = (item: Item, value: string) => {
    if (value === '') return;
    const targetId = value;
    if (targetId === room.id) return;
    const hasMultipleBatches = (item.batches?.length || 0) > 1;
    if (hasMultipleBatches) {
      setBulkTransferContext({ item, toRoomId: targetId });
      return;
    }
    openTransferModal(item, targetId);
  };

  const handleBatchRelocateSelect = (item: Item, batchIndex: number, targetRoomId: string) => {
    if (targetRoomId === '' || targetRoomId === room.id) return;
    const batch = item.batches?.[batchIndex];
    if (batch) {
      openTransferModal(item, targetRoomId, batchIndex, batch.qty);
    } else {
      // Fallback for single/virtual batch
      openTransferModal(item, targetRoomId);
    }
  };



  const confirmTransfer = () => {
    if (!transferContext) return;
    const maxQty = Math.max(transferContext.availableQty, 0);
    const qtyToMove = Math.min(Math.max(transferQty || 0, 1), maxQty);
    onTransfer(room.id, transferContext.toRoomId, transferContext.item.id, qtyToMove, transferContext.batchIndex);
    setTransferContext(null);
    setTransferQty(0);
  };

  const cancelTransfer = () => {
    setTransferContext(null);
    setTransferQty(0);
  };

  const requestDeleteItem = (item: Item) => {
    setDeleteContext({ item });
  };

  const requestDeleteBatch = (item: Item, batchIndex: number) => {
    setDeleteContext({ item, batchIndex });
  };

  const confirmDelete = () => {
    if (!deleteContext) return;
    if (typeof deleteContext.batchIndex === 'number') {
      const targetBatch = deleteContext.item.batches?.[deleteContext.batchIndex];
      const delta = targetBatch ? -targetBatch.qty : 0;
      onUpdateBatchQty(room.id, deleteContext.item.id, deleteContext.batchIndex, delta);
    } else {
      onDeleteItem(room.id, deleteContext.item.id);
    }
    setDeleteContext(null);
  };

  const cancelDelete = () => setDeleteContext(null);
  const confirmBulkTransfer = () => {
    if (!bulkTransferContext) return;
    onTransfer(room.id, bulkTransferContext.toRoomId, bulkTransferContext.item.id, bulkTransferContext.item.quantity);
    setBulkTransferContext(null);
  };
  const cancelBulkTransfer = () => setBulkTransferContext(null);

  // Existing item pricing preview
  const selectedExistingItem = receiveMode === 'existing' && selectedItemIdx !== '' ? room.items[parseInt(selectedItemIdx)] : null;
  const currentQty = selectedExistingItem ? selectedExistingItem.quantity : 0;
  const currentUnitPrice = selectedExistingItem ? selectedExistingItem.price : 0;
  const incomingQty = receiveQty || 0;
  const incomingPrice = receivePrice || 0;
  const newQty = currentQty + incomingQty;
  const newAvgPrice = newQty > 0 ? ((currentQty * currentUnitPrice) + (incomingQty * incomingPrice)) / newQty : 0;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10000] flex items-center justify-center md:p-2">
      <div className="bg-white w-full md:max-w-[95vw] h-full md:h-[90vh] rounded-none md:rounded-[1.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-200">
        <div className="bg-[#4d9678] px-6 py-4 flex items-center justify-between text-white shrink-0 border-b border-white/10">
          <div className="flex-1">
            {readOnly ? (
              <h2 className="text-xl font-bold py-1">{room.name}</h2>
            ) : (
              <input
                type="text"
                value={localRoomName}
                onChange={(e) => setLocalRoomName(e.target.value)}
                onBlur={handleRoomNameBlur}
                onKeyDown={handleRoomNameKeyDown}
                style={{
                  caretColor: 'white',
                  cursor: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'16\' height=\'24\' viewBox=\'0 0 16 24\'%3E%3Cpath d=\'M8 5v14M6 5h4M6 19h4\' stroke=\'white\' stroke-width=\'1.5\'/%3E%3C/svg%3E") 8 12, text'
                }}
                className="bg-transparent border-b border-white/30 text-xl font-bold focus:border-white focus:outline-none w-full max-w-[250px] placeholder:text-white/40 transition-colors"
                placeholder="Enter room name..."
              />
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { void exportRoomExcel(); }}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all border border-white/20"
            >
              <FileSpreadsheet className="w-4 h-4" /> <span className="hidden sm:inline">Export as Excel</span>
            </button>
            <button
              onClick={() => { void downloadRoomPDF(); }}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all border border-white/20"
            >
              <FileDown className="w-4 h-4" /> <span className="hidden sm:inline">Download PDF</span>
            </button>
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 p-2 rounded-full transition-all border border-white/10">
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 custom-scrollbar bg-slate-50/50">
          <div className="flex items-center gap-2">
            {!readOnly && (
              !isReceiving && !isOCRActive && !isExcelPreviewActive ? (
                <>
                  <button
                    onClick={() => setIsReceiving(true)}
                    className="bg-[#3498db] text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-[#2980b9] shadow-lg shadow-blue-100 transition-all"
                  >
                    <Package className="w-4 h-4" /> Receive Stock
                  </button>
                  <button
                    onClick={() => { setIsOCRActive(true); setOcrStep('upload'); setOcrImage(null); setOcrResult(null); }}
                    className="bg-emerald-600 text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all"
                  >
                    <Scan className="w-4 h-4" /> Add via OCR
                  </button>
                  <button
                    onClick={() => excelInputRef.current?.click()}
                    className="bg-[#4d9678] text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-[#407f65] shadow-lg shadow-green-100 transition-all"
                  >
                    <FileUp className="w-4 h-4" /> Import Excel
                  </button>
                  <input
                    ref={excelInputRef}
                    type="file"
                    accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                    className="hidden"
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (file) await importRoomExcel(file);
                      event.target.value = '';
                    }}
                  />
                </>
              ) : (
                <button
                  onClick={() => { setIsReceiving(false); setIsOCRActive(false); setIsExcelPreviewActive(false); }}
                  className="bg-[#e74c3c] text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-[#c0392b] shadow-lg shadow-rose-100 transition-all"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              )
            )}
          </div>

          {isExcelPreviewActive && excelPreviewData && (
            <div className="bg-[#ebf5fb] border border-[#c4e1f3] rounded-[1rem] p-6 shadow-sm animate-in zoom-in-95 duration-200 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[#2c78b2] font-black uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                  <FileUp className="w-4 h-4" /> Excel Import Preview
                </h4>
              </div>
              
              <div className="flex flex-col gap-6">
                <div className="flex flex-col gap-2 overflow-hidden">
                  <div className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-2">Items to Import ({excelPreviewData.length})</div>
                  
                  <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm max-h-[400px]">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                        <tr>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Brand</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Product</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Code</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Qty</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">UOM</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Unit Price</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Total</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Vendor</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Category</th>
                          <th className="px-3 py-2 text-[10px] font-black text-slate-500 uppercase tracking-widest">Expires</th>
                          <th className="px-2 py-2"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {excelPreviewData.map((item, idx) => (
                          <tr key={idx} className="hover:bg-red-50/30 group">
                            <td className="px-3 py-2 text-slate-600 text-[11px] whitespace-nowrap">{item.brand || '-'}</td>
                            <td className="px-3 py-2 text-[11px]">
                              <div className="font-bold text-slate-700">{item.name}</div>
                              {item.description && <div className="text-slate-400 text-[10px] mt-0.5">{item.description}</div>}
                            </td>
                            <td className="px-3 py-2 text-slate-600 text-[11px]">{item.code || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 font-semibold text-[11px]">{item.quantity}</td>
                            <td className="px-3 py-2 text-slate-600 text-[11px]">{item.uom?.toUpperCase()}</td>
                            <td className="px-3 py-2 text-slate-600 font-semibold text-[11px]">${item.price?.toFixed(2)}</td>
                            <td className="px-3 py-2 text-[#2ecc71] font-bold text-[11px]">${((item.price || 0) * (item.quantity || 0)).toFixed(2)}</td>
                            <td className="px-3 py-2 text-slate-600 text-[11px]">{item.vendor || '-'}</td>
                            <td className="px-3 py-2 text-slate-600 text-[11px]">{CATEGORIES.find(c => c.id === item.category)?.label || item.category}</td>
                            <td className="px-3 py-2 text-slate-600 text-[11px] whitespace-nowrap">{item.expiryDate || '-'}</td>
                            <td className="px-2 py-2 text-right">
                              <button
                                onClick={() => setExcelPreviewData(prev => prev.filter((_, i) => i !== idx))}
                                className="p-1 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
                                title="Remove from import"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                
                <div className="flex flex-col sm:flex-row-reverse items-center justify-center gap-3 pt-2">
                  <button
                    onClick={() => {
                      excelPreviewData.forEach(item => {
                        if (item.name) {
                          onReceive(
                            room.id,
                            {
                              name: item.name,
                              brand: item.brand || '',
                              category: item.category || 'consumables',
                              uom: item.uom || 'box',
                              code: item.code || '',
                              vendor: item.vendor || '',
                              description: item.description || '',
                              expiryDate: item.expiryDate || undefined
                            },
                            item.quantity || 1,
                            item.price || 0,
                            new Date().toISOString().split('T')[0],
                            item.expiryDate || undefined
                          );
                        }
                      });
                      setIsExcelPreviewActive(false);
                      setExcelPreviewData([]);
                    }}
                    className={`w-full sm:w-44 py-3 rounded-xl font-black uppercase text-[12px] tracking-widest shadow-lg transition-all flex items-center justify-center gap-2 ${
                      excelPreviewData.length === 0
                        ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                        : 'bg-[#3498db] text-white hover:bg-[#2980b9] shadow-blue-100'
                    }`}
                    disabled={excelPreviewData.length === 0}
                  >
                    Confirm Import
                  </button>
                  <button
                    onClick={() => {
                      setIsExcelPreviewActive(false);
                      setExcelPreviewData([]);
                    }}
                    className="w-full sm:w-44 bg-slate-200 text-slate-500 py-3 rounded-xl font-bold uppercase text-[12px] tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {isOCRActive && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-[1rem] p-6 shadow-sm animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-emerald-700 font-black uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                  <Scan className="w-4 h-4" /> Intelligent Shield (OCR)
                </h4>
              </div>

              {ocrStep === 'upload' && (
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={async (e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                      const imgs = await filesToImages([e.dataTransfer.files[0]]);
                      processCapturedImage(imgs[0]);
                    }
                  }}
                  className={`flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl transition-all duration-300 gap-4 ${isDragging
                    ? 'border-emerald-500 bg-emerald-100/50 scale-[1.02] shadow-xl shadow-emerald-100'
                    : 'border-emerald-200 bg-white/50'
                    }`}
                >
                  <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 ${isDragging ? 'bg-emerald-500 text-white scale-110' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <h5 className={`font-bold transition-colors duration-300 ${isDragging ? 'text-emerald-700' : 'text-slate-700'} mb-1`}>
                      {isDragging ? 'Drop File Here' : 'Upload Receipt or Label'}
                    </h5>
                    <p className="text-xs text-slate-400">
                      {isDragging ? 'Let go to start extraction' : 'Take a photo, or drag and drop an image or PDF'}
                    </p>
                  </div>
                  <div className={`flex items-center gap-3 transition-opacity duration-300 ${isDragging ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
                    <button
                      onClick={startCamera}
                      className="bg-white text-emerald-600 border border-emerald-200 px-6 py-2 rounded-lg font-bold text-xs hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" /> Take Photo
                    </button>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          const imgs = await filesToImages([e.target.files[0]]);
                          processCapturedImage(imgs[0]);
                        }
                      }} />
                      <span className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold text-xs hover:bg-emerald-700 transition-all shadow-md inline-flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Select File
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {ocrStep === 'camera' && (
                <div className="fixed inset-0 z-[10100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
                  <div className="relative w-full h-full md:max-w-6xl md:max-h-[80vh] md:rounded-3xl overflow-hidden shadow-2xl">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />

                    {/* Floating Controls Overlay */}
                    <div className="absolute inset-x-0 bottom-12 flex items-center justify-center z-[10101]">
                      <div className="flex items-center">
                        {/* Hidden Spacer to keep Camera perfectly centered */}
                        <div className="w-12 invisible" aria-hidden="true" />
                        <div className="w-6 invisible" aria-hidden="true" /> {/* Gap balance */}

                        <button
                          onClick={capturePhoto}
                          className="group relative flex items-center justify-center"
                        >
                          <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-[0_0_30px_rgba(0,0,0,0.3)] transform active:scale-90 transition-transform">
                            <div className="w-14 h-14 rounded-full border-2 border-slate-100 flex items-center justify-center">
                              <Camera className="w-8 h-8 text-slate-800" />
                            </div>
                          </div>
                        </button>

                        <div className="w-6" aria-hidden="true" /> {/* Gap */}

                        <button
                          onClick={stopCamera}
                          className="group w-14 h-14 rounded-full bg-black/30 backdrop-blur-md flex items-center justify-center text-white hover:bg-rose-500 hover:text-white transition-all border border-white/10 shadow-lg"
                        >
                          <X className="w-6 h-6 transform group-hover:rotate-90 transition-transform" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {ocrStep === 'camera_preview' && ocrImage && (
                <div className="flex flex-col items-center justify-center p-2 gap-6 animate-in zoom-in-95 duration-300">
                  <div className="relative w-full max-w-2xl aspect-[3/4] sm:aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/20">
                    {ocrImage.startsWith('data:application/pdf') ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-slate-800 text-white gap-4">
                        <FileText className="w-20 h-20 text-emerald-400" />
                        <span className="font-bold">PDF Document Selected</span>
                      </div>
                    ) : (
                      <img src={ocrImage} className="w-full h-full object-contain" alt="Captured preview" />
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row-reverse items-center gap-4 w-full max-w-sm">
                    <button
                      onClick={() => processCapturedImage(ocrImage)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all font-bold text-xs shadow-md animate-pulse hover:animate-none"
                    >
                      <Scan className="w-4 h-4" /> Analyze
                    </button>
                    <button
                      onClick={startCamera}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-slate-200 hover:border-emerald-500 hover:text-emerald-600 rounded-xl transition-all font-bold text-xs text-slate-600 shadow-sm"
                    >
                      <Camera className="w-4 h-4" /> Retake
                    </button>
                  </div>
                </div>
              )}

              {ocrStep === 'processing' && (
                <div className="flex flex-col items-center justify-center p-12 gap-6">
                  <div className="relative w-24 h-24 flex items-center justify-center">
                    <svg className="animate-spin text-emerald-200 w-full h-full" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    <div className="absolute inset-0 flex items-center justify-center font-bold text-emerald-600 text-sm">{ocrProgress}%</div>
                  </div>
                  <div className="text-center">
                    <div className="font-bold text-slate-700 text-lg mb-1">Analysing Image...</div>
                    <div className="text-slate-400 text-sm font-mono">{ocrStatusText}</div>
                  </div>
                </div>
              )}

              {ocrStep === 'review' && ocrResult && (
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-2">
                    <div className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-2">Original Document</div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm relative mx-auto bg-slate-50 w-fit">
                      {ocrImage?.startsWith('data:application/pdf') ? (
                        <div className="w-[320px] h-[320px] flex flex-col items-center justify-center bg-slate-100 text-slate-400 gap-2">
                          <FileText className="w-12 h-12" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">PDF Document</span>
                        </div>
                      ) : (
                        <img src={ocrImage || ''} className="max-h-[320px] w-auto h-auto block" />
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 overflow-hidden">
                    <div className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-2">Extracted Data ({ocrResult.length} items)</div>

                    {/* MOBILE CARD VIEW */}
                    <div className="md:hidden flex flex-col gap-4 max-h-[500px] overflow-y-auto px-1 py-1">
                      {ocrResult.length === 0 && (
                        <div className="p-8 text-center text-slate-400 text-xs italic bg-white rounded-2xl border border-dashed border-slate-200">
                          No items detected
                        </div>
                      )}
                      {ocrResult.map((item, idx) => (
                        <div key={idx} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 relative flex flex-col gap-3 animate-in fade-in slide-in-from-bottom-2 duration-300" style={{ animationDelay: `${idx * 50}ms` }}>
                          <div className="flex justify-between items-start gap-2">
                            <div className="flex flex-col gap-1 flex-1">
                              <input
                                className="w-full bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 rounded-lg px-3 py-2 font-bold text-slate-800 text-xs"
                                value={item.name || ''}
                                onChange={e => {
                                  const newRes = [...ocrResult];
                                  newRes[idx] = { ...item, name: e.target.value };
                                  setOcrResult(newRes);
                                }}
                                placeholder="Item Name"
                              />
                              <input
                                className="w-full bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 rounded-lg px-3 py-1.5 text-slate-500 text-[10px]"
                                value={item.description || ''}
                                onChange={e => {
                                  const newRes = [...ocrResult];
                                  newRes[idx] = { ...item, description: e.target.value };
                                  setOcrResult(newRes);
                                }}
                                placeholder="Add product description..."
                              />
                            </div>
                            <button
                              onClick={() => {
                                const newRes = ocrResult.filter((_, i) => i !== idx);
                                setOcrResult(newRes);
                              }}
                              className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Qty & Price</label>
                              <div className="flex items-center gap-1 bg-slate-50 rounded-lg px-2 overflow-hidden">
                                <input
                                  type="number"
                                  className="w-10 bg-transparent border-none focus:ring-0 text-slate-700 font-bold text-xs p-1"
                                  value={item.quantity || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, quantity: parseInt(e.target.value) || 0 };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="0"
                                />
                                <span className="text-slate-300 text-[10px]">×</span>
                                <input
                                  type="number" step="0.01"
                                  className="flex-1 min-w-0 bg-transparent border-none focus:ring-0 text-slate-700 font-bold text-xs p-1"
                                  value={item.price || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, price: parseFloat(e.target.value) || 0 };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="0.00"
                                />
                              </div>
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">UOM</label>
                              <select
                                className="w-full bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 rounded-lg px-3 py-2 text-slate-700 font-bold text-xs appearance-none"
                                value={item.uom || 'box'}
                                onChange={e => {
                                  const newRes = [...ocrResult];
                                  newRes[idx] = { ...item, uom: e.target.value as UOM };
                                  setOcrResult(newRes);
                                }}
                              >
                                {UOMS.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                              </select>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Brand</label>
                              <input
                                className="w-full bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 rounded-lg px-3 py-2 text-slate-600 text-xs"
                                value={item.brand || ''}
                                onChange={e => {
                                  const newRes = [...ocrResult];
                                  newRes[idx] = { ...item, brand: e.target.value };
                                  setOcrResult(newRes);
                                }}
                                placeholder="Brand"
                              />
                            </div>
                            <div className="flex flex-col gap-1">
                              <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Code</label>
                              <input
                                className="w-full bg-slate-50 border-none focus:ring-2 focus:ring-emerald-500 rounded-lg px-3 py-2 text-slate-600 text-xs font-mono"
                                value={item.code || ''}
                                onChange={e => {
                                  const newRes = [...ocrResult];
                                  newRes[idx] = { ...item, code: e.target.value };
                                  setOcrResult(newRes);
                                }}
                                placeholder="Code"
                              />
                            </div>
                          </div>

                          <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Purchased / Expires</label>
                            <div className="flex items-center gap-2 bg-slate-50 rounded-lg px-2">
                              <input
                                type="date"
                                className="flex-1 bg-transparent border-none focus:ring-0 text-slate-600 text-[10px] p-1.5"
                                value={item.purchaseDate || ''}
                                onChange={e => {
                                  const newRes = [...ocrResult];
                                  newRes[idx] = { ...item, purchaseDate: e.target.value };
                                  setOcrResult(newRes);
                                }}
                              />
                              <span className="text-slate-300">→</span>
                              <input
                                type="date"
                                className="flex-1 bg-transparent border-none focus:ring-0 text-slate-600 text-[10px] p-1.5"
                                value={item.expiryDate || ''}
                                onChange={e => {
                                  const newRes = [...ocrResult];
                                  newRes[idx] = { ...item, expiryDate: e.target.value };
                                  setOcrResult(newRes);
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                      <button
                        onClick={() => setOcrResult([...ocrResult, { name: '', quantity: 1, price: 0, purchaseDate: new Date().toISOString().split('T')[0] }])}
                        className="w-full py-4 bg-emerald-50 text-emerald-600 border-2 border-dashed border-emerald-200 rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-100 transition-all flex items-center justify-center gap-2"
                      >
                        <Plus className="w-4 h-4" /> Add Another Item
                      </button>
                    </div>

                    {/* DESKTOP TABLE VIEW */}
                    <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm max-h-[400px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                          <tr>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[200px]">Name</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[180px]">Description</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[60px]">Qty</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[80px]">Price</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[110px]">Brand</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[100px]">Code</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[75px]">UOM</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[120px]">Vendor</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[120px]">Category</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[120px]">Purchased</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[120px]">Expires</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {ocrResult.map((item, idx) => (
                            <tr key={idx} className="hover:bg-slate-50 group">
                              <td className="px-3 py-2">
                                <input
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-1 font-bold text-slate-700 text-[11px]"
                                  value={item.name || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, name: e.target.value };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="Item Name"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-1 text-slate-500 text-[10px]"
                                  value={item.description || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, description: e.target.value };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="Description"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number"
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-1 text-slate-600 font-semibold text-[11px] text-center"
                                  value={item.quantity || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, quantity: parseInt(e.target.value) || 0 };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-2 py-2">
                                <input
                                  type="number" step="0.01"
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-1 text-slate-600 font-semibold text-[11px]"
                                  value={item.price || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, price: parseFloat(e.target.value) || 0 };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="0.00"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-1 text-slate-600 text-[11px]"
                                  value={item.brand || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, brand: e.target.value };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="Brand"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-1 text-slate-600 text-[11px]"
                                  value={item.code || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, code: e.target.value };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="Code"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded text-slate-600 text-[11px]"
                                  value={item.uom || 'box'}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, uom: e.target.value as UOM };
                                    setOcrResult(newRes);
                                  }}
                                >
                                  {UOMS.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded text-slate-600 text-[11px]"
                                  value={item.vendor || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, vendor: e.target.value };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="Vendor"
                                />
                              </td>
                              <td className="px-3 py-2">
                                <select
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded text-slate-600 text-[11px]"
                                  value={item.category || 'consumables'}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, category: e.target.value as Category };
                                    setOcrResult(newRes);
                                  }}
                                >
                                  {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded text-slate-600 text-[11px]"
                                  value={item.purchaseDate || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, purchaseDate: e.target.value };
                                    setOcrResult(newRes);
                                  }}
                                />
                              </td>
                              <td className="px-3 py-2">
                                <input
                                  type="date"
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded text-slate-600 text-[11px]"
                                  value={item.expiryDate || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, expiryDate: e.target.value };
                                    setOcrResult(newRes);
                                  }}
                                />
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  onClick={() => {
                                    const newRes = ocrResult.filter((_, i) => i !== idx);
                                    setOcrResult(newRes);
                                  }}
                                  className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                          {ocrResult.length === 0 && (
                            <tr><td colSpan={11} className="p-4 text-center text-slate-300 text-xs italic">No items detected</td></tr>
                          )}
                        </tbody>
                      </table>
                      <button
                        onClick={() => setOcrResult([...ocrResult, { name: '', quantity: 1, price: 0, purchaseDate: new Date().toISOString().split('T')[0] }])}
                        className="w-full py-2 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 border-t border-slate-100 uppercase tracking-widest transition-colors"
                      >
                        + Add Item
                      </button>
                    </div>
                  </div>


                  <div className="flex flex-col sm:flex-row-reverse items-center justify-center gap-3 pt-2">
                    <button
                      onClick={() => {
                        const validItems = ocrResult.filter(item => item.name);
                        if (validItems.length === 0) return;

                        if (onReceiveBatch) {
                          // Single batched call — isDirty stays true until ALL items are persisted
                          onReceiveBatch(
                            room.id,
                            validItems.map(item => ({
                              itemData: {
                                name: item.name,
                                brand: item.brand || '',
                                category: item.category || 'consumables',
                                uom: item.uom || 'box',
                                code: item.code || '',
                                vendor: item.vendor || '',
                                description: item.description || '',
                                expiryDate: item.expiryDate || undefined,
                              },
                              qty: item.quantity || 1,
                              price: item.price || 0,
                              purchaseDate: item.purchaseDate || new Date().toISOString().split('T')[0],
                              expiry: item.expiryDate || undefined,
                            }))
                          );
                        } else {
                          // Fallback: individual calls (legacy path)
                          validItems.forEach(item => {
                            onReceive(
                              room.id,
                              {
                                name: item.name,
                                brand: item.brand || '',
                                category: item.category || 'consumables',
                                uom: item.uom || 'box',
                                code: item.code || '',
                                vendor: item.vendor || '',
                                description: item.description || '',
                                expiryDate: item.expiryDate || undefined,
                              },
                              item.quantity || 1,
                              item.price || 0,
                              item.purchaseDate || new Date().toISOString().split('T')[0],
                              item.expiryDate || undefined
                            );
                          });
                        }
                        setOcrStep('upload');
                        setIsOCRActive(false);
                      }}
                      disabled={ocrResult.length === 0}
                      className="w-full sm:w-44 bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[12px] tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
                    >
                      <Plus className="w-3 h-3" /> Add All ({ocrResult.length})
                    </button>
                    <button
                      onClick={() => setOcrStep('upload')}
                      className="w-full sm:w-44 bg-slate-100 text-slate-500 py-3 rounded-xl font-bold uppercase text-[12px] tracking-widest hover:bg-slate-200 transition-all flex items-center justify-center gap-2"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {isReceiving && (
            <div className="bg-[#ebf5fb] border border-[#c4e1f3] rounded-[1rem] p-6 shadow-sm animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[#2c78b2] font-black uppercase text-xs tracking-[0.2em]">Receive Stock</h4>
              </div>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Select Product *</label>
                    <div className="relative">
                      <button 
                        type="button"
                        onClick={() => setShowProductList(!showProductList)}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm h-[38px]"
                      >
                        <span className="truncate">
                          {selectedItemIdx === 'new' ? '⊕ Create New Product...' : 
                           selectedItemIdx !== '' ? `${globalProducts[parseInt(selectedItemIdx)]?.name} (${globalProducts[parseInt(selectedItemIdx)]?.brand})` : 
                           'Choose existing product...'}
                        </span>
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${showProductList ? 'rotate-180' : ''}`} />
                      </button>

                      {showProductList && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowProductList(false)} />
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 max-h-[300px] overflow-hidden flex flex-col">
                            <div className="p-2 border-b border-slate-100">
                              <div className="relative">
                                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400" />
                                <input 
                                  placeholder="Filter products..."
                                  className="w-full pl-7 pr-3 py-1.5 bg-slate-50 border-none rounded-lg text-xs outline-none focus:ring-1 focus:ring-blue-100"
                                  value={productSearch}
                                  onChange={e => setProductSearch(e.target.value)}
                                  onClick={e => e.stopPropagation()}
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto custom-scrollbar flex-1 py-1">
                              <button
                                type="button"
                                onClick={() => {
                                  handleProductSelect({ target: { value: 'new' } } as any);
                                  setShowProductList(false);
                                }}
                                className="w-full text-left px-3 py-2 text-[#3498db] font-bold text-xs hover:bg-blue-50 transition-colors flex items-center gap-2"
                              >
                                <Plus className="w-3 h-3" /> Create New Product...
                              </button>
                              
                              {globalProducts
                                .map((item, idx) => ({ item, idx }))
                                .filter(({ item }) => 
                                  item.name.toLowerCase().includes(productSearch.toLowerCase()) || 
                                  item.brand.toLowerCase().includes(productSearch.toLowerCase())
                                )
                                .map(({ item, idx }) => (
                                  <div key={idx} className="group relative flex items-center">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        handleProductSelect({ target: { value: idx.toString() } } as any);
                                        setShowProductList(false);
                                      }}
                                      className="flex-1 text-left px-3 py-2 text-slate-700 text-xs hover:bg-slate-50 transition-colors pr-10"
                                    >
                                      <div className="font-bold">{item.name}</div>
                                      <div className="text-[10px] text-slate-400">{item.brand}</div>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteGlobalProduct(item.name, item.brand);
                                      }}
                                      className="absolute right-2 p-1.5 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                                      title="Delete Product Data"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Quantity to Add *</label>
                    <input type="number" required placeholder="0" className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm"
                      value={receiveQty || ''} onChange={e => setReceiveQty(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purchase Price *</label>
                    <input type="number" step="0.01" required placeholder="0.00" className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm"
                      value={receivePrice || ''} onChange={e => setReceivePrice(Number(e.target.value))} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Purchase Date *</label>
                    <input
                      type="date"
                      required
                      className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm"
                      value={purchaseDate}
                      onChange={e => setPurchaseDate(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-4">
                    <input type="checkbox" checked={hasExpiry} onChange={e => setHasExpiry(e.target.checked)} className="w-4 h-4 accent-[#3498db] rounded" id="modalHasExp" />
                    <label htmlFor="modalHasExp" className="text-[10px] font-bold text-slate-600">This item has expiry date</label>
                  </div>
                </div>

                {hasExpiry && (
                  <div className="flex flex-col gap-1 max-w-[200px] animate-in slide-in-from-top-1 duration-200">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Expiry Date *</label>
                    <input type="date" className="px-3 py-2 rounded-lg border border-slate-200 font-semibold text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm" value={expiry} onChange={e => setExpiry(e.target.value)} required={hasExpiry} />
                  </div>
                )}

                {(receiveMode === 'new' || receiveMode === 'edit') && (
                  <div className="flex flex-col gap-4 animate-in slide-in-from-top-1 duration-200 mt-2">
                    <h5 className="text-[#3498db] font-black uppercase text-[9px] tracking-[0.2em] border-b border-slate-200/40 pb-1">
                      {receiveMode === 'edit' ? 'Edit Item Details' : 'New Product Details'}
                    </h5>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Product Name *</label>
                        <input required placeholder="e.g. Dental Gloves" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Brand</label>
                        <input placeholder="e.g. 3M" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.brand} onChange={e => setFormData({ ...formData, brand: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Code/SKU</label>
                        <input placeholder="e.g. DG-001" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.code} onChange={e => setFormData({ ...formData, code: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">UOM</label>
                        <select className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs shadow-sm" value={formData.uom} onChange={e => setFormData({ ...formData, uom: e.target.value as UOM })}>
                          <option value="">Select UOM</option>
                          {UOMS.map(u => <option key={u} value={u}>{u.toUpperCase()}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Vendor</label>
                        <input placeholder="e.g. MedSupply Co" className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm" value={formData.vendor} onChange={e => setFormData({ ...formData, vendor: e.target.value })} />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Category</label>
                        <select className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs shadow-sm" value={formData.category} onChange={e => setFormData({ ...formData, category: e.target.value as Category })}>
                          <option value="">Select category</option>
                          {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Description</label>
                      <textarea rows={2} placeholder="Product description..." className="px-3 py-2 rounded-lg border border-slate-200 text-xs shadow-sm resize-none" value={formData.description} onChange={e => setFormData({ ...formData, description: e.target.value })} />
                    </div>
                  </div>
                )}

                {selectedExistingItem && (
                  <div className="mt-2 bg-white border border-slate-200 rounded-xl p-4 text-xs text-slate-600 space-y-1 shadow-sm">
                    <div className="font-black text-slate-700 uppercase tracking-[0.15em] mb-1">Price Preview</div>
                    <div className="flex justify-between">
                      <span>Item Status in THIS Room:</span>
                      <span className="font-bold text-slate-800">
                        {room.items.find(i => i.name === selectedExistingItem.name && i.brand === selectedExistingItem.brand) 
                          ? `${room.items.find(i => i.name === selectedExistingItem.name && i.brand === selectedExistingItem.brand)?.quantity} ${selectedExistingItem.uom} existing`
                          : "New to this room"}
                      </span>
                    </div>
                    <div className="flex justify-between"><span>Adding:</span><span className="font-bold text-blue-600">{incomingQty} {selectedExistingItem.uom} @ ${incomingPrice.toFixed(2)} = ${(incomingQty * incomingPrice).toFixed(2)}</span></div>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button type="submit" className="bg-[#3498db] text-white px-6 py-2 rounded-lg font-black uppercase text-[10px] tracking-[0.2em] hover:bg-[#2980b9] shadow-md shadow-blue-100 transition-all">
                    {receiveMode === 'edit' ? 'Update Item' : 'Receive Stock'}
                  </button>
                  <button type="button" onClick={resetForm} className="bg-slate-500 text-white px-6 py-2 rounded-lg font-black uppercase text-[10px] tracking-[0.2em] hover:bg-slate-600 shadow-md shadow-slate-100 transition-all">Cancel</button>
                </div>
              </form>
            </div>
          )}

          <div className="flex flex-col gap-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <h3 className="font-bold text-slate-800 text-lg tracking-tight">Items in Room <span className="text-slate-400 font-medium">({room.items.length})</span></h3>
              <div className="relative w-full md:w-96">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#3498db] w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search items by product, brand, or code..."
                  className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium focus:ring-1 focus:ring-[#4d9678] focus:border-transparent outline-none shadow-sm transition-all"
                  value={roomSearch}
                  onChange={e => setRoomSearch(e.target.value)}
                />
              </div>
            </div>

            {/* DESKTOP TABLE VIEW */}
            <div className="hidden md:block bg-white border border-slate-200 rounded-[1rem] overflow-x-auto shadow-sm custom-scrollbar">
              <table className="w-full text-left border-collapse min-w-[1000px] text-xs">
                <thead className="bg-[#f8fafc] text-slate-500 font-black uppercase tracking-widest text-[9px] border-b border-slate-200 sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-5 w-[100px]">Brand</th>
                    <th className="px-3 py-5 w-[150px]">Product</th>
                    <th className="px-3 py-5 w-[80px]">Code</th>
                    <th className="px-3 py-5 w-[110px] text-center">Qty</th>
                    <th className="px-3 py-5 w-[60px]">UOM</th>
                    <th className="px-3 py-5 w-[80px]">Unit Price</th>
                    <th className="px-3 py-5 w-[80px]">Total</th>
                    <th className="px-3 py-5 w-[100px]">Vendor</th>
                    <th className="px-3 py-5 w-[100px]">Category</th>
                    <th className="px-3 py-5 w-[100px]">Expires</th>
                    <th className="px-3 py-5 w-[140px]">Location</th>
                    <th className="px-3 py-5 w-[60px] text-center">Action</th>
                  </tr>
                </thead>

                <tbody className="bg-white divide-y divide-slate-50">
                  {Object.entries(itemsByCategory).length > 0 ? (
                    Object.entries(itemsByCategory).map(([cat, items]: [string, Item[]]) => (
                      <React.Fragment key={cat}>
                        <tr className="bg-slate-100/70 border-y border-slate-200">
                          <td
                            colSpan={12}
                            className="px-3 py-3 text-[10px] font-black text-slate-600 uppercase tracking-[0.2em]"
                          >
                            {cat}
                          </td>
                        </tr>

                        {items.map((item) => {
                          const expiryDateObj = item.expiryDate ? new Date(item.expiryDate) : null;
                          const now = new Date();
                          const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                          const isExpired = expiryDateObj ? expiryDateObj < now : false;
                          const isExpiringSoon = expiryDateObj ? !isExpired && expiryDateObj <= soonThreshold : false;
                          const batches = item.batches && item.batches.length ? item.batches : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
                          const isOpen = !!openBatchRows[item.id];
                          const rowHighlight = isOpen ? 'bg-blue-200/60' : 'hover:bg-slate-50/60';

                          return (
                            <React.Fragment key={item.id}>
                              <tr
                                className={`${rowHighlight} transition-colors group`}
                              >
                                <td className="px-3 py-4 text-slate-500 whitespace-nowrap text-xs overflow-hidden text-ellipsis">
                                  #{item.brand || "-"}
                                </td>

                                <td className="px-3 py-4 text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis">
                                  <div className="font-bold truncate max-w-[250px]" title={item.name}>{item.name}</div>
                                  {item.description && (
                                    <div className="text-[12px] text-slate-600 italic mt-1 truncate max-w-[250px]" title={item.description}>
                                      {item.description}
                                    </div>
                                  )}
                                </td>

                                <td className="px-3 py-4 text-slate-500 text-[10px] whitespace-nowrap overflow-hidden text-ellipsis">
                                  {item.code || "-"}
                                </td>

                                {/* Quantity Column - Hide adjustments in readOnly mode */}
                                <td className="px-3 py-4">
                                  {readOnly || batches.length > 1 ? (
                                    <span className="min-w-[28px] text-center font-bold text-slate-800 block">{item.quantity}</span>
                                  ) : (
                                    <div className="flex items-center justify-center gap-2">
                                      <button
                                        onClick={() => item.quantity > 1 && onUpdateQty(room.id, item.id, -1)}
                                        disabled={item.quantity <= 1}
                                        className={`w-7 h-7 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${item.quantity <= 1 ? 'text-slate-300 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'}`}
                                        aria-label="Decrease quantity"
                                        title="Decrease"
                                      >
                                        <Minus className="w-3.5 h-3.5" />
                                      </button>
                                      <span className="min-w-[28px] text-center font-bold text-slate-800">
                                        {item.quantity}
                                      </span>
                                      <button
                                        onClick={() => onUpdateQty(room.id, item.id, 1)}
                                        className="w-7 h-7 flex items-center justify-center border border-slate-200 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors"
                                        aria-label="Increase quantity"
                                        title="Increase"
                                      >
                                        <Plus className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </td>

                                <td className="px-3 py-4 text-slate-600 font-medium text-xs capitalize whitespace-nowrap">
                                  {item.uom}
                                </td>

                                <td className="px-3 py-4 text-slate-500 font-semibold whitespace-nowrap">
                                  ${item.price.toFixed(2)}
                                </td>

                                <td className="px-3 py-4 font-black text-[#4d9678] tracking-tight whitespace-nowrap">
                                  ${(item.quantity * item.price).toFixed(2)}
                                </td>

                                <td className="px-3 py-4 text-slate-600 font-medium text-xs whitespace-nowrap overflow-hidden text-ellipsis">
                                  {item.vendor || "-"}
                                </td>

                                <td className="px-3 py-4">
                                  <span className="text-[10px] font-medium text-slate-500 capitalize tracking-wide">
                                    {item.category}
                                  </span>
                                </td>

                                <td
                                  className={`px-3 py-4 text-xs whitespace-nowrap ${isExpired
                                    ? "text-rose-600 font-bold"
                                    : isExpiringSoon
                                      ? "text-amber-600 font-bold"
                                      : "text-slate-500"
                                    }`}
                                >
                                  {item.expiryDate ? (
                                    <>
                                      {new Date(item.expiryDate).toLocaleDateString('en-GB')}
                                      {isExpired && (
                                        <span className="ml-1 text-[9px] uppercase tracking-tight font-black">
                                          (EXP)
                                        </span>
                                      )}
                                      {isExpiringSoon && (
                                        <span className="ml-1 text-[9px] uppercase tracking-tight font-black">
                                          (SOON)
                                        </span>
                                      )}
                                    </>
                                  ) : (
                                    "-"
                                  )}
                                  {batches.length > 1 && (
                                    <button
                                      type="button"
                                      className="ml-2 text-[10px] font-bold text-blue-600 underline"
                                      onClick={(e) => { e.stopPropagation(); toggleBatchRow(item.id); }}
                                    >
                                      {isOpen ? "Hide" : "View"}
                                    </button>
                                  )}
                                </td>

                                <td className="px-3 py-4">
                                  {readOnly ? (
                                    <span className="text-slate-400 font-medium text-xs">{room.name}</span>
                                  ) : (
                                    <select
                                      className="bg-white text-xs font-bold text-slate-700 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer w-full text-ellipsis shadow-sm"
                                      value={room.id}
                                      onChange={(e) => handleRelocateSelect(item, e.target.value)}
                                      title="Transfer location"
                                    >
                                      <option value={room.id}>{room.name}</option>
                                      <option value="" disabled>
                                        -- Move to --
                                      </option>
                                      {allRooms
                                        .filter((r) => r.id !== room.id)
                                        .map((r) => (
                                          <option key={r.id} value={r.id}>
                                            {r.name}
                                          </option>
                                        ))}
                                    </select>
                                  )}
                                </td>
                                <td className="px-3 py-4 text-center">
                                  {!readOnly && (
                                    <div className="flex items-center justify-center gap-3">
                                      <button
                                        onClick={() => handleEditItem(item)}
                                        className="text-slate-300 hover:text-indigo-600 transition-colors"
                                        title="Edit item"
                                        aria-label="Edit item"
                                      >
                                        <Edit3 className="w-4 h-4" />
                                      </button>
                                      <button
                                        onClick={() => requestDeleteItem(item)}
                                        className="text-slate-300 hover:text-rose-600 transition-colors"
                                        title="Delete item"
                                        aria-label="Delete item"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                              {isOpen && batches.map((b, idx) => {
                                const bExpiry = b.expiryDate ? new Date(b.expiryDate) : null;
                                const bExpired = bExpiry ? bExpiry < now : false;
                                const bSoon = bExpiry ? !bExpired && bExpiry <= soonThreshold : false;
                                return (
                                  <tr key={idx} className={`${isOpen ? 'bg-blue-100/50' : 'bg-slate-50/60'}`}>
                                    <td className="px-3 py-2 text-[11px] text-slate-400" colSpan={3}>Batch {idx + 1}</td>
                                    <td className="px-3 py-2 text-[11px] font-bold text-slate-800 text-center">
                                      {readOnly ? (
                                        <span className="min-w-[22px] text-center font-bold text-slate-800">
                                          {b.qty}
                                        </span>
                                      ) : (
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            onClick={() => b.qty > 1 && onUpdateBatchQty(room.id, item.id, idx, -1)}
                                            disabled={b.qty <= 1}
                                            className={`w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full transition-colors ${b.qty <= 1 ? 'text-slate-300 cursor-not-allowed bg-slate-50' : 'hover:bg-slate-100 text-slate-400 hover:text-rose-500'}`}
                                            aria-label="Decrease batch quantity"
                                            title="Decrease batch quantity"
                                          >
                                            <Minus className="w-3 h-3" />
                                          </button>
                                          <span className="min-w-[22px] text-center font-bold text-slate-800">
                                            {b.qty}
                                          </span>
                                          <button
                                            onClick={() => onUpdateBatchQty(room.id, item.id, idx, 1)}
                                            className="w-6 h-6 flex items-center justify-center border border-slate-200 rounded-full hover:bg-slate-100 text-slate-400 hover:text-emerald-500 transition-colors"
                                            aria-label="Increase batch quantity"
                                            title="Increase batch quantity"
                                          >
                                            <Plus className="w-3 h-3" />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-slate-600"></td>
                                    <td className="px-3 py-2 text-[11px] text-slate-500">${b.unitPrice.toFixed(2)}</td>
                                    <td className="px-3 py-2 text-[11px] font-bold text-[#4d9678]">${(b.qty * b.unitPrice).toFixed(2)}</td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400"></td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400"></td>
                                    <td className={`px-3 py-2 text-[11px] whitespace-nowrap ${bExpired ? "text-rose-600 font-bold" : bSoon ? "text-amber-600 font-bold" : "text-slate-500"
                                      }`}>
                                      {bExpiry ? bExpiry.toLocaleDateString('en-GB') : "(No expiry)"}
                                      {bExpired && <span className="ml-1 text-[9px] uppercase font-black">(EXP)</span>}
                                      {bSoon && !bExpired && <span className="ml-1 text-[9px] uppercase font-black">(SOON)</span>}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-slate-400">
                                      {readOnly ? (
                                        <span className="text-slate-400 font-medium text-[10px]">{room.name}</span>
                                      ) : (
                                        <select
                                          className="bg-white text-[10px] font-semibold text-slate-600 border border-slate-200 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-emerald-500 cursor-pointer w-full text-ellipsis shadow-sm"
                                          value={room.id}
                                          onChange={(e) => handleBatchRelocateSelect(item, idx, e.target.value)}
                                          title="Transfer batch"
                                        >
                                          <option value={room.id}>{room.name}</option>
                                          <option value="" disabled>-- Move to --</option>
                                          {allRooms
                                            .filter((r) => r.id !== room.id)
                                            .map((r) => (
                                              <option key={r.id} value={r.id}>{r.name}</option>
                                            ))}
                                        </select>
                                      )}
                                    </td>
                                    <td className="px-3 py-2 text-[11px] text-center">
                                      {!readOnly && (
                                        <div className="flex items-center justify-center gap-2">
                                          <button
                                            onClick={() => handleEditBatch(item, b)}
                                            className="text-slate-300 hover:text-indigo-600 transition-colors"
                                            title="Edit batch"
                                            aria-label="Edit batch"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                          <button
                                            onClick={() => requestDeleteBatch(item, idx)}
                                            className="text-slate-300 hover:text-rose-600 transition-colors"
                                            title="Delete batch"
                                            aria-label="Delete batch"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })}
                            </React.Fragment>
                          );
                        })}
                      </React.Fragment>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={12}
                        className="py-24 text-center text-slate-300 font-black uppercase tracking-[0.2em] text-xs opacity-50"
                      >
                        No Inventory
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* MOBILE LIST VIEW */}
            <div className="md:hidden space-y-6 pb-20">
              {Object.keys(itemsByCategory).length > 0 ? (
                Object.entries(itemsByCategory).map(([category, items]) => (
                  <div key={category} className="space-y-3">
                    <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] px-2 flex items-center gap-2">
                      <div className="h-px bg-slate-100 flex-1" />
                      {category}
                      <div className="h-px bg-slate-100 flex-1" />
                    </h3>

                    {items.map((item) => {
                      const expiryDateObj = item.expiryDate ? new Date(item.expiryDate) : null;
                      const now = new Date();
                      const soonThreshold = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
                      const isExpired = expiryDateObj ? expiryDateObj < now : false;
                      const isExpiringSoon = expiryDateObj ? !isExpired && expiryDateObj <= soonThreshold : false;
                      const batches = item.batches && item.batches.length ? item.batches : [{ qty: item.quantity, unitPrice: item.price, expiryDate: item.expiryDate || null }];
                      const isDetailOpen = !!openDetailRows[item.id];
                      const isOpen = !!openBatchRows[item.id];

                      return (
                        <div
                          key={item.id}
                          onClick={() => toggleDetailRow(item.id)}
                          className={`bg-white rounded-2xl border transition-all duration-300 cursor-pointer active:scale-[0.99] select-none ${isDetailOpen ? 'border-emerald-200 ring-4 ring-emerald-50 shadow-md' : isOpen ? 'border-blue-200 ring-4 ring-blue-50 shadow-md' : 'border-slate-100 shadow-sm'} overflow-visible mb-4 relative ${activeRelocateKey?.startsWith(item.id) ? 'z-[50]' : 'z-0'}`}
                        >
                          {/* Compact Main View */}
                          <div className="p-4 flex flex-col gap-3">
                            {/* Title & Brand Row */}
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex flex-wrap items-center gap-2">
                                <h4 className="font-bold text-slate-800 text-base leading-tight truncate" title={item.name}>
                                  {item.name}
                                </h4>

                              </div>
                              <div className="flex items-center gap-3 shrink-0">
                                {!readOnly && (
                                  <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <button
                                      onClick={() => handleEditItem(item)}
                                      className="p-1.5 text-slate-400 hover:text-indigo-600 active:text-indigo-700 transition-colors bg-slate-50 rounded-lg hover:bg-slate-100"
                                    >
                                      <Edit3 className="w-4 h-4" />
                                    </button>
                                    <button
                                      onClick={() => requestDeleteItem(item)}
                                      className="p-1.5 text-slate-400 hover:text-rose-600 active:text-rose-700 transition-colors bg-slate-50 rounded-lg hover:bg-rose-50"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                )}
                                <div className={`transition-transform duration-300 ${isDetailOpen ? 'rotate-180 text-emerald-500' : 'text-slate-300'}`}>
                                  <ChevronDown className="w-5 h-5" />
                                </div>
                              </div>
                            </div>

                            {/* Info & Price Row */}
                            <div className="flex items-end justify-between gap-4">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-600 bg-slate-50 px-1.5 py-0.5 rounded-lg border border-slate-100">
                                  ${item.price.toFixed(2)}/ea
                                </span>

                                {!readOnly && batches.length === 1 ? (
                                  <div
                                    className="flex items-center bg-white border border-slate-100 rounded-lg shadow-sm p-0.5"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        item.quantity > 1 && onUpdateQty(room.id, item.id, -1);
                                      }}
                                      className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:text-rose-500"
                                    >
                                      <Minus className="w-2.5 h-2.5" />
                                    </button>
                                    <div className={`px-1.5 min-w-[30px] text-center font-black text-[10px] ${item.quantity <= 5 ? 'text-rose-600' : 'text-slate-700'}`}>
                                      {item.quantity}
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdateQty(room.id, item.id, 1);
                                      }}
                                      className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-90 transition-all hover:text-emerald-500"
                                    >
                                      <Plus className="w-2.5 h-2.5" />
                                    </button>
                                    <span className="pr-1 text-[8px] font-bold text-slate-500 uppercase tracking-tighter">{item.uom}</span>
                                  </div>
                                ) : (
                                  <div className={`px-2 py-0.5 rounded-lg font-black text-[10px] shadow-sm border ${item.quantity <= 5 ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-white text-slate-700 border-slate-100'}`}>
                                    {item.quantity} {item.uom}
                                  </div>
                                )}
                              </div>

                              <div className="text-xl font-black text-[#4d9678] leading-none shrink-0">
                                ${(item.quantity * item.price).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>

                          {/* Expandable Secondary Details Area */}
                          {isDetailOpen && (
                            <div className="px-5 py-4 bg-gradient-to-b from-slate-50/80 to-white border-t border-slate-100 space-y-4 animate-in slide-in-from-top-4 duration-300 rounded-b-2xl">
                              <div className="grid grid-cols-2 gap-4 pb-2 border-b border-slate-50">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Tag className="w-3 h-3" />
                                    Brand / Code
                                  </div>
                                  <div className="flex items-baseline gap-2">
                                    <span className="text-[11px] font-bold text-slate-700">{item.brand || 'No Brand'}</span>
                                    {item.code && (
                                      <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded font-mono font-bold shadow-sm">
                                        {item.code}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div className="space-y-1.5 text-right">
                                  <div className="flex items-center justify-end gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Calendar className="w-3 h-3" />
                                    Expiration
                                  </div>
                                  <div className={`text-[12px] font-black ${isExpired ? "text-rose-600" : isExpiringSoon ? "text-amber-600" : "text-slate-700"}`}>
                                    {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-GB') : 'No Date Set'}
                                  </div>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <Truck className="w-3 h-3" />
                                    Vendor
                                  </div>
                                  <span className="text-[11px] font-bold text-slate-700">{item.vendor || 'Not Specified'}</span>
                                </div>

                                <div className="space-y-1.5 text-right">
                                  <div className="flex items-center justify-end gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <MapIcon className="w-3 h-3" />
                                    Relocate
                                  </div>
                                  <div className="relative" onClick={(e) => e.stopPropagation()}>
                                    {readOnly ? (
                                      <span className="text-[11px] font-bold text-slate-700">{room.name}</span>
                                    ) : (
                                      <button
                                        onClick={() => setActiveRelocateKey(activeRelocateKey === item.id ? null : item.id)}
                                        className={`w-full bg-white text-[11px] font-bold text-slate-700 border rounded-lg px-2 py-2 text-right shadow-sm flex items-center justify-end gap-2 transition-all active:scale-[0.98] ${activeRelocateKey === item.id ? 'border-emerald-500 ring-1 ring-emerald-500/20' : 'border-slate-200 hover:border-slate-300'}`}
                                      >
                                        <span className="truncate">{room.name}</span>
                                        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-300 ${activeRelocateKey === item.id ? 'rotate-180 text-emerald-500' : ''}`} />
                                      </button>
                                    )}
                                    {activeRelocateKey === item.id && (
                                      <>
                                        <div className="fixed inset-0 z-[90]" onClick={() => setActiveRelocateKey(null)} />
                                        <div className="absolute right-0 top-full mt-1.5 z-[100] w-full min-w-[200px] bg-white border border-slate-200 rounded-xl shadow-2xl py-1 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200">
                                          <div className="px-3 py-2 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 bg-slate-50/50 flex items-center gap-2">
                                            <MapIcon className="w-3 h-3" />
                                            Target Room
                                          </div>
                                          <div className="max-h-[220px] overflow-y-auto custom-scrollbar">
                                            {allRooms.filter(r => r.id !== room.id).map(r => (
                                              <button
                                                key={r.id}
                                                onClick={() => {
                                                  handleRelocateSelect(item, r.id);
                                                  setActiveRelocateKey(null);
                                                }}
                                                className="w-full px-3 py-2.5 text-right text-[11px] font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors flex items-center justify-between group active:bg-emerald-100 border-b border-slate-200 last:border-0"
                                              >
                                                <ArrowRight className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-emerald-500 shrink-0" />
                                                <span className="truncate">{r.name}</span>
                                              </button>
                                            ))}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {item.description && (
                                <div className="space-y-1.5">
                                  <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                    <FileText className="w-3 h-3" />
                                    Description
                                  </div>
                                  <p className="text-[11px] text-slate-600 italic leading-relaxed bg-white/50 rounded-lg border border-slate-50">
                                    {item.description}
                                  </p>
                                </div>
                              )}



                              {batches.length > 1 && (
                                <div className="flex items-center justify-center pt-2 border-t border-slate-100">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleBatchRow(item.id);
                                    }}
                                    className={`w-full py-3 rounded-2xl font-black text-[11px] uppercase tracking-widest transition-all ${isOpen ? 'bg-blue-600 text-white shadow-xl shadow-blue-100' : 'bg-white border-2 border-blue-50 text-blue-600 hover:bg-blue-50/50'}`}
                                  >
                                    {isOpen ? `Hide ${batches.length} Batches` : `View ${batches.length} Batches`}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Mobile Batches Expansion */}
                          {isOpen && (
                            <div
                              className="bg-blue-50/50 border-t border-blue-100 p-3 space-y-2 rounded-b-2xl"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {batches.map((b: any, bIdx: number) => {
                                const bExpDate = b.expiryDate ? new Date(b.expiryDate) : null;
                                const bExp = bExpDate ? bExpDate < now : false;
                                const bSoon = bExpDate ? !bExp && bExpDate <= soonThreshold : false;
                                return (
                                  <div key={bIdx} className={`bg-white rounded-xl p-3 border border-blue-100 shadow-sm flex items-center gap-3 relative min-h-[75px] ${activeRelocateKey === `${item.id}-${bIdx}` ? 'z-[60]' : 'z-0'}`}>
                                    {/* Left: Quantity */}
                                    <div className="shrink-0">
                                      {!readOnly ? (
                                        <div className="flex items-center bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                                          <button
                                            onClick={() => b.qty > 1 && onUpdateBatchQty(room.id, item.id, bIdx, -1)}
                                            className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-95 transition-all hover:text-rose-500"
                                          >
                                            <Minus className="w-2.5 h-2.5" />
                                          </button>
                                          <span className="w-8 text-center text-xs font-black text-slate-700">{b.qty}</span>
                                          <button
                                            onClick={() => onUpdateBatchQty(room.id, item.id, bIdx, 1)}
                                            className="w-6 h-6 flex items-center justify-center text-slate-400 active:scale-95 transition-all hover:text-emerald-500"
                                          >
                                            <Plus className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="px-3 py-1 bg-slate-50 rounded-lg border border-slate-100 text-xs font-black text-slate-700">
                                          {b.qty}
                                        </div>
                                      )}
                                    </div>

                                    {/* Center: Prices */}
                                    <div className="flex-1 flex flex-col items-center justify-center min-w-0">
                                      <div className="text-[15px] font-black text-[#4d9678]">
                                        ${(b.qty * b.unitPrice).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                      </div>
                                      <div className="text-[11px] font-bold text-slate-500 tracking-tight">
                                        ${b.unitPrice.toFixed(2)}/ea
                                      </div>
                                    </div>

                                    {/* Right: Actions Top, Date Bottom */}
                                    <div className="flex flex-col items-end justify-between self-stretch shrink-0 min-w-[80px]">
                                      {/* Batch Actions (Top Right) */}
                                      {!readOnly && (
                                        <div className="flex gap-0.5 -mt-1 -mr-1">
                                          <div className="relative" onClick={(e) => e.stopPropagation()}>
                                            <button
                                              onClick={() => setActiveRelocateKey(activeRelocateKey === `${item.id}-${bIdx}` ? null : `${item.id}-${bIdx}`)}
                                              className={`p-1.5 transition-all rounded-lg active:scale-90 ${activeRelocateKey === `${item.id}-${bIdx}` ? 'bg-blue-100 text-blue-600 shadow-inner' : 'text-slate-400 hover:text-blue-600 hover:bg-slate-50'}`}
                                            >
                                              <MapIcon className="w-3.5 h-3.5" />
                                            </button>
                                            {activeRelocateKey === `${item.id}-${bIdx}` && (
                                              <>
                                                <div className="fixed inset-0 z-[100]" onClick={() => setActiveRelocateKey(null)} />
                                                <div className="absolute right-0 top-full mt-2 z-[110] w-[200px] bg-white border border-slate-200 rounded-2xl shadow-2xl py-2 overflow-hidden animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200">
                                                  <div className="px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-50 bg-slate-50/30 flex items-center gap-2">
                                                    <MapIcon className="w-3 h-3" />
                                                    Move Batch
                                                  </div>
                                                  <div className="max-h-[240px] overflow-y-auto custom-scrollbar">
                                                    {allRooms.filter(r => r.id !== room.id).map(r => (
                                                      <button
                                                        key={r.id}
                                                        onClick={() => {
                                                          handleBatchRelocateSelect(item, bIdx, r.id);
                                                          setActiveRelocateKey(null);
                                                        }}
                                                        className="w-full px-4 py-2.5 text-left text-[12px] font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 transition-all flex items-center justify-between group active:bg-blue-100 border-b border-slate-200 last:border-0"
                                                      >
                                                        <span className="truncate pr-2">{r.name}</span>
                                                        <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 -translate-x-2 group-hover:translate-x-0 transition-all text-blue-500 shrink-0" />
                                                      </button>
                                                    ))}
                                                  </div>
                                                </div>
                                              </>
                                            )}
                                          </div>
                                          <button onClick={() => handleEditBatch(item, b)} className="p-1.5 text-slate-400 hover:text-indigo-600 transition-colors">
                                            <Edit3 className="w-3.5 h-3.5" />
                                          </button>
                                          <button onClick={() => requestDeleteBatch(item, bIdx)} className="p-1.5 text-slate-400 hover:text-rose-600 transition-colors">
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        </div>
                                      )}

                                      {/* Expiration Date (Bottom Right) */}
                                      <div className={`text-[12px] font-black px-1.5 py-0.5 rounded-lg shadow-sm border ${bExp ? 'bg-rose-50 text-rose-500 border-rose-100' : bSoon ? 'bg-amber-50 text-amber-500 border-amber-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                                        <div className="flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />
                                          {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-GB') : 'No Exp'}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))
              ) : (
                <div className="py-20 text-center flex flex-col items-center justify-center text-slate-300 gap-4">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center">
                    <Package className="w-10 h-10" />
                  </div>
                  <div className="text-sm font-black uppercase tracking-[0.2em] opacity-50">Empty Room</div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-8 pb-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="bg-slate-800 p-2 rounded-xl">
                  <Activity className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-wider">Recent Activity</h4>
                </div>
              </div>
              <button
                onClick={() => setIsLogOpen(!isLogOpen)}
                className="flex items-center gap-2 border border-slate-200 rounded-full px-4 py-2 text-[10px] font-black uppercase text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-all shadow-sm tracking-widest bg-white"
              >
                {isLogOpen ? 'Collapse' : 'Expand'}
                <ChevronDown className={`w-3 h-3 transition-transform duration-500 ${isLogOpen ? 'rotate-180' : ''}`} />
              </button>
            </div>

            {isLogOpen && (
              <div className="grid grid-cols-1 gap-3 animate-in fade-in slide-in-from-bottom-4 duration-500 max-h-[350px] overflow-y-auto pr-3 custom-scrollbar">
                {logs.length > 0 ? logs.map((log) => (
                  <div key={log.id} className="flex flex-col gap-3 p-4 bg-slate-50/50 rounded-2xl border border-transparent hover:border-slate-200 hover:bg-white group transition-all duration-300">
                    <div className="flex items-center justify-between">
                      <div className="flex items-start gap-4">
                        <div className={`mt-1 p-2.5 rounded-xl shadow-sm ${log.action === 'receive' || log.action === 'add' || log.action === 'transfer_in'
                          ? 'bg-emerald-100 text-emerald-600'
                          : log.action === 'remove' || log.action === 'delete' || log.action === 'transfer_out'
                            ? 'bg-rose-100 text-rose-600'
                            : 'bg-blue-100 text-blue-600'
                          }`}>
                          {log.action === 'receive' || log.action === 'add' || log.action === 'transfer_in' ? (
                            <Plus className="w-4 h-4" />
                          ) : log.action === 'remove' || log.action === 'delete' || log.action === 'transfer_out' ? (
                            <ArrowDownLeft className="w-4 h-4" />
                          ) : (
                            <Activity className="w-4 h-4" />
                          )}
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md ${log.action === 'receive' || log.action === 'add' || log.action === 'transfer_in'
                              ? 'bg-emerald-50 text-emerald-700'
                              : log.action === 'remove' || log.action === 'delete' || log.action === 'transfer_out'
                                ? 'bg-rose-50 text-rose-700'
                                : 'bg-blue-50 text-blue-700'
                              }`}>
                              {log.action.replace('_', ' ')}
                            </span>
                            {log.actorName && (
                              <span className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded-md font-bold shadow-sm">
                                {log.actorName}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                            {log.details}
                          </p>

                          {log.beforeValue !== undefined && log.afterValue !== undefined && (
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Change</span>
                              <div className="flex items-center gap-2 bg-white px-2.5 py-1 rounded-lg border border-slate-100 shadow-sm">
                                <span className="text-[11px] font-bold text-slate-400 line-through decoration-slate-300">{log.beforeValue}</span>
                                <ArrowRight className="w-3 h-3 text-slate-300" />
                                <span className={`text-[11px] font-black ${Number(log.afterValue) > Number(log.beforeValue) ? 'text-emerald-600' : 'text-rose-600'
                                  }`}>
                                  {log.afterValue}
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1.5 shrink-0 ml-4">
                        <div className="flex items-center gap-2 text-slate-700">
                          <Clock className="w-3 h-3" />
                          <p className="text-[12px] font-extrabold tracking-wider">{new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <div className="flex items-center gap-2 text-slate-400">
                          <Calendar className="w-3 h-3" />
                          <p className="text-[11px] font-bold">{new Date(log.timestamp).toLocaleDateString('en-GB')}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="text-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                    <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                    <p className="text-[11px] text-slate-400 font-black uppercase tracking-[0.3em]">No activity traces found</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {
        transferContext && (
          <div className="fixed inset-0 bg-black/50 z-[10100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
              <div>
                <p className="text-xl font-semibold text-slate-700">
                  Transfer "{transferContext.item.name}" to {targetRoomName}
                </p>
                <p className="text-sm text-slate-600 mt-1">How many do you want to transfer?</p>
                <p className="text-[12px] font-bold text-emerald-600 mt-1">Available: {transferContext.item.quantity}</p>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Quantity</label>
                <input
                  type="number"
                  min={1}
                  max={transferContext.item.quantity}
                  value={transferQty || ''}
                  onChange={(e) => setTransferQty(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold focus:ring-2 focus:ring-blue-500 outline-none"
                />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={cancelTransfer}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmTransfer}
                  className="px-4 py-2 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        bulkTransferContext && (
          <div className="fixed inset-0 bg-black/50 z-[10100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
              <div>
                <p className="text-xl font-semibold text-slate-700">
                  Transfer all batches of "{bulkTransferContext.item.name}"?
                </p>
                <p className="text-sm text-slate-600 mt-1">
                  This will move {bulkTransferContext.item.quantity} {bulkTransferContext.item.uom} to {allRooms.find(r => r.id === bulkTransferContext.toRoomId)?.name || 'the selected room'}.
                </p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={cancelBulkTransfer}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmBulkTransfer}
                  className="px-4 py-2 rounded-full bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 transition-colors"
                >
                  Transfer all
                </button>
              </div>
            </div>
          </div>
        )
      }

      {
        deleteContext && (
          <div className="fixed inset-0 bg-black/50 z-[10100] flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4 border border-slate-100 animate-in zoom-in-95 duration-200">
              <div>
                <p className="text-xl font-semibold text-slate-700">
                  {deleteContext.batchIndex !== undefined
                    ? `Delete Batch ${deleteContext.batchIndex + 1} of "${deleteContext.item.name}" ?`
                    : `Delete "${deleteContext.item.name}" ?`}
                </p>
                <p className="text-sm text-slate-500 mt-1">This action cannot be undone.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  onClick={cancelDelete}
                  className="px-4 py-2 rounded-full bg-slate-100 text-slate-600 font-bold text-sm hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  className="px-4 py-2 rounded-full bg-rose-600 text-white font-bold text-sm hover:bg-rose-700 transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )
      }
      {
        errorModal && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[10200] flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-sm p-8 border border-slate-100 animate-in zoom-in-95 duration-200 text-center">
              <div className="flex justify-center mb-4">
                <div className="w-16 h-16 bg-rose-50 rounded-full flex items-center justify-center text-rose-500">
                  <AlertCircle className="w-10 h-10" />
                </div>
              </div>
              <h3 className="text-xl font-black text-slate-800 mb-2 uppercase tracking-tight">{errorModal.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed mb-8">
                {errorModal.message}
              </p>
              <button
                onClick={() => setErrorModal(null)}
                className="w-full py-4 bg-slate-900 text-white rounded-2xl font-bold text-sm hover:bg-slate-800 transition-all shadow-lg active:scale-95"
              >
                Got it
              </button>
            </div>
          </div>
        )
      }
      {deleteProductConfirm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-[2px] z-[10200] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-100 p-8 max-w-sm w-full animate-in zoom-in-95 duration-200">
            <h4 className="text-xl font-bold text-slate-800 mb-2 leading-tight">
              Delete "{deleteProductConfirm.name}" {deleteProductConfirm.brand ? `(${deleteProductConfirm.brand})` : ''}?
            </h4>
            <p className="text-sm text-slate-500 mb-8 leading-relaxed">
              This action cannot be undone.
            </p>
            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setDeleteProductConfirm(null)}
                className="px-6 py-2.5 rounded-full font-bold text-sm text-slate-600 bg-slate-50 hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDeleteGlobalProduct}
                className="px-6 py-2.5 rounded-full font-bold text-sm text-white bg-[#e91e63] hover:bg-[#d81b60] shadow-lg shadow-rose-100 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default RoomModal;