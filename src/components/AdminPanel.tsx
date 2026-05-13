import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldAlert, 
  UserPlus, 
  RefreshCw,
  User,
  X,
  AlertCircle,
  MapPin,
  Database,
  CheckCircle2,
  Settings,
  Zap
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, setDoc, doc, getDocs, writeBatch, deleteField } from 'firebase/firestore';
import { CampaignUser, District, CampaignConfig } from '../types';
import { useAuth } from '../App';

export default function AdminPanel() {
  const { users: staff } = useAuth();
  const [districts, setDistricts] = useState<District[]>([]);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);
  const [config, setConfig] = useState<CampaignConfig | null>(null);
  const [migrating, setMigrating] = useState(false);
  const [migrationStatus, setMigrationStatus] = useState<{ processed: number, total: number } | null>(null);

  const [activeAdminTab, setActiveAdminTab] = useState<'users' | 'system' | 'optimization'>('users');
  const [showMigrationConfirm, setShowMigrationConfirm] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const snapD = await getDocs(collection(db, 'districts'));
        setDistricts(snapD.docs.map(doc => ({ ...doc.data(), id: doc.id } as District)));
      } catch (err) {
        handleFirestoreError(err, OperationType.LIST, 'districts');
      }
    };
    
    fetchData();
    
    const unsubscribeC = onSnapshot(doc(db, 'config', 'global'), (docSnap) => {
      if (docSnap.exists()) {
        setConfig(docSnap.data() as CampaignConfig);
      } else {
        setConfig({ electionName: 'Election Day Stats', electionDate: '', targetVotes: 5000 });
      }
    });

    return () => {
      unsubscribeC();
    };
  }, []);

  const seedDistricts = async () => {
    setSeeding(true);
    const maafannuDistricts = [
      { id: 'mf_north', name: 'Maafannu North', managerUid: 'system' },
      { id: 'mf_south', name: 'Maafannu South', managerUid: 'system' },
      { id: 'mf_central', name: 'Maafannu Central', managerUid: 'system' },
      { id: 'mf_west', name: 'Maafannu West', managerUid: 'system' }
    ];

    try {
      for (const d of maafannuDistricts) {
        await setDoc(doc(db, 'districts', d.id), d);
      }
      setSeedSuccess(true);
      setTimeout(() => setSeedSuccess(false), 3000);
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'districts');
    } finally {
      setSeeding(false);
    }
  };

  const runMigration = async () => {
    if (!confirm("This will scan all voter records and remove 'base64Image' fields to save Firestore quota. Continue?")) return;
    
    setMigrating(true);
    try {
      const q = query(collection(db, 'voters'));
      const snap = await getDocs(q);
      const total = snap.size;
      let processed = 0;
      
      // Batch updates in chunks of 500 (Firestore limit)
      const docs = snap.docs;
      for (let i = 0; i < docs.length; i += 500) {
        const batch = writeBatch(db);
        const chunk = docs.slice(i, i + 500);
        
        chunk.forEach(d => {
          const data = d.data();
          if (data.base64Image) {
            batch.update(d.ref, {
              base64Image: deleteField()
            });
          }
        });
        
        await batch.commit();
        processed += chunk.length;
        setMigrationStatus({ processed, total });
      }
      
      alert("Migration complete. All identified 'base64Image' fields have been removed.");
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'voters (batch)');
    } finally {
      setMigrating(false);
      setMigrationStatus(null);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-20">
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white dark:text-gray-100 shadow-xl">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white dark:text-gray-100 uppercase">System <span className="text-[#DAA520] dark:text-[#DAA520]">Console</span></h2>
              <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold tracking-widest uppercase">Operational Integrity & Access</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-100 rounded-full">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-tighter">Admin Credentials Verified</span>
          </div>
        </div>

        {/* Admin Tabs */}
        <div className="flex items-center gap-2 mb-8 bg-[#002B5B] dark:bg-[#141414] p-1.5 rounded-2xl border border-[#004A8F] dark:border-[#333333] overflow-x-auto scrollbar-hide">
          <button 
            onClick={() => setActiveAdminTab('users')}
            className={`px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeAdminTab === 'users' ? 'bg-[#DAA520] text-white' : 'text-blue-200 hover:bg-[#003B73]'}`}
          >
            User Access
          </button>
          <button 
            onClick={() => setActiveAdminTab('system')}
            className={`px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeAdminTab === 'system' ? 'bg-[#DAA520] text-white' : 'text-blue-200 hover:bg-[#003B73]'}`}
          >
            System Config
          </button>
          <button 
            onClick={() => setActiveAdminTab('optimization')}
            className={`px-6 py-3 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all whitespace-nowrap ${activeAdminTab === 'optimization' ? 'bg-amber-500 text-white' : 'text-amber-200 hover:bg-amber-500/10'}`}
          >
            DB Optimization
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {activeAdminTab === 'users' && (
            <div className="lg:col-span-3 space-y-8">
              <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-8 rounded-[32px] space-y-6 relative overflow-hidden shadow-sm flex flex-col sm:flex-row items-center justify-between text-center sm:text-left">
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-16 h-16 bg-sky-50 rounded-3xl flex items-center justify-center">
                    <UserPlus className="w-8 h-8 text-sky-500" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold font-mono text-white dark:text-gray-100 uppercase tracking-widest">Team Authorization</h3>
                    <p className="text-xs text-blue-200 dark:text-gray-300 mt-1 max-w-md">Onboard campaign staff and assign roles for record intake and analytics access.</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsAddingStaff(true)}
                  className="px-8 py-4 bg-slate-900 text-white dark:text-gray-100 rounded-2xl flex items-center justify-center gap-4 hover:bg-slate-800 transition-all shadow-xl whitespace-nowrap"
                >
                  <UserPlus className="w-5 h-5 text-[#DAA520] dark:text-[#DAA520]" />
                  <span className="text-[10px] font-bold tracking-widest uppercase">Authorize Node</span>
                </button>
              </div>

              <section className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-[40px] overflow-hidden shadow-sm">
                <div className="px-10 py-8 border-b border-[#004A8F] dark:border-[#333333] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300 dark:text-gray-400 flex items-center gap-2 font-mono">
                    <ShieldAlert className="w-4 h-4 text-[#DAA520] dark:text-[#DAA520]" />
                    Current Campaign Nodes
                  </h3>
                  <div className="px-4 py-2 bg-[#003B73] dark:bg-[#1f1f1f] rounded-full text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">
                    Nodes Online: {staff.length}
                  </div>
                </div>
                <div className="divide-y divide-slate-50/10">
                  {staff.map((s) => (
                    <div key={s.uid} className="px-10 py-6 flex items-center justify-between group hover:bg-[#DAA520]/[0.01] transition-colors">
                      <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${s.role === 'admin' ? 'border-[#DAA520] dark:border-[#DAA520] bg-[#DAA520]/5' : 'border-[#004A8F] dark:border-[#333333] bg-[#003B73] dark:bg-[#1f1f1f]'}`}>
                          {s.role === 'admin' ? <ShieldAlert className="w-6 h-6 text-[#DAA520] dark:text-[#DAA520]" /> : <User className="w-6 h-6 text-blue-300 dark:text-gray-400" />}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-white dark:text-gray-100">{s.displayName}</p>
                          <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold lowercase mt-0.5">{s.email}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className={`text-[9px] font-bold px-4 py-1.5 rounded-full border inline-block mb-1 tracking-widest ${s.role === 'admin' ? 'text-[#DAA520] dark:text-[#DAA520] border-[#DAA520] bg-[#DAA520]/5' : 'text-blue-300 dark:text-gray-400 border-[#004A8F] bg-[#003B73] dark:bg-[#1f1f1f]'}`}>
                          {s.role.toUpperCase()}
                        </p>
                        <p className="text-[9px] text-slate-300 font-bold uppercase mt-1 tracking-tighter hidden sm:block">Since {new Date(s.createdAt).toLocaleDateString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}

          {activeAdminTab === 'system' && (
            <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-8 rounded-[32px] space-y-6 flex flex-col justify-between">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-[#DAA520]/10 rounded-3xl flex items-center justify-center mb-4">
                    <MapPin className="w-8 h-8 text-[#DAA520] dark:text-[#DAA520]" />
                  </div>
                  <h3 className="text-sm font-bold font-mono text-white dark:text-gray-100 uppercase tracking-widest">Region Mapping</h3>
                  <p className="text-xs text-blue-200 dark:text-gray-300 leading-relaxed mt-2">Initialize Maafannu districts. This is required for valid voter registration and geospatial grouping.</p>
                  <button 
                    onClick={seedDistricts}
                    disabled={seeding || districts.length > 0}
                    className="w-full mt-8 py-4 border-2 border-[#004A8F] dark:border-[#333333] text-white dark:text-gray-100 rounded-2xl flex items-center justify-center gap-4 hover:bg-[#003B73] transition-all disabled:opacity-50 disabled:grayscale"
                  >
                    {seeding ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5 text-[#DAA520]" />}
                    <span className="text-[10px] font-bold tracking-widest uppercase">{districts.length > 0 ? 'Regions Initialized' : 'Initialize Regions'}</span>
                  </button>
                </div>
              </div>

              <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-8 rounded-[32px] space-y-6 flex flex-col justify-between">
                <div className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-emerald-50 rounded-3xl flex items-center justify-center mb-4">
                    <Settings className="w-8 h-8 text-emerald-500" />
                  </div>
                  <h3 className="text-sm font-bold font-mono text-white dark:text-gray-100 uppercase tracking-widest">Campaign Settings</h3>
                  <p className="text-xs text-blue-200 dark:text-gray-300 leading-relaxed mt-2">Adjust global parameters like election date, name, and total target votes.</p>
                  <button 
                    onClick={() => setIsEditingConfig(true)}
                    className="w-full mt-8 py-4 bg-slate-900 text-white dark:text-gray-100 rounded-2xl flex items-center justify-center gap-4 hover:bg-slate-800 transition-all"
                  >
                    <Settings className="w-5 h-5 text-[#DAA520]" />
                    <span className="text-[10px] font-bold tracking-widest uppercase">Adjust Settings</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeAdminTab === 'optimization' && (
            <div className="lg:col-span-3 space-y-8">
              <div className="bg-amber-900/10 border border-amber-500/30 p-8 rounded-[32px] space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-6">
                    <div className="w-16 h-16 bg-amber-50 rounded-3xl flex items-center justify-center">
                      <Zap className="w-8 h-8 text-amber-600" />
                    </div>
                    <div>
                      <h3 className="text-sm font-bold font-mono text-white dark:text-gray-100 uppercase tracking-widest">Database Optimization</h3>
                      <p className="text-xs text-blue-200 dark:text-gray-300 mt-1">Clean up legacy data structures (Base64 images) to resolve quota limits and improve load times.</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setShowMigrationConfirm(true)}
                    disabled={migrating}
                    className="px-10 py-5 bg-amber-500 text-white font-bold rounded-2xl flex items-center gap-3 hover:bg-amber-600 transition-all shadow-xl shadow-amber-500/20 disabled:opacity-50"
                  >
                    {migrating ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5" />}
                    <span className="text-[10px] uppercase tracking-widest">
                      {migrating ? `Processing (${migrationStatus?.processed}/${migrationStatus?.total})...` : 'Clear Base64 Image Strings'}
                    </span>
                  </button>
                </div>
              </div>

              {migrating && migrationStatus && (
                <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] p-8 rounded-[32px] space-y-4">
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] font-bold text-blue-300 uppercase tracking-widest">Migration Progress</span>
                    <span className="text-[10px] font-bold text-white uppercase">{Math.round((migrationStatus.processed / migrationStatus.total) * 100)}%</span>
                  </div>
                  <div className="w-full bg-[#003B73] h-3 rounded-full overflow-hidden">
                    <motion.div 
                      className="h-full bg-amber-500"
                      initial={{ width: 0 }}
                      animate={{ width: `${(migrationStatus.processed / migrationStatus.total) * 100}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-blue-200 text-center uppercase tracking-tighter">Processed {migrationStatus.processed} of {migrationStatus.total} records</p>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {isAddingStaff && (
          <StaffAddModal onClose={() => setIsAddingStaff(false)} />
        )}
        {isEditingConfig && config && (
          <ConfigModal config={config} onClose={() => setIsEditingConfig(false)} />
        )}
        {showMigrationConfirm && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] p-10 rounded-[40px] max-w-md w-full shadow-2xl text-center"
            >
              <div className="w-20 h-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldAlert className="w-10 h-10 text-amber-500" />
              </div>
              <h3 className="text-xl font-black text-white mb-4 uppercase italic">Database Sanitization</h3>
              <p className="text-sm text-blue-200 leading-relaxed mb-8">
                This operation will strip the <code className="bg-slate-900/50 px-1.5 py-0.5 rounded text-amber-400">base64Image</code> field from every voter record. This is irreversible but necessary to stay within Firestore free-tier limits.
              </p>
              <div className="flex flex-col gap-3">
                <button 
                  onClick={() => { setShowMigrationConfirm(false); runMigration(); }}
                  className="w-full py-4 bg-rose-600 text-white font-bold rounded-2xl uppercase tracking-widest text-[10px] hover:bg-rose-700 transition-all shadow-lg"
                >
                  Proceed with Cleanup
                </button>
                <button 
                  onClick={() => setShowMigrationConfirm(false)}
                  className="w-full py-4 bg-[#003B73] text-blue-300 font-bold rounded-2xl uppercase tracking-widest text-[10px] hover:bg-[#004A8F] transition-all"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ConfigModal({ config, onClose }: { config: CampaignConfig, onClose: () => void }) {
  const [electionName, setElectionName] = useState(config.electionName);
  const [electionDate, setElectionDate] = useState(config.electionDate);
  const [targetVotes, setTargetVotes] = useState(config.targetVotes || 5000);
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, 'config', 'global'), {
        electionName,
        electionDate,
        targetVotes
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, 'config/global');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] w-full max-w-lg rounded-[40px] shadow-2xl overflow-visible p-10"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-emerald-500">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-white dark:text-gray-100">Campaign Settings</h3>
              <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold uppercase tracking-widest">Global Parameters</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-[#003B73] dark:bg-[#1f1f1f] flex items-center justify-center text-blue-300 dark:text-gray-400 hover:bg-[#DAA520] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Election Name</label>
            <input 
              required
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#DAA520] dark:border-[#333333]"
              placeholder="e.g. 2026 Presidential Election"
              value={electionName}
              onChange={(e) => setElectionName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Election Date</label>
            <input 
              required
              type="date"
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#DAA520] dark:border-[#333333] text-white dark:text-gray-100"
              style={{ colorScheme: 'dark' }}
              value={electionDate}
              onChange={(e) => setElectionDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Target Votes</label>
            <input 
              required
              type="number"
              min="0"
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#DAA520] dark:border-[#333333]"
              placeholder="5000"
              value={targetVotes}
              onChange={(e) => setTargetVotes(parseInt(e.target.value) || 0)}
            />
          </div>
          
          <button 
            disabled={saving}
            className="w-full py-5 bg-slate-900 text-white dark:text-gray-100 rounded-[24px] font-bold uppercase tracking-[0.2em] text-[10px] mt-4 hover:bg-slate-800 flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-900/10"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Settings className="w-4 h-4 text-emerald-500" />}
            Save Settings
          </button>
        </form>
      </motion.div>
    </div>
  );
}

function StaffAddModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff' | 'leader'>('staff');
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // In a real app, we might check if user already exists
      await setDoc(doc(db, 'users', `INV_${Date.now()}`), {
        email,
        displayName: name,
        role,
        createdAt: new Date().toISOString(),
        uid: `invited_${Date.now()}` // Will be updated on actual login
      });
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'users');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden p-10"
      >
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-[#DAA520] dark:text-[#DAA520]">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-white dark:text-gray-100">Authorize Node</h3>
              <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold uppercase tracking-widest">Protocol Initiation</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-[#003B73] dark:bg-[#1f1f1f] flex items-center justify-center text-blue-300 dark:text-gray-400 hover:bg-[#DAA520] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Operational Name</label>
            <input 
              required
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#DAA520] dark:border-[#333333]"
              placeholder="e.g. Ahmed Staff"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Email Identity</label>
            <input 
              required
              type="email"
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#DAA520] dark:border-[#333333]"
              placeholder="verified-email@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Clearance Level</label>
            <div className="flex gap-2">
              <button 
                type="button"
                onClick={() => setRole('staff')}
                className={`flex-1 py-4 rounded-xl border text-[10px] font-bold transition-all ${role === 'staff' ? 'bg-slate-900 text-white dark:text-gray-100 border-slate-900 shadow-lg' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
              >
                STAFF
              </button>
              <button 
                type="button"
                onClick={() => setRole('leader')}
                className={`flex-1 py-4 rounded-xl border text-[10px] font-bold transition-all ${role === 'leader' ? 'bg-blue-600 text-white dark:text-gray-100 border-blue-600 shadow-lg' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
              >
                LEADER
              </button>
              <button 
                type="button"
                onClick={() => setRole('admin')}
                className={`flex-1 py-4 rounded-xl border text-[10px] font-bold transition-all ${role === 'admin' ? 'bg-[#DAA520] text-white dark:text-gray-100 border-[#DAA520] dark:border-[#DAA520] dark:border-[#333333] shadow-lg shadow-[#DAA520]/20' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
              >
                ADMIN
              </button>
            </div>
          </div>
          <button 
            disabled={saving}
            className="w-full py-5 bg-slate-900 text-white dark:text-gray-100 rounded-[24px] font-bold uppercase tracking-[0.2em] text-[10px] mt-4 hover:bg-slate-800 flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-900/10"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4 text-[#DAA520] dark:text-[#DAA520]" />}
            Confirm Authorization
          </button>
        </form>
      </motion.div>
    </div>
  );
}
