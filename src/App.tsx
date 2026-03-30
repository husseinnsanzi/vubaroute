/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import { cn } from './lib/utils';
import { Screen, RouteOption, ReportType, Destination } from './types';
import { KIGALI_ROADS, getTrafficLevel, getTrafficColor, getCurrentTrafficMultiplier } from './data/kigaliTraffic';
import { GoogleGenAI } from "@google/genai";

// Kigali coordinates
const KIGALI_CENTER: [number, number] = [-1.9441, 30.0619];

// Fix Leaflet default icon issue
import icon from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});

L.Marker.prototype.options.icon = DefaultIcon;

// --- Voice Hook ---
const useVoice = () => {
  const speak = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
    }
  };

  const listen = (onResult: (text: string) => void, onEnd?: () => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onresult = (event: any) => {
        const text = event.results[0][0].transcript;
        onResult(text);
      };

      recognition.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === 'not-allowed') {
          alert("Microphone access is required for voice features. Please grant permission in your browser settings.");
        }
        if (onEnd) onEnd();
      };

      recognition.onend = onEnd;
      recognition.start();
      return recognition;
    } else {
      alert("Speech recognition not supported in this browser.");
      if (onEnd) onEnd();
      return null;
    }
  };

  return { speak, listen };
};

// --- Mock Data ---
const MOCK_PEOPLE = [
  { id: 'p1', name: 'Jean-Claude', role: 'Moto Driver', rating: 4.9, status: 'Nearby' },
  { id: 'p2', name: 'Divine', role: 'Taxi Driver', rating: 4.8, status: '5 min away' },
  { id: 'p3', name: 'Eric', role: 'Delivery', rating: 4.7, status: 'Available' },
];

// --- Components ---

const TopBar = ({ title, onProfileClick, onNotificationClick }: { title: string; onProfileClick?: () => void; onNotificationClick?: () => void }) => (
  <header className="fixed top-0 w-full z-50 bg-surface/60 backdrop-blur-xl flex items-center justify-between px-6 py-4 shadow-[0_24px_48px_-12px_rgba(182,196,255,0.04)]">
    <div className="flex items-center gap-4 overflow-hidden">
      <h1 className="text-primary font-headline font-black text-2xl tracking-tighter uppercase truncate">{title}</h1>
    </div>
    <div className="flex items-center gap-3">
      <button 
        onClick={onNotificationClick}
        className="material-symbols-outlined text-primary p-2 rounded-full hover:bg-surface-variant/50 transition-colors"
      >
        notifications
      </button>
      <button 
        onClick={onProfileClick}
        className="h-10 w-10 rounded-full overflow-hidden border border-primary/20 bg-surface-container-high active:scale-90 transition-transform"
      >
        <img 
          alt="User profile" 
          className="w-full h-full object-cover"
          src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=100&auto=format&fit=crop" 
        />
      </button>
    </div>
  </header>
);

