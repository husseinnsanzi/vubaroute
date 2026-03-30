export type Screen = 'splash' | 'home' | 'route-selection' | 'navigation' | 'report' | 'settings' | 'insights';

export interface Destination {
  name: string;
  coordinates: [number, number];
}

export interface RouteOption {
  id: string;
  time: number;
  distance: number;
  via: string;
  trafficLevel: 'Optimal' | 'Medium Traffic' | 'Heavy Traffic';
  trafficColor: string;
  insight: string;
  isRecommended?: boolean;
}

export interface ReportType {
  id: string;
  label: string;
  description: string;
  icon: string;
  color: string;
  bgColor: string;
}
