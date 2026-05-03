import React, { useState } from 'react';
import { motion } from 'motion/react';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, serverTimestamp, writeBatch, collection, getDocs } from 'firebase/firestore';
import { useAuth } from '../App';

export default function BulkUpload() {
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [processing, setProcessing] = useState(false);
  const [progressStatus, setProgressStatus] = useState<string>('');
  const [progressPercent, setProgressPercent] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
      setProgressPercent(0);
    }
  };

  const processAndUpload = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    setSuccess(null);
    setProgressPercent(0);
    setProgressStatus('Uploading PDF file...');

    try {
      const formData = new FormData();
      formData.append('pdf', file);

      const response = await fetch('/api/extract-voters', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Upload failed handles failed with status ${response.status}`);
      }
      
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      let streamCompleted = false;

      if (reader) {
        while (true) {
          const { value, done } = await reader.read();
          
          if (value) {
            buffer += decoder.decode(value, { stream: true });
            
            const lines = buffer.split('\n\n');
            buffer = lines.pop() || ''; // Keep the incomplete part

            for (const line of lines) {
              const matchEvent = line.match(/event: (.*)\n/);
              const matchData = line.match(/data: (.*)/);
              if (matchEvent && matchData) {
                const eventName = matchEvent[1];
                let eventData;
                try {
                  eventData = JSON.parse(matchData[1]);
                } catch (e) {
                   continue; // skip invalid json
                }

                if (eventName === 'progress') {
                   setProgressStatus(eventData.status);
                   setProgressPercent(eventData.percent);
                } else if (eventName === 'complete') {
                   streamCompleted = true;
                   await handleVotersExtracted(eventData.voters);
                } else if (eventName === 'error') {
                   throw new Error(eventData.message);
                }
              }
            }
          }

          if (done) break;
        }
      }

      if (reader && !streamCompleted) {
        throw new Error("Connection closed unexpectedly. The AI processing might have timed out.");
      }

    } catch (err: any) {
      console.error("Bulk Upload Error:", err);
      let errorMessage = err.message || 'An error occurred during bulk upload.';
      if (typeof errorMessage === 'string' && errorMessage.startsWith('{')) {
        try {
          const info = JSON.parse(errorMessage);
          errorMessage = `Error: ${info.error ? (typeof info.error === 'string' ? info.error : JSON.stringify(info.error)) : 'Unknown'} (${info.operationType || 'unknown'})`;
        } catch {
          // ignore parsing error
        }
      } else if (typeof errorMessage === 'string' && errorMessage.includes('API_KEY_INVALID')) {
        errorMessage = "Your Gemini API Key is invalid. Please update it in the AI Studio Settings (gear icon).";
      } else if (typeof errorMessage === 'string' && errorMessage.includes('API KEY NOT VALID')) {
        errorMessage = "Your Gemini API Key is invalid. Please update it in the AI Studio Settings (gear icon).";
      }
      setError(errorMessage);
      setProcessing(false);
      setProgressStatus('');
      setProgressPercent(100);
    }
  };

  const handleVotersExtracted = async (allVoters: any[]) => {
    setProgressStatus(`Deduplicating ${allVoters.length} voters...`);
    
    // Fetch existing logic to prevent duplication on re-upload
    let existingNames = new Set<string>();
    try {
      const snap = await getDocs(collection(db, 'voters'));
      snap.forEach(doc => {
         const data = doc.data();
         if (data.fullName) existingNames.add(data.fullName.trim().toLowerCase());
         // Also add combinations like fullName + phone if desired, but fullName is safer to prevent duplicates of same person
      });
    } catch(e) {
      console.warn("Failed to fetch existing voters for deduplication", e);
    }

    const uniqueVoters = [];
    const processedNames = new Set<string>();

    for (const vData of allVoters) {
      const name = String(vData.fullName || 'Unknown Voter').trim();
      const normalizeName = name.toLowerCase();
      // If it exists in DB, or we already processed this name in THIS batch, skip
      if (existingNames.has(normalizeName) || processedNames.has(normalizeName)) {
        continue;
      }
      uniqueVoters.push(vData);
      processedNames.add(normalizeName);
    }

    setProgressStatus(`Saving ${uniqueVoters.length} new voters to database...`);
    
    const BATCH_SIZE = 100; // Smaller chunks for DB saves to show progress better
    const dbBatches = Math.ceil(uniqueVoters.length / BATCH_SIZE);
    
    for (let i = 0; i < uniqueVoters.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      const chunk = uniqueVoters.slice(i, i + BATCH_SIZE);
      
      for (const vData of chunk) {
        // Create deterministic fallback ID so even if existing DB query fails, we overwrite instead of duplicate
        const providedId = String(vData.voterId || '').trim();
        const fallbackStr = String(vData.fullName || '') + String(vData.phone || '');
        let hash = 0;
        for (let j = 0; j < fallbackStr.length; j++) {
           hash = ((hash << 5) - hash) + fallbackStr.charCodeAt(j);
           hash |= 0;
        }
        const deterministicFallback = `vtr_${Math.abs(hash).toString(36)}`;
        
        let targetId = providedId || deterministicFallback;
        const trimmedId = targetId.replace(/[^a-zA-Z0-9_\-]/g, '_') || deterministicFallback;
        
        const docRef = doc(db, 'voters', trimmedId);
        batch.set(docRef, {
          voterId: trimmedId,
          fullName: String(vData.fullName || 'Unknown Voter').substring(0, 200),
          phone: String(vData.phone || '').substring(0, 50),
          address: String(vData.address || '').substring(0, 500),
          pollingStation: String(vData.pollingStation || '').substring(0, 200),
          districtId: 'default',
          supportLevel: 'undecided',
          votedStatus: false,
          updatedBy: user?.uid || 'system_bulk',
          updatedAt: serverTimestamp()
        }, { merge: true });
      }
      try {
        await batch.commit();
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, 'voters');
      }
      setProgressPercent(70 + Math.round(((i + BATCH_SIZE) / uniqueVoters.length) * 30));
    }

    setSuccess(`Successfully imported ${uniqueVoters.length} NEW voters from PDF (skipped ${allVoters.length - uniqueVoters.length} duplicates).`);
    setFile(null);
    setProcessing(false);
    setProgressStatus('');
    setProgressPercent(100);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex flex-col mb-8">
        <h2 className="text-2xl font-black text-white dark:text-gray-100 tracking-tight uppercase">Bulk Upload</h2>
        <p className="text-sm text-blue-200 dark:text-gray-300 font-medium">Extract voters automatically from a PDF using Gemini AI.</p>
      </div>

      {error && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 font-bold text-xs uppercase tracking-widest shadow-sm"
        >
          <AlertCircle className="w-4 h-4" />
          {error}
        </motion.div>
      )}

      {success && (
        <motion.div 
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3 text-emerald-600 font-bold text-xs uppercase tracking-widest shadow-sm"
        >
          <CheckCircle2 className="w-4 h-4" />
          {success}
        </motion.div>
      )}

      <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-8 rounded-3xl shadow-sm">
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-[#004A8F] dark:border-[#333333] rounded-2xl p-10 bg-[#003B73] dark:bg-[#1f1f1f] gap-4 transition-colors hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505] relative">
          <UploadCloud className="w-10 h-10 text-blue-300 dark:text-gray-400" />
          <div className="text-center">
            <p className="text-sm font-bold text-blue-100 dark:text-gray-400">Drop PDF file here or click to browse</p>
            <p className="text-xs text-blue-300 dark:text-gray-400 mt-1">Accepts multi-page PDF files</p>
          </div>
          <input 
            type="file" 
            accept=".pdf,application/pdf"
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={processing}
          />
        </div>


        {file && !processing && (
          <div className="mt-6 flex items-center justify-between p-4 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl">
            <div className="flex items-center gap-3 overflow-hidden">
              <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
              <div className="truncate">
                <p className="text-sm font-bold text-blue-100 dark:text-gray-400 truncate">{file.name}</p>
                <p className="text-xs text-blue-300 dark:text-gray-400">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            <button
              onClick={() => setFile(null)}
              className="text-xs font-bold text-rose-500 uppercase tracking-widest hover:text-rose-700 p-2"
            >
              Remove
            </button>
          </div>
        )}

        {processing && (
          <div className="mt-6 space-y-2">
            <div className="flex justify-between text-xs font-bold uppercase tracking-widest text-blue-200 dark:text-gray-300">
              <span>{progressStatus}</span>
              <span>{progressPercent}%</span>
            </div>
            <div className="w-full bg-[#FFD700] dark:bg-[#050505] rounded-full h-3 overflow-hidden">
              <motion.div 
                className="bg-black h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${progressPercent}%` }}
                transition={{ ease: "easeOut" }}
              />
            </div>
          </div>
        )}

        <button
          onClick={processAndUpload}
          disabled={!file || processing}
          className="w-full mt-8 bg-black text-white dark:text-gray-100 rounded-xl py-4 font-bold text-sm uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {processing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Processing Bulk Upload...
            </>
          ) : (
            'Extract & Save Voters'
          )}
        </button>
      </div>
    </div>
  );
}
