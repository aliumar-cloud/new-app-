import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  Filter, 
  MoreVertical, 
  CheckCircle2, 
  Circle, 
  Phone, 
  MapPin, 
  User, 
  UserPlus,
  ChevronRight, 
  ChevronDown,
  Save, 
  X,
  MessageSquare,
  AlertCircle,
  Vote,
  ShieldCheck,
  RefreshCw,
  Image as ImageIcon,
  Upload,
  Camera,
  Clipboard,
  Trash2,
  Grid,
  List,
  Users,
  Check
} from 'lucide-react';
import { db, storage, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, doc, updateDoc, deleteDoc, serverTimestamp, writeBatch, deleteField } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Voter, SupportLevel, CampaignUser } from '../types';
import { useAuth } from '../App';
import { useVoters } from '../contexts/VoterContext';

export default function VoterList({ onRegisterClick }: { onRegisterClick: () => void, key?: string }) {
  const { user, users: usersList } = useAuth();
  const { voters, loading, refreshVoters, updateVoterLocally } = useVoters();
  
  const usersInfo = React.useMemo(() => {
    const info: Record<string, string> = {};
    usersList.forEach(u => {
      info[u.uid] = u.displayName || u.email;
    });
    return info;
  }, [usersList]);

  const [search, setSearch] = useState('');
  const [sentimentFilter, setSentimentFilter] = useState<SupportLevel | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'voted' | 'not_voted' | 'all'>('all');
  const [groupBy, setGroupBy] = useState<'station' | 'assigned' | 'address'>('address');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selectedVoter, setSelectedVoter] = useState<Voter | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAssignMode, setBulkAssignMode] = useState(false);
  const [bulkAssignUser, setBulkAssignUser] = useState('');
  const [assigning, setAssigning] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  const filteredVoters = voters.filter(v => {
    const matchesSearch = (v.fullName || '').toLowerCase().includes(search.toLowerCase()) || 
                         (v.address || '').toLowerCase().includes(search.toLowerCase()) ||
                         (v.voterId || '').toLowerCase().includes(search.toLowerCase());
    const matchesSentiment = sentimentFilter === 'all' || v.supportLevel === sentimentFilter;
    const matchesStatus = statusFilter === 'all' || 
                         (statusFilter === 'voted' ? v.votedStatus : !v.votedStatus);
    
    return matchesSearch && matchesSentiment && matchesStatus;
  });

  const toggleGroup = (groupName: string) => {
    setCollapsedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  const groupedVoters = filteredVoters.reduce((acc, voter) => {
    let groupKey = 'Unassigned';
    if (groupBy === 'station') {
      groupKey = voter.pollingStation || 'Unassigned';
    } else if (groupBy === 'address') {
      groupKey = 'All Voters (Sorted by Address)';
    } else {
      groupKey = voter.assignedTo && usersInfo[voter.assignedTo] ? usersInfo[voter.assignedTo] : 'Unassigned';
    }
    if (!acc[groupKey]) acc[groupKey] = [];
    acc[groupKey].push(voter);
    return acc;
  }, {} as Record<string, Voter[]>);

  if (groupBy === 'address' && groupedVoters['All Voters (Sorted by Address)']) {
    groupedVoters['All Voters (Sorted by Address)'].sort((a, b) => (a.address || '').localeCompare(b.address || ''));
  }

  const handleToggleSupport = async (e: React.MouseEvent, voter: Voter) => {
    e.stopPropagation();
    const newSupportLevel = voter.supportLevel === 'strong_support' ? 'undecided' : 'strong_support';
    
    // Optimistic Update
    updateVoterLocally(voter.voterId, { supportLevel: newSupportLevel });
    
    try {
      await updateDoc(doc(db, 'voters', voter.voterId), {
        supportLevel: newSupportLevel,
        updatedAt: serverTimestamp()
      });
      // Optionally refresh in background, but the UI is already updated
    } catch (err) {
      // Revert on error
      updateVoterLocally(voter.voterId, { supportLevel: voter.supportLevel });
      handleFirestoreError(err, OperationType.UPDATE, `voters/${voter.voterId}`);
    }
  };

  const handleToggleVoted = async (e: React.MouseEvent, voter: Voter) => {
    e.stopPropagation();
    const newStatus = !voter.votedStatus;
    
    // Optimistic Update
    updateVoterLocally(voter.voterId, { votedStatus: newStatus });
    
    try {
      await updateDoc(doc(db, 'voters', voter.voterId), {
        votedStatus: newStatus,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      // Revert on error
      updateVoterLocally(voter.voterId, { votedStatus: voter.votedStatus });
      handleFirestoreError(err, OperationType.UPDATE, `voters/${voter.voterId}`);
    }
  };

  const handleToggleOppose = async (e: React.MouseEvent, voter) => {
    e.stopPropagation();
    const newSupportLevel = voter.supportLevel === 'strong_opposition' ? 'undecided' : 'strong_opposition';
    
    // Optimistic Update
    updateVoterLocally(voter.voterId, { supportLevel: newSupportLevel });
    
    try {
      await updateDoc(doc(db, 'voters', voter.voterId), {
        supportLevel: newSupportLevel,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      // Revert on error
      updateVoterLocally(voter.voterId, { supportLevel: voter.supportLevel });
      handleFirestoreError(err, OperationType.UPDATE, `voters/${voter.voterId}`);
    }
  };

  const handleToggleNeutral = async (e: React.MouseEvent, voter: Voter) => {
    e.stopPropagation();
    
    // Optimistic Update
    updateVoterLocally(voter.voterId, { supportLevel: 'undecided' });
    
    try {
      await updateDoc(doc(db, 'voters', voter.voterId), {
        supportLevel: 'undecided',
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      // Revert on error
      updateVoterLocally(voter.voterId, { supportLevel: voter.supportLevel });
      handleFirestoreError(err, OperationType.UPDATE, `voters/${voter.voterId}`);
    }
  };

  const toggleSelection = (e: React.MouseEvent, voterId: string) => {
    e.stopPropagation();
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(voterId)) newSet.delete(voterId);
      else newSet.add(voterId);
      return newSet;
    });
  };

  const selectAllInGroup = (e: React.MouseEvent, groupVoters: Voter[]) => {
    e.stopPropagation();
    const allSelected = groupVoters.every(v => selectedIds.has(v.voterId));
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      groupVoters.forEach(v => {
        if (allSelected) newSet.delete(v.voterId);
        else newSet.add(v.voterId);
      });
      return newSet;
    });
  };

  const handleBulkAssign = async () => {
    if (selectedIds.size === 0 || !bulkAssignUser) return;
    setAssigning(true);
    try {
      const batch = writeBatch(db);
      selectedIds.forEach(id => {
        batch.update(doc(db, 'voters', id), {
          assignedTo: bulkAssignUser,
          updatedAt: serverTimestamp(),
          updatedBy: user?.uid
        });
      });
      await batch.commit();
      refreshVoters();
      setSelectedIds(new Set());
      setBulkAssignMode(false);
      setBulkAssignUser('');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'voters');
    } finally {
      setAssigning(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Header & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-4 md:p-6 rounded-3xl shadow-sm">
        <div className="relative flex-1">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 dark:text-gray-400" />
          <input 
            type="text" 
            placeholder="Search verified records..." 
            className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl py-3 pl-12 pr-4 text-sm text-white dark:text-gray-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] transition-all"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <div className="flex shrink-0 border border-[#004A8F] dark:border-[#333333] rounded-2xl overflow-hidden bg-[#003B73] dark:bg-[#1f1f1f]">
            <button 
              onClick={() => setViewMode('list')}
              className={`px-4 py-3 flex items-center justify-center transition-all ${viewMode === 'list' ? 'bg-[#002B5B] dark:bg-[#141414] text-white dark:text-gray-100' : 'text-blue-300 dark:text-gray-400 hover:text-blue-200 dark:text-gray-300'}`}
              title="List View"
            >
              <List className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setViewMode('grid')}
              className={`px-4 py-3 flex items-center justify-center transition-all ${viewMode === 'grid' ? 'bg-[#002B5B] dark:bg-[#141414] text-white dark:text-gray-100' : 'text-blue-300 dark:text-gray-400 hover:text-blue-200 dark:text-gray-300'}`}
              title="Photo View"
            >
              <Grid className="w-4 h-4" />
            </button>
          </div>
          
          {(user?.role === 'admin' || user?.role === 'leader') && (
            <div className="relative shrink-0">
              {user?.role === 'admin' ? (
                <>
                  <button 
                    onClick={() => setShowAddMenu(!showAddMenu)}
                    className="flex items-center justify-center gap-2 px-6 py-3 bg-[#DAA520] text-white dark:text-gray-100 rounded-2xl transition-all text-xs font-bold uppercase tracking-widest hover:bg-[#B8860B] shadow-lg shadow-[#DAA520]/20 min-w-max"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span className="hidden sm:inline">Add Options</span>
                    <ChevronDown className="w-3 h-3 ml-1 opacity-70" />
                  </button>
                  
                  {showAddMenu && (
                    <div className="absolute right-0 top-full mt-2 w-48 bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-2xl shadow-xl overflow-hidden z-30 flex flex-col">
                      <button 
                        onClick={() => {
                          setShowAddMenu(false);
                          onRegisterClick();
                        }}
                        className="flex items-center gap-3 px-4 py-3 text-left w-full text-xs font-bold uppercase tracking-widest hover:bg-[#003B73] dark:hover:bg-[#1f1f1f] transition-all text-white dark:text-gray-100 border-b border-[#004A8F] dark:border-[#333333]"
                      >
                        <UserPlus className="w-4 h-4 text-[#DAA520]" />
                        Add Record
                      </button>
                      <button 
                        onClick={() => {
                          setShowAddMenu(false);
                          setBulkAssignMode(!bulkAssignMode);
                        }}
                        className={`flex items-center gap-3 px-4 py-3 text-left w-full text-xs font-bold uppercase tracking-widest hover:bg-[#003B73] dark:hover:bg-[#1f1f1f] transition-all ${bulkAssignMode ? 'text-[#FFD700]' : 'text-white dark:text-gray-100'}`}
                      >
                        <Users className={`w-4 h-4 ${bulkAssignMode ? 'text-[#FFD700]' : 'text-blue-300'}`} />
                        Bulk Assign
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button 
                  onClick={onRegisterClick}
                  className="flex items-center justify-center gap-2 px-6 py-3 bg-[#DAA520] text-white dark:text-gray-100 rounded-2xl transition-all text-xs font-bold uppercase tracking-widest hover:bg-[#B8860B] shadow-lg shadow-[#DAA520]/20 min-w-max"
                >
                  <UserPlus className="w-4 h-4" />
                  <span className="hidden sm:inline">Add Voter</span>
                </button>
              )}
            </div>
          )}
          
          <button 
            onClick={() => refreshVoters()}
            disabled={loading}
            className="flex items-center shrink-0 justify-center gap-2 px-6 py-3 border border-[#004A8F] dark:border-[#333333] rounded-2xl transition-all text-xs font-bold uppercase tracking-widest text-blue-200 dark:text-gray-300 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          
          <button 
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center shrink-0 justify-center gap-2 px-6 py-3 border rounded-2xl transition-all text-xs font-bold uppercase tracking-widest min-w-max ${showFilters ? 'bg-slate-900 border-slate-900 text-white dark:text-gray-100' : 'border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
          >
            <Filter className="w-4 h-4" />
            <span className="hidden sm:inline">{showFilters ? 'Hide Filters' : 'Filters'}</span>
          </button>
        </div>
      </div>

      {/* Advanced Filters Bar */}
      <AnimatePresence>
        {showFilters && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-4 md:p-6 rounded-3xl shadow-sm mb-4 md:mb-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Filter by Sentiment</label>
                <div className="flex flex-wrap gap-2">
                  <button 
                    onClick={() => setSentimentFilter('all')}
                    className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${sentimentFilter === 'all' ? 'bg-[#DAA520] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                  >
                    ALL
                  </button>
                  {(['strong_support', 'lean_support', 'undecided', 'lean_opposition', 'strong_opposition'] as SupportLevel[]).map(level => (
                    <button 
                      key={level}
                      onClick={() => setSentimentFilter(level)}
                      className={`px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${sentimentFilter === level ? 'bg-[#DAA520] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                    >
                      {level.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Filter by Protocol Status</label>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setStatusFilter('all')}
                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${statusFilter === 'all' ? 'bg-[#DAA520] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                  >
                    ALL STATUSES
                  </button>
                  <button 
                    onClick={() => setStatusFilter('voted')}
                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${statusFilter === 'voted' ? 'bg-emerald-500 border-emerald-500 text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                  >
                    SYNCED (VOTED)
                  </button>
                  <button 
                    onClick={() => setStatusFilter('not_voted')}
                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${statusFilter === 'not_voted' ? 'bg-slate-300 border-[#004A8F] dark:border-[#333333] text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                  >
                    PENDING (NOT VOTED)
                  </button>
                </div>
              </div>
              <div className="space-y-2 col-span-1 border-t md:border-t-0 md:pl-4 border-[#004A8F] dark:border-[#333333] pt-4 md:pt-0">
                <label className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest">Group By</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <button 
                    onClick={() => setGroupBy('station')}
                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${groupBy === 'station' ? 'bg-[#DAA520] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                  >
                    POLLING STATION
                  </button>
                  <button 
                    onClick={() => setGroupBy('address')}
                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${groupBy === 'address' ? 'bg-[#DAA520] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                  >
                    ADDRESS
                  </button>
                  <button 
                    onClick={() => setGroupBy('assigned')}
                    className={`flex-1 px-4 py-2 rounded-xl text-[10px] font-bold transition-all border ${groupBy === 'assigned' ? 'bg-[#DAA520] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100' : 'bg-[#003B73] dark:bg-[#1f1f1f] border-[#004A8F] dark:border-[#333333] text-blue-200 dark:text-gray-300 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505]'}`}
                  >
                    ASSIGNED LEADER
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List or Grid */}
      <div className={viewMode === 'list' ? "bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-3xl overflow-hidden shadow-sm" : ""}>
        {viewMode === 'list' && (
          <div className="hidden md:grid grid-cols-12 gap-4 px-8 py-5 border-b border-[#004A8F] dark:border-[#333333] bg-[#002B5B] dark:bg-[#141414]">
            <div className="col-span-12 md:col-span-7 text-[10px] uppercase font-bold tracking-[0.2em] text-blue-300 dark:text-gray-400 font-mono">IDENT_ENTITY</div>
            <div className="col-span-12 md:col-span-5 text-[10px] uppercase font-bold tracking-[0.2em] text-blue-300 dark:text-gray-400 font-mono text-right">ACTIONS</div>
          </div>
        )}

        {viewMode === 'list' ? (
          <div className="max-h-[600px] overflow-auto">
            {(Object.entries(groupedVoters) as [string, Voter[]][]).map(([station, groupVoters]) => (
              <div key={station}>
                <div 
                  className="w-full flex items-center justify-between px-6 py-3 bg-[#003B73] dark:bg-[#1f1f1f] border-b border-[#004A8F] dark:border-[#333333] sticky top-0 z-10"
                >
                  <div className="flex items-center gap-3">
                    {bulkAssignMode && (
                      <input
                        type="checkbox"
                        checked={groupVoters.every(v => selectedIds.has(v.voterId)) && groupVoters.length > 0}
                        onChange={(e) => selectAllInGroup(e as any, groupVoters)}
                        className="w-4 h-4 accent-[#DAA520] cursor-pointer"
                      />
                    )}
                    <button onClick={() => toggleGroup(station)} className="text-xs font-bold text-white dark:text-gray-100 uppercase tracking-widest flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
                      {station}
                    </button>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-blue-300 dark:text-gray-400 font-mono">{groupVoters.length} RECORDS</span>
                    <button onClick={() => toggleGroup(station)}>
                      {collapsedGroups.has(station) ? <ChevronRight className="w-4 h-4 text-blue-300 dark:text-gray-400" /> : <ChevronDown className="w-4 h-4 text-blue-300 dark:text-gray-400" />}
                    </button>
                  </div>
                </div>
                {!collapsedGroups.has(station) && (
                  <div className="divide-y divide-slate-50">
                    {groupVoters.map((voter) => (
                      <motion.div
                        key={voter.voterId}
                        onClick={() => user?.role === 'admin' ? setSelectedVoter(voter) : null}
                        className={`grid grid-cols-12 gap-2 md:gap-4 px-4 md:px-8 py-4 md:py-6 items-center ${user?.role === 'admin' ? 'cursor-pointer' : ''} transition-all group border-b border-b-sky-100/50 ${
                          voter.supportLevel === 'strong_support' || voter.supportLevel === 'lean_support' ? 'border-4 border-emerald-500' :
                          voter.supportLevel === 'strong_opposition' || voter.supportLevel === 'lean_opposition' ? 'border-4 border-red-500' :
                          'border-l-4 border-l-transparent'
                        } ${
                          voter.votedStatus ? 'bg-[#003B73] dark:bg-[#1f1f1f]/80 border-l-slate-300 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]' :
                          'bg-[#002B5B] dark:bg-[#141414] hover:border-l-[#DAA520] hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'
                        } ${
                          !(voter.supportLevel === 'strong_support' || voter.supportLevel === 'lean_support' || voter.supportLevel === 'strong_opposition' || voter.supportLevel === 'lean_opposition') && voter.votedStatus ? 'border-l-slate-300' : ''
                        }`}
                      >
                        {bulkAssignMode && (
                          <div className="col-span-1 flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(voter.voterId)}
                              onChange={(e) => { e.stopPropagation(); toggleSelection(e as any, voter.voterId); }}
                              onClick={(e) => e.stopPropagation()}
                              className="w-5 h-5 accent-[#DAA520] cursor-pointer"
                            />
                          </div>
                        )}
                        <div className={`${bulkAssignMode ? 'col-span-11 md:col-span-6' : 'col-span-12 md:col-span-7'} mb-2 md:mb-0 flex items-center gap-4`}>
                          <div className="w-10 h-10 rounded-full bg-[#FFD700] dark:bg-[#050505] overflow-hidden shrink-0 border border-[#004A8F] dark:border-[#333333]">
                            {voter.photoUrl ? (
                              <img src={voter.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-blue-300 dark:text-gray-400">
                                <User className="w-4 h-4" />
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-3 w-full">
                              <p className="text-sm font-bold text-white dark:text-gray-100 group-hover:text-[#DAA520] dark:hover:text-[#FFD700] transition-colors truncate shrink-0">{voter.fullName}</p>
                              {voter.address && (
                                <p className="text-sm font-bold text-[#DAA520] dark:text-[#FFD700] uppercase truncate text-right flex-1">{voter.address}</p>
                              )}
                            </div>
                            <p className="text-sm font-bold text-rose-500 uppercase mt-0.5">{voter.voterId}</p>
                            {voter.assignedTo && usersInfo[voter.assignedTo] && (
                              <div className="flex items-center gap-1 mt-1 opacity-70">
                                <User className="w-3 h-3 text-emerald-500" />
                                <span className="text-[9px] uppercase font-bold text-emerald-500">
                                  {usersInfo[voter.assignedTo]}
                                </span>
                              </div>
                            )}
                            {voter.phone && (
                              <a href={`tel:${voter.phone}`} target="_top" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 mt-1.5 text-[10px] font-bold tracking-wider text-[#DAA520] dark:text-[#FFD700] hover:text-[#B8860B] w-max bg-[#DAA520]/5 px-2 py-1 rounded-full border border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20 transition-colors">
                                <Phone className="w-3 h-3" />
                                {voter.phone}
                              </a>
                            )}
                          </div>
                        </div>

                        <div className="col-span-12 md:col-span-5 flex flex-col items-end justify-center gap-2 relative z-10 w-full">
                          <div className="flex gap-1 w-full max-w-[280px] bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] p-1.5 rounded-2xl shadow-inner ml-auto">
                            <button 
                              onClick={(e) => handleToggleOppose(e, voter)} 
                              className={`flex-1 py-2 px-1 rounded-xl text-[9px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1 ${voter.supportLevel === 'strong_opposition' ? 'bg-red-500 text-white shadow-md transform scale-105' : 'text-blue-300 dark:text-gray-400 hover:bg-red-500/10 hover:text-red-400'}`}
                            >
                              Oppose
                            </button>
                            <button 
                              onClick={(e) => handleToggleNeutral(e, voter)} 
                              className={`flex-1 py-2 px-1 rounded-xl text-[9px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1 ${voter.supportLevel === 'undecided' ? 'bg-[#94A3B8] text-white shadow-md transform scale-105' : 'text-blue-300 dark:text-gray-400 hover:bg-slate-500/10 hover:text-slate-300'}`}
                            >
                              Neutral
                            </button>
                            <button 
                              onClick={(e) => handleToggleSupport(e, voter)} 
                              className={`flex-1 py-2 px-1 rounded-xl text-[9px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1 ${(voter.supportLevel === 'strong_support' || voter.supportLevel === 'lean_support') ? 'bg-[#DAA520] dark:bg-[#FFD700] text-gray-900 shadow-md transform scale-105' : 'text-blue-300 dark:text-gray-400 hover:bg-[#DAA520]/10 hover:text-[#DAA520]'}`}
                            >
                              Support
                            </button>
                            <div className="w-[1px] bg-[#004A8F] dark:bg-[#333333] mx-1 my-2 rounded-full"></div>
                            <button
                              onClick={(e) => handleToggleVoted(e, voter)}
                              className={`flex-1 py-2 px-1 rounded-xl text-[9px] font-bold uppercase transition-all flex flex-col items-center justify-center gap-1 ${voter.votedStatus ? 'bg-emerald-500 text-white shadow-md transform scale-105' : 'text-blue-300 dark:text-gray-400 hover:bg-emerald-500/10 hover:text-emerald-400'}`}
                            >
                              <Vote className="w-3 h-3 mb-0.5" />
                              {voter.votedStatus ? 'Voted' : 'Vote'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredVoters.length === 0 && (
              <div className="p-20 text-center">
                <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-4" />
                <p className="text-blue-300 dark:text-gray-400 font-mono text-xs uppercase tracking-widest">No matching records found</p>
              </div>
            )}
          </div>
        ) : (
          <div className="max-h-[600px] overflow-auto p-1 space-y-6">
            {(Object.entries(groupedVoters) as [string, Voter[]][]).map(([station, groupVoters]) => (
              <div key={station} className="space-y-4">
                <div 
                  className="w-full flex items-center gap-3 px-2 py-1"
                >
                  <button onClick={() => toggleGroup(station + '_grid')} >
                    {collapsedGroups.has(station + '_grid') ? <ChevronRight className="w-5 h-5 text-blue-300 dark:text-gray-400" /> : <ChevronDown className="w-5 h-5 text-blue-300 dark:text-gray-400" />}
                  </button>
                  {bulkAssignMode && (
                    <input
                      type="checkbox"
                      checked={groupVoters.every(v => selectedIds.has(v.voterId)) && groupVoters.length > 0}
                      onChange={(e) => selectAllInGroup(e as any, groupVoters)}
                      className="w-4 h-4 accent-[#DAA520] cursor-pointer"
                    />
                  )}
                  <button onClick={() => toggleGroup(station + '_grid')} className="text-sm font-black text-white dark:text-gray-100 uppercase tracking-widest flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
                    {station}
                  </button>
                  <div className="h-px bg-[#004A8F] dark:bg-[#333333] flex-1 mx-4"></div>
                  <span className="text-[10px] text-blue-300 dark:text-gray-400 font-mono">{groupVoters.length} RECORDS</span>
                </div>
                {!collapsedGroups.has(station + '_grid') && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {groupVoters.map((voter) => (
                      <motion.div
                        key={voter.voterId}
                        onClick={() => bulkAssignMode ? toggleSelection({stopPropagation:()=>{}} as any, voter.voterId) : (user?.role === 'admin' ? setSelectedVoter(voter) : null)}
                        className={`border rounded-3xl overflow-hidden shadow-sm hover:shadow-md ${user?.role === 'admin' || bulkAssignMode ? 'cursor-pointer' : ''} transition-all group flex flex-col relative ${
                          bulkAssignMode && selectedIds.has(voter.voterId) ? 'ring-2 ring-[#DAA520] transform scale-[0.98]' : ''
                        } ${
                          voter.supportLevel === 'strong_support' || voter.supportLevel === 'lean_support' ? 'border-4 border-emerald-500' :
                          voter.supportLevel === 'strong_opposition' || voter.supportLevel === 'lean_opposition' ? 'border-4 border-red-500' :
                          'border-[#004A8F] dark:border-[#333333]'
                        } ${
                          voter.votedStatus ? 'bg-[#003B73] dark:bg-[#1f1f1f] hover:border-[#004A8F] dark:hover:border-[#333333]' :
                          'bg-[#002B5B] dark:bg-[#141414] hover:border-[#DAA520] hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'
                        }`}
                      >
                        {bulkAssignMode && (
                          <div className="absolute top-3 left-3 z-20">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(voter.voterId)}
                              readOnly
                              className="w-5 h-5 accent-[#DAA520]"
                            />
                          </div>
                        )}
                        <div className="aspect-square bg-[#FFD700] dark:bg-[#050505] relative">
                          {voter.photoUrl ? (
                            <img src={voter.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-300">
                              <User className="w-12 h-12" />
                            </div>
                          )}
                          {voter.votedStatus && (
                            <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/40 via-emerald-500/20 to-transparent pointer-events-none">
                              <div className="absolute top-2 right-2 w-6 h-6 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white dark:border-[#141414]">
                                <Check className="w-4 h-4 text-white" />
                              </div>
                            </div>
                          )}
                        </div>
                        <div className="p-4 relative flex-1 flex flex-col justify-between">
                          <div>
                            <div className="flex w-full items-start justify-between gap-2 mb-1">
                              <div className="flex flex-col flex-1 min-w-0">
                                <p className="text-[15px] font-black text-white dark:text-gray-100 truncate group-hover:text-[#DAA520] dark:hover:text-[#FFD700] transition-colors pb-1">{voter.fullName}</p>
                                {voter.address ? (
                                  <p className="text-[10px] font-bold text-[#DAA520] dark:text-[#FFD700] uppercase truncate leading-tight flex items-center gap-1.5 mb-1.5">
                                    <MapPin className="w-3 h-3 flex-shrink-0 opacity-80" />
                                    <span className="truncate">{voter.address}</span>
                                  </p>
                                ) : (
                                  <p className="text-[10px] text-blue-200/50 dark:text-gray-400/50 truncate leading-tight mb-1.5 flex items-center gap-1.5">
                                    <MapPin className="w-3 h-3 flex-shrink-0" />
                                    No address
                                  </p>
                                )}
                                <div className="inline-flex items-center gap-1.5 bg-rose-500/10 dark:bg-rose-500/20 px-2 py-0.5 rounded border border-rose-500/20 w-max">
                                  <User className="w-3 h-3 text-rose-500" />
                                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest">{voter.voterId}</span>
                                </div>
                              </div>
                              <button
                                onClick={(e) => { e.stopPropagation(); handleToggleVoted(e, voter); }}
                                className={`w-12 h-12 flex-shrink-0 rounded-xl flex flex-col items-center justify-center border transition-all ${voter.votedStatus ? 'bg-emerald-500 border-emerald-400 text-white shadow-emerald-500/20' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:border-[#DAA520] hover:text-[#DAA520]'}`}
                              >
                                <Vote className="w-5 h-5 mb-0.5" />
                                <span className="text-[7px] font-black uppercase leading-none">{voter.votedStatus ? 'VOTED' : 'VOTE'}</span>
                              </button>
                            </div>
                            {voter.assignedTo && usersInfo[voter.assignedTo] && (
                              <div className="flex items-center gap-1 mt-1 opacity-70">
                                <User className="w-3 h-3 text-emerald-500" />
                                <span className="text-[9px] uppercase font-bold text-emerald-500">
                                  {usersInfo[voter.assignedTo]}
                                </span>
                              </div>
                            )}
                            {voter.phone && (
                              <a href={`tel:${voter.phone}`} target="_top" onClick={(e) => e.stopPropagation()} className="flex items-center gap-1.5 mt-1.5 text-[10px] font-bold tracking-wider text-[#DAA520] dark:text-[#FFD700] hover:text-[#B8860B] w-max bg-[#DAA520]/5 px-2 py-1 rounded-full border border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20 transition-colors">
                                <Phone className="w-3 h-3" />
                                {voter.phone}
                              </a>
                            )}
                          </div>
                          
                          <div>
                            <div className="mt-3 flex flex-col gap-2 w-full pt-3 border-t border-[#004A8F] dark:border-[#333333]">
                              <div className="flex gap-1 w-full">
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleToggleOppose(e, voter); }} 
                                  className={`flex-1 py-1.5 px-0.5 rounded-lg text-[8px] font-bold uppercase transition-all ${voter.supportLevel === 'strong_opposition' ? 'bg-red-500 text-white shadow-sm' : 'bg-[#002B5B] dark:bg-[#141414] text-blue-300 dark:text-gray-400 border border-[#004A8F] dark:border-[#333333] hover:bg-red-500/10 hover:text-red-500 hover:border-red-500/50'}`}
                                >
                                  Oppose
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleToggleNeutral(e, voter); }} 
                                  className={`flex-1 py-1.5 px-0.5 rounded-lg text-[8px] font-bold uppercase transition-all ${voter.supportLevel === 'undecided' ? 'bg-[#94A3B8] text-white shadow-sm' : 'bg-[#002B5B] dark:bg-[#141414] text-blue-300 dark:text-gray-400 border border-[#004A8F] dark:border-[#333333] hover:bg-slate-500/10 hover:text-slate-300 hover:border-slate-500/50'}`}
                                >
                                  Neutral
                                </button>
                                <button 
                                  onClick={(e) => { e.stopPropagation(); handleToggleSupport(e, voter); }} 
                                  className={`flex-1 py-1.5 px-0.5 rounded-lg text-[8px] font-bold uppercase transition-all ${(voter.supportLevel === 'strong_support' || voter.supportLevel === 'lean_support') ? 'bg-[#DAA520] dark:bg-[#FFD700] text-gray-900 shadow-sm' : 'bg-[#002B5B] dark:bg-[#141414] text-blue-300 dark:text-gray-400 border border-[#004A8F] dark:border-[#333333] hover:bg-[#DAA520]/10 hover:text-[#DAA520] dark:hover:text-[#FFD700] hover:border-[#DAA520]/50'}`}
                                >
                                  Support
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {filteredVoters.length === 0 && (
              <div className="col-span-full p-20 text-center bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-3xl shadow-sm">
                <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-4" />
                <p className="text-blue-300 dark:text-gray-400 font-mono text-xs uppercase tracking-widest">No matching records found</p>
              </div>
            )}
          </div>
        )}
      </div>

      <AnimatePresence>
        {selectedVoter && !bulkAssignMode && (
          <VoterEditor 
            voter={selectedVoter} 
            users={usersList}
            onClose={() => setSelectedVoter(null)} 
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {bulkAssignMode && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] shadow-2xl p-4 md:px-6 md:py-4 rounded-full flex flex-col sm:flex-row items-center gap-4 w-[90%] md:w-max max-w-4xl"
          >
            <div className="flex items-center gap-2 font-mono text-sm font-bold tracking-widest text-[#DAA520]">
              <span className="w-6 h-6 rounded-full bg-[#DAA520]/20 flex items-center justify-center">
                {selectedIds.size}
              </span>
              SELECTED
            </div>
            <div className="h-4 w-px bg-[#004A8F] dark:bg-[#333333] hidden sm:block"></div>
            <div className="flex w-full sm:w-auto items-center gap-3">
              <select
                className="flex-1 sm:w-48 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-[#DAA520] transition-all"
                value={bulkAssignUser}
                onChange={(e) => setBulkAssignUser(e.target.value)}
              >
                <option value="">Select Leader...</option>
                {usersList.map(u => (
                  <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
                ))}
              </select>
              <button
                disabled={assigning || selectedIds.size === 0 || !bulkAssignUser}
                onClick={handleBulkAssign}
                className="bg-[#DAA520] hover:bg-[#B8860B] text-white px-6 py-2 rounded-xl text-xs font-bold uppercase tracking-widest disabled:opacity-50 transition-all shadow-lg"
              >
                {assigning ? 'Assigning...' : 'Assign'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SentimentBadge({ level }: { level: SupportLevel }) {
  const configs: Record<SupportLevel, { label: string, color: string, bg: string }> = {
    strong_support: { label: 'STRONG', color: '#10B981', bg: '#ecfdf5' },
    lean_support: { label: 'LEAN_PRO', color: '#059669', bg: '#f0fdf4' },
    undecided: { label: 'NEUTRAL', color: '#D97706', bg: '#fffbeb' },
    lean_opposition: { label: 'LEAN_ANTI', color: '#DC2626', bg: '#fef2f2' },
    strong_opposition: { label: 'STRONG_OPP', color: '#991B1B', bg: '#fff1f2' },
  };

  const config = configs[level as SupportLevel] || { label: 'UNKNOWN', color: '#94A3B8', bg: '#f8fafc' };

  return (
    <div 
      className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-transparent font-mono"
      style={{ backgroundColor: config.bg }}
    >
      <div className="w-1 h-1 rounded-full animate-pulse" style={{ backgroundColor: config.color }} />
      <span className="text-[9px] font-bold tracking-widest" style={{ color: config.color }}>{config.label}</span>
    </div>
  );
}

function VoterEditor({ voter, users, onClose }: { voter: Voter, users: CampaignUser[], onClose: () => void }) {
  const { user } = useAuth();
  const { updateVoterLocally, refreshVoters } = useVoters();
  const [fullName, setFullName] = useState(voter.fullName);
  const [address, setAddress] = useState(voter.address);
  const [phone, setPhone] = useState(voter.phone);
  const [pollingStation, setPollingStation] = useState(voter.pollingStation || '');
  const [photoUrl, setPhotoUrl] = useState(voter.photoUrl || '');
  const [supportLevel, setSupportLevel] = useState<SupportLevel>(voter.supportLevel);
  const [votedStatus, setVotedStatus] = useState(voter.votedStatus);
  const [assignedTo, setAssignedTo] = useState(voter.assignedTo || '');
  const [notes, setNotes] = useState(voter.notes || '');
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const processImage = async (file: File | Blob) => {
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
              alert("Failed to process image blob.");
              setUploading(false);
              return;
            }
            
            try {
              const fileName = `voter_photos/${voter.voterId}.jpg`;
              const storageRef = ref(storage, fileName);
              const snapshot = await uploadBytes(storageRef, blob);
              const downloadURL = await getDownloadURL(snapshot.ref);
              
              setPhotoUrl(downloadURL);
              setUploading(false);
            } catch (storageErr: any) {
              console.error("Storage error:", storageErr);
              alert(`Upload failed: ${storageErr.message}`);
              setUploading(false);
            }
          }, 'image/jpeg', 0.7);
        };
        img.onerror = () => {
          alert("Failed to parse image file.");
          setUploading(false);
        };
        img.src = event.target?.result as string;
      };
      reader.onerror = () => {
        alert("Failed to read file.");
        setUploading(false);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Failed to process image.");
      setUploading(false);
    }
  };
  
  const handleClipboardPaste = async () => {
    try {
      if (!navigator.clipboard || !navigator.clipboard.read) {
        // Fallback or warning
        alert("Direct clipboard access is restricted. Try using Ctrl+V on your keyboard.");
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
      alert("No image found in clipboard.");
    } catch (err: any) {
      console.error("Clipboard error:", err);
      alert("Clipboard access denied or unsupported.");
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

  const handleSave = async () => {
    setSaving(true);
    const updates = {
      fullName,
      address,
      phone,
      pollingStation,
      photoUrl,
      supportLevel,
      votedStatus,
      assignedTo,
      notes,
    };

    // Optimistic local update so the list is snappy
    updateVoterLocally(voter.voterId, updates);

    try {
      await updateDoc(doc(db, 'voters', voter.voterId), {
        ...updates,
        base64Image: deleteField(),
        updatedBy: user?.uid,
        updatedAt: serverTimestamp()
      });
      onClose();
    } catch (err) {
      // Revert if somehow failed
      refreshVoters(); 
      handleFirestoreError(err, OperationType.UPDATE, `voters/${voter.voterId}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!showDeleteConfirm) {
      setShowDeleteConfirm(true);
      // Automatically reset confirmation after 3 seconds
      setTimeout(() => setShowDeleteConfirm(false), 3000);
      return;
    }
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'voters', voter.voterId));
      refreshVoters(); // Full refresh after delete
      onClose();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `voters/${voter.voterId}`);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6 bg-slate-900/40 backdrop-blur-md">
      <motion.div 
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        onPaste={handlePaste}
        className="bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] w-full max-w-2xl rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh] relative"
      >
        <div className="px-6 md:px-10 py-6 md:py-8 border-b border-[#004A8F] dark:border-[#333333] flex items-center justify-between bg-[#002B5B] dark:bg-[#141414] sticky top-0 z-10">
          <div className="flex items-center gap-4 md:gap-6">
            <div className="w-16 h-16 md:w-20 md:h-20 bg-[#DAA520] shadow-xl rounded-2xl flex items-center justify-center text-white dark:text-gray-100 overflow-hidden relative shrink-0">
              {photoUrl ? (
                <img src={photoUrl} alt={fullName} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <User className="w-8 h-8 md:w-10 md:h-10" />
              )}
              {uploading && (
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 animate-spin text-white dark:text-gray-100" />
                </div>
              )}
            </div>
            <div>
              <h3 className="text-xl md:text-2xl font-black tracking-tight text-white dark:text-gray-100 truncate max-w-[200px] md:max-w-xs">{fullName}</h3>
              <p className="text-[10px] text-blue-300 dark:text-gray-400 uppercase tracking-widest font-bold">VOTER_ID: {voter.voterId.slice(0, 12)}</p>
              
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex gap-2">
                  <button 
                     onClick={() => fileInputRef.current?.click()}
                     className="px-3 py-1.5 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-lg text-[9px] font-bold text-blue-200 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505] transition-all"
                  >
                    <Upload className="w-3 h-3" />
                    Library
                  </button>
                  <button 
                     onClick={() => cameraInputRef.current?.click()}
                     className="px-3 py-1.5 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-lg text-[9px] font-bold text-blue-200 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505] transition-all"
                  >
                    <Camera className="w-3 h-3" />
                    Capture
                  </button>
                  <button 
                     onClick={handleClipboardPaste}
                     className="px-3 py-1.5 bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-lg text-[9px] font-bold text-blue-200 dark:text-gray-300 uppercase tracking-wider flex items-center gap-1.5 hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505] transition-all"
                  >
                    <Clipboard className="w-3 h-3" />
                    Paste
                  </button>
                </div>
                <p className="text-[8px] font-bold text-blue-300/40 dark:text-gray-500 uppercase tracking-widest text-center">Ctrl+V to Paste</p>
                <input ref={fileInputRef} type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                <input ref={cameraInputRef} type="file" className="hidden" accept="image/*" capture="environment" onChange={handleFileUpload} />
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-10 h-10 rounded-full bg-[#003B73] dark:bg-[#1f1f1f] flex items-center justify-center hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505] transition-colors">
            <X className="w-5 h-5 text-blue-300 dark:text-gray-400" />
          </button>
        </div>

        <div className="flex-1 overflow-auto p-6 md:p-10 space-y-10">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-widest text-[#DAA520] dark:text-[#FFD700] flex items-center gap-2">
                <Phone className="w-4 h-4" />
                Identity & Contact
              </label>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase">Full Name</label>
                  <input 
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl p-3 text-sm focus:outline-none focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase">Phone</label>
                  <input 
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl p-3 text-sm focus:outline-none focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase">Polling Station</label>
                  <input 
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl p-3 text-sm focus:outline-none focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]"
                    value={pollingStation}
                    onChange={(e) => setPollingStation(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase">Assigned Leader</label>
                  <select 
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl p-3 text-sm focus:outline-none focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100"
                    value={assignedTo}
                    onChange={(e) => setAssignedTo(e.target.value)}
                  >
                    <option value="">Unassigned</option>
                    {users.map(u => (
                      <option key={u.uid} value={u.uid}>{u.displayName || u.email}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase">Registered Address</label>
                  <textarea 
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl p-3 text-sm focus:outline-none focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] min-h-[60px] resize-none"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-blue-300 dark:text-gray-400 uppercase">Photo URL</label>
                  <input 
                    className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-xl p-3 text-sm focus:outline-none focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]"
                    value={photoUrl}
                    onChange={(e) => setPhotoUrl(e.target.value)}
                  />
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <label className="text-[10px] font-bold uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                <Vote className="w-4 h-4" />
                Sync Protocol
              </label>
              <div className="flex gap-3">
                <button 
                  onClick={() => setVotedStatus(true)}
                  className={`flex-1 py-4 rounded-2xl border text-[10px] font-bold transition-all shadow-sm ${votedStatus ? 'bg-emerald-500 text-white dark:text-gray-100 border-emerald-400 shadow-emerald-200' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
                >
                  BALLOT_SYNC
                </button>
                <button 
                  onClick={() => setVotedStatus(false)}
                  className={`flex-1 py-4 rounded-2xl border text-[10px] font-bold transition-all ${!votedStatus ? 'bg-[#002B5B] dark:bg-[#141414] text-blue-50 dark:text-gray-300 border-[#004A8F] dark:border-[#333333]' : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f]'}`}
                >
                  PENDING
                </button>
              </div>

               <div className="pt-6 space-y-4">
                <label className="text-[10px] font-bold uppercase tracking-widest text-[#DAA520] dark:text-[#FFD700] flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Sentiment Matrix
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['strong_support', 'lean_support', 'undecided', 'lean_opposition', 'strong_opposition'] as SupportLevel[]).map(level => (
                    <button
                      key={level}
                      onClick={() => setSupportLevel(level)}
                      className={`px-2 py-3 border rounded-xl text-[8px] font-black transition-all flex flex-col items-center justify-center ${
                        supportLevel === level 
                          ? 'bg-[#DAA520] border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-white dark:text-gray-100 shadow-md' 
                          : 'bg-[#002B5B] dark:bg-[#141414] border-[#004A8F] dark:border-[#333333] text-blue-300 dark:text-gray-400 hover:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/30 dark:border-[#FFD700] dark:border-[#333333]/30 hover:text-blue-200 dark:text-gray-300'
                      }`}
                    >
                       {level.replace('_', ' ').toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </div>

          <section className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-blue-300 dark:text-gray-400 flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              Field Insights
            </label>
            <textarea 
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Enter strategic observations..."
              className="w-full bg-[#003B73] dark:bg-[#1f1f1f] border border-[#004A8F] dark:border-[#333333] rounded-2xl p-6 text-sm text-blue-100 dark:text-gray-400 placeholder-slate-300 focus:outline-none focus:ring-2 focus:ring-[#DAA520]/20 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] min-h-[160px] transition-all resize-none shadow-inner"
            />
          </section>
        </div>

        <div className="px-6 md:px-10 py-6 md:py-8 border-t border-[#004A8F] dark:border-[#333333] bg-[#003B73] dark:bg-[#1f1f1f] flex flex-col-reverse sm:flex-row items-center justify-between gap-4 sticky bottom-0 z-10 w-full">
          <div className="w-full sm:w-auto flex justify-center text-center">
            <button 
              disabled={deleting}
              onClick={handleDelete}
              className={`px-4 py-3 sm:py-2 text-xs font-bold uppercase tracking-widest rounded-xl transition-colors flex items-center justify-center gap-2 w-full sm:w-auto ${showDeleteConfirm ? 'bg-rose-500 text-white dark:text-gray-100 hover:bg-rose-600 shadow-lg shadow-rose-500/30' : 'text-rose-500 hover:bg-rose-50'}`}
            >
              {deleting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              {showDeleteConfirm ? 'Click to Confirm' : 'Delete Record'}
            </button>
          </div>
          <button 
            disabled={saving || deleting}
            onClick={handleSave}
            className="w-full sm:w-auto bg-[#DAA520] text-white dark:text-gray-100 font-bold px-12 py-4 rounded-2xl flex items-center justify-center gap-3 hover:bg-[#B8860B] transition-all shadow-xl shadow-[#DAA520]/20 disabled:opacity-50"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            COMMIT_CHANGES
          </button>
        </div>
      </motion.div>
    </div>
  );
}

