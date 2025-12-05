import { Point, Wall, AntennaType } from './types';

// Distance between two points
export const distance = (p1: Point, p2: Point): number => {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
};

// Rotate point around center
export const rotatePoint = (point: Point, center: Point, angleDegrees: number): Point => {
  const angleRad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  return {
    x: center.x + (dx * cos - dy * sin),
    y: center.y + (dx * sin + dy * cos)
  };
};

// Distance from point to line segment (for selection)
export const pointToLineDistance = (p: Point, v: Point, w: Point): number => {
  const l2 = Math.pow(distance(v, w), 2);
  if (l2 === 0) return distance(p, v);
  let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
  t = Math.max(0, Math.min(1, t));
  const projection = {
    x: v.x + t * (w.x - v.x),
    y: v.y + t * (w.y - v.y)
  };
  return distance(p, projection);
};

// Simple intersection test for line segments
export const intersects = (a: Point, b: Point, c: Point, d: Point): boolean => {
  const det = (b.x - a.x) * (d.y - c.y) - (d.x - c.x) * (b.y - a.y);
  if (det === 0) return false;
  const lambda = ((d.y - c.y) * (d.x - a.x) + (c.x - d.x) * (d.y - a.y)) / det;
  const gamma = ((a.y - b.y) * (d.x - a.x) + (b.x - a.x) * (d.y - a.y)) / det;
  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
};

// Calculate Free Space Range (meters) for a given minimum signal (e.g. -75dBm)
export const calculateFreeSpaceRange = (
    txPower: number, 
    freqGHz: number, 
    minSignal: number = -75,
    gain: number = 0,
    loss: number = 0
): number => {
    // FSPL = 20log10(d) + 20log10(f) - 27.55
    const freqMHz = freqGHz * 1000;
    const eirp = txPower + gain - loss;
    const budget = eirp - minSignal;
    const constTerm = 20 * Math.log10(freqMHz) - 27.55;
    
    const logDist = (budget - constTerm) / 20;
    return Math.pow(10, logDist);
};

export const calculateSignal = (
  tx: Point, 
  rx: Point, 
  power: number, // Tx Power dBm
  gain: number, // Antenna Gain dBi
  loss: number, // Cable Loss dB
  freqGHz: number, 
  walls: Wall[],
  pxScale: number, // pixels per meter
  antennaType: AntennaType = AntennaType.OMNI,
  rotation: number = 0, // degrees
  beamwidth: number = 60, // degrees
  txAltitude: number = 2.5, // meters
  rxHeight: number = 1.0 // meters (client device height)
): number => {
  const safeScale = pxScale > 0 ? pxScale : 20;
  
  const dx = rx.x - tx.x;
  const dy = rx.y - tx.y;
  
  // 2D distance in pixels
  const dist2DPixels = Math.sqrt(dx * dx + dy * dy);
  
  // 3D distance calculation
  const dist2DMeters = dist2DPixels / safeScale;
  const dzMeters = Math.abs(txAltitude - rxHeight);
  const dist3DMeters = Math.sqrt(dist2DMeters * dist2DMeters + dzMeters * dzMeters);

  if (dist3DMeters < 0.1) return power + gain - loss; // At source

  // Free Space Path Loss (FSPL) using 3D distance
  const freqMHz = freqGHz * 1000;
  const fspl = 20 * Math.log10(dist3DMeters) + 20 * Math.log10(freqMHz) - 27.55;
  
  // EIRP = Tx Power + Antenna Gain - Cable Loss
  const eirp = power + gain - loss;

  // Antenna Pattern Loss (Simplified 2D plane check, could be upgraded to 3D angle)
  let antennaPatternLoss = 0;
  if (antennaType === AntennaType.DIRECTIONAL) {
    const angleRad = Math.atan2(dy, dx);
    let angleDeg = angleRad * (180 / Math.PI);
    if (angleDeg < 0) angleDeg += 360;
    
    // Normalize rotation to 0-360
    let rot = rotation % 360;
    if (rot < 0) rot += 360;

    // Calculate difference
    let diff = Math.abs(angleDeg - rot);
    if (diff > 180) diff = 360 - diff;

    const halfBeam = beamwidth / 2;
    if (diff > halfBeam) {
        // Linear drop off outside beam
        const extra = diff - halfBeam;
        const maxExtra = 180 - halfBeam;
        antennaPatternLoss = (extra / maxExtra) * 25; 
    }
  }

  let wallAttenuation = 0;
  // Ray casting for walls (2D plane)
  // Note: This assumes walls are infinitely high for the check, or we check z-height
  for (const wall of walls) {
    if (intersects(tx, rx, wall.start, wall.end)) {
        // Apply thickness factor.
        // We assume the base attenuation in constants (e.g. 12dB for Concrete) is for a standard 15cm (0.15m) wall.
        // Therefore thicker walls attenuate more.
        const baseThickness = 0.15;
        const thickness = wall.thickness || baseThickness;
        const thicknessFactor = thickness / baseThickness;

        wallAttenuation += wall.attenuation * thicknessFactor;
    }
  }

  // Final RSSI
  return eirp - fspl - wallAttenuation - antennaPatternLoss;
};

