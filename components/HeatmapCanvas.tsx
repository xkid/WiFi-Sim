

import React, { useEffect, useRef } from 'react';
import { Wall, AccessPoint, VisualizationMode } from '../types';
import { calculateSignal, signalToColor, calculateThroughput, throughputToColor } from '../signalUtils';

interface HeatmapCanvasProps {
  walls: Wall[];
  accessPoints: AccessPoint[];
  width: number;
  height: number;
  scale: number; // pixels per meter
  resolution: number; // grid size
  opacity: number;
  mode: VisualizationMode;
}

export const HeatmapCanvas: React.FC<HeatmapCanvasProps> = ({
  walls,
  accessPoints,
  width,
  height,
  scale,
  resolution,
  opacity,
  mode
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (accessPoints.length === 0) return;

    // Draw in blocks defined by resolution
    for (let y = 0; y < height; y += resolution) {
      for (let x = 0; x < width; x += resolution) {
        const rx = { x: x + resolution / 2, y: y + resolution / 2 };
        
        // We find the strongest AP for this point
        let bestMetric = -Infinity;
        let color = '';

        if (mode === 'signal') {
             let maxSignal = -120;
             for (const ap of accessPoints) {
                const signal = calculateSignal(
                    ap.position, 
                    rx, 
                    ap.txPower,
                    ap.antennaGain,
                    ap.cableLoss,
                    ap.frequency, 
                    walls,
                    scale,
                    ap.antennaType,
                    ap.rotation,
                    ap.beamwidth
                );
                if (signal > maxSignal) maxSignal = signal;
            }
            color = signalToColor(maxSignal);
        } else {
            // Throughput Mode
            let maxThroughput = 0;
            for (const ap of accessPoints) {
                const signal = calculateSignal(
                    ap.position, 
                    rx, 
                    ap.txPower,
                    ap.antennaGain,
                    ap.cableLoss,
                    ap.frequency, 
                    walls,
                    scale,
                    ap.antennaType,
                    ap.rotation,
                    ap.beamwidth
                );
                const throughput = calculateThroughput(signal, ap.wifiStandard, ap.channelWidth);
                if (throughput > maxThroughput) maxThroughput = throughput;
            }
            color = throughputToColor(maxThroughput);
        }

        ctx.fillStyle = color;
        ctx.fillRect(x, y, resolution, resolution);
      }
    }
    
  }, [walls, accessPoints, width, height, scale, resolution, mode]);

  return (
    <canvas 
      ref={canvasRef} 
      id="heatmap-canvas"
      width={width} 
      height={height} 
      className="absolute top-0 left-0 pointer-events-none transition-opacity duration-300"
      style={{ opacity }}
    />
  );
};