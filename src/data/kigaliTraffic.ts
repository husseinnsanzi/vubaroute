
export interface RoadSegment {
  id: string;
  name: string;
  baseTravelTime: number; // in minutes
  distance: number; // in km
  typicalBottleneck: boolean;
  peakHourMultiplier: number;
  coords: [number, number];
}

export const KIGALI_ROADS: RoadSegment[] = [
  { id: 'r1', name: 'KG 11 Ave (Nyabugogo - Town)', baseTravelTime: 10, distance: 3.5, typicalBottleneck: true, peakHourMultiplier: 2.5, coords: [-1.9390, 30.0440] },
  { id: 'r2', name: 'KG 7 Ave (Giporoso - Kimironko)', baseTravelTime: 8, distance: 2.8, typicalBottleneck: true, peakHourMultiplier: 2.0, coords: [-1.9580, 30.1130] },
  { id: 'r3', name: 'KG 2 Ave (Kimihurura - Town)', baseTravelTime: 12, distance: 4.2, typicalBottleneck: false, peakHourMultiplier: 1.5, coords: [-1.9520, 30.0920] },
  { id: 'r4', name: 'Boulevard de l\'Umuganda (Airport Rd)', baseTravelTime: 15, distance: 6.5, typicalBottleneck: true, peakHourMultiplier: 1.8, coords: [-1.9630, 30.1350] },
  { id: 'r5', name: 'KG 17 Ave (Kacyiru - Nyarutarama)', baseTravelTime: 7, distance: 2.5, typicalBottleneck: false, peakHourMultiplier: 1.4, coords: [-1.9440, 30.0890] },
  { id: 'r6', name: 'KN 3 Rd (Gikondo - Town)', baseTravelTime: 14, distance: 5.0, typicalBottleneck: true, peakHourMultiplier: 2.2, coords: [-1.9650, 30.0650] },
];

export const getTrafficLevel = (multiplier: number): 'Optimal' | 'Medium Traffic' | 'Heavy Traffic' => {
  if (multiplier < 1.3) return 'Optimal';
  if (multiplier < 1.8) return 'Medium Traffic';
  return 'Heavy Traffic';
};

export const getTrafficColor = (level: string): string => {
  if (level === 'Optimal') return 'text-secondary';
  if (level === 'Medium Traffic') return 'text-yellow-400';
  return 'text-tertiary';
};

export const getCurrentTrafficMultiplier = () => {
  const now = new Date();
  const hour = now.getHours();
  
  // Morning peak: 7:00 - 9:30
  if (hour >= 7 && hour < 10) return 2.2;
  // Evening peak: 16:30 - 19:30
  if (hour >= 16 && hour < 20) return 2.0;
  // Lunch time: 12:00 - 13:30
  if (hour >= 12 && hour < 14) return 1.4;
  
  return 1.0;
};
