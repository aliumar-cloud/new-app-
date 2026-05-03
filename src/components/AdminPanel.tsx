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
  CheckCircle2
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, addDoc, onSnapshot, query, setDoc, doc } from 'firebase/firestore';
import { CampaignUser, District } from '../types';

export default function AdminPanel() {
  const [staff, setStaff] = useState<CampaignUser[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [isAddingStaff, setIsAddingStaff] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedSuccess, setSeedSuccess] = useState(false);

  useEffect(() => {
    const qS = query(collection(db, 'users'));
    const unsubscribeS = onSnapshot(qS, (snapshot) => {
      setStaff(snapshot.docs.map(doc => doc.data() as CampaignUser));
    });

    const qD = query(collection(db, 'districts'));
    const unsubscribeD = onSnapshot(qD, (snapshot) => {
      setDistricts(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as District)));
    });

    return () => {
      unsubscribeS();
      unsubscribeD();
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

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-20">
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-white dark:text-gray-100 shadow-xl">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-2xl font-black tracking-tight text-white dark:text-gray-100 uppercase">System <span className="text-[#DAA520] dark:text-[#FFD700]">Console</span></h2>
              <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold tracking-widest uppercase">Operational Integrity & Access</p>
            </div>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-rose-50 border border-rose-100 rounded-full">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <span className="text-[10px] font-black text-rose-600 uppercase tracking-tighter">Admin Credentials Verified</span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* User Management Block */}
           <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-8 rounded-[32px] space-y-6 relative overflow-hidden shadow-sm flex flex-col justify-between">
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-sky-50 rounded-3xl flex items-center justify-center mb-4">
                <UserPlus className="w-8 h-8 text-sky-500" />
              </div>
              <h3 className="text-sm font-bold font-mono text-white dark:text-gray-100 uppercase tracking-widest">
                Team Authorization
              </h3>
              <p className="text-xs text-blue-200 dark:text-gray-300 leading-relaxed mt-2">
                 Onboard campaign staff and assign roles for record intake and analytics access.
              </p>
              <button 
                onClick={() => setIsAddingStaff(true)}
                className="w-full mt-8 py-4 bg-slate-900 text-white dark:text-gray-100 rounded-2xl flex items-center justify-center gap-4 hover:bg-slate-800 transition-all shadow-xl"
              >
                <UserPlus className="w-5 h-5 text-[#DAA520] dark:text-[#FFD700]" />
                <span className="text-[10px] font-bold tracking-widest uppercase">Authorize Node</span>
              </button>
            </div>
          </div>

          {/* District Initialization Block */}
          <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-8 rounded-[32px] space-y-6 relative overflow-hidden shadow-sm flex flex-col justify-between">
            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-[#DAA520]/10 rounded-3xl flex items-center justify-center mb-4">
                <MapPin className="w-8 h-8 text-[#DAA520] dark:text-[#FFD700]" />
              </div>
              <h3 className="text-sm font-bold font-mono text-white dark:text-gray-100 uppercase tracking-widest">
                Region Mapping
              </h3>
              <p className="text-xs text-blue-200 dark:text-gray-300 leading-relaxed mt-2">
                 Initialize Maafannu districts. This is required for valid voter registration and geospatial grouping.
              </p>
              <button 
                onClick={seedDistricts}
                disabled={seeding || districts.length > 0}
                className="w-full mt-8 py-4 border-2 border-[#004A8F] dark:border-[#333333] text-white dark:text-gray-100 rounded-2xl flex items-center justify-center gap-4 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] transition-all disabled:opacity-50 disabled:grayscale"
              >
                {seeding ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Database className="w-5 h-5 text-[#DAA520] dark:text-[#FFD700]" />}
                <span className="text-[10px] font-bold tracking-widest uppercase">
                  {districts.length > 0 ? 'Regions Initialized' : 'Initialize Regions'}
                </span>
                {seedSuccess && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
              </button>
              {districts.length > 0 && (
                <p className="text-[9px] text-emerald-600 font-bold uppercase mt-3">{districts.length} Active Regions Detected</p>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Staff Activity */}
      <section className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-[40px] overflow-hidden shadow-sm">
        <div className="px-10 py-8 border-b border-[#004A8F] dark:border-[#333333] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h3 className="text-xs font-bold uppercase tracking-[0.2em] text-blue-300 dark:text-gray-400 flex items-center gap-2 font-mono">
             <ShieldAlert className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
             Current Campaign Nodes
          </h3>
          <div className="px-4 py-2 bg-[#003B73] dark:bg-[#1f1f1f] rounded-full text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">
            Nodes Online: {staff.length}
          </div>
        </div>
        <div className="divide-y divide-slate-50">
          {staff.map((s) => (
            <div key={s.uid} className="px-10 py-6 flex items-center justify-between group hover:bg-[#DAA520]/[0.01] transition-colors">
              <div className="flex items-center gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center border-2 ${s.role === 'admin' ? 'border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20 bg-[#DAA520]/5' : 'border-[#004A8F] dark:border-[#333333] bg-[#003B73] dark:bg-[#1f1f1f]'}`}>
                  {s.role === 'admin' ? <ShieldAlert className="w-6 h-6 text-[#DAA520] dark:text-[#FFD700]" /> : <User className="w-6 h-6 text-blue-300 dark:text-gray-400" />}
                </div>
                <div>
                  <p className="text-sm font-bold text-white dark:text-gray-100">{s.displayName}</p>
                  <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold lowercase mt-0.5">{s.email}</p>
                </div>
              </div>
              <div className="text-right">
                <p className={`text-[9px] font-bold px-4 py-1.5 rounded-full border inline-block mb-1 tracking-widest ${s.role === 'admin' ? 'text-[#DAA520] dark:text-[#FFD700] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20 bg-[#DAA520]/5' : 'text-blue-300 dark:text-gray-400 border-[#004A8F] dark:border-[#333333] bg-[#003B73] dark:bg-[#1f1f1f]'}`}>
                   {s.role.toUpperCase()}
                </p>
                <p className="text-[9px] text-slate-300 font-bold uppercase mt-1 tracking-tighter hidden sm:block">Since {new Date(s.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
          {staff.length === 0 && (
            <div className="p-16 text-center text-slate-300 text-xs font-bold uppercase tracking-widest">
              No authorized nodes detected in sector
            </div>
          )}
        </div>
      </section>

      <AnimatePresence>
        {isAddingStaff && (
          <StaffAddModal onClose={() => setIsAddingStaff(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

function StaffAddModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'admin' | 'staff'>('staff');
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
            <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center text-[#DAA520] dark:text-[#FFD700]">
              <UserPlus className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-white dark:text-gray-100">Authorize Node</h3>
              <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold uppercase tracking-widest">Protocol Initiation</p>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-[#003B73] dark:bg-[#1f1f1f] flex items-center justify-center text-blue-300 dark:text-gray-400 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Operational Name</label>
            <input 
              required
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]"
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
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]"
              placeholder="verified-email@domain.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Clearance Level</label>
            <div className="flex gap-4">
              <button 
                type="button"
                onClick={() => setRole('staff')}
                className={`flex-1 py-4 rounded-xl border text-[10px] font-bold transition-all ${role === 'staff' ? 'bg-slate-900 text-white dark:text-gray-100 border-slate-900 shadow-lg' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
              >
                STAFF_OPERATOR
              </button>
              <button 
                type="button"
                onClick={() => setRole('admin')}
                className={`flex-1 py-4 rounded-xl border text-[10px] font-bold transition-all ${role === 'admin' ? 'bg-[#DAA520] text-white dark:text-gray-100 border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] shadow-lg shadow-[#DAA520]/20' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
              >
                UNLIMITED_ADMIN
              </button>
            </div>
          </div>
          <button 
            disabled={saving}
            className="w-full py-5 bg-slate-900 text-white dark:text-gray-100 rounded-[24px] font-bold uppercase tracking-[0.2em] text-[10px] mt-4 hover:bg-slate-800 flex items-center justify-center gap-3 transition-all shadow-xl shadow-slate-900/10"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />}
            Confirm Authorization
          </button>
        </form>
      </motion.div>
    </div>
  );
}
