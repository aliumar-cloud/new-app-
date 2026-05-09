import React, { createContext, useContext, useState, useEffect } from 'react';
import { collection, onSnapshot, query, orderBy, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { Voter } from '../types';
import { useAuth } from '../App';

interface VoterContextType {
  voters: Voter[];
  loading: boolean;
  error: string | null;
  refreshVoters: () => Promise<void>;
  updateVoterLocally: (voterId: string, updates: Partial<Voter>) => void;
}

const VoterContext = createContext<VoterContextType>({
  voters: [],
  loading: true,
  error: null,
  refreshVoters: async () => {},
  updateVoterLocally: () => {}
});

export const useVoters = () => useContext(VoterContext);

export function VoterProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [voters, setVoters] = useState<Voter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const updateVoterLocally = (voterId: string, updates: Partial<Voter>) => {
    setVoters(prev => prev.map(v => v.voterId === voterId ? { ...v, ...updates } : v));
  };

  const fetchVoters = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, 'voters'), orderBy('updatedAt', 'desc'));
      const snap = await getDocs(q);
      const data = snap.docs.map(doc => ({ 
        ...doc.data(),
        voterId: doc.id 
      } as Voter));
      setVoters(data);
      setError(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'voters');
      setError(err instanceof Error ? err.message : 'Failed to fetch voters');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!user) {
      setVoters([]);
      setLoading(false);
      return;
    }

    fetchVoters();
  }, [user?.uid]);

  return (
    <VoterContext.Provider value={{ voters, loading, error, refreshVoters: fetchVoters, updateVoterLocally }}>
      {children}
    </VoterContext.Provider>
  );
}
