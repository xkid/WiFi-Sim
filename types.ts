
export enum MaterialType {
  CONCRETE = 'Concrete',
  BRICK = 'Brick',
  DRYWALL = 'Drywall',
  GLASS = 'Glass',
  METAL = 'Metal'
}

export enum AntennaType {
  OMNI = 'Omnidirectional',
  DIRECTIONAL = 'Directional (Sector)'
}

export type VisualizationMode = 'signal' | 'throughput';

export interface Point {
  x: number;
  y: number;
}

export interface Wall {
  id: string;
  start: Point;
  end: Point;
  material: MaterialType;
  thickness: number; // in meters
  height: number; // in meters (for 3D)
  attenuation: number; // dB loss
}

export interface AccessPoint {
  id: string;
  name: string;
  position: Point;
  altitude: number; // Height in meters (Z axis)
  txPower: number; // dBm
  antennaGain: number; // dBi
  cableLoss: number; // dB
  wifiStandard: '802.11n' | '802.11ac' | '802.11ax' | '802.11be';
  frequency: 2.4 | 5; // GHz
  channelWidth: 20 | 40 | 80 | 160; // MHz
  color: string;
  model: string;
  antennaType: AntennaType;
  rotation: number; // degrees, 0 = East
  beamwidth: number; // degrees
}

export interface SimulationConfig {
  scale: number; // pixels per meter
  resolution: number; // grid size for heatmap
  floorPlanImage?: string; // base64
}
