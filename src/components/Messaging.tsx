import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, serverTimestamp, doc, updateDoc, getDoc, getDocs, orderBy } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { useAuth } from '../App';
import { CampaignUser, Chat, ChatMessage } from '../types';
import { Lock, Search, Send, User, ShieldCheck, X } from 'lucide-react';
import { 
  generateRSAKeyPair, 
  importPrivateKey, 
  importPublicKey, 
  generateChatKey, 
  encryptChatKey, 
  decryptChatKey, 
  encryptMessage, 
  decryptMessage 
} from '../crypto';

export default function Messaging() {
  const { user } = useAuth();
  const [selectedChat, setSelectedChat] = useState<string | null>(null);
  const [chats, setChats] = useState<(Chat & { id: string })[]>([]);
  const [messages, setMessages] = useState<(ChatMessage & { id: string, decrypted?: string })[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<CampaignUser[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [isInitializingRow, setIsInitializingRow] = useState(true);
  const [privateKey, setPrivateKey] = useState<CryptoKey | null>(null);
  const [chatKeys, setChatKeys] = useState<Record<string, CryptoKey>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load or generate RSA keypair for current user
  useEffect(() => {
    if (!user) return;
    
    async function initKeys() {
      try {
        const storedPriv = localStorage.getItem(`securevote_priv_${user.uid}`);
        if (storedPriv) {
          const privJwk = JSON.parse(storedPriv);
          const prvKey = await importPrivateKey(privJwk);
          setPrivateKey(prvKey);
          setInitialized(true);
          setIsInitializingRow(false);
          return;
        }

        // Generate new pair
        const { publicKeyJwk, privateKeyJwk, keyPair } = await generateRSAKeyPair();
        localStorage.setItem(`securevote_priv_${user.uid}`, JSON.stringify(privateKeyJwk));
        
        await updateDoc(doc(db, 'users', user.uid), {
          publicKey: publicKeyJwk
        });
        
        setPrivateKey(keyPair.privateKey);
        setInitialized(true);
      } catch (err) {
        console.error("E2EE Init error", err);
      }
      setIsInitializingRow(false);
    }
    
    initKeys();
  }, [user]);

  // Fetch all users for starting new chats
  useEffect(() => {
    const fetchUsers = async () => {
      const snap = await getDocs(collection(db, 'users'));
      const activeUsers: CampaignUser[] = [];
      snap.forEach(d => {
        if (d.id !== user?.uid) activeUsers.push(d.data() as CampaignUser);
      });
      setUsers(activeUsers);
    };
    if (initialized) fetchUsers();
  }, [initialized, user?.uid]);

  // Listen to chats I am part of
  useEffect(() => {
    if (!user || !initialized) return;

    const q = query(
      collection(db, 'chats'),
      where('participants', 'array-contains', user.uid)
    );

    const unsub = onSnapshot(q, async (snap) => {
      const chatsData: (Chat & { id: string })[] = [];
      const newChatKeys = { ...chatKeys };
      
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as Chat;
        const id = docSnap.id;
        
        // Decrypt chat keys if we haven't already
        if (!newChatKeys[id] && data.encryptedKeys && data.encryptedKeys[user.uid] && privateKey) {
          try {
            const symKey = await decryptChatKey(data.encryptedKeys[user.uid], privateKey);
            newChatKeys[id] = symKey;
          } catch (e) {
            console.error("Failed to decrypt chat key for chat", id, e);
          }
        }
        
        chatsData.push({ ...data, id });
      }
      
      chatsData.sort((a, b) => {
        const at = a.updatedAt?.toMillis() || 0;
        const bt = b.updatedAt?.toMillis() || 0;
        return bt - at;
      });
      
      setChatKeys(newChatKeys);
      setChats(chatsData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'chats');
    });

    return () => unsub();
  }, [user, initialized, privateKey]); // removed chatKeys from deps to avoid loop

  // Listen to messages for selected chat
  useEffect(() => {
    if (!selectedChat || !chatKeys[selectedChat]) {
      setMessages([]);
      return;
    }

    const q = query(
      collection(db, 'chats', selectedChat, 'messages'),
      orderBy('createdAt', 'asc')
    );

    const unsub = onSnapshot(q, async (snap) => {
      const msgs: (ChatMessage & { id: string, decrypted?: string })[] = [];
      for (const docSnap of snap.docs) {
        const data = docSnap.data() as ChatMessage;
        
        let decryptedText = "[Encrypted Content]";
        try {
          if (data.encryptedText) {
             decryptedText = await decryptMessage(data.encryptedText, chatKeys[selectedChat]);
          }
        } catch (e) {
          console.error("Msg Decryption Failed", e);
        }
        
        msgs.push({ ...data, id: docSnap.id, decrypted: decryptedText });
      }
      setMessages(msgs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `chats/${selectedChat}/messages`);
    });

    return () => unsub();
  }, [selectedChat, chatKeys]);

  const startDirectChat = async (targetUser: CampaignUser) => {
    if (!user || !privateKey || !targetUser.publicKey) {
      alert("Target user has not initialized secure messaging.");
      return;
    }

    // Check if chat already exists
    const existingChat = chats.find(c => 
      c.type === 'direct' && 
      c.participants.includes(targetUser.uid) && 
      c.participants.includes(user.uid)
    );
    
    if (existingChat) {
      setSelectedChat(existingChat.id);
      return;
    }

    try {
      // 1. Generate symmetric AES Chat Key
      const symmKey = await generateChatKey();
      
      // 2. Encrypt Chat Key for both Alice (me) and Bob (Target)
      const myPublicJwk = (await getDoc(doc(db, 'users', user.uid))).data()?.publicKey;
      if (!myPublicJwk) throw new Error("My public key missing in DB");
      
      const myPubKey = await importPublicKey(myPublicJwk);
      const theirPubKey = await importPublicKey(targetUser.publicKey);
      
      const myEncryptedKey = await encryptChatKey(symmKey, myPubKey);
      const theirEncryptedKey = await encryptChatKey(symmKey, theirPubKey);
      
      // 3. Create chat doc
      const chatRef = await addDoc(collection(db, 'chats'), {
        type: 'direct',
        participants: [user.uid, targetUser.uid],
        encryptedKeys: {
          [user.uid]: myEncryptedKey,
          [targetUser.uid]: theirEncryptedKey
        },
        updatedAt: serverTimestamp()
      });
      
      setChatKeys(prev => ({ ...prev, [chatRef.id]: symmKey }));
      setSelectedChat(chatRef.id);
      setSearchQuery('');
    } catch (err) {
      console.error(err);
      alert("Failed to start chat securely");
    }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedChat || !newMessage.trim() || !user || !chatKeys[selectedChat]) return;

    try {
      const symmKey = chatKeys[selectedChat];
      const encryptedText = await encryptMessage(newMessage.trim(), symmKey);
      
      await addDoc(collection(db, 'chats', selectedChat, 'messages'), {
        chatId: selectedChat,
        senderId: user.uid,
        encryptedText,
        createdAt: serverTimestamp()
      });
      
      await updateDoc(doc(db, 'chats', selectedChat), {
        lastMessage: "Encrypted Message", // Never store plain text
        updatedAt: serverTimestamp()
      });
      
      setNewMessage('');
    } catch (err) {
      console.error(err);
      alert("Failed to send encrypted message.");
    }
  };

  if (isInitializingRow) {
    return <div className="text-center py-12"><Lock className="w-8 h-8 mx-auto animate-pulse text-[#DAA520] dark:text-[#FFD700]"/> Generating Keys...</div>;
  }

  const filteredUsers = users.filter(u => 
    u.displayName.toLowerCase().includes(searchQuery.toLowerCase()) || 
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="bg-[#002B5B] dark:bg-[#141414] border text-sm border-[#004A8F] dark:border-[#333333] rounded-2xl shadow-sm overflow-hidden h-[calc(100vh-12rem)] min-h-[500px] flex">
      {/* Sidebar: Chat List */}
      <div className="w-full md:w-80 border-r border-[#004A8F] dark:border-[#333333] bg-[#003B73] dark:bg-[#1f1f1f] flex flex-col shrink-0">
        <div className="p-4 border-b border-[#004A8F] dark:border-[#333333] bg-[#002B5B] dark:bg-[#141414]">
          <h2 className="font-semibold flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            Secure Protocol
          </h2>
          <div className="mt-3 relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-blue-300 dark:text-gray-400" />
            <input 
              type="text" 
              placeholder="Search Staff..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-[#FFD700] dark:bg-[#050505] border-none rounded-xl focus:ring-2 focus:ring-[#DAA520]/50 outline-none text-xs"
            />
          </div>
        </div>
        
        <div className="flex-1 overflow-y-auto">
          {searchQuery ? (
            <div className="p-2 space-y-1">
              <p className="px-3 text-[10px] font-bold tracking-widest text-blue-300 dark:text-gray-400 uppercase py-2">Staff Directory</p>
              {filteredUsers.map(u => (
                <button
                  key={u.uid}
                  onClick={() => startDirectChat(u)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-[#002B5B] dark:hover:bg-[#1a1a1a] dark:bg-[#141414] border border-transparent hover:border-[#004A8F] dark:border-[#333333] transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-full bg-[#DAA520]/20 flex items-center justify-center shrink-0">
                    <User className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
                  </div>
                  <div>
                    <p className="font-medium text-white dark:text-gray-100 leading-tight">{u.displayName}</p>
                    <p className="text-[10px] text-blue-200 dark:text-gray-300 font-mono mt-0.5">{u.role}</p>
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="p-2 space-y-1">
               <p className="px-3 text-[10px] font-bold tracking-widest text-blue-300 dark:text-gray-400 uppercase py-2">Active Channels</p>
               {chats.map(chat => {
                 const otherUserId = chat.participants.find(p => p !== user?.uid);
                 const otherUser = users.find(u => u.uid === otherUserId);
                 
                 return (
                  <button
                    key={chat.id}
                    onClick={() => setSelectedChat(chat.id)}
                    className={`w-full flex items-start gap-3 p-3 rounded-xl transition-all text-left ${selectedChat === chat.id ? 'bg-[#002B5B] dark:bg-[#141414] shadow-sm border border-[#004A8F] dark:border-[#333333]' : 'hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505] border border-transparent'}`}
                  >
                    <div className="w-8 h-8 rounded-full bg-[#002B5B] dark:bg-[#141414] flex items-center justify-center shrink-0">
                       <Lock className="w-3.5 h-3.5 text-blue-200 dark:text-gray-300" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white dark:text-gray-100 truncate">
                        {chat.type === 'direct' ? (otherUser?.displayName || 'Unknown Staff') : chat.name}
                      </p>
                      <p className="text-xs text-blue-200 dark:text-gray-300 truncate mt-0.5 flex items-center gap-1">
                         <ShieldCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                         E2EE Secured
                      </p>
                    </div>
                  </button>
                 );
               })}
               {chats.length === 0 && (
                 <div className="p-4 text-center text-xs text-blue-300 dark:text-gray-400">
                   No active secure channels. Search directory to initialize.
                 </div>
               )}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col bg-[#002B5B] dark:bg-[#141414] min-w-0">
          <div className="h-14 border-b border-[#004A8F] dark:border-[#333333] flex items-center px-6 shrink-0 justify-between">
            <div className="flex items-center gap-2 text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full">
              <Lock className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold tracking-widest uppercase">End-to-End Encrypted</span>
            </div>
            <button onClick={() => setSelectedChat(null)} className="md:hidden text-blue-300 dark:text-gray-400">
              <X className="w-5 h-5"/>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
             {messages.map(msg => {
               const isMe = msg.senderId === user?.uid;
               const sender = isMe ? 'You' : users.find(u => u.uid === msg.senderId)?.displayName || 'Unknown';
               
               return (
                 <div key={msg.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-2 mb-1.5 px-1">
                       <span className="text-[10px] font-medium text-blue-200 dark:text-gray-300">{sender}</span>
                    </div>
                    <div className={`px-4 py-2.5 rounded-2xl max-w-[80%] ${isMe ? 'bg-[#141414] text-white dark:text-gray-100 rounded-tr-sm' : 'bg-[#FFD700] dark:bg-[#050505] text-white dark:text-gray-100 rounded-tl-sm'}`}>
                      <p className="leading-relaxed">{msg.decrypted}</p>
                    </div>
                 </div>
               )
             })}
             <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-[#004A8F] dark:border-[#333333] bg-[#003B73] dark:bg-[#1f1f1f]">
            <form onSubmit={sendMessage} className="flex gap-2">
               <input
                 type="text"
                 value={newMessage}
                 onChange={e => setNewMessage(e.target.value)}
                 placeholder="Draft encrypted transmission..."
                 className="flex-1 px-4 py-3 bg-[#002B5B] dark:bg-[#141414] border border-[#004A8F] dark:border-[#333333] rounded-xl focus:ring-2 focus:ring-[#DAA520]/50 focus:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] outline-none"
               />
               <button 
                 type="submit"
                 disabled={!newMessage.trim()}
                 className="h-[46px] w-[46px] bg-[#141414] text-white dark:text-gray-100 rounded-xl flex items-center justify-center hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
               >
                 <Send className="w-4 h-4 ml-1" />
               </button>
            </form>
            <p className="text-center text-[9px] text-blue-300 dark:text-gray-400 mt-2 font-mono uppercase">Locally Encrypted via AES-GCM-256 before transmission.</p>
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 flex-col items-center justify-center bg-[#003B73] dark:bg-[#1f1f1f] p-8 text-center border-l border-[#004A8F] dark:border-[#333333]">
           <div className="w-16 h-16 bg-[#002B5B] dark:bg-[#141414] border-2 border-emerald-100 rounded-2xl flex items-center justify-center mb-4">
             <ShieldCheck className="w-8 h-8 text-emerald-500" />
           </div>
           <h3 className="text-lg font-bold text-white dark:text-gray-100 mb-2">Secure Communications Protocol</h3>
           <p className="text-sm text-blue-200 dark:text-gray-300 max-w-sm mx-auto">
             All messages are client-side encrypted using 256-bit AES symmetric keys combined with 2048-bit RSA asymmetric cryptography. Not even the system administrators can intercept your communications.
           </p>
        </div>
      )}
    </div>
  );
}
