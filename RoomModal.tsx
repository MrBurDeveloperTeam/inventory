
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
  Clock
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
  onUpdateQty: (roomId: string, itemId: string, delta: number) => void;
  onUpdateBatchQty: (roomId: string, itemId: string, batchIndex: number, delta: number) => void;
  onTransfer: (fromRoomId: string, toRoomId: string, itemId: string, quantity: number, batchIndex?: number) => void;
  onDeleteItem: (roomId: string, itemId: string) => void;
  onUpdateItem: (roomId: string, itemId: string, itemData: Partial<Item>) => void;
  onUpdateBatch: (roomId: string, itemId: string, batchId: string, batchData: Partial<ItemBatch>) => void;
  readOnly?: boolean;
}

const RoomModal: React.FC<RoomModalProps> = ({ room, allRooms, logs, onClose, onUpdateName, onReceive, onUpdateQty, onUpdateBatchQty, onTransfer, onDeleteItem, onUpdateItem, onUpdateBatch, readOnly = false }) => {
  const [isReceiving, setIsReceiving] = useState(false);
  const [receiveMode, setReceiveMode] = useState<'existing' | 'new' | 'edit'>('existing');
  const [selectedItemIdx, setSelectedItemIdx] = useState<string>('');
  const [formData, setFormData] = useState<Partial<Item>>({
    name: '', brand: '', category: 'consumables', uom: 'box', code: '', vendor: '', description: ''
  });
  const [receiveQty, setReceiveQty] = useState(0);
  const [receivePrice, setReceivePrice] = useState(0);
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [expiry, setExpiry] = useState('');
  const [hasExpiry, setHasExpiry] = useState(false);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [roomSearch, setRoomSearch] = useState('');
  const [openBatchRows, setOpenBatchRows] = useState<Record<string, boolean>>({});
  const [transferContext, setTransferContext] = useState<{ item: Item; toRoomId: string; batchIndex?: number; availableQty: number } | null>(null);
  const [transferQty, setTransferQty] = useState(0);
  const targetRoomName = transferContext ? (allRooms.find(r => r.id === transferContext.toRoomId)?.name || 'Selected room') : '';
  const [bulkTransferContext, setBulkTransferContext] = useState<{ item: Item; toRoomId: string } | null>(null);
  const [deleteContext, setDeleteContext] = useState<{ item: Item; batchIndex?: number } | null>(null);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [localRoomName, setLocalRoomName] = useState(room.name);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);

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

  // OCR State
  const [isOCRActive, setIsOCRActive] = useState(false);
  const [ocrStep, setOcrStep] = useState<'upload' | 'camera' | 'camera_preview' | 'processing' | 'review'>('upload');
  const [ocrImage, setOcrImage] = useState<string | null>(null);
  const [ocrProgress, setOcrProgress] = useState(0);
  const [ocrStatusText, setOcrStatusText] = useState('');
  const [ocrResult, setOcrResult] = useState<(Partial<Item> & { purchaseDate?: string })[] | null>(null);

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
        description: `Imported: ${i.product}`
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

  const toggleBatchRow = (id: string) => {
    setOpenBatchRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

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
      const item = room.items[parseInt(val)];
      setFormData({ ...item });
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

  const handleBatchRelocateSelect = (item: Item, batchIndex: number, batch: ItemBatch, value: string) => {
    if (value === '') return;
    const targetId = value;
    if (targetId === room.id) return;
    openTransferModal(item, targetId, batchIndex, batch.qty);
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
            <button className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-white/10 hover:bg-white/20 rounded-xl font-bold text-sm transition-all border border-white/20">
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
              !isReceiving && !isOCRActive ? (
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
                </>
              ) : (
                <button
                  onClick={() => { setIsReceiving(false); setIsOCRActive(false); }}
                  className="bg-[#e74c3c] text-white px-6 py-2.5 rounded-xl flex items-center gap-2 font-black uppercase text-[10px] tracking-widest hover:bg-[#c0392b] shadow-lg shadow-rose-100 transition-all"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              )
            )}
          </div>

          {isOCRActive && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-[1rem] p-6 shadow-sm animate-in zoom-in-95 duration-200">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-emerald-700 font-black uppercase text-xs tracking-[0.2em] flex items-center gap-2">
                  <Scan className="w-4 h-4" /> Intelligent Shield (OCR)
                </h4>
              </div>

              {ocrStep === 'upload' && (
                <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-emerald-200 rounded-xl bg-white/50 gap-4">
                  <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                    <Camera className="w-8 h-8" />
                  </div>
                  <div className="text-center">
                    <h5 className="font-bold text-slate-700 mb-1">Upload Receipt or Label</h5>
                    <p className="text-xs text-slate-400">Take a photo or upload an image to automatically extract details</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={startCamera}
                      className="bg-white text-emerald-600 border border-emerald-200 px-6 py-2 rounded-lg font-bold text-xs hover:bg-emerald-50 transition-all shadow-sm flex items-center gap-2"
                    >
                      <Camera className="w-4 h-4" /> Take Photo
                    </button>
                    <label className="cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        if (e.target.files && e.target.files[0]) {
                          const imgs = await filesToImages([e.target.files[0]]);
                          processCapturedImage(imgs[0]);
                        }
                      }} />
                      <span className="bg-emerald-600 text-white px-6 py-2 rounded-lg font-bold text-xs hover:bg-emerald-700 transition-all shadow-md inline-flex items-center gap-2">
                        <Upload className="w-4 h-4" /> Select Image
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {ocrStep === 'camera' && (
                <div className="flex flex-col md:flex-row items-center justify-center p-2 gap-6 animate-in fade-in duration-300">
                  <div className="relative w-full max-w-2xl aspect-[3/4] sm:aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl border-4 border-white/20">
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <div className="flex flex-row md:flex-col items-center gap-4 bg-white/60 backdrop-blur-md p-4 rounded-3xl border border-slate-200 shadow-xl">
                    <button
                      onClick={capturePhoto}
                      className="flex items-center justify-center"
                    >
                      <div className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-700 flex items-center justify-center shadow-lg transform active:scale-95 transition-all duration-200">
                        <div className="w-9 h-9 rounded-full border-2 border-white/10 flex items-center justify-center">
                          <Camera className="w-5 h-5 text-white" />
                        </div>
                      </div>
                    </button>

                    <div className="h-px w-8 bg-slate-200 hidden md:block" />

                    <button
                      onClick={stopCamera}
                      className="group w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-400 hover:bg-rose-500 hover:text-white transition-all border border-slate-200 shadow-sm"
                    >
                      <X className="w-6 h-6 transform group-hover:rotate-90 transition-transform" />
                    </button>
                  </div>

                  <canvas ref={canvasRef} className="hidden" />
                </div>
              )}

              {ocrStep === 'camera_preview' && ocrImage && (
                <div className="flex flex-col items-center justify-center p-2 gap-6 animate-in zoom-in-95 duration-300">
                  <div className="relative w-full max-w-2xl aspect-[3/4] sm:aspect-video bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border-4 border-white/20">
                    <img src={ocrImage} className="w-full h-full object-contain" alt="Captured preview" />
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-4 w-full max-w-sm">
                    <button
                      onClick={startCamera}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-white border-2 border-slate-200 hover:border-emerald-500 hover:text-emerald-600 rounded-xl transition-all font-bold text-xs text-slate-600 shadow-sm"
                    >
                      <Camera className="w-4 h-4" /> Retake
                    </button>
                    <button
                      onClick={() => processCapturedImage(ocrImage)}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl transition-all font-bold text-xs shadow-md animate-pulse hover:animate-none"
                    >
                      <Scan className="w-4 h-4" /> Analyze
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
                    <div className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-2">Original Image</div>
                    <div className="rounded-xl overflow-hidden border border-slate-200 shadow-sm relative h-48 w-full bg-slate-900">
                      <img src={ocrImage || ''} className="w-full h-full object-contain" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 overflow-hidden">
                    <div className="font-bold text-slate-500 text-[10px] uppercase tracking-widest mb-2">Extracted Data ({ocrResult.length} items)</div>
                    <div className="overflow-y-auto border border-slate-200 rounded-xl bg-white shadow-sm max-h-[400px]">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 sticky top-0 z-10 border-b border-slate-100">
                          <tr>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[180px]">Name</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[50px]">Qty</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[60px]">Price</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[100px]">Brand</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[80px]">Code</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[60px]">UOM</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[90px]">Vendor</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[90px]">Category</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[90px]">Purchased</th>
                            <th className="p-2 text-[10px] font-black text-slate-500 uppercase tracking-widest w-[90px]">Expires</th>
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
                                  type="number"
                                  className="w-full bg-transparent border-none focus:ring-1 focus:ring-emerald-500 rounded px-1 text-slate-600 font-semibold text-[11px]"
                                  value={item.quantity || ''}
                                  onChange={e => {
                                    const newRes = [...ocrResult];
                                    newRes[idx] = { ...item, quantity: parseInt(e.target.value) || 0 };
                                    setOcrResult(newRes);
                                  }}
                                  placeholder="0"
                                />
                              </td>
                              <td className="px-3 py-2">
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
                            <tr><td colSpan={4} className="p-4 text-center text-slate-300 text-xs italic">No items detected</td></tr>
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


                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => {
                        // Bulk Add
                        ocrResult.forEach(item => {
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
                                description: item.description || 'Imported via OCR',
                                expiryDate: item.expiryDate || undefined
                              },
                              item.quantity || 1,
                              item.price || 0,
                              item.purchaseDate || new Date().toISOString().split('T')[0], // Purchase Date
                              item.expiryDate || undefined
                            );
                          }
                        });
                        setOcrStep('upload');
                        setIsOCRActive(false);
                      }}
                      disabled={ocrResult.length === 0}
                      className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-black uppercase text-[10px] tracking-widest hover:bg-emerald-700 shadow-lg shadow-emerald-100 transition-all disabled:opacity-50 disabled:shadow-none"
                    >
                      Add All Items ({ocrResult.length})
                    </button>
                    <button
                      onClick={() => setOcrStep('upload')}
                      className="px-6 bg-slate-100 text-slate-500 py-3 rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-slate-200 transition-all"
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
                    <select value={selectedItemIdx} onChange={handleProductSelect} className="px-3 py-2 rounded-lg border border-slate-200 bg-white font-semibold text-slate-700 text-xs focus:ring-1 focus:ring-[#3498db] outline-none shadow-sm" required>
                      <option value="">Choose existing product...</option>
                      <option value="new" className="text-[#3498db] font-bold">⊕ Create New Product...</option>
                      {room.items.map((item, idx) => <option key={idx} value={idx}>{item.name} ({item.brand})</option>)}
                    </select>
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
                    <div className="flex justify-between"><span>Current Stock:</span><span className="font-bold text-slate-800">{currentQty} {selectedExistingItem.uom} @ ${currentUnitPrice.toFixed(2)} = ${(currentQty * currentUnitPrice).toFixed(2)}</span></div>
                    <div className="flex justify-between"><span>Adding:</span><span className="font-bold text-blue-600">{incomingQty} {selectedExistingItem.uom} @ ${incomingPrice.toFixed(2)} = ${(incomingQty * incomingPrice).toFixed(2)}</span></div>
                    <div className="flex justify-between border-t border-slate-100 pt-1"><span>After Receive:</span><span className="font-black text-emerald-600">{newQty} {selectedExistingItem.uom} @ ${newAvgPrice.toFixed(2)} avg = ${(newQty * newAvgPrice).toFixed(2)}</span></div>
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
                                          onChange={(e) => handleBatchRelocateSelect(item, idx, b, e.target.value)}
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
                      const isOpen = !!openBatchRows[item.id];

                      return (
                        <div key={item.id} className={`bg-white rounded-2xl border ${isOpen ? 'border-blue-200 ring-4 ring-blue-50' : 'border-slate-100 shadow-sm'} overflow-hidden transition-all duration-300`}>
                          {/* Card Header */}
                          <div className="p-4 border-b border-slate-50 flex items-start justify-between gap-4">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[120px]">
                                  {item.brand || 'No Brand'}
                                </span>
                                {item.code && (
                                  <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-bold">
                                    {item.code}
                                  </span>
                                )}
                              </div>
                              <h4 className="font-bold text-slate-800 leading-tight truncate" title={item.name}>{item.name}</h4>
                              {item.description && (
                                <p className="text-[11px] text-slate-500 italic mt-1 leading-relaxed">
                                  {item.description}
                                </p>
                              )}
                            </div>

                            {!readOnly && (
                              <div className="flex items-center gap-1 shrink-0 bg-slate-50 p-1 rounded-xl">
                                <button onClick={() => handleEditItem(item)} className="p-2 text-slate-400 hover:text-indigo-600 transition-colors">
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button onClick={() => requestDeleteItem(item)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Main Controls Overlay */}
                          <div className="px-4 py-5 bg-gradient-to-br from-white to-slate-50/50 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                              {readOnly || batches.length > 1 ? (
                                <div className="flex flex-col">
                                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity</span>
                                  <span className="text-xl font-black text-slate-800">{item.quantity}</span>
                                </div>
                              ) : (
                                <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                                  <button
                                    onClick={() => item.quantity > 1 && onUpdateQty(room.id, item.id, -1)}
                                    disabled={item.quantity <= 1}
                                    className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                  <span className="w-10 text-center font-black text-lg text-slate-800">
                                    {item.quantity}
                                  </span>
                                  <button
                                    onClick={() => onUpdateQty(room.id, item.id, 1)}
                                    className="w-10 h-10 flex items-center justify-center rounded-xl text-slate-400 hover:bg-emerald-50 hover:text-emerald-500 transition-all active:scale-90"
                                  >
                                    <Plus className="w-4 h-4" />
                                  </button>
                                </div>
                              )}
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Unit</span>
                                <span className="text-sm font-bold text-slate-600 capitalize">{item.uom}</span>
                              </div>
                            </div>

                            <div className="text-right">
                              <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Value</div>
                              <div className="text-xl font-black text-[#4d9678] tracking-tight">
                                ${(item.quantity * item.price).toFixed(2)}
                              </div>
                              <div className="text-[10px] font-bold text-slate-400 mt-1">
                                ${item.price.toFixed(2)} / ea
                              </div>
                            </div>
                          </div>

                          {/* Secondary Info & Relocate */}
                          <div className="p-4 bg-white border-t border-slate-50 space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Expiration</span>
                                <div className={`flex items-center gap-1.5 text-[11px] font-bold ${isExpired ? "text-rose-600" : isExpiringSoon ? "text-amber-600" : "text-slate-600"}`}>
                                  <Calendar className="w-3.5 h-3.5" />
                                  {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString('en-GB') : 'No Date'}
                                  {isExpired && <span className="text-[8px] bg-rose-100 px-1 rounded tracking-tighter">(EXP)</span>}
                                  {isExpiringSoon && <span className="text-[8px] bg-amber-100 px-1 rounded tracking-tighter">(SOON)</span>}
                                </div>
                              </div>
                              <div className="space-y-1 text-right">
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Vendor</span>
                                <span className="text-[11px] font-bold text-slate-600 truncate block">
                                  {item.vendor || 'Unknown'}
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex-1">
                                {readOnly ? (
                                  <div className="bg-slate-50 px-3 py-2 rounded-xl text-[11px] font-bold text-slate-500 flex items-center gap-2">
                                    <Package className="w-3.5 h-3.5" /> {room.name}
                                  </div>
                                ) : (
                                  <div className="relative">
                                    <select
                                      className="w-full bg-slate-50 text-[11px] font-bold text-slate-700 border border-slate-100 rounded-xl px-3 py-2.5 appearance-none focus:ring-2 focus:ring-emerald-500/20 outline-none"
                                      value={room.id}
                                      onChange={(e) => handleRelocateSelect(item, e.target.value)}
                                    >
                                      <option value={room.id}>Current: {room.name}</option>
                                      {allRooms.filter(r => r.id !== room.id).map(r => (
                                        <option key={r.id} value={r.id}>Move to: {r.name}</option>
                                      ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                                      <ChevronDown className="w-4 h-4" />
                                    </div>
                                  </div>
                                )}
                              </div>

                              {batches.length > 1 && (
                                <button
                                  onClick={() => toggleBatchRow(item.id)}
                                  className={`px-4 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all ${isOpen ? 'bg-blue-600 text-white shadow-lg shadow-blue-200' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                >
                                  {isOpen ? `Hide ${batches.length} Batches` : `View ${batches.length} Batches`}
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Mobile Batches */}
                          {isOpen && (
                            <div className="bg-blue-50/50 border-t border-blue-100 p-3 space-y-2">
                              {batches.map((b, bIdx) => {
                                const bExpDate = b.expiryDate ? new Date(b.expiryDate) : null;
                                const bExp = bExpDate ? bExpDate < now : false;
                                const bSoon = bExpDate ? !bExp && bExpDate <= soonThreshold : false;
                                return (
                                  <div key={bIdx} className="bg-white rounded-xl p-3 border border-blue-100 shadow-sm flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                      {readOnly ? (
                                        <div className="text-center">
                                          <div className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Qty</div>
                                          <div className="text-sm font-black text-slate-800">{b.qty}</div>
                                        </div>
                                      ) : (
                                        <div className="flex items-center bg-slate-50 rounded-lg p-0.5 border border-slate-100">
                                          <button
                                            onClick={() => b.qty > 1 && onUpdateBatchQty(room.id, item.id, bIdx, -1)}
                                            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-rose-500"
                                          >
                                            <Minus className="w-2.5 h-2.5" />
                                          </button>
                                          <span className="w-6 text-center text-xs font-black text-slate-700">{b.qty}</span>
                                          <button
                                            onClick={() => onUpdateBatchQty(room.id, item.id, bIdx, 1)}
                                            className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-emerald-500"
                                          >
                                            <Plus className="w-2.5 h-2.5" />
                                          </button>
                                        </div>
                                      )}
                                      <div className="space-y-1">
                                        <div className="text-[11px] font-black text-[#4d9678]">${(b.qty * b.unitPrice).toFixed(2)}</div>
                                        <div className={`text-[9px] font-bold flex items-center gap-1 ${bExp ? 'text-rose-500' : bSoon ? 'text-amber-500' : 'text-slate-400'}`}>
                                          <Calendar className="w-2.5 h-2.5" />
                                          {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-GB') : 'No Exp'}
                                        </div>
                                      </div>
                                    </div>

                                    {!readOnly && (
                                      <div className="flex gap-1">
                                        <button onClick={() => handleEditBatch(item, b)} className="p-1.5 text-slate-400 hover:text-indigo-600">
                                          <Edit3 className="w-3.5 h-3.5" />
                                        </button>
                                        <button onClick={() => requestDeleteBatch(item, bIdx)} className="p-1.5 text-slate-400 hover:text-rose-600">
                                          <Trash2 className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    )}
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
    </div >
  );
};

export default RoomModal;
