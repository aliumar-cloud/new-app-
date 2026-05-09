export type UserRole = 'admin' | 'staff' | 'leader';

export interface CampaignUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  districtId?: string;
  createdAt: string;
  lastActive: string;
}

export type SupportLevel = 'strong_support' | 'lean_support' | 'undecided' | 'lean_opposition' | 'strong_opposition';

export interface Voter {
  voterId: string;
  fullName: string;
  address: string;
  phone: string;
  districtId: string;
  pollingStation?: string;
  supportLevel: SupportLevel;
  votedStatus: boolean;
  photoUrl?: string;
  notes?: string;
  updatedBy: string;
  updatedAt?: any; // Firestore Timestamp
  latitude?: number;
  longitude?: number;
  assignedTo?: string; // staff user UID
}

export interface District {
  id: string;
  name: string;
  managerUid: string;
}

export interface CampaignConfig {
  electionName: string;
  electionDate: string;
  targetVotes: number;
}
