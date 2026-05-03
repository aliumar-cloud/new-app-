import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  PieChart, Pie, Cell, LineChart, Line, AreaChart, Area
} from 'recharts';
import { 
  Users, 
  Vote, 
  Target, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownRight,
  ShieldCheck,
  Zap,
  BarChart3,
  Database
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, limit, doc } from 'firebase/firestore';
import { Voter, CampaignConfig } from '../types';

export default function DashboardView() {
  const [voters, setVoters] = useState<Voter[]>([]);
  const [config, setConfig] = useState<CampaignConfig>({
    electionName: 'Election Data Loading...',
    electionDate: '',
    targetVotes: 5000
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(collection(db, 'voters'));
    const unsubscribeV = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => doc.data() as Voter);
      setVoters(data);
      setLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'voters'));

    const unsubscribeC = onSnapshot(doc(db, 'config', 'global'), (doc) => {
      if (doc.exists()) {
        setConfig(doc.data() as CampaignConfig);
      }
    });

    return () => {
      unsubscribeV();
      unsubscribeC();
    };
  }, []);

  const totalVoters = voters.length;
  const supporters = voters.filter(v => v.supportLevel === 'strong_support' || v.supportLevel === 'lean_support').length;
  const votedCount = voters.filter(v => v.votedStatus).length;
  const targetVotes = totalVoters;
  
  const supportData = [
    { name: 'Support', value: supporters, color: '#DAA520' },
    { name: 'Undecided', value: voters.filter(v => v.supportLevel === 'undecided').length, color: '#F59E0B' },
    { name: 'Oppose', value: voters.filter(v => v.supportLevel === 'lean_opposition' || v.supportLevel === 'strong_opposition').length, color: '#F43F5E' },
  ];

  const turnoutPercentage = totalVoters > 0 ? (votedCount / totalVoters) * 100 : 0;
  const supportPercentage = totalVoters > 0 ? (supporters / totalVoters) * 100 : 0;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="space-y-6"
    >
      {/* Central Metric */}
      <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-3xl p-8 md:p-12 flex flex-col items-center justify-center relative overflow-hidden shadow-sm text-center">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(218,165,32,0.05),transparent_70%)]"></div>
        <div className="z-10 w-full max-w-2xl mx-auto">
          <h1 className="text-2xl md:text-4xl font-black text-white dark:text-gray-100 mb-2 tracking-tight">{config.electionName}</h1>
          <p className="text-blue-300 dark:text-gray-400 text-xs font-bold uppercase tracking-[0.4em] mb-8">
            {config.electionDate ? new Date(config.electionDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'SET_DATE_PENDING'}
          </p>
          
          <h2 className="text-blue-300 dark:text-gray-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4">Total Secured Records</h2>
          <div className="text-6xl md:text-8xl font-black text-[#DAA520] dark:text-[#FFD700] tracking-tighter mb-8 tabular-nums">
            {totalVoters.toLocaleString()}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <div className="px-5 py-2 bg-emerald-50 border border-emerald-100 rounded-full text-[10px] text-emerald-600 font-bold uppercase tracking-wider">
               Turnout: {turnoutPercentage.toFixed(1)}%
            </div>
            <div className="px-5 py-2 bg-[#DAA520]/5 border border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20 rounded-full text-[10px] text-[#DAA520] dark:text-[#FFD700] font-bold uppercase tracking-wider font-mono">
              HASH: 7XJ9...L12
            </div>
          </div>
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 md:gap-6">
        <StatCard 
          label="SUPPORTERS" 
          value={`${supporters.toLocaleString()}`} 
          sub={`${supportPercentage.toFixed(1)}% Strength`} 
          icon={<ShieldCheck className="w-5 h-5" />} 
          color="#DAA520"
        />
        <StatCard 
          label="TURNOUT" 
          value={`${votedCount.toLocaleString()}`} 
          sub="Verified ballots" 
          icon={<Vote className="w-5 h-5" />} 
          color="#10B981"
        />
        <StatCard 
          label="REMAINING" 
          value={Math.max(0, targetVotes - supporters).toLocaleString()} 
          sub="Target vs Current" 
          icon={<Target className="w-5 h-5" />} 
          color="#6366f1"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-3xl p-6 md:p-8 relative overflow-hidden shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-8 gap-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-blue-300 dark:text-gray-400 flex items-center gap-2 font-mono">
              <TrendingUp className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
              SENTIMENT_CHART
            </h3>
            <span className="text-[9px] font-mono text-slate-300 uppercase tracking-tighter">DATA_STREAM_08</span>
          </div>
          <div className="h-[250px] md:h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={supportData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <Tooltip 
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ backgroundColor: '#fff', border: '1px solid #f1f5f9', borderRadius: '12px', fontSize: '11px', fontWeight: 'bold', color: '#1e293b', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} 
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={32}>
                  {supportData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-4 bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-3xl p-8 flex flex-col shadow-sm">
          <h3 className="text-xs font-bold uppercase tracking-widest text-blue-300 dark:text-gray-400 mb-8 flex items-center gap-2 font-mono">
             <Target className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
             STRATEGIC_GOALS
          </h3>
          <div className="flex-1 flex flex-col justify-center gap-10">
            <div>
              <div className="flex justify-between text-[11px] font-bold text-blue-200 dark:text-gray-300 mb-3 tracking-tight">
                <span className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-[#DAA520] rounded-full"></div>
                  TARGET_REACH
                </span>
                <span className="text-white dark:text-gray-100">{targetVotes > 0 ? (supporters / targetVotes * 100).toFixed(0) : 0}%</span>
              </div>
              <div className="h-2 bg-[#FFD700] dark:bg-[#050505] rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${targetVotes > 0 ? (supporters / targetVotes * 100) : 0}%` }}
                  className="h-full bg-[#DAA520]" 
                />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] font-bold text-blue-200 dark:text-gray-300 mb-3 tracking-tight">
                <span className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full"></div>
                  POLL_TURNOUT
                </span>
                <span className="text-white dark:text-gray-100">{turnoutPercentage.toFixed(0)}%</span>
              </div>
              <div className="h-2 bg-[#FFD700] dark:bg-[#050505] rounded-full overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: `${turnoutPercentage}%` }}
                  className="h-full bg-emerald-500" 
                />
              </div>
            </div>
            
            <div className="mt-4 pt-6 border-t border-[#004A8F] dark:border-[#333333] space-y-4 font-mono">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-[#DAA520]/10">
                  <BarChart3 className="w-5 h-5 text-[#DAA520] dark:text-[#FFD700]" />
                </div>
                <div>
                  <p className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-tighter">Live Status</p>
                  <p className="text-sm font-bold text-white dark:text-gray-100">District Alpha Sync</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StatCard({ label, value, sub, icon, color = "#fff" }: { label: string, value: string, sub: string, icon: React.ReactNode, color?: string }) {
  return (
    <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-6 rounded-3xl group hover:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/30 dark:border-[#FFD700] dark:border-[#333333]/30 transition-all shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest font-mono">{label}</span>
        <div style={{ color }} className="opacity-60 group-hover:opacity-100 transition-opacity">
          {icon}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="text-3xl font-bold tracking-tight text-white dark:text-gray-100">{value}</span>
      </div>
      <p className="text-[10px] text-blue-300 dark:text-gray-400 mt-1 uppercase font-bold tracking-tighter">{sub}</p>
    </div>
  );
}