// Calculate Estimated Throughput (Mbps)
export const calculateThroughput = (rssi: number, standard: string, channelWidth: number): number => {
    if (rssi < -90) return 0;
    
    // Base Max Speed (Approx 2x2 MIMO 256-QAM or 1024-QAM)
    // These are simplified theoretical maximums per PHY specs
    let maxSpeed = 0;
    
    if (standard === '802.11n') {
        if (channelWidth === 20) maxSpeed = 144;
        else maxSpeed = 300; 
    } else if (standard === '802.11ac') {
        if (channelWidth === 20) maxSpeed = 173;
        else if (channelWidth === 40) maxSpeed = 400;
        else maxSpeed = 867; // 80MHz
    } else { // 802.11ax or 802.11be (Simplified)
        if (channelWidth === 20) maxSpeed = 287;
        else if (channelWidth === 40) maxSpeed = 574;
        else if (channelWidth === 80) maxSpeed = 1200;
        else maxSpeed = 2400; // 160MHz
    }

    // Efficiency curve based on SNR/RSSI
    // RSSI roughly maps to MCS index achievable
    let efficiency = 0;
    if (rssi >= -45) efficiency = 0.92;
    else if (rssi >= -55) efficiency = 0.80;
    else if (rssi >= -65) efficiency = 0.60;
    else if (rssi >= -70) efficiency = 0.40;
    else if (rssi >= -75) efficiency = 0.20;
    else if (rssi >= -80) efficiency = 0.10;
    else efficiency = 0.0;

    return Math.floor(maxSpeed * efficiency);
};

// Map dBm to Color String
export const signalToColor = (dBm: number): string => {
  if (dBm > -50) return `rgba(0, 255, 0, 0.6)`; // Excellent (Green)
  if (dBm > -60) return `rgba(120, 255, 0, 0.6)`;
  if (dBm > -65) return `rgba(173, 255, 47, 0.6)`; // Good (Yellow-Green)
  if (dBm > -70) return `rgba(255, 215, 0, 0.6)`; // (Yellow)
  if (dBm > -75) return `rgba(255, 165, 0, 0.6)`; // Fair (Orange)
  if (dBm > -85) return `rgba(255, 0, 0, 0.5)`; // Poor (Red)
  return `rgba(0, 0, 0, 0.0)`; // Dead zone
};

export const throughputToColor = (mbps: number): string => {
    if (mbps > 1000) return `rgba(147, 51, 234, 0.6)`; // Purple (>1Gbps)
    if (mbps > 500) return `rgba(37, 99, 235, 0.6)`; // Blue
    if (mbps > 100) return `rgba(0, 255, 0, 0.6)`; // Green
    if (mbps > 50) return `rgba(255, 215, 0, 0.6)`; // Yellow
    if (mbps > 10) return `rgba(255, 165, 0, 0.6)`; // Orange
    return `rgba(255, 0, 0, 0.5)`; // Red (Slow)
};

// Helper for 3D RGB array
export const signalToRGB = (dBm: number): [number, number, number] => {
    if (dBm > -50) return [0, 1, 0];
    if (dBm > -60) return [0.47, 1, 0];
    if (dBm > -65) return [0.68, 1, 0.18];
    if (dBm > -70) return [1, 0.84, 0];
    if (dBm > -75) return [1, 0.65, 0];
    if (dBm > -85) return [1, 0, 0];
    return [0.1, 0.1, 0.1]; // Low signal background
};

export const throughputToRGB = (mbps: number): [number, number, number] => {
    if (mbps > 1000) return [0.58, 0.2, 0.92]; // Purple
    if (mbps > 500) return [0.15, 0.39, 0.92]; // Blue
    if (mbps > 100) return [0, 1, 0]; // Green
    if (mbps > 50) return [1, 0.84, 0]; // Yellow
    if (mbps > 10) return [1, 0.65, 0]; // Orange
    return [1, 0, 0]; // Red
};