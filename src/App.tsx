/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Users, 
  ShieldCheck, 
  BarChart3, 
  UserPlus, 
  LogOut, 
  Search, 
  Filter, 
  ChevronRight, 
  MapPin, 
  Vote,
  AlertCircle,
  Database,
  MessageSquare,
  Sun,
  Moon
} from 'lucide-react';
import { 
  auth, 
  db, 
  signIn, 
  signOut, 
  handleFirestoreError, 
  OperationType,
  testConnection 
} from './firebase';
import { 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  doc, 
  getDoc, 
  setDoc, 
  collection, 
  onSnapshot, 
  query, 
  serverTimestamp,
  orderBy,
  updateDoc
} from 'firebase/firestore';
import { CampaignUser, Voter, District, UserRole } from './types';
import DashboardView from './components/DashboardView';
import VoterList from './components/VoterList';
import AdminPanel from './components/AdminPanel';
import MapView from './components/MapView';
import VoterCreatorView from './components/VoterCreatorView';
import BulkUpload from './components/BulkUpload';
import Messaging from './components/Messaging';

// --- Auth Context ---
interface AuthContextType {
  user: CampaignUser | null;
  loading: boolean;
  error: string | null;
}

const AuthContext = createContext<AuthContextType>({ user: null, loading: true, error: null });

export const useAuth = () => useContext(AuthContext);

