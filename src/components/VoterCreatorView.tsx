import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { 
  UserPlus, 
  MapPin, 
  Save, 
  RefreshCw, 
  Phone, 
  Home,
  CheckCircle2,
  AlertCircle,
  Upload,
  Camera,
  Clipboard,
  User
} from 'lucide-react';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { collection, doc, setDoc, serverTimestamp, onSnapshot, query } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Voter, SupportLevel } from '../types';
import { useAuth } from '../App';
import { useVoters } from '../contexts/VoterContext';

export default function VoterCreatorView() {
  const { user } = useAuth();
  const { refreshVoters } = useVoters();
  const [formData, setFormData] = useState({
    voterId: '',
    fullName: '',
    address: '',
    phone: '',
    pollingStation: '',
    supportLevel: 'undecided' as SupportLevel,
    photoUrl: '',
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [error, setError] = useState<string | null>(null);

  const processImage = async (file: File | Blob) => {
    setError(null);
    setUploading(true);
    try {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const MAX_WIDTH = 400;
          const MAX_HEIGHT = 400;
          let width = img.width;
          let height = img.height;

          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);
          
          canvas.toBlob(async (blob) => {
            if (!blob) {
              setError("Failed to process image blob.");
              setUploading(false);
              return;
            }
            
            try {
              const safeId = formData.voterId.trim() || `temp_${Date.now()}`;
              const fileName = `voter_photos/${safeId}.jpg`;
              const storageRef = ref(storage, fileName);
              const snapshot = await uploadBytes(storageRef, blob);
              const downloadURL = await getDownloadURL(snapshot.ref);
              
              setFormData(prev => ({ ...prev, photoUrl: downloadURL }));
              setUploading(false);
            } catch (storageErr: any) {
              console.error("Storage error:", storageErr);
              setError(`Upload failed: ${storageErr.message}`);
              setUploading(false);
            }
          }, 'image/jpeg', 0.7);
        };
        img.onerror = () => {
          setError("Failed to parse image file.");
          setUploading(false);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        setError("Failed to read file.");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload error:", err);
      setError("Failed to process image.");
      setUploading(false);
    }
  };
  
  const handleClipboardPaste = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        // Fallback for browsers that don't support read() but might support readText() or just don't allow programmatic image paste
        setError("Direct clipboard access is restricted. Try using Ctrl+V or your keyboard's paste button.");
        return;
      }
      
      const items = await navigator.clipboard.read();
      for (const item of items) {
        for (const type of item.types) {
          if (type.startsWith("image/")) {
            const blob = await item.getType(type);
            if (blob) processImage(blob);
            return;
          }
        }
      }
      setError("No image found in clipboard.");
    } catch (err: any) {
      console.error("Clipboard error:", err);
      setError("Clipboard access denied or unsupported.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processImage(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
            const blob = items[i].getAsFile();
            if (blob) processImage(blob);
        }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedId = formData.voterId.trim();
    if (!trimmedId || !formData.fullName.trim()) {
      setError("Voter ID and Full Name are mandatory fields.");
      return;
    }

    if (!/^[a-zA-Z0-9_\-]+$/.test(trimmedId)) {
      setError("Voter ID must only contain letters, numbers, hyphens, and underscores (no spaces).");
      return;
    }
    
    setSaving(true);
    try {
      const voterData: Voter = {
        ...formData,
        voterId: trimmedId,
        fullName: formData.fullName.trim(),
        districtId: 'default', // Using a default value as it's still in the type
        votedStatus: false,
        updatedBy: user?.uid || 'unknown',
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'voters', trimmedId), voterData);
      refreshVoters();
      setSuccess(true);
      setFormData({
        voterId: '',
        fullName: '',
        address: '',
        phone: '',
        pollingStation: '',
        supportLevel: 'undecided',
        photoUrl: ''
      });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("Save error:", err);
      if (err.message && err.message.startsWith('{')) {
        try {
          const info = JSON.parse(err.message);
          setError(`Security Denied: ${info.error} (${info.operationType})`);
        } catch {
          setError(err.message);
        }
      } else {
        setError(err.message || "An unexpected error occurred during registration.");
      }
      handleFirestoreError(err, OperationType.CREATE, `voters/${formData.voterId}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-4xl mx-auto"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 bg-[#DAA520] shadow-2xl shadow-[#DAA520]/20 rounded-3xl flex items-center justify-center text-white dark:text-gray-100">
            <UserPlus className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-3xl font-black tracking-tight text-white dark:text-gray-100 uppercase">Registry <span className="text-[#DAA520] dark:text-[#FFD700]">Expansion</span></h2>
            <p className="text-xs font-bold text-blue-300 dark:text-gray-400 tracking-[0.2em] uppercase mt-1">Authorized Data Intake Protocol</p>
          </div>
        </div>
        
        {success && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="px-6 py-3 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-500/10"
          >
            <CheckCircle2 className="w-4 h-4" />
            Voter Registered Successfully
          </motion.div>
        )}

        {error && (
          <motion.div 
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="px-6 py-3 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 font-bold text-xs uppercase tracking-widest shadow-lg shadow-rose-500/10"
          >
            <AlertCircle className="w-4 h-4" />
            {error}
          </motion.div>
        )}
      </div>

      <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-[40px] shadow-sm overflow-hidden p-8 md:p-12">
        <form onSubmit={handleSave} onPaste={handlePaste} className="space-y-10 group">
          <div className="flex flex-col md:flex-row gap-10 items-start">
            {/* Photo Section */}
            <div className="w-full md:w-auto flex flex-col items-center gap-4">
              <div className="w-32 h-32 md:w-40 md:h-40 bg-[#003B73] dark:bg-[#1f1f1f] border-2 border-dashed border-[#004A8F] dark:border-[#333333] rounded-[32px] flex items-center justify-center text-slate-300 overflow-hidden relative shadow-inner group-hover:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/30 dark:border-[#FFD700] dark:border-[#333333]/30 transition-colors">
                {formData.photoUrl ? (
                  <img src={formData.photoUrl} alt="Preview" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <User className="w-12 h-12" />
                )}
                {uploading && (
                  <div className="absolute inset-0 bg-[#002B5B] dark:bg-[#141414]/60 backdrop-blur-sm flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 animate-spin text-[#DAA520] dark:text-[#FFD700]" />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-1.5 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-lg text-[9px] font-bold text-blue-200 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#DAA520]/10 hover:text-[#DAA520] dark:hover:text-[#FFD700] dark:text-[#FFD700] transition-all">
                    <Upload className="w-3 h-3" /> Library
                  </button>
                  <button type="button" onClick={() => cameraInputRef.current?.click()} className="px-3 py-1.5 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-lg text-[9px] font-bold text-blue-200 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#DAA520]/10 hover:text-[#DAA520] dark:hover:text-[#FFD700] dark:text-[#FFD700] transition-all">
                    <Camera className="w-3 h-3" /> Capture
                  </button>
                  <button type="button" onClick={handleClipboardPaste} className="px-3 py-1.5 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-lg text-[9px] font-bold text-blue-200 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#DAA520]/10 hover:text-[#DAA520] dark:hover:text-[#FFD700] dark:text-[#FFD700] transition-all">
                    <Clipboard className="w-3 h-3" /> Paste
                  </button>
                </div>
                <p className="text-[8px] font-bold text-blue-300/40 dark:text-gray-500 uppercase tracking-widest text-center">Ctrl+V to Paste</p>
              </div>
              <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
              <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
            </div>

            {/* Basic Info */}
            <div className="flex-1 space-y-8 w-full">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-blue-300 dark:text-gray-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
                    <AlertCircle className="w-3 h-3 text-[#DAA520] dark:text-[#FFD700]" />
                    Voter ID
                  </label>
                  <input 
                    required
                    placeholder="e.g. A012345"
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl py-4 px-6 text-sm font-semibold focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] outline-none transition-all"
                    value={formData.voterId}
                    onChange={(e) => setFormData({...formData, voterId: e.target.value})}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-blue-300 dark:text-gray-400 uppercase tracking-[0.2em] px-1">Full Name</label>
                  <input 
                    required
                    placeholder="Full legal name"
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl py-4 px-6 text-sm font-semibold focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] outline-none transition-all"
                    value={formData.fullName}
                    onChange={(e) => setFormData({...formData, fullName: e.target.value})}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-blue-300 dark:text-gray-400 uppercase tracking-[0.2em] px-1">Phone</label>
                  <input 
                    type="tel"
                    placeholder="+960 777-7777"
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl py-4 px-6 text-sm font-semibold focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] outline-none transition-all"
                    value={formData.phone}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  />
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black text-blue-300 dark:text-gray-400 uppercase tracking-[0.2em] px-1">Polling Station</label>
                  <input 
                    placeholder="e.g. Ward 1 Station"
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl py-4 px-6 text-sm font-semibold focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] outline-none transition-all"
                    value={formData.pollingStation}
                    onChange={(e) => setFormData({...formData, pollingStation: e.target.value})}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <label className="text-[10px] font-black text-blue-300 dark:text-gray-400 uppercase tracking-[0.2em] px-1 flex items-center gap-2">
              <Home className="w-3 h-3 text-blue-300 dark:text-gray-400" />
              Registered Residential Address
            </label>
            <textarea 
              required
              placeholder="e.g. M. Victory House, 2nd Floor, Male'"
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-[28px] p-6 text-sm font-semibold focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] outline-none transition-all min-h-[100px] resize-none"
              value={formData.address}
              onChange={(e) => setFormData({...formData, address: e.target.value})}
            />
          </div>

          <div className="space-y-3">
             <label className="text-[10px] font-black text-blue-300 dark:text-gray-400 uppercase tracking-[0.2em] px-1">Initial Political Sentiment</label>
             <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                {[
                  { value: 'strong_support', label: 'Strong Support', color: 'bg-emerald-500 text-white dark:text-gray-100' },
                  { value: 'lean_support', label: 'Lean Support', color: 'bg-emerald-100 text-emerald-700' },
                  { value: 'undecided', label: 'Undecided', color: 'bg-[#FFD700] dark:bg-[#050505] text-blue-200 dark:text-gray-300' },
                  { value: 'lean_opposition', label: 'Lean Oppose', color: 'bg-rose-100 text-rose-700' },
                  { value: 'strong_opposition', label: 'Strong Oppose', color: 'bg-rose-500 text-white dark:text-gray-100' }
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setFormData({...formData, supportLevel: option.value as SupportLevel})}
                    className={`py-4 px-2 rounded-2xl text-[10px] font-black uppercase tracking-tighter transition-all ${
                      formData.supportLevel === option.value 
                        ? `${option.color} ring-4 ring-offset-2 ring-slate-100 scale-105 shadow-xl` 
                        : 'bg-[#003B73] dark:bg-[#1f1f1f] text-blue-300 dark:text-gray-400 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
             </div>
          </div>

          <div className="pt-6 border-t border-[#004A8F] dark:border-[#333333] flex items-center justify-between gap-6">
            <p className="text-[10px] font-mono text-blue-300 dark:text-gray-400 uppercase tracking-widest hidden sm:block">
              Auth_Node: {user?.displayName} <br/>
              Timestamp: {new Date().toLocaleTimeString()}
            </p>
            <button 
              type="submit" 
              disabled={saving} 
              className="w-full sm:w-auto bg-slate-900 text-white dark:text-gray-100 font-black px-16 py-5 rounded-[24px] flex items-center justify-center gap-4 hover:bg-slate-800 transition-all shadow-2xl shadow-slate-900/10 disabled:opacity-50"
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5 text-[#DAA520] dark:text-[#FFD700]" />}
              <span className="text-xs uppercase tracking-[0.2em]">Initiate Record Intake</span>
            </button>
          </div>
        </form>
      </div>
    </motion.div>
  );
}
