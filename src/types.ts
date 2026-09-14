export interface Point {
  lat: number;
  lon: number;
  ele: number;
  time: number;
}
export interface Bike {
  id: string;
  name: string;
  brand: string;
  travel: number;
  type: string;
}
export interface Profile {
  name: string;
  email: string;
  home: string;
}
export interface Trail {
  id: string;
  name: string;
  location: string;
  difficulty: string;
  points: Point[];
  boundaries: number[];
  sectorNames: string[];
}
export interface Run {
  id: string;
  trailId: string;
  bikeId: string;
  name: string;
  date: string;
  points: Point[];
  notes: string;
  synthetic?: boolean;
}
export interface AppData {
  version: 1;
  profile: Profile;
  bikes: Bike[];
  trails: Trail[];
  runs: Run[];
  demo: boolean;
}
export interface Sample {
  distance: number;
  fraction: number;
  time: number;
  speed: number;
  elevation: number;
  lat: number;
  lon: number;
}
export interface Telemetry {
  samples: Sample[];
  duration: number;
  distance: number;
  avgSpeed: number;
  maxSpeed: number;
  descent: number;
  ascent: number;
}