export default function App() {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<CampaignUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'voters' | 'mapping' | 'admin' | 'add_voter' | 'bulk_upload' | 'messages'>('dashboard');
  
  const [isDarkMode, setIsDarkMode] = useState(() => {
    return localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches);
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  useEffect(() => {
    testConnection();
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        try {
          let data: CampaignUser | null = null;
          try {
            const profileDoc = await getDoc(doc(db, 'users', user.uid));
            if (profileDoc.exists()) {
              data = profileDoc.data() as CampaignUser;
            }
          } catch (getErr) {
            console.error("Profile fetch error:", getErr);
            // If it's a permission error, we might still want to try creating/updating if we are the admin
          }

          if (data) {
            // Force admin role for the specific user email if not already set
            if (user.email === 'aliumar@gmail.com' && data.role !== 'admin') {
              try {
                await updateDoc(doc(db, 'users', user.uid), { role: 'admin' });
                setProfile({ ...data, role: 'admin' });
              } catch (updErr) {
                handleFirestoreError(updErr, OperationType.UPDATE, `users/${user.uid}`);
              }
            } else {
              setProfile(data);
            }
          } else {
            // Auto-provision profile as staff for new users
            const newProfile: CampaignUser = {
              uid: user.uid,
              email: user.email || '',
              displayName: user.displayName || 'Staff Member',
              role: user.email === 'aliumar@gmail.com' ? 'admin' : 'staff' as UserRole,
              createdAt: new Date().toISOString(),
              lastActive: new Date().toISOString()
            };
            try {
              await setDoc(doc(db, 'users', user.uid), newProfile);
              setProfile(newProfile);
            } catch (writeErr) {
              handleFirestoreError(writeErr, OperationType.WRITE, `users/${user.uid}`);
            }
          }
        } catch (err) {
          console.error("Auth Profile Error:", err);
          if (err instanceof Error && err.message.startsWith('{')) {
            try {
              const info = JSON.parse(err.message);
              setError(`Auth Flow Error: ${info.error} (${info.operationType} @ ${info.path})`);
            } catch {
              setError(`Auth error: ${err.message}`);
            }
          } else {
            setError(err instanceof Error ? err.message : "Session verification failed.");
          }
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-[#FFD700] dark:bg-[#050505] text-blue-900 dark:text-gray-100 font-mono">
        <div className="w-16 h-16 bg-transparent rounded-full flex items-center justify-center shadow-xl overflow-hidden border-2 border-[#DAA520] animate-pulse mb-6">
          <img src="https://iili.io/BLKhJf4.png" alt="Vote Adey" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        </div>
        <p className="text-xs uppercase tracking-[0.3em] font-bold text-[#002B5B] dark:text-gray-100">Initializing Vote Adey...</p>
      </div>
    );
  }

  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-[#FFD700] dark:bg-[#050505] flex items-center justify-center p-6 text-[#002B5B] dark:text-gray-100 font-sans overflow-hidden">
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="h-full w-full bg-[linear-gradient(to_right,#141414_1px,transparent_1px),linear-gradient(to_bottom,#141414_1px,transparent_1px)] bg-[size:40px_40px]"></div>
        </div>
        
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full relative z-10"
        >
          <div className="border border-[#004A8F] dark:border-[#333333] bg-[#002B5B] dark:bg-[#141414] p-8 md:p-12 rounded-lg shadow-2xl">
            <div className="flex flex-col items-center gap-6 mb-10 text-center">
              <div className="w-24 h-24 bg-transparent rounded-full flex items-center justify-center shadow-2xl border-4 border-[#DAA520] overflow-hidden transition-transform hover:scale-105 duration-500">
                <img src="https://iili.io/BLKhJf4.png" alt="Vote Adey Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
              </div>
              <div>
                <h1 className="text-3xl font-black tracking-tight text-white dark:text-gray-100 uppercase italic">VOTE ADEY</h1>
                <p className="text-[10px] text-blue-200 dark:text-gray-300 uppercase tracking-[0.4em] font-mono mt-1">Electoral Management Platform</p>
              </div>
            </div>

            <p className="text-blue-100 dark:text-gray-400 mb-8 text-sm leading-relaxed lowercase italic font-serif">
              Access to the voter database is restricted to authorized campaign personnel only. 
              All interactions are logged for integrity verification.
            </p>

            <button 
              onClick={signIn}
              className="w-full bg-[#004A8F] text-white dark:text-gray-100 font-bold py-4 px-6 rounded flex items-center justify-center gap-3 hover:bg-[#005ABF] transition-colors group"
            >
              <Users className="w-5 h-5" />
              <span>AUTHENTICATE VIA SYSTEMS</span>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
            
            {error && (
              <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex gap-3 items-center">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ user: profile, loading, error }}>
      <div className="min-h-screen bg-[#FFD700] dark:bg-[#050505] text-white dark:text-gray-100 font-sans flex flex-col relative grid-pattern">
        {/* Top Header */}
        <header className="h-16 border-b border-[#004A8F] dark:border-[#333333] flex items-center justify-between px-4 md:px-8 bg-[#002B5B] dark:bg-[#141414]/80 backdrop-blur-md sticky top-0 z-40 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-transparent rounded-full flex items-center justify-center overflow-hidden border-2 border-[#DAA520] shadow-lg flex-shrink-0">
              <img src="https://iili.io/BLKhJf4.png" alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            <h1 className="text-xl font-black tracking-tighter text-white dark:text-gray-100 italic">VOTE<span className="text-[#DAA520] dark:text-[#FFD700]">ADEY</span></h1>
          </div>
          
          <div className="flex-1 flex items-center justify-end gap-4 md:gap-8">
            <div className="hidden md:flex items-center gap-2">
              <span className="status-pulse"></span>
              <span className="text-[10px] font-bold text-blue-200 dark:text-gray-300 uppercase tracking-widest">Network Connected</span>
            </div>
            <div className="h-6 w-px bg-[#002B5B] dark:bg-[#141414] hidden md:block"></div>
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsDarkMode(!isDarkMode)} 
                className="p-2 rounded-xl bg-[#003B73] hover:bg-[#004A8F] dark:bg-[#1f1f1f] dark:hover:bg-[#333333] transition-colors"
                title="Toggle Theme"
              >
                {isDarkMode ? <Sun className="w-4 h-4 text-[#FFD700]" /> : <Moon className="w-4 h-4 text-blue-200" />}
              </button>
              {profile?.role === 'admin' && (
                <div className="relative group hidden sm:block">
                  <button className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white dark:text-gray-100 rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all">
                    <ShieldCheck className="w-3.5 h-3.5 text-[#DAA520] dark:text-[#FFD700]" />
                    Admin Menu
                  </button>
                  <div className="absolute right-0 mt-2 w-56 bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-2xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 p-2">
                    <button 
                      onClick={() => setActiveTab('add_voter')}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] transition-colors flex items-center gap-3"
                    >
                      <UserPlus className="w-4 h-4 text-sky-500" />
                      <span className="text-xs font-semibold text-blue-100 dark:text-gray-400">Add New Voter</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('admin')}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] transition-colors flex items-center gap-3"
                    >
                      <Database className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
                      <span className="text-xs font-semibold text-blue-100 dark:text-gray-400">System Console</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('admin')}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] transition-colors flex items-center gap-3"
                    >
                      <UserPlus className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs font-semibold text-blue-100 dark:text-gray-400">Staff Authorization</span>
                    </button>
                    <button 
                      onClick={() => setActiveTab('mapping')}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] transition-colors flex items-center gap-3"
                    >
                      <MapPin className="w-4 h-4 text-sky-500" />
                      <span className="text-xs font-semibold text-blue-100 dark:text-gray-400">Geospatial Audit</span>
                    </button>
                    <div className="h-px bg-[#003B73] dark:bg-[#1f1f1f] my-1"></div>
                    <button 
                      onClick={() => setActiveTab('voters')}
                      className="w-full text-left px-4 py-3 rounded-xl hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] transition-colors flex items-center gap-3"
                    >
                      <Users className="w-4 h-4 text-blue-300 dark:text-gray-400" />
                      <span className="text-xs font-semibold text-blue-100 dark:text-gray-400">Voter Registry</span>
                    </button>
                  </div>
                </div>
              )}
              <div className="text-right leading-none hidden sm:block">
                <p className="text-sm font-semibold">{profile?.displayName}</p>
                <p className="text-[10px] text-blue-300 dark:text-gray-400 uppercase font-mono">{profile?.role}</p>
              </div>
              <div className="w-9 h-9 rounded-full border-2 border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20 p-0.5">
                <div className="w-full h-full rounded-full bg-[#FFD700] dark:bg-[#050505] flex items-center justify-center text-[10px] font-bold text-blue-200 dark:text-gray-300">
                  {profile?.displayName?.[0] || 'U'}
                </div>
              </div>
              <button 
                onClick={signOut}
                className="p-2 text-blue-300 dark:text-gray-400 hover:text-rose-500 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
          {/* Desktop Sidebar / Mobile Nav */}
          <nav className="md:w-64 border-r border-[#004A8F] dark:border-[#333333] bg-[#002B5B] dark:bg-[#141414] p-4 hidden md:flex flex-col shrink-0 z-20">
            <div className="space-y-1">
              <NavButton 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')}
                icon={<BarChart3 className="w-4 h-4" />}
                label="Analytics"
              />
              <NavButton 
                active={activeTab === 'voters'} 
                onClick={() => setActiveTab('voters')}
                icon={<Users className="w-4 h-4" />}
                label="Voter Base"
              />
              <NavButton 
                active={activeTab === 'add_voter'} 
                onClick={() => setActiveTab('add_voter')}
                icon={<UserPlus className="w-4 h-4" />}
                label="Register Voter"
              />
              <NavButton 
                active={activeTab === 'bulk_upload'} 
                onClick={() => setActiveTab('bulk_upload')}
                icon={<Database className="w-4 h-4" />}
                label="Bulk Upload"
              />
              <NavButton 
                active={activeTab === 'messages'} 
                onClick={() => setActiveTab('messages')}
                icon={<MessageSquare className="w-4 h-4" />}
                label="Comms"
              />
              <NavButton 
                active={activeTab === 'mapping'} 
                onClick={() => setActiveTab('mapping')}
                icon={<MapPin className="w-4 h-4" />}
                label="Maafannu Map"
              />
              {profile?.role === 'admin' && (
                <NavButton 
                  active={activeTab === 'admin'} 
                  onClick={() => setActiveTab('admin')}
                  icon={<ShieldCheck className="w-4 h-4" />}
                  label="System Cmd"
                />
              )}
            </div>
          </nav>

          {/* Main Content Area */}
          <main className="flex-1 overflow-auto">
            <div className="max-w-7xl mx-auto p-4 md:p-8 pb-24 md:pb-8">
              <AnimatePresence mode="wait">
                {activeTab === 'dashboard' && <DashboardView key="dashboard" />}
                {activeTab === 'voters' && <VoterList key="voters" onRegisterClick={() => setActiveTab('add_voter')} />}
                {activeTab === 'add_voter' && <VoterCreatorView key="add_voter" />}
                {activeTab === 'bulk_upload' && <BulkUpload key="bulk_upload" />}
                {activeTab === 'messages' && <Messaging key="messages" />}
                {activeTab === 'mapping' && <MapView />}
                {activeTab === 'admin' && <AdminPanel key="admin" />}
              </AnimatePresence>
            </div>
          </main>
        </div>

        {/* Mobile Navigation Bar */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 h-auto py-2 bg-[#002B5B] dark:bg-[#141414] border-t border-[#004A8F] dark:border-[#333333] flex items-center gap-2 overflow-x-auto px-4 z-50 pb-[max(env(safe-area-inset-bottom),0.5rem)] snap-x scrollbar-hide hide-scrollbar">
          <div className="snap-center shrink-0">
            <MobileNavButton 
              active={activeTab === 'dashboard'} 
              onClick={() => setActiveTab('dashboard')}
              icon={<BarChart3 className="w-5 h-5" />}
              label="Home"
            />
          </div>
          <div className="snap-center shrink-0">
            <MobileNavButton 
              active={activeTab === 'mapping'} 
              onClick={() => setActiveTab('mapping')}
              icon={<MapPin className="w-5 h-5" />}
              label="Map"
            />
          </div>
          <div className="snap-center shrink-0">
            <MobileNavButton 
              active={activeTab === 'voters'} 
              onClick={() => setActiveTab('voters')}
              icon={<Users className="w-5 h-5" />}
              label="Voters"
            />
          </div>
          <div className="snap-center shrink-0">
            <MobileNavButton 
              active={activeTab === 'messages'} 
              onClick={() => setActiveTab('messages')}
              icon={<MessageSquare className="w-5 h-5" />}
              label="Chat"
            />
          </div>
          <div className="snap-center shrink-0">
            <MobileNavButton 
              active={activeTab === 'bulk_upload'} 
              onClick={() => setActiveTab('bulk_upload')}
              icon={<Database className="w-5 h-5" />}
              label="Upload"
            />
          </div>
          <div className="snap-center shrink-0">
            <MobileNavButton 
              active={activeTab === 'add_voter'} 
              onClick={() => setActiveTab('add_voter')}
              icon={<UserPlus className="w-5 h-5" />}
              label="Add"
            />
          </div>
          {profile?.role === 'admin' && (
            <div className="snap-center shrink-0 pr-4">
              <MobileNavButton 
                active={activeTab === 'admin'} 
                onClick={() => setActiveTab('admin')}
                icon={<ShieldCheck className="w-5 h-5" />}
                label="Admin"
              />
            </div>
          )}
        </div>

        {/* Desktop Status Bar */}
        <footer className="hidden md:flex h-8 border-t border-[#004A8F] dark:border-[#333333] bg-[#002B5B] dark:bg-[#141414] items-center px-8 justify-between text-[10px] tracking-widest text-blue-300 dark:text-gray-400 shrink-0 z-30">
          <div className="flex gap-6 uppercase">
            <span className="flex items-center gap-2 font-medium">Uplink Active</span>
            <span>Latency: 14ms</span>
          </div>
          <div className="uppercase font-mono">
            SECURE_ID: {profile?.uid.slice(0, 8)}
          </div>
        </footer>
      </div>
    </AuthContext.Provider>
  );
}

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`w-full flex items-center gap-3 px-4 py-3 mb-2 rounded-xl transition-all border shadow-sm ${
        active 
          ? 'bg-gradient-to-r from-[#FFD700] dark:from-[#333333] to-[#E5C100] dark:to-[#1a1a1a] text-[#002B5B] dark:text-gray-100 font-bold border-[#E5C100] dark:border-[#555555]' 
          : 'bg-gradient-to-r from-[#003B73] dark:from-[#1f1f1f] to-[#002B5B] dark:to-[#141414] text-white dark:text-gray-100 border-[#004A8F] dark:border-[#333333] hover:from-[#004A8F] dark:hover:from-[#2a2a2a] hover:to-[#003B73] dark:hover:to-[#1f1f1f]'
      }`}
    >
      <div className={`${active ? 'text-[#002B5B] dark:text-gray-100' : 'text-blue-200 dark:text-gray-300'}`}>
        {icon}
      </div>
      <span className="text-sm tracking-tight">{label}</span>
    </button>
  );
}

function MobileNavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex flex-col items-center justify-center min-w-[64px] py-1.5 px-2 rounded-xl border shadow-sm transition-all ${
        active 
          ? 'bg-gradient-to-r from-[#FFD700] dark:from-[#333333] to-[#E5C100] dark:to-[#1a1a1a] text-[#002B5B] dark:text-gray-100 border-[#E5C100] dark:border-[#555555]' 
          : 'bg-gradient-to-b from-[#003B73] dark:from-[#1f1f1f] to-[#002B5B] dark:to-[#141414] text-blue-100 dark:text-gray-400 border-[#004A8F] dark:border-[#333333]'
      }`}
    >
      <div className={`${active ? 'scale-110' : ''} transition-transform`}>
        {icon}
      </div>
      <span className="text-[10px] font-bold uppercase tracking-tighter mt-1">{label}</span>
    </button>
  );
}
