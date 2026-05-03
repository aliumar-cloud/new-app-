export type UserRole = 'admin' | 'staff';

export interface CampaignUser {
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  districtId?: string;
  createdAt: string;
  lastActive: string;
  publicKey?: any; // JWK public key for E2EE
}

export interface Chat {
  id: string;
  type: 'direct' | 'group';
  name?: string; // for group chats
  participants: string[];
  encryptedKeys: Record<string, string>; // mapping of uid to encrypted ChatKey
  lastMessage?: string;
  updatedAt?: any; // Firestore Timestamp
}

export interface ChatMessage {
  id: string;
  chatId: string;
  senderId: string;
  encryptedText: string;
  createdAt: any; // Firestore Timestamp
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