const NotificationOverlay = ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => {
  const notifications = [
    { id: 1, title: 'Heavy Traffic Alert', message: 'Nyabugogo Bridge is currently congested. Expect 15 min delay.', time: '2m ago', icon: 'traffic', color: 'text-tertiary' },
    { id: 2, title: 'Route Optimized', message: 'Vuba Route AI found a faster path to Kimironko.', time: '15m ago', icon: 'auto_awesome', color: 'text-primary' },
    { id: 3, title: 'Weather Warning', message: 'Heavy rain expected in Kigali Center. Drive safely.', time: '1h ago', icon: 'rainy', color: 'text-secondary' },
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-surface/40 backdrop-blur-sm z-[1000]"
          />
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            className="fixed top-20 right-6 w-[calc(100%-3rem)] max-w-sm bg-surface-container-high border border-outline-variant/10 rounded-[2.5rem] shadow-2xl z-[1001] overflow-hidden"
          >
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 className="font-headline font-black text-xl text-on-surface">Notifications</h3>
              <button onClick={onClose} className="material-symbols-outlined text-on-surface-variant">close</button>
            </div>
            <div className="max-h-[60vh] overflow-y-auto p-4 space-y-3">
              {notifications.map(n => (
                <div key={n.id} className="p-4 bg-surface-container-highest/30 rounded-3xl flex gap-4 hover:bg-surface-container-highest/50 transition-colors">
                  <div className={cn("bg-surface-container-highest p-3 rounded-2xl h-fit", n.color)}>
                    <span className="material-symbols-outlined">{n.icon}</span>
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="font-bold text-sm">{n.title}</h4>
                      <span className="text-[10px] text-on-surface-variant/60 font-medium">{n.time}</span>
                    </div>
                    <p className="text-xs text-on-surface-variant leading-relaxed">{n.message}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-4 bg-surface-container-highest/20 text-center">
              <button className="text-xs font-black text-primary uppercase tracking-widest">Clear All</button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

const BottomNav = ({ activeScreen, onNavigate }: { activeScreen: Screen; onNavigate: (s: Screen) => void }) => {
  const navItems = [
    { id: 'home', label: 'Explore', icon: 'explore' },
    { id: 'report', label: 'Report', icon: 'report_problem' },
    { id: 'insights', label: 'Insights', icon: 'insights' },
    { id: 'settings', label: 'Profile', icon: 'person' },
  ];

  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md flex justify-around items-center pt-4 pb-12 px-6 bg-surface/80 backdrop-blur-2xl rounded-t-[3rem] z-[1000] border-t border-white/5 shadow-[0_-20px_40px_rgba(0,0,0,0.3)]">
      {navItems.map((item) => (
        <button
          key={item.id}
          onClick={() => onNavigate(item.id as Screen)}
          className="relative flex flex-col items-center justify-center px-4 py-2 transition-all active:scale-90"
        >
          {activeScreen === item.id && (
            <motion.div 
              layoutId="nav-active"
              className="absolute -top-1 h-1 w-8 bg-primary rounded-full shadow-[0_0_12px_rgba(var(--primary-rgb),0.6)]"
            />
          )}
          <span className={cn(
            "material-symbols-outlined text-2xl mb-1 transition-colors duration-300",
            activeScreen === item.id ? "text-primary material-symbols-fill" : "text-on-surface-variant/40"
          )}>
            {item.icon}
          </span>
          <span className={cn(
            "font-body font-bold text-[10px] uppercase tracking-widest transition-colors duration-300",
            activeScreen === item.id ? "text-primary" : "text-on-surface-variant/40"
          )}>
            {item.label}
          </span>
        </button>
      ))}
    </nav>
  );
};

// --- Screens ---

const SplashScreen = ({ onComplete }: { onComplete: () => void }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center overflow-hidden bg-surface">
      <div className="absolute inset-0 z-0">
        <div 
          className="absolute inset-0 opacity-20 mix-blend-overlay" 
          style={{ 
            backgroundImage: "url('https://images.unsplash.com/photo-1514316454349-750a7fd3da3a?q=80&w=1000&auto=format&fit=crop')",
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(182,196,255,0.08)_0%,transparent_70%)]" />
      </div>

      <motion.div 
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex flex-col items-center text-center px-6"
      >
        <div className="relative mb-12">
          <motion.div 
            animate={{ 
              scale: [1, 1.1, 1],
              opacity: [0.2, 0.3, 0.2]
            }}
            transition={{ duration: 4, repeat: Infinity }}
            className="absolute -inset-12 bg-primary/30 blur-[80px] rounded-full" 
          />
          <div className="relative flex h-40 w-40 items-center justify-center rounded-[3rem] bg-surface-container-highest shadow-[0_32px_64px_-12px_rgba(0,0,0,0.4)]">
            <div className="absolute inset-[2px] rounded-[2.9rem] bg-gradient-to-br from-surface-bright to-surface-container-low" />
            <div className="relative flex flex-col items-center gap-2">
              <motion.span 
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="material-symbols-outlined text-primary text-7xl material-symbols-fill"
              >
                location_on
              </motion.span>
              <div className="flex gap-1.5 mt-[-10px]">
                <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 2, repeat: Infinity }} className="h-2 w-2 rounded-full bg-secondary shadow-[0_0_12px_rgba(120,220,119,0.8)]" />
                <div className="h-2 w-2 rounded-full bg-yellow-400 opacity-20" />
                <div className="h-2 w-2 rounded-full bg-tertiary opacity-20" />
              </div>
            </div>
          </div>
        </div>

        <motion.h1 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="font-headline text-7xl font-black tracking-tighter text-on-surface uppercase sm:text-8xl"
        >
          Vuba Route
        </motion.h1>
        <motion.div 
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-6 inline-flex items-center gap-3 px-6 py-2.5 rounded-full bg-surface-container-high/40 backdrop-blur-xl border border-white/5 shadow-xl"
        >
          <span className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
          <p className="font-body text-sm font-bold tracking-[0.1em] text-on-surface-variant uppercase">Premium Mobility for Kigali</p>
        </motion.div>
      </motion.div>

      <div className="fixed bottom-16 flex flex-col items-center gap-6">
        <div className="h-1 w-48 overflow-hidden rounded-full bg-surface-container-highest">
          <motion.div 
            initial={{ x: '-100%' }}
            animate={{ x: '0%' }}
            transition={{ duration: 2, ease: "easeInOut" }}
            className="h-full w-full rounded-full bg-gradient-to-r from-primary to-primary-container" 
          />
        </div>
        <div className="flex items-center gap-4 text-on-surface-variant/40 font-label text-[10px] tracking-[0.2em] uppercase">
          <span>Traffic Data Syncing</span>
          <span className="h-1 w-1 rounded-full bg-outline-variant" />
          <span>Kigali Central Hub</span>
        </div>
      </div>
    </div>
  );
};

const HomeScreen = ({ onNavigate, setDestination, destination, onProfileClick, onNotificationClick }: { onNavigate: (s: Screen) => void; setDestination: (d: Destination | null) => void; destination: Destination | null; onProfileClick?: () => void; onNotificationClick?: () => void }) => {
  const { listen, speak } = useVoice();
  const [isListening, setIsListening] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchResult, setSearchResult] = useState<any>(null);
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiThinking, setIsAiThinking] = useState(false);

  // Mock geocoding
  const geocode = (query: string): Destination | null => {
    const q = query.toLowerCase();
    if (q.includes('home')) return { name: 'Home', coordinates: [-1.9500, 30.0600] };
    if (q.includes('work') || q.includes('office')) return { name: 'Work', coordinates: [-1.9400, 30.0800] };
    if (q.includes('kimironko')) return { name: 'Kimironko Market', coordinates: [-1.9350, 30.1250] };
    if (q.includes('convention')) return { name: 'Kigali Convention Centre', coordinates: [-1.9520, 30.0920] };
    if (q.includes('airport')) return { name: 'Kigali International Airport', coordinates: [-1.9630, 30.1350] };
    if (q.includes('nyabugogo')) return { name: 'Nyabugogo Bus Park', coordinates: [-1.9390, 30.0440] };
    if (q.includes('remera')) return { name: 'Remera Corner', coordinates: [-1.9580, 30.1130] };
    
    // Default to a random spot near center if not found
    return { 
      name: query, 
      coordinates: [
        KIGALI_CENTER[0] + (Math.random() - 0.5) * 0.02,
        KIGALI_CENTER[1] + (Math.random() - 0.5) * 0.02
      ] 
    };
  };

  const handleAiAssistant = async (text: string) => {
    setIsAiThinking(true);
    setAiResponse(null);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `You are Vuba Route Premium AI Assistant for Kigali. 
        User said: "${text}"
        Current Time: ${new Date().toLocaleTimeString()}
        Context: Kigali traffic is currently ${getCurrentTrafficMultiplier() > 1.8 ? 'heavy' : 'moderate'}.
        Provide a helpful, highly concise, and premium response about Kigali mobility or navigation.
        STRICTLY FORBIDDEN: Do not use any asterisks (*) for bullet points or formatting. Use plain text.`,
      });
      setAiResponse(response.text.replace(/\*/g, ''));
      speak(response.text.replace(/\*/g, ''));
    } catch (error) {
      console.error("AI Assistant error:", error);
      setAiResponse("I'm here to help you navigate Kigali smoothly. How can I assist you today?");
    } finally {
      setIsAiThinking(false);
    }
  };

  const handleSearch = (text: string) => {
    setSearchText(text);
    const dest = geocode(text);
    if (dest) {
      setDestination(dest);
      speak(`Searching for ${dest.name}`);
      // Don't navigate immediately if it's a person search, otherwise navigate
      const foundPerson = MOCK_PEOPLE.find(p => text.toLowerCase().includes(p.name.toLowerCase()));
      if (!foundPerson) {
        setTimeout(() => onNavigate('route-selection'), 1500);
      }
    } else if (text.toLowerCase().includes('help') || text.toLowerCase().includes('traffic')) {
      handleAiAssistant(text);
    }
  };

  const handleVoiceSearch = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsListening(true);
    setSearchResult(null);
    
    listen(
      (text) => {
        setSearchText(text);
        const lowerText = text.toLowerCase();
        
        // Check if searching for a person
        const foundPerson = MOCK_PEOPLE.find(p => lowerText.includes(p.name.toLowerCase()));
        
        if (foundPerson) {
          setSearchResult(foundPerson);
          speak(`Found ${foundPerson.name}, a ${foundPerson.role} who is ${foundPerson.status}.`);
        } else {
          handleSearch(text);
        }
      },
      () => setIsListening(false)
    );
  };

  const handleQuickAction = (label: string) => {
    handleSearch(label);
  };

  return (
    <div className="relative flex flex-col h-screen w-full bg-surface overflow-hidden">
      {/* Map Section */}
      <div className="relative flex-1 w-full overflow-hidden">
        {/* Real Leaflet Map */}
        <div className="absolute inset-0 z-0 h-full w-full">
          <MapContainer 
            center={KIGALI_CENTER} 
            zoom={13} 
            zoomControl={false}
            className="h-full w-full grayscale contrast-125 opacity-60"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={KIGALI_CENTER} />
            {destination && <Marker position={destination.coordinates} />}
            {KIGALI_ROADS.map(road => {
              const multiplier = road.typicalBottleneck ? getCurrentTrafficMultiplier() * road.peakHourMultiplier : getCurrentTrafficMultiplier();
              const level = getTrafficLevel(multiplier);
              const color = level === 'Heavy Traffic' ? '#FF4444' : level === 'Medium Traffic' ? '#FFBB33' : '#00C851';
              return (
                <Circle 
                  key={road.id}
                  center={road.coords}
                  radius={300}
                  pathOptions={{ fillColor: color, color: 'transparent', fillOpacity: 0.3 }}
                />
              );
            })}
          </MapContainer>
          <div className="absolute inset-0 bg-gradient-to-b from-surface/40 via-transparent to-surface/80 pointer-events-none z-[400]" />
        </div>

        <TopBar 
          title="Vuba Route" 
          onProfileClick={onProfileClick}
          onNotificationClick={onNotificationClick}
        />

        {/* Search Bar */}
        <div className="fixed top-24 left-1/2 -translate-x-1/2 w-[calc(100%-3rem)] max-w-xl z-40">
          <div 
            className={cn(
              "bg-surface-container-high/60 backdrop-blur-2xl p-2 rounded-[2rem] shadow-2xl border border-outline-variant/10 transition-all",
              isListening && "ring-2 ring-primary ring-offset-2 ring-offset-surface"
            )}
          >
            <form 
              onSubmit={(e) => {
                e.preventDefault();
                if (searchText) handleSearch(searchText);
              }}
              className="flex items-center px-4 py-2"
            >
              <span className={cn("material-symbols-outlined text-primary mr-3", isListening && "animate-pulse")}>
                {isListening ? 'graphic_eq' : 'search'}
              </span>
              <input 
                type="text"
                value={isListening ? 'Listening...' : searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Where to?"
                className={cn(
                  "bg-transparent border-none outline-none text-on-surface-variant text-lg font-body w-full",
                  isListening && "text-primary italic"
                )}
              />
              <div className="ml-auto flex items-center gap-2">
                <div className="h-6 w-[1px] bg-outline-variant/30 mx-2" />
                <button 
                  type="button"
                  onClick={handleVoiceSearch}
                  className={cn(
                    "p-2 rounded-full transition-colors",
                    isListening ? "bg-primary text-on-primary" : "text-on-surface-variant hover:text-primary"
                  )}
                >
                  <span className={cn("material-symbols-outlined", isListening && "material-symbols-fill")}>mic</span>
                </button>
              </div>
            </form>
          </div>

          {/* AI Assistant Response */}
          <AnimatePresence>
            {(aiResponse || isAiThinking) && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="mt-4 bg-surface-container-high/80 backdrop-blur-2xl p-6 rounded-[2rem] shadow-2xl border border-primary/20"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-primary/10 p-2 rounded-xl">
                    <span className="material-symbols-outlined text-primary material-symbols-fill">auto_awesome</span>
                  </div>
                  <h4 className="font-headline font-bold text-primary">Vuba Route AI Assistant</h4>
                </div>
                {isAiThinking ? (
                  <div className="flex flex-col gap-2">
                    <div className="h-3 w-full bg-surface-container-highest animate-pulse rounded-full" />
                    <div className="h-3 w-2/3 bg-surface-container-highest animate-pulse rounded-full" />
                  </div>
                ) : (
                  <p className="text-sm text-on-surface leading-relaxed italic">"{aiResponse}"</p>
                )}
                {!isAiThinking && (
                  <button 
                    onClick={() => setAiResponse(null)}
                    className="mt-4 text-[10px] font-black uppercase tracking-widest text-primary hover:opacity-70"
                  >
                    Dismiss
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Person Search Result */}
          <AnimatePresence>
            {searchResult && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                className="mt-4 bg-primary-container text-on-primary-container p-4 rounded-[1.5rem] shadow-xl border border-primary/20 flex items-center gap-4"
              >
                <div className="bg-primary/20 p-3 rounded-full">
                  <span className="material-symbols-outlined text-primary material-symbols-fill">person</span>
                </div>
                <div className="flex-1">
                  <h4 className="font-bold">{searchResult.name}</h4>
                  <p className="text-xs opacity-80">{searchResult.role} • {searchResult.status}</p>
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onNavigate('navigation'); }}
                  className="bg-primary text-on-primary px-4 py-2 rounded-full text-xs font-bold"
                >
                  Call
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-4 flex gap-2 overflow-x-auto pb-4 no-scrollbar">
            {['Home', 'Office', 'Recent'].map((label, i) => (
              <button 
                key={label} 
                onClick={() => handleQuickAction(label)}
                className="flex items-center gap-2 bg-surface-container-low/80 backdrop-blur-md px-4 py-2 rounded-full border border-outline-variant/10 text-sm whitespace-nowrap active:scale-95 transition-all"
              >
                <span className={cn(
                  "material-symbols-outlined text-lg",
                  i === 0 ? "text-secondary" : i === 1 ? "text-primary" : "text-tertiary"
                )}>
                  {i === 0 ? 'home' : i === 1 ? 'work' : 'favorite'}
                </span>
                <span className="font-medium">{label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Map Controls */}
        <div className="absolute bottom-6 right-6 z-40 flex flex-col gap-4 items-end">
          <button 
            onClick={() => onNavigate('report')}
            className="flex items-center gap-3 bg-gradient-to-br from-primary to-primary-container text-on-primary px-6 py-4 rounded-full shadow-2xl active:scale-90 transition-all"
          >
            <span className="material-symbols-outlined text-2xl material-symbols-fill">report</span>
            <span className="font-bold font-headline tracking-wide">Report</span>
          </button>
        </div>

        {/* Traffic Legend */}
        <div className="absolute bottom-6 left-6 z-30 flex flex-col gap-2 items-start">
          <div className="bg-surface-container-lowest/60 backdrop-blur-sm px-3 py-2 rounded-xl border border-outline-variant/5 flex flex-col gap-2">
            {[
              { label: 'Clear', color: 'bg-secondary' },
              { label: 'Moderate', color: 'bg-yellow-400' },
              { label: 'Heavy', color: 'bg-tertiary' }
            ].map(item => (
              <div key={item.label} className="flex items-center gap-2">
                <div className={cn("w-2 h-2 rounded-full", item.color)} />
                <span className="text-[9px] font-bold text-on-surface-variant/80 uppercase">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer Intelligence Section */}
      <div className="bg-surface-container-low/90 backdrop-blur-3xl border-t border-outline-variant/10 p-6 pb-32 z-50 overflow-y-auto max-h-[40vh]">
        <div className="flex flex-col gap-6 max-w-xl mx-auto">
          <div className="flex items-center justify-between">
            <h3 className="font-headline font-black text-on-surface uppercase tracking-widest text-[10px]">Traffic Intelligence</h3>
            <div className="flex gap-1">
              <div className="h-1 w-1 rounded-full bg-secondary animate-pulse" />
              <div className="h-1 w-1 rounded-full bg-secondary animate-pulse delay-75" />
              <div className="h-1 w-1 rounded-full bg-secondary animate-pulse delay-150" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4">
            {/* Live Traffic Status Widget */}
            <div className="bg-surface-container-high/40 p-4 rounded-[1.5rem] border border-outline-variant/5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-[8px] font-black uppercase tracking-widest text-on-surface-variant/60">Current Status</span>
                <span className="text-[8px] font-bold text-secondary uppercase">Live</span>
              </div>
              <div className="flex items-center gap-4">
                <div className={cn(
                  "h-12 w-12 rounded-2xl flex items-center justify-center shadow-lg",
                  getCurrentTrafficMultiplier() > 1.8 ? "bg-tertiary text-on-tertiary" : "bg-secondary text-on-secondary"
                )}>
                  <span className="material-symbols-outlined text-2xl material-symbols-fill">
                    {getCurrentTrafficMultiplier() > 1.8 ? 'traffic' : 'speed'}
                  </span>
                </div>
                <div>
                  <p className="text-lg font-black text-on-surface leading-none mb-1">
                    {getCurrentTrafficMultiplier() > 1.8 ? 'Heavy Peak' : 'Smooth Flow'}
                  </p>
                  <p className="text-xs text-on-surface-variant font-medium">Kigali Center • Updated just now</p>
                </div>
              </div>
            </div>

            {/* Premium Traffic Forecast */}
            <div className="bg-surface-container-high/40 p-5 rounded-[2rem] border border-outline-variant/10">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-primary text-sm material-symbols-fill">timeline</span>
                <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">Kigali Traffic Forecast</span>
              </div>
              <div className="flex items-end gap-1.5 h-16 mb-3">
                {[0.4, 0.6, 0.9, 1.0, 0.8, 0.5, 0.3].map((h, i) => (
                  <motion.div 
                    key={i}
                    initial={{ height: 0 }}
                    animate={{ height: `${h * 100}%` }}
                    className={cn(
                      "flex-1 rounded-t-lg",
                      h > 0.8 ? "bg-tertiary" : h > 0.5 ? "bg-yellow-400" : "bg-secondary"
                    )}
                  />
                ))}
              </div>
              <div className="flex justify-between text-[9px] font-black text-on-surface-variant/60 uppercase tracking-tighter">
                <span>7 AM</span>
                <span>12 PM</span>
                <span>7 PM</span>
              </div>
              <div className="mt-4 pt-4 border-t border-outline-variant/10">
                <div className="flex items-start gap-3">
                  <span className="material-symbols-outlined text-primary text-lg">lightbulb</span>
                  <p className="text-xs text-on-surface-variant leading-relaxed">
                    <span className="text-primary font-black uppercase text-[10px] tracking-widest block mb-1">AI Mobility Tip</span>
                    Traffic is easing near <span className="font-bold text-on-surface">Nyabugogo</span>. Best time to commute is now to save up to <span className="font-bold text-secondary">15 mins</span>.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const RouteSelectionScreen = ({ onNavigate, destination, onProfileClick, onNotificationClick }: { onNavigate: (s: Screen) => void; destination: Destination | null; onProfileClick?: () => void; onNotificationClick?: () => void }) => {
  const [selectedRouteId, setSelectedRouteId] = useState('1');
  const [filter, setFilter] = useState<'Fastest' | 'Shortest' | 'Less Traffic'>('Fastest');
  const [aiInsight, setAiInsight] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  const currentMultiplier = getCurrentTrafficMultiplier();
  
  const allRoutes: RouteOption[] = KIGALI_ROADS.map((road, index) => {
    const multiplier = road.typicalBottleneck ? currentMultiplier * road.peakHourMultiplier : currentMultiplier;
    const time = Math.round(road.baseTravelTime * multiplier);
    const level = getTrafficLevel(multiplier);
    
    return {
      id: road.id,
      time: time,
      distance: road.distance,
      via: road.name,
      trafficLevel: level,
      trafficColor: getTrafficColor(level),
      insight: level === 'Heavy Traffic' ? 'Peak hour congestion' : level === 'Medium Traffic' ? 'Moderate flow' : 'Fluid traffic flow',
      isRecommended: index === 0
    };
  });

  const filteredRoutes = [...allRoutes].sort((a, b) => {
    if (filter === 'Fastest') return a.time - b.time;
    if (filter === 'Shortest') return a.distance - b.distance;
    if (filter === 'Less Traffic') {
      const trafficOrder = { 'Optimal': 0, 'Medium Traffic': 1, 'Heavy Traffic': 2 };
      return trafficOrder[a.trafficLevel] - trafficOrder[b.trafficLevel];
    }
    return 0;
  });

  const selectedRoute = filteredRoutes.find(r => r.id === selectedRouteId) || filteredRoutes[0];
  const isHeavyTraffic = selectedRoute?.trafficLevel === 'Heavy Traffic';
  const recommendation = allRoutes.find(r => r.trafficLevel === 'Optimal') || allRoutes[0];

  useEffect(() => {
    const generateAiInsight = async () => {
      setIsAnalyzing(true);
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: `Analyze this Kigali traffic data for a user going to ${destination?.name || 'Kigali'}:
          Selected Route: ${selectedRoute.via} (${selectedRoute.time} mins, ${selectedRoute.trafficLevel})
          Recommended Route: ${recommendation.via} (${recommendation.time} mins, ${recommendation.trafficLevel})
          Current Time: ${new Date().toLocaleTimeString()}
          
          Provide a premium, highly summarized mobility insight for Kigali commuters. 
          STRICTLY FORBIDDEN: Do not use any asterisks (*) for bullet points or formatting. Use plain text and clear headings.`,
        });
        setAiInsight(response.text.replace(/\*/g, ''));
      } catch (error) {
        console.error("AI Insight error:", error);
        setAiInsight("Traffic is currently heavy on major routes. Consider using back roads through Kacyiru.");
      } finally {
        setIsAnalyzing(false);
      }
    };

    generateAiInsight();
  }, [selectedRouteId, destination]);

  return (
    <div className="min-h-screen bg-surface pb-32">
      <TopBar 
        title="Vuba Route" 
        onProfileClick={onProfileClick}
        onNotificationClick={onNotificationClick}
      />
      
      <main className="pt-24 px-6 max-w-5xl mx-auto flex flex-col gap-8">
        {/* Traffic Alert Banner */}
        <AnimatePresence>
          {isHeavyTraffic && (
            <motion.div 
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="bg-tertiary-container/30 border border-tertiary/20 p-4 rounded-3xl flex items-center gap-4">
                <div className="bg-tertiary text-on-tertiary p-2 rounded-xl">
                  <span className="material-symbols-outlined material-symbols-fill">warning</span>
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-on-surface">Heavy Traffic Detected</p>
                  <p className="text-xs text-on-surface-variant">Vuba Route AI suggests switching to <span className="font-bold text-primary">{recommendation?.via}</span> to save {selectedRoute?.time! - recommendation?.time!} mins.</p>
                </div>
                <button 
                  onClick={() => setSelectedRouteId(recommendation?.id!)}
                  className="bg-primary text-on-primary px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap"
                >
                  Switch Route
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* Mini Map */}
        <section className="relative h-[200px] w-full rounded-[2rem] overflow-hidden bg-surface-container-low shadow-2xl">
          <MapContainer 
            center={KIGALI_CENTER} 
            zoom={14} 
            zoomControl={false}
            dragging={false}
            scrollWheelZoom={false}
            doubleClickZoom={false}
            className="h-full w-full grayscale contrast-125 opacity-60"
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <Marker position={KIGALI_CENTER} />
            {destination && <Marker position={destination.coordinates} />}
            {KIGALI_ROADS.map(road => {
              const multiplier = road.typicalBottleneck ? getCurrentTrafficMultiplier() * road.peakHourMultiplier : getCurrentTrafficMultiplier();
              const level = getTrafficLevel(multiplier);
              const color = level === 'Heavy Traffic' ? '#FF4444' : level === 'Medium Traffic' ? '#FFBB33' : '#00C851';
              return (
                <Circle 
                  key={road.id}
                  center={road.coords}
                  radius={200}
                  pathOptions={{ fillColor: color, color: 'transparent', fillOpacity: 0.2 }}
                />
              );
            })}
          </MapContainer>
          <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent pointer-events-none z-[400]" />
          <div className="absolute top-6 left-6 right-6 z-[401]">
            <div className="glass-panel p-4 rounded-[1.5rem] flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="bg-primary/20 p-2 rounded-xl">
                  <span className="material-symbols-outlined text-primary material-symbols-fill">location_on</span>
                </div>
                <div>
                  <p className="text-on-surface-variant text-xs font-label uppercase tracking-widest">Destination</p>
                  <h2 className="font-headline font-bold text-lg">{destination?.name || "Kigali Convention Centre"}</h2>
                </div>
              </div>
              <button className="material-symbols-outlined text-on-surface-variant">edit</button>
            </div>
          </div>
        </section>

        {/* AI Insight Section */}
        <section className="bg-surface-container-low/40 backdrop-blur-xl p-6 rounded-[2rem] border border-outline-variant/10">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-primary/10 p-2 rounded-xl">
              <span className="material-symbols-outlined text-primary material-symbols-fill">auto_awesome</span>
            </div>
            <h3 className="font-headline font-bold text-lg">Vuba Route Premium Insight</h3>
          </div>
          {isAnalyzing ? (
            <div className="flex flex-col gap-2">
              <div className="h-4 w-full bg-surface-container-highest animate-pulse rounded-full" />
              <div className="h-4 w-3/4 bg-surface-container-highest animate-pulse rounded-full" />
            </div>
          ) : (
            <p className="text-sm text-on-surface-variant leading-relaxed">
              {aiInsight}
            </p>
          )}
        </section>

        {/* Filters */}
        <section className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
          {['Fastest', 'Shortest', 'Less Traffic'].map((f) => (
            <button 
              key={f}
              onClick={() => setFilter(f as any)}
              className={cn(
                "whitespace-nowrap px-6 py-3 rounded-full font-bold text-sm flex items-center gap-2 transition-all",
                filter === f ? "bg-primary text-on-primary shadow-lg shadow-primary/20" : "bg-surface-container-highest text-on-surface-variant border border-outline-variant/10"
              )}
            >
              <span className="material-symbols-outlined text-sm">{f === 'Fastest' ? 'bolt' : f === 'Shortest' ? 'straighten' : 'traffic'}</span>
              {f}
            </button>
          ))}
        </section>

        {/* Route Cards */}
        <section className="flex flex-col gap-6">
          {filteredRoutes.map((route) => (
            <div 
              key={route.id} 
              onClick={() => setSelectedRouteId(route.id)}
              className="relative group cursor-pointer"
            >
              {route.isRecommended && (
                <div className="absolute -top-3 left-6 z-10 bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-[10px] font-black tracking-widest uppercase flex items-center gap-1.5 shadow-xl">
                  <span className="material-symbols-outlined text-[12px] material-symbols-fill">auto_awesome</span>
                  Recommended by Vuba Route AI
                </div>
              )}
              <div className={cn(
                "bg-surface-container-high p-5 rounded-[2rem] border-2 transition-all group-hover:scale-[1.01]",
                selectedRouteId === route.id ? "border-primary shadow-xl ring-4 ring-primary/10" : "border-transparent"
              )}>
                <div className="flex justify-between items-start mb-6">
                  <div className="flex flex-col">
                    <span className="font-headline text-4xl font-black text-on-surface tracking-tight">
                      {route.time} <span className="text-lg font-medium">min</span>
                    </span>
                    <span className="text-on-surface-variant text-sm font-label">{route.distance} km via {route.via}</span>
                  </div>
                  <div className={cn("px-3 py-1 rounded-lg text-xs font-bold border", route.trafficColor.replace('text-', 'bg-').replace('400', '400/10') + ' ' + route.trafficColor + ' ' + route.trafficColor.replace('text-', 'border-').replace('400', '400/20'))}>
                    {route.trafficLevel}
                  </div>
                </div>
                <div className="flex items-center gap-3 bg-surface-container-highest/50 p-3 rounded-2xl">
                  <span className={cn("material-symbols-outlined", route.trafficColor)}>{route.trafficLevel === 'Optimal' ? 'speed' : route.trafficLevel === 'Medium Traffic' ? 'warning' : 'traffic'}</span>
                  <span className="text-sm font-medium">{route.insight}</span>
                </div>
              </div>
            </div>
          ))}
        </section>

        <button 
          onClick={() => onNavigate('navigation')}
          className="w-full py-5 rounded-full bg-gradient-to-r from-primary to-primary-container text-on-primary font-black text-lg tracking-tight shadow-2xl flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
        >
          Start Navigation
          <span className="material-symbols-outlined material-symbols-fill">navigation</span>
        </button>
      </main>
    </div>
  );
};

const ReportScreen = ({ onNavigate, onProfileClick, onNotificationClick }: { onNavigate: (s: Screen) => void; onProfileClick?: () => void; onNotificationClick?: () => void }) => {
  const reports: ReportType[] = [
    { id: 'jam', label: 'Traffic Jam', description: 'Heavy flow or standstill', icon: 'traffic', color: 'text-primary', bgColor: 'bg-primary/10' },
    { id: 'accident', label: 'Accident', description: 'Vehicle collision', icon: 'emergency_share', color: 'text-tertiary', bgColor: 'bg-tertiary-container/20' },
    { id: 'police', label: 'Police', description: 'Checkpoint or speed trap', icon: 'local_police', color: 'text-primary', bgColor: 'bg-surface-container-low' },
    { id: 'hazard', label: 'Hazard', description: 'Pothole or debris', icon: 'warning', color: 'text-secondary', bgColor: 'bg-surface-container-low' },
    { id: 'closure', label: 'Road Closure', description: 'Construction or event', icon: 'block', color: 'text-on-surface-variant', bgColor: 'bg-surface-container-low' },
    { id: 'event', label: 'Event', description: 'Public gathering', icon: 'celebration', color: 'text-primary', bgColor: 'bg-surface-container-low' },
  ];

  const [reporting, setReporting] = useState<string | null>(null);

  const handleReport = (id: string) => {
    setReporting(id);
    setTimeout(() => {
      setReporting(null);
      onNavigate('home');
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-surface pb-32">
      <TopBar 
        title="Vuba Route" 
        onProfileClick={onProfileClick}
        onNotificationClick={onNotificationClick}
      />
      
      <main className="pt-24 px-6 max-w-4xl mx-auto">
        <div className="mb-10 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-secondary/10 text-secondary mb-4 border border-secondary/20">
            <span className="material-symbols-outlined text-sm material-symbols-fill">location_on</span>
            <span className="font-label text-xs font-bold uppercase tracking-widest">Live GPS Active</span>
          </div>
          <h2 className="font-headline text-3xl font-bold tracking-tight text-on-surface mb-2">Report Traffic</h2>
          <p className="text-on-surface-variant">Reporting near <span className="text-primary font-semibold">Kimironko Market</span></p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {/* Traffic Jam - Large Card */}
          <button 
            onClick={() => handleReport('jam')}
            className="col-span-2 group relative overflow-hidden bg-surface-container-low rounded-[2rem] p-8 text-left transition-all hover:bg-surface-container-high active:scale-[0.98]"
          >
            <div className="absolute -right-4 -top-4 opacity-10 group-hover:opacity-20 transition-opacity">
              <span className="material-symbols-outlined text-9xl">traffic</span>
            </div>
            <div className="bg-primary/10 text-primary w-14 h-14 rounded-2xl flex items-center justify-center mb-6">
              <span className="material-symbols-outlined text-3xl material-symbols-fill">traffic</span>
            </div>
            <h3 className="font-headline text-2xl font-bold mb-1">Traffic Jam</h3>
            <p className="text-on-surface-variant text-sm">Heavy flow or standstill</p>
          </button>

          {reports.slice(1).map((report) => (
            <button 
              key={report.id}
              onClick={() => handleReport(report.id)}
              className={cn(
                "col-span-1 group rounded-[2rem] p-6 text-center transition-all active:scale-[0.98]",
                report.bgColor,
                report.id === 'accident' ? "border border-tertiary/10 hover:bg-tertiary-container/30" : "hover:bg-surface-container-high"
              )}
            >
              <div className={cn("mb-4", report.color)}>
                <span className="material-symbols-outlined text-4xl material-symbols-fill">{report.icon}</span>
              </div>
              <h3 className="font-headline text-lg font-bold">{report.label}</h3>
            </button>
          ))}
        </div>

        {/* Undo UI */}
        <AnimatePresence>
          {reporting && (
            <motion.div 
              initial={{ y: 100, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 100, opacity: 0 }}
              className="fixed bottom-32 left-6 right-6 max-w-md mx-auto z-50"
            >
              <div className="glass-panel p-4 rounded-full flex items-center justify-between border border-primary/20 shadow-2xl">
                <div className="flex items-center gap-4 pl-2">
                  <div className="relative w-10 h-10 flex items-center justify-center">
                    <svg className="absolute inset-0 w-full h-full -rotate-90">
                      <circle className="text-primary/20" cx="20" cy="20" fill="none" r="18" stroke="currentColor" strokeWidth="3" />
                      <motion.circle 
                        initial={{ strokeDashoffset: 113 }}
                        animate={{ strokeDashoffset: 0 }}
                        transition={{ duration: 3, ease: "linear" }}
                        className="text-primary" cx="20" cy="20" fill="none" r="18" stroke="currentColor" strokeDasharray="113" strokeWidth="3" 
                      />
                    </svg>
                    <span className="font-headline font-bold text-primary text-xs">3s</span>
                  </div>
                  <p className="font-body text-sm font-medium">Reporting {reports.find(r => r.id === reporting)?.label}...</p>
                </div>
                <button 
                  onClick={() => setReporting(null)}
                  className="bg-surface-container-highest text-primary px-6 py-2 rounded-full font-label text-sm font-bold hover:bg-surface-bright"
                >
                  UNDO
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
};

const SettingsScreen = ({ onNavigate, isDarkMode, onToggleTheme, onProfileClick, onNotificationClick }: { onNavigate: (s: Screen) => void; isDarkMode: boolean; onToggleTheme: () => void; onProfileClick?: () => void; onNotificationClick?: () => void }) => {
  return (
    <div className="min-h-screen bg-surface pb-32">
      <TopBar 
        title="Vuba Route" 
        onProfileClick={onProfileClick}
        onNotificationClick={onNotificationClick}
      />
      <main className="pt-24 px-6 max-w-2xl mx-auto">
        <div className="flex flex-col items-center mb-10">
          <div className="relative group">
            <div className="h-32 w-32 rounded-[2.5rem] overflow-hidden border-4 border-primary/20 mb-6 shadow-2xl transition-transform group-hover:scale-105">
              <img src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=400&auto=format&fit=crop" className="w-full h-full object-cover" alt="Profile" />
            </div>
            <button className="absolute -bottom-2 -right-2 bg-primary text-on-primary p-2.5 rounded-2xl shadow-xl border-2 border-surface">
              <span className="material-symbols-outlined text-sm material-symbols-fill">edit</span>
            </button>
          </div>
          <h2 className="font-headline text-3xl font-black tracking-tight text-on-surface">John Doe</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className="h-2 w-2 rounded-full bg-secondary animate-pulse" />
            <p className="text-on-surface-variant font-medium tracking-wide uppercase text-xs">Premium Member • Kigali</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-10">
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/10 text-center">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Reports</p>
            <p className="text-3xl font-black text-primary">128</p>
          </div>
          <div className="bg-surface-container-low p-6 rounded-[2rem] border border-outline-variant/10 text-center">
            <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest mb-1">Points</p>
            <p className="text-3xl font-black text-secondary">2.4k</p>
          </div>
        </div>

        <div className="space-y-4">
          <button 
            onClick={onToggleTheme}
            className="w-full flex items-center justify-between p-5 bg-surface-container-low rounded-3xl border border-outline-variant/10 hover:bg-surface-container-high transition-colors"
          >
            <div className="flex items-center gap-4">
              <span className="material-symbols-outlined text-primary">{isDarkMode ? 'dark_mode' : 'light_mode'}</span>
              <div className="text-left">
                <p className="font-bold">App Theme</p>
                <p className="text-xs text-on-surface-variant">{isDarkMode ? 'Dark Mode' : 'Light Mode'}</p>
              </div>
            </div>
            <div className={cn(
              "w-12 h-6 rounded-full relative transition-colors duration-300",
              isDarkMode ? "bg-primary" : "bg-outline-variant"
            )}>
              <div className={cn(
                "absolute top-1 w-4 h-4 rounded-full bg-white transition-all duration-300",
                isDarkMode ? "left-7" : "left-1"
              )} />
            </div>
          </button>

          {[
            { label: 'Language', value: 'English (Kinyarwanda available)', icon: 'language' },
            { label: 'Map Preferences', value: isDarkMode ? 'Dark Map' : 'Light Map', icon: 'map' },
            { label: 'Voice Guidance', value: 'Enabled', icon: 'record_voice_over' },
            { label: 'Emergency Mode', value: 'Disabled', icon: 'emergency' },
            { label: 'Help & Support', value: '', icon: 'help' },
          ].map((item) => (
            <button key={item.label} className="w-full flex items-center justify-between p-5 bg-surface-container-low rounded-3xl border border-outline-variant/10 hover:bg-surface-container-high transition-colors">
              <div className="flex items-center gap-4">
                <span className="material-symbols-outlined text-primary">{item.icon}</span>
                <div className="text-left">
                  <p className="font-bold">{item.label}</p>
                  {item.value && <p className="text-xs text-on-surface-variant">{item.value}</p>}
                </div>
              </div>
              <span className="material-symbols-outlined text-outline">chevron_right</span>
            </button>
          ))}
        </div>

        <button className="w-full mt-10 py-4 rounded-full border border-tertiary/20 text-tertiary font-bold hover:bg-tertiary/5 transition-colors">
          Log Out
        </button>
      </main>
    </div>
  );
};

const InsightsScreen = ({ onNavigate, onProfileClick, onNotificationClick }: { onNavigate: (s: Screen) => void; onProfileClick?: () => void; onNotificationClick?: () => void }) => {
  return (
    <div className="min-h-screen bg-surface pb-32">
      <TopBar 
        title="Vuba Route Insights" 
        onProfileClick={onProfileClick}
        onNotificationClick={onNotificationClick}
      />
      <main className="pt-24 px-6 max-w-2xl mx-auto">
        <div className="mb-8">
          <button 
            onClick={() => onNavigate('home')}
            className="flex items-center gap-2 text-primary font-bold mb-6"
          >
            <span className="material-symbols-outlined">arrow_back</span>
            Back to Explore
          </button>
          <h2 className="font-headline text-4xl font-black text-on-surface mb-2">Mobility Intelligence</h2>
          <p className="text-on-surface-variant">Deep dive into Kigali's real-time traffic patterns and AI-driven forecasts.</p>
        </div>

        <div className="space-y-6">
          {/* Detailed Forecast */}
          <section className="bg-surface-container-high p-8 rounded-[2.5rem] border border-outline-variant/10 shadow-xl">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="bg-primary/10 p-3 rounded-2xl">
                  <span className="material-symbols-outlined text-primary material-symbols-fill">timeline</span>
                </div>
                <div>
                  <h3 className="font-bold text-lg">24h Traffic Forecast</h3>
                  <p className="text-xs text-on-surface-variant">Predictive analysis for Kigali Center</p>
                </div>
              </div>
              <div className="bg-secondary/10 text-secondary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">
                AI Powered
              </div>
            </div>

            <div className="flex items-end gap-1 h-40 mb-6">
              {[0.3, 0.4, 0.6, 0.8, 1.0, 0.9, 0.7, 0.5, 0.4, 0.3, 0.2, 0.3].map((h, i) => (
                <div key={i} className="flex-1 flex flex-col items-center gap-2 h-full">
                  <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${h * 100}%` }}
                    className={cn(
                      "w-full rounded-t-xl shadow-lg",
                      h > 0.8 ? "bg-tertiary" : h > 0.5 ? "bg-yellow-400" : "bg-secondary"
                    )}
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-between text-[10px] font-black text-on-surface-variant/60 uppercase tracking-widest px-1">
              <span>6 AM</span>
              <span>12 PM</span>
              <span>6 PM</span>
              <span>12 AM</span>
            </div>
          </section>

          {/* AI Insights Cards */}
          <div className="grid grid-cols-1 gap-4">
            <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-primary">psychology</span>
                <h4 className="font-bold text-primary">Smart Commute Analysis</h4>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                Based on current trends, the <span className="font-bold text-on-surface">Nyabugogo-Downtown</span> corridor is experiencing a 15% reduction in typical congestion. We recommend departing within the next 20 minutes to avoid the upcoming peak.
              </p>
            </div>

            <div className="bg-secondary/5 p-6 rounded-[2rem] border border-secondary/10">
              <div className="flex items-center gap-3 mb-4">
                <span className="material-symbols-outlined text-secondary">eco</span>
                <h4 className="font-bold text-secondary">Eco-Impact Score</h4>
              </div>
              <p className="text-sm text-on-surface-variant leading-relaxed">
                By following Vuba Route's "Less Traffic" routes this week, you've saved approximately <span className="font-bold text-on-surface">2.4kg of CO2</span> and reduced your idle time by 45 minutes.
              </p>
            </div>
          </div>

          {/* Hotspot Analysis */}
          <section className="bg-surface-container-high p-8 rounded-[2.5rem] border border-outline-variant/10">
            <h3 className="font-bold mb-6">Current Congestion Hotspots</h3>
            <div className="space-y-4">
              {[
                { name: 'Nyabugogo Bridge', status: 'Heavy', color: 'text-tertiary' },
                { name: 'Giporoso Junction', status: 'Moderate', color: 'text-yellow-500' },
                { name: 'Kimironko Market', status: 'Clear', color: 'text-secondary' },
              ].map(spot => (
                <div key={spot.name} className="flex items-center justify-between p-4 bg-surface-container-highest/30 rounded-2xl">
                  <span className="font-medium">{spot.name}</span>
                  <span className={cn("text-xs font-black uppercase tracking-widest", spot.color)}>{spot.status}</span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>
      <BottomNav activeScreen="home" onNavigate={onNavigate} />
    </div>
  );
};

const NavigationScreen = ({ onNavigate }: { onNavigate: (s: Screen) => void }) => {
  const { speak, listen } = useVoice();
  const [isMuted, setIsMuted] = useState(false);
  const [isAssistantActive, setIsAssistantActive] = useState(false);
  const [currentPos, setCurrentPos] = useState<[number, number]>(KIGALI_CENTER);
  const [remainingDistance, setRemainingDistance] = useState(5.4); // km
  const [remainingTime, setRemainingTime] = useState(12); // min
  const [speed, setSpeed] = useState(0); // km/h
  const lastAnnounced = useRef<number | null>(null);

  // Simulate movement if GPS isn't moving much (for demo) or use real GPS
  useEffect(() => {
    let watchId: number;

    if ("geolocation" in navigator) {
      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude, speed: gpsSpeed } = position.coords;
          setCurrentPos([latitude, longitude]);
          if (gpsSpeed) setSpeed(Math.round(gpsSpeed * 3.6)); // m/s to km/h
          
          // Calculate distance to a mock destination (e.g., 5km away from start)
          // For simplicity in this demo, we'll just decrement distance if moving
          if (gpsSpeed && gpsSpeed > 0.5) {
            setRemainingDistance(prev => Math.max(0, prev - (gpsSpeed * 1 / 1000))); // decrement by meters
          }
        },
        (error) => console.error("GPS Error:", error),
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    }

    // Simulation fallback: if distance is not decreasing, simulate it for the demo
    const simInterval = setInterval(() => {
      setRemainingDistance(prev => {
        if (prev <= 0) {
          clearInterval(simInterval);
          return 0;
        }
        // Simulate 40km/h movement = ~0.011 km per second
        return Math.max(0, prev - 0.005); 
      });
    }, 1000);

    return () => {
      if (watchId) navigator.geolocation.clearWatch(watchId);
      clearInterval(simInterval);
    };
  }, []);

  // Update time based on remaining distance and current traffic multiplier
  useEffect(() => {
    const multiplier = getCurrentTrafficMultiplier();
    // Base speed 40km/h, adjusted by traffic
    const adjustedSpeed = 40 / multiplier; 
    const time = Math.round((remainingDistance / adjustedSpeed) * 60);
    setRemainingTime(time);
  }, [remainingDistance]);

  useEffect(() => {
    if (isMuted || remainingDistance <= 0) return;

    const milestones = [5, 4, 3, 2, 1, 0.5, 0.4, 0.2, 0.1, 0.01]; // km
    const currentKm = remainingDistance;

    for (const milestone of milestones) {
      // If we just passed a milestone (going down)
      if (currentKm <= milestone && (lastAnnounced.current === null || lastAnnounced.current > milestone)) {
        if (milestone <= 0.01) {
          speak("You have arrived at your destination.");
        } else if (milestone < 1) {
          speak(`In ${Math.round(milestone * 1000)} meters, prepare for your next turn.`);
        } else {
          speak(`In ${milestone} kilometers, continue straight.`);
        }
        lastAnnounced.current = milestone;
        break;
      }
    }
  }, [remainingDistance, isMuted]);

  const handleVoiceCommand = () => {
    setIsAssistantActive(true);
    listen(
      (text) => {
        const lowerText = text.toLowerCase();
        if (lowerText.includes('mute')) {
          setIsMuted(true);
          speak("Guidance muted.");
        } else if (lowerText.includes('unmute')) {
          setIsMuted(false);
          speak("Guidance unmuted.");
        } else if (lowerText.includes('arrival') || lowerText.includes('time')) {
          speak(`Your estimated arrival time is in ${remainingTime} minutes.`);
        } else if (lowerText.includes('where')) {
          speak("You are currently navigating through Kigali, heading towards your destination.");
        } else {
          speak("I didn't quite catch that. Try asking for arrival time or to mute guidance.");
        }
      },
      () => setIsAssistantActive(false)
    );
  };

  const arrivalTimeStr = new Date(Date.now() + remainingTime * 60000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div className="relative min-h-screen w-full bg-surface overflow-hidden">
      <div className="absolute inset-0 z-0 h-full w-full">
        <MapContainer 
          center={currentPos} 
          zoom={16} 
          zoomControl={false}
          className="h-full w-full grayscale contrast-125 opacity-60"
        >
          <TileLayer
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={currentPos} />
          {/* Dynamic map centering */}
          <RecenterMap coords={currentPos} />
        </MapContainer>
        <div className="absolute inset-0 bg-gradient-to-b from-surface/20 via-transparent to-surface/40 pointer-events-none z-[400]" />
      </div>

      {/* Speedometer Overlay */}
      <div className="absolute top-44 left-6 z-50">
        <div className="bg-surface-container-high/80 backdrop-blur-xl p-4 rounded-3xl border border-primary/20 shadow-xl flex flex-col items-center">
          <span className="text-3xl font-black text-primary leading-none">{speed || Math.floor(Math.random() * 5 + 35)}</span>
          <span className="text-[10px] font-black uppercase tracking-widest text-on-surface-variant">km/h</span>
        </div>
      </div>

      {/* Nav Header */}
      <div className="fixed top-0 w-full z-50 p-4">
        <div className="bg-primary-container text-on-primary-container p-5 rounded-[2rem] shadow-2xl flex items-center gap-4">
          <div className="bg-white/20 p-3 rounded-2xl">
            <span className="material-symbols-outlined text-3xl">turn_right</span>
          </div>
          <div>
            <h2 className="font-headline text-3xl font-black">
              {remainingDistance > 1 ? `${remainingDistance.toFixed(1)} km` : `${Math.round(remainingDistance * 1000)} m`}
            </h2>
            <p className="text-on-primary-container/80 font-medium">Turn right onto KG 2 Ave</p>
          </div>
        </div>
      </div>

      {/* Nav Bottom Sheet */}
      <div className="fixed bottom-0 w-full z-50 p-4">
        <div className="bg-surface-container-high/90 backdrop-blur-2xl p-6 rounded-[2.5rem] shadow-2xl border border-outline-variant/10">
          <div className="flex justify-between items-end mb-6">
            <div className="flex flex-col">
              <span className="font-headline text-4xl font-black text-primary">{remainingTime} <span className="text-lg font-medium">min</span></span>
              <span className="text-on-surface-variant text-sm font-label">{remainingDistance.toFixed(1)} km • {arrivalTimeStr} arrival</span>
            </div>
            <button 
              onClick={() => onNavigate('home')}
              className="bg-tertiary-container text-on-tertiary-container px-8 py-3 rounded-full font-black text-sm uppercase tracking-widest"
            >
              Exit
            </button>
          </div>
          
          <div className="flex gap-4">
            <button 
              onClick={handleVoiceCommand}
              className={cn(
                "flex-1 p-4 rounded-2xl flex items-center justify-center gap-2 transition-all",
                isAssistantActive ? "bg-primary text-on-primary animate-pulse" : "bg-surface-container-highest text-primary"
              )}
            >
              <span className="material-symbols-outlined">{isAssistantActive ? 'graphic_eq' : 'mic'}</span>
              <span className="font-bold text-sm">{isAssistantActive ? 'Listening...' : 'Voice Command'}</span>
            </button>
            <button 
              onClick={() => setIsMuted(!isMuted)}
              className={cn(
                "p-4 rounded-2xl flex items-center justify-center gap-2 transition-colors",
                isMuted ? "bg-surface-container-highest text-outline" : "bg-primary/10 text-primary"
              )}
            >
              <span className="material-symbols-outlined">{isMuted ? 'volume_off' : 'volume_up'}</span>
            </button>
            <button 
              onClick={() => onNavigate('report')}
              className="p-4 rounded-2xl flex items-center justify-center bg-surface-container-highest"
            >
              <span className="material-symbols-outlined text-tertiary">report</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const RecenterMap = ({ coords }: { coords: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(coords, map.getZoom());
  }, [coords, map]);
  return null;
};

// --- Main App ---

export default function App() {
  const [screen, setScreen] = useState<Screen>('splash');
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [destination, setDestination] = useState<Destination | null>(null);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);

  const onNavigate = (s: Screen) => {
    setScreen(s);
    setIsNotificationsOpen(false);
  };

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [isDarkMode]);

  const toggleTheme = () => setIsDarkMode(!isDarkMode);

  return (
    <div className="min-h-screen w-full max-w-md mx-auto relative shadow-2xl overflow-hidden bg-surface transition-colors duration-500">
      <NotificationOverlay isOpen={isNotificationsOpen} onClose={() => setIsNotificationsOpen(false)} />
      <AnimatePresence mode="wait">
        {screen === 'splash' && (
          <motion.div key="splash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <SplashScreen onComplete={() => setScreen('home')} />
          </motion.div>
        )}
        {screen === 'home' && (
          <motion.div key="home" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
            <HomeScreen 
              onNavigate={onNavigate} 
              setDestination={setDestination} 
              destination={destination} 
              onProfileClick={() => onNavigate('settings')}
              onNotificationClick={() => setIsNotificationsOpen(true)}
            />
            <BottomNav activeScreen="home" onNavigate={onNavigate} />
          </motion.div>
        )}
        {screen === 'route-selection' && (
          <motion.div key="route-selection" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -50 }}>
            <RouteSelectionScreen 
              onNavigate={onNavigate} 
              destination={destination} 
              onProfileClick={() => onNavigate('settings')}
              onNotificationClick={() => setIsNotificationsOpen(true)}
            />
            <BottomNav activeScreen="home" onNavigate={onNavigate} />
          </motion.div>
        )}
        {screen === 'navigation' && (
          <motion.div key="navigation" initial={{ opacity: 0, scale: 1.1 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <NavigationScreen onNavigate={onNavigate} />
          </motion.div>
        )}
        {screen === 'report' && (
          <motion.div key="report" initial={{ opacity: 0, y: 50 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 50 }}>
            <ReportScreen 
              onNavigate={onNavigate} 
              onProfileClick={() => onNavigate('settings')}
              onNotificationClick={() => setIsNotificationsOpen(true)}
            />
            <BottomNav activeScreen="report" onNavigate={onNavigate} />
          </motion.div>
        )}
        {screen === 'settings' && (
          <motion.div key="settings" initial={{ opacity: 0, x: -50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
            <SettingsScreen 
              onNavigate={onNavigate} 
              isDarkMode={isDarkMode} 
              onToggleTheme={toggleTheme} 
              onProfileClick={() => onNavigate('settings')}
              onNotificationClick={() => setIsNotificationsOpen(true)}
            />
            <BottomNav activeScreen="settings" onNavigate={onNavigate} />
          </motion.div>
        )}
        {screen === 'insights' && (
          <motion.div key="insights" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 1.1 }}>
            <InsightsScreen 
              onNavigate={onNavigate} 
              onProfileClick={() => onNavigate('settings')}
              onNotificationClick={() => setIsNotificationsOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
