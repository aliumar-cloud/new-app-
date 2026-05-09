import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, updateDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Voter } from '../types';
import { useAuth } from '../App';
import { useVoters } from '../contexts/VoterContext';
import { MapPin, Search, User, Phone, Map as MapIcon, X, Navigation, ChevronDown, ChevronRight } from 'lucide-react';

// Fix Leaflet marker icon issues in React
const markerIcon = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png';
const markerShadow = 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// Maafannu Area Coordinates (Male')
const MAAFANNU_CENTER: [number, number] = [4.1755, 73.5042];

const MapEventsComponent = ({ onClick }: { onClick: (lat: number, lng: number) => void }) => {
  const onClickRef = React.useRef(onClick);
  
  React.useEffect(() => {
    onClickRef.current = onClick;
  }, [onClick]);

  useMapEvents({
    click(e) {
      onClickRef.current(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
};

export default function MapView({ onSelectVoter }: { onSelectVoter?: (voter: Voter) => void }) {
  const { user } = useAuth();
  const { voters } = useVoters();
  const [selectedVoterForPin, setSelectedVoterForPin] = useState<Voter | null>(null);
  const [droppedPin, setDroppedPin] = useState<{lat: number, lng: number} | null>(null);
  const [isPinMode, setIsPinMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [isLocating, setIsLocating] = useState(false);

  const [quickAddName, setQuickAddName] = useState('');
  const [isQuickAdding, setIsQuickAdding] = useState(false);

  const handleQuickAdd = async () => {
    if (!droppedPin || !quickAddName.trim()) return;
    setIsQuickAdding(true);
    const generatedId = `vtr_${Math.random().toString(36).substr(2, 9)}`;
    try {
      const voterData: any = {
        voterId: generatedId,
        fullName: quickAddName.trim(),
        address: '',
        phone: '',
        supportLevel: 'undecided',
        longitude: droppedPin.lng,
        latitude: droppedPin.lat,
        familyMembers: [],
        votedStatus: false,
        districtId: 'default',
        updatedBy: user?.uid || 'unknown',
        updatedAt: serverTimestamp()
      };
      await setDoc(doc(db, 'voters', generatedId), voterData);
      setQuickAddName('');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `voters/${generatedId}`);
    } finally {
      setIsQuickAdding(false);
    }
  };

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());

  const votersWithLocation = voters.filter(v => v.latitude && v.longitude);
  const votersWithoutLocation = voters.filter(v => !v.latitude || !v.longitude);

  const filteredVoters = votersWithoutLocation.filter(v => 
    v.fullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    v.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const groupedVoters = filteredVoters.reduce((acc, voter) => {
    const station = voter.pollingStation || 'Unassigned';
    if (!acc[station]) acc[station] = [];
    acc[station].push(voter);
    return acc;
  }, {} as Record<string, Voter[]>);

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

  const isLinkingRef = React.useRef(isLinking);
  const selectedVoterForPinRef = React.useRef(selectedVoterForPin);
  const isPinModeRef = React.useRef(isPinMode);

  React.useEffect(() => {
    isLinkingRef.current = isLinking;
    selectedVoterForPinRef.current = selectedVoterForPin;
    isPinModeRef.current = isPinMode;
  }, [isLinking, selectedVoterForPin, isPinMode]);

  const handleMapClick = async (lat: number, lng: number) => {
    const currentIsLinking = isLinkingRef.current;
    const currentSelectedVoter = selectedVoterForPinRef.current;
    const currentIsPinMode = isPinModeRef.current;

    if (currentIsLinking && currentSelectedVoter) {
      try {
        await updateDoc(doc(db, 'voters', currentSelectedVoter.voterId), {
          latitude: lat,
          longitude: lng,
          updatedAt: serverTimestamp()
        });
        setSelectedVoterForPin(null);
        setIsLinking(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `voters/${currentSelectedVoter.voterId}`);
      }
    } else if (currentIsPinMode) {
      setDroppedPin({ lat, lng });
      setIsPinMode(false);
    }
  };

  const linkDroppedPinToVoter = async (v: Voter) => {
    if (!droppedPin) return;
    try {
      await updateDoc(doc(db, 'voters', v.voterId), {
        latitude: droppedPin.lat,
        longitude: droppedPin.lng,
        updatedAt: serverTimestamp()
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `voters/${v.voterId}`);
    }
  };

  const handleUseCurrentLocation = () => {
    if (!selectedVoterForPin) return;
    
    setIsLocating(true);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          await handleMapClick(latitude, longitude);
          setIsLocating(false);
        },
        (error) => {
          console.error("Error getting location:", error);
          setIsLocating(false);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setIsLocating(false);
    }
  };

  return (
    <div className="flex flex-col md:h-[calc(100vh-12rem)] md:min-h-[500px]">
      <div className="flex flex-col md:flex-row gap-4 md:gap-6 h-full">
        {/* Sidebar for Linking */}
        <div className={`w-full md:w-80 bg-[#002B5B] dark:bg-[#141414] rounded-3xl border border-[#004A8F] dark:border-[#333333] p-6 flex-col gap-4 shadow-sm order-2 md:order-1 flex`}>
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-blue-50 dark:text-gray-300 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-[#DAA520] dark:text-[#FFD700]" />
              Geospatial Linking
            </h2>
            {(isLinking || droppedPin) && (
              <button 
                onClick={() => {
                  setIsLinking(false);
                  setSelectedVoterForPin(null);
                  setDroppedPin(null);
                }}
                className="p-1 hover:bg-[#003B73] dark:hover:bg-[#2a2a2a] dark:bg-[#1f1f1f] rounded-lg text-blue-300 dark:text-gray-400"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {!isLinking ? (
            <div className="space-y-4">
              <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold uppercase tracking-wider">
                {droppedPin ? "Select Voter for Pin" : "Unmapped Voters"}
              </p>
              {droppedPin && (
                <div className="bg-[#DAA520]/10 border border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20 rounded-xl p-3">
                  <p className="text-xs text-[#DAA520] dark:text-[#FFD700] font-semibold flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Pin Ready!
                  </p>
                  <p className="text-[10px] text-blue-200 dark:text-gray-300 mt-1 mb-3">Select a voter below to link to this pin's location, or click somewhere else to move it.</p>
                  <div className="pt-3 border-t border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/20 dark:border-[#FFD700] dark:border-[#333333]/20">
                    <p className="text-[10px] font-bold text-[#DAA520] dark:text-[#FFD700] mb-2 uppercase tracking-wider">Or Quick Add Voter:</p>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        placeholder="Voter Full Name"
                        value={quickAddName}
                        onChange={(e) => setQuickAddName(e.target.value)}
                        className="flex-1 min-w-0 bg-[#002B5B] dark:bg-[#141414] border border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/30 dark:border-[#FFD700] dark:border-[#333333]/30 rounded-lg px-2 py-2 text-xs focus:ring-1 focus:ring-[#DAA520] outline-none"
                        onKeyPress={(e) => e.key === 'Enter' && handleQuickAdd()}
                      />
                      <button 
                        onClick={handleQuickAdd}
                        disabled={isQuickAdding || !quickAddName.trim()}
                        className="whitespace-nowrap bg-[#DAA520] hover:bg-[#B8860B] active:bg-[#996515] transition-colors text-white dark:text-gray-100 px-3 py-1 rounded-lg text-xs font-bold disabled:opacity-50"
                      >
                        {isQuickAdding ? 'Adding' : 'Add Here'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {!droppedPin && (
                <p className="text-[10px] text-blue-200 dark:text-gray-300 italic">Click on the map to manually drop a pin, or select a voter to begin mapping.</p>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-300 dark:text-gray-400" />
                <input 
                  type="text"
                  placeholder="Search by name or address..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-[#003B73] dark:bg-[#1f1f1f] border-none rounded-xl text-xs font-semibold focus:ring-2 focus:ring-[#DAA520]/20 placeholder:text-blue-300 dark:text-gray-400"
                />
              </div>
              <div className="flex-1 overflow-auto max-h-[300px] md:max-h-full space-y-4 pr-2 custom-scrollbar">
                {(Object.entries(groupedVoters) as [string, Voter[]][]).map(([station, groupVoters]) => (
                  <div key={station} className="space-y-2">
                    <button 
                      onClick={() => toggleGroup(station)} 
                      className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-[#DAA520]/5 transition-colors group"
                    >
                      <span className="text-xs font-bold text-white dark:text-gray-100 uppercase flex items-center gap-2">
                        {collapsedGroups.has(station) ? <ChevronRight className="w-4 h-4 text-blue-300 dark:text-gray-400" /> : <ChevronDown className="w-4 h-4 text-blue-300 dark:text-gray-400" />}
                        <MapPin className="w-3 h-3 text-[#DAA520] dark:text-[#FFD700]" />
                        {station}
                      </span>
                      <span className="text-[9px] text-blue-300 dark:text-gray-400 font-mono">{groupVoters.length}</span>
                    </button>
                    {!collapsedGroups.has(station) && (
                      <div className="space-y-2 pl-2 border-l border-[#004A8F] dark:border-[#333333] ml-3">
                        {groupVoters.map(v => (
                          <button 
                            key={v.voterId}
                            onClick={() => {
                              if (droppedPin) {
                                linkDroppedPinToVoter(v);
                              } else {
                                setSelectedVoterForPin(v);
                                setIsLinking(true);
                              }
                            }}
                            className="w-full text-left p-3 rounded-xl border border-[#004A8F] dark:border-[#333333] hover:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/30 dark:border-[#FFD700] dark:border-[#333333]/30 hover:bg-[#DAA520]/5 transition-all group"
                          >
                            <p className="text-xs font-bold text-blue-100 dark:text-gray-400 group-hover:text-[#DAA520] dark:hover:text-[#FFD700] dark:text-[#FFD700]">{v.fullName}</p>
                            <p className="text-[10px] text-blue-300 dark:text-gray-400 mt-1">{v.address}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <span className="text-[9px] font-mono text-slate-400">#{v.voterId.slice(0, 8)}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {filteredVoters.length === 0 && (
                  <div className="py-8 text-center bg-[#003B73] dark:bg-[#1f1f1f] rounded-2xl border border-dashed border-[#004A8F] dark:border-[#333333]">
                    <p className="text-[10px] text-blue-300 dark:text-gray-400 font-bold uppercase">All voters mapped</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-6 flex-1 flex flex-col items-center justify-center text-center p-4">
              <div className="w-16 h-16 bg-[#DAA520]/10 rounded-full flex items-center justify-center animate-bounce mb-2">
                <MapPin className="w-7 h-7 text-[#DAA520] dark:text-[#FFD700]" />
              </div>
              <div>
                <p className="text-sm font-bold text-blue-50 dark:text-gray-300">Assigning Location</p>
                <p className="text-[10px] text-blue-200 dark:text-gray-300 mt-1 leading-relaxed">
                  Click on the map to pin <br/>
                  <span className="text-[#DAA520] dark:text-[#FFD700] font-bold">{selectedVoterForPin?.fullName}</span> <br/>
                  to that location.
                </p>
              </div>
              <p className="text-[9px] text-blue-300 dark:text-gray-400 italic">Address: {selectedVoterForPin?.address}</p>
              
              <div className="w-full space-y-2">
                <button 
                  onClick={handleUseCurrentLocation}
                  disabled={isLocating}
                  className="w-full py-4 bg-[#DAA520] rounded-xl text-xs font-bold text-white dark:text-gray-100 flex items-center justify-center gap-3 shadow-lg shadow-[#DAA520]/20 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100"
                >
                  <Navigation className={`w-4 h-4 ${isLocating ? 'animate-spin' : ''}`} />
                  {isLocating ? 'Getting GPS Fix...' : 'Pin My Current Location'}
                </button>
                
                <button 
                  onClick={() => {
                    setIsLinking(false);
                    setSelectedVoterForPin(null);
                  }}
                  className="w-full py-3 bg-[#003B73] dark:bg-[#1f1f1f] rounded-xl text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest hover:bg-[#FFD700] dark:hover:bg-[#2a2a2a] dark:bg-[#050505] transition-all"
                >
                  Cancel Operation
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Map Area */}
        <div className="flex-1 h-[60vh] md:h-auto bg-[#002B5B] dark:bg-[#141414] rounded-3xl border border-[#004A8F] dark:border-[#333333] overflow-hidden shadow-sm relative group order-1 md:order-2">
          {!droppedPin && !isLinking && (
            <div className="absolute top-4 right-4 z-[2000] flex flex-col md:flex-row gap-2 items-end md:items-start">
               <button 
                  onClick={() => setIsPinMode(!isPinMode)}
                  className={`bg-[#002B5B] dark:bg-[#141414] px-4 py-2 rounded-xl shadow-md border ${isPinMode ? 'border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333] text-[#DAA520] dark:text-[#FFD700] bg-[#DAA520]/10' : 'border-[#004A8F] dark:border-[#333333] text-blue-50 dark:text-gray-300'} text-xs font-bold`}
               >
                  {isPinMode ? 'Cancel Pin Drop' : 'Drop Manual Pin'}
               </button>
            </div>
          )}
          <MapContainer 
            center={MAAFANNU_CENTER} 
            zoom={19}
            maxZoom={20}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%', zIndex: 1 }}
          >
            <TileLayer
              attribution='&copy; Google Maps'
              url="https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}"
              maxZoom={20}
              subdomains={['mt0', 'mt1', 'mt2', 'mt3']}
            />
            <MapEventsComponent onClick={handleMapClick} />
            {droppedPin && (
              <Marker position={[droppedPin.lat, droppedPin.lng]}>
                <Popup>
                  <p className="text-xs font-bold text-blue-50 dark:text-gray-300">Dropped Pin</p>
                  <p className="text-[10px] text-blue-200 dark:text-gray-300 mb-2">Select a voter to link.</p>
                  <button 
                    onClick={() => setDroppedPin(null)}
                    className="w-full mt-2 py-1 bg-[#FFD700] dark:bg-[#050505] hover:bg-[#002B5B] dark:hover:bg-[#1a1a1a] dark:bg-[#141414] text-blue-100 dark:text-gray-400 text-[10px] font-bold rounded-lg transition-colors"
                  >
                    Clear Pin
                  </button>
                </Popup>
              </Marker>
            )}
            {(Object.values(
              votersWithLocation.reduce((acc, v) => {
                const key = `${v.latitude},${v.longitude}`;
                if (!acc[key]) acc[key] = { lat: v.latitude!, lng: v.longitude!, voters: [] };
                acc[key].voters.push(v);
                return acc;
              }, {} as Record<string, { lat: number, lng: number, voters: Voter[] }>)
            ) as { lat: number, lng: number, voters: Voter[] }[]).map(group => (
              <Marker 
                key={`${group.lat},${group.lng}`} 
                position={[group.lat, group.lng]}
                eventHandlers={{
                  click: (e) => {
                    if (isLinkingRef.current && selectedVoterForPinRef.current) {
                      e.originalEvent.stopPropagation();
                      e.originalEvent.preventDefault();
                      handleMapClick(group.lat, group.lng);
                    }
                  }
                }}
              >
                <Popup>
                  <div className="p-1 min-w-[200px] max-h-[300px] overflow-y-auto custom-scrollbar">
                    <p className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest mb-2 border-b border-[#004A8F] dark:border-[#333333] pb-2">
                      {group.voters.length} {group.voters.length === 1 ? 'Voter' : 'Voters'} Here
                    </p>
                    <div className="space-y-4 mb-4">
                      {group.voters.map(v => (
                        <div key={v.voterId} className="pb-3 border-b border-[#004A8F] dark:border-[#333333] last:border-0 last:pb-0">
                          <div className="flex items-center gap-3 mb-2">
                            <div className="w-8 h-8 rounded-full bg-[#FFD700] dark:bg-[#050505] overflow-hidden flex shadow-[0_0_0_1px_rgba(0,0,0,0.05)] items-center justify-center shrink-0">
                              {v.photoUrl ? (
                                <img src={v.photoUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                              ) : (
                                <User className="w-4 h-4 text-blue-300 dark:text-gray-400" />
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-blue-50 dark:text-gray-300 leading-tight">{v.fullName}</p>
                              <p className="text-[9px] text-blue-300 dark:text-gray-400">ID: {v.voterId}</p>
                            </div>
                          </div>
                          <div className="space-y-1">
                             <div className="flex items-center gap-2 text-[10px]">
                               <MapIcon className="w-3 h-3 text-blue-300 dark:text-gray-400" />
                               <span className="text-blue-200 dark:text-gray-300 font-semibold truncate">{v.address || '-'}</span>
                             </div>
                             {v.phone ? (
                               <a href={`tel:${v.phone}`} target="_top" onClick={(e) => e.stopPropagation()} className="flex items-center gap-2 text-[10px] hover:opacity-80 transition-opacity">
                                 <Phone className="w-3 h-3 text-[#DAA520] dark:text-[#FFD700]" />
                                 <span className="text-blue-200 dark:text-gray-300 font-semibold">{v.phone}</span>
                               </a>
                             ) : (
                               <div className="flex items-center gap-2 text-[10px]">
                                 <Phone className="w-3 h-3 text-blue-300 dark:text-gray-400" />
                                 <span className="text-blue-200 dark:text-gray-300 font-semibold">-</span>
                               </div>
                             )}
                          </div>
                          <div className="mt-2 pt-2 border-t border-[#004A8F] dark:border-[#333333] flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase ${
                              v.supportLevel.includes('support') ? 'bg-emerald-50 text-emerald-600' :
                              v.supportLevel.includes('opposition') ? 'bg-rose-50 text-rose-600' : 'bg-[#003B73] dark:bg-[#1f1f1f] text-blue-200 dark:text-gray-300'
                            }`}>
                              {v.supportLevel.replace('_', ' ')}
                            </span>
                            <div className="flex items-center gap-3">
                              <button 
                                onClick={() => {
                                  updateDoc(doc(db, 'voters', v.voterId), {
                                    latitude: null,
                                    longitude: null,
                                    updatedAt: serverTimestamp()
                                  }).catch(err => {
                                    handleFirestoreError(err, OperationType.UPDATE, `voters/${v.voterId}`);
                                  });
                                }}
                                className="text-[9px] font-bold text-rose-500 hover:underline"
                              >
                                Remove Pin
                              </button>
                              <button 
                                onClick={() => onSelectVoter?.(v)}
                                className="text-[9px] font-bold text-[#DAA520] dark:text-[#FFD700] hover:underline"
                              >
                                View
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button 
                      onClick={() => setDroppedPin({ lat: group.lat, lng: group.lng })}
                      className="w-full sticky bottom-0 bg-[#FFD700] dark:bg-[#050505] hover:bg-[#DAA520]/10 hover:text-[#DAA520] dark:hover:text-[#FFD700] dark:text-[#FFD700] text-blue-100 dark:text-gray-400 p-2 text-[10px] font-bold rounded-lg transition-colors border border-[#004A8F] dark:border-[#333333] hover:border-[#DAA520] dark:border-[#FFD700] dark:border-[#333333]/30 dark:border-[#FFD700] dark:border-[#333333]/30"
                    >
                      Add Voter to this Location
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
          
          {/* Legend Overlay */}
          <div className="absolute top-4 right-4 z-[500] bg-[#002B5B] dark:bg-[#141414]/90 backdrop-blur-md p-4 rounded-2xl shadow-xl border border-white/20">
            <h3 className="text-[10px] font-bold text-blue-300 dark:text-gray-400 uppercase tracking-widest mb-3">Map Legend</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#DAA520]"></div>
                <span className="text-[10px] font-semibold text-blue-200 dark:text-gray-300">Active Voter</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                <span className="text-[10px] font-semibold text-blue-200 dark:text-gray-300">Supporter</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
