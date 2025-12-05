
import React, { useState, useRef, useEffect } from 'react';
import { 
  Plus, Upload, Layers, Wifi, RotateCw, ZoomIn, ZoomOut, Move, Ruler, MousePointer2, RefreshCcw, Signal, Trash, Gauge, PenTool, Magnet, Printer, Download, Loader2, Box
} from 'lucide-react';
import { HeatmapCanvas } from './components/HeatmapCanvas';
import { Viewer3D } from './components/Viewer3D';
import { PropertyPanel } from './components/PropertyPanel';
import { Wall, Point, AccessPoint, MaterialType, AntennaType, VisualizationMode } from './types';
import { MATERIAL_ATTENUATION, MOXA_PRODUCTS, COLORS } from './constants';
import { distance, pointToLineDistance, calculateSignal, calculateThroughput, signalToColor, throughputToColor } from './signalUtils';

type ToolType = 'select' | 'wall_room' | 'wall_line' | 'ap' | 'scale';

export default function App() {
  // --- State ---
  const [mode, setMode] = useState<'2D' | '3D'>('2D');
  const [tool, setTool] = useState<ToolType>('select');
  const [vizMode, setVizMode] = useState<VisualizationMode>('signal');
  const [snappingEnabled, setSnappingEnabled] = useState(true);
  
  // Data
  const [walls, setWalls] = useState<Wall[]>([]);
  const [accessPoints, setAccessPoints] = useState<AccessPoint[]>([]);
  const [pixelsPerMeter, setPixelsPerMeter] = useState(20); // Scale

  // Editor State
  const [selectedObject, setSelectedObject] = useState<{ type: 'wall' | 'ap', id: string } | null>(null);
  const [activeAPModel, setActiveAPModel] = useState(MOXA_PRODUCTS[0]);
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(true);
  const [cursorMetric, setCursorMetric] = useState<{value: number, unit: string} | null>(null);
  
  // View Transform
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Interactions
  const [interaction, setInteraction] = useState<{
    type: 'panning' | 'dragging' | 'drawing_room' | 'drawing_line' | 'scaling' | 'rotating';
    startScreen: Point;
    startWorld: Point;
    currentWorld?: Point; // For drawing
    activeId?: string; // ID of object being manipulated
    handle?: 'start' | 'end' | 'center' | 'rotate'; // For walls/objects
  } | null>(null);

  // Calibration
  const [tempScaleLine, setTempScaleLine] = useState<{start: Point, end: Point} | null>(null);

  // Dimensions
  const canvasRef = useRef<HTMLDivElement>(null);
  const [viewportSize, setViewportSize] = useState({ width: 1200, height: 800 }); // Screen size
  const [floorSize, setFloorSize] = useState({ width: 1200, height: 800 }); // Simulation World Size

  // Manual Scale Input State
  const [manualScaleInput, setManualScaleInput] = useState("20");

  useEffect(() => {
    const updateDim = () => {
      if (canvasRef.current) {
        const newViewport = {
          width: canvasRef.current.offsetWidth,
          height: canvasRef.current.offsetHeight
        };
        setViewportSize(newViewport);
        
        // If no background image is loaded, floor size matches viewport
        if (!backgroundImage) {
            setFloorSize(newViewport);
        }
      }
    };
    window.addEventListener('resize', updateDim);
    updateDim();
    return () => window.removeEventListener('resize', updateDim);
  }, [backgroundImage]);

  useEffect(() => {
      setManualScaleInput(pixelsPerMeter.toFixed(2));
  }, [pixelsPerMeter]);

  // --- Helpers ---
  const screenToWorld = (screenX: number, screenY: number): Point => {
    if (!canvasRef.current) return { x: 0, y: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    return {
      x: (screenX - rect.left - pan.x) / zoom,
      y: (screenY - rect.top - pan.y) / zoom
    };
  };

  const getSnappedPos = (pos: Point): Point => {
      if (!snappingEnabled) return pos;

      const snapThreshold = 15 / zoom;
      
      // 1. Snap to existing Wall Endpoints
      for (const wall of walls) {
          if (distance(pos, wall.start) < snapThreshold) return wall.start;
          if (distance(pos, wall.end) < snapThreshold) return wall.end;
      }

      // 2. Snap to Grid (every 1 meter)
      const gridSize = pixelsPerMeter; 
      
      // Only snap to grid if grid is visible/reasonable size (avoid snapping to 1px grid)
      if (gridSize > 5) {
        const gridX = Math.round(pos.x / gridSize) * gridSize;
        const gridY = Math.round(pos.y / gridSize) * gridSize;

        let snappedX = pos.x;
        let snappedY = pos.y;

        if (Math.abs(pos.x - gridX) < snapThreshold) snappedX = gridX;
        if (Math.abs(pos.y - gridY) < snapThreshold) snappedY = gridY;

        return { x: snappedX, y: snappedY };
      }

      return pos;
  };

  const getObjectAt = (pos: Point, ignoreWallBody: boolean = false, ignoreAPs: boolean = false): { type: 'wall' | 'ap', id: string, handle?: 'start' | 'end' | 'center' | 'rotate' } | null => {
    const hitRadius = 10 / zoom;

    if (!ignoreAPs) {
        // Check APs (Reverse for top-most check)
        for (let i = accessPoints.length - 1; i >= 0; i--) {
            const ap = accessPoints[i];
            
            // Rotation Handle Check
            if (selectedObject?.id === ap.id && selectedObject.type === 'ap') {
                 const handlePos = { x: ap.position.x + 25, y: ap.position.y - 25 }; // Offset handle
                 if (distance(pos, handlePos) < hitRadius) return { type: 'ap', id: ap.id, handle: 'rotate' };
            }

            if (distance(pos, ap.position) < 20 / zoom) { // AP radius
                return { type: 'ap', id: ap.id, handle: 'center' };
            }
        }
    }

    // Check Walls
    for (const wall of walls) {
        // Handles for selected wall
        if (selectedObject?.id === wall.id && selectedObject.type === 'wall') {
            const center = { x: (wall.start.x + wall.end.x) / 2, y: (wall.start.y + wall.end.y) / 2 };
            // Rotation handle removed for walls
        }

        // Always check endpoints for snapping/selection
        if (distance(pos, wall.start) < hitRadius) return { type: 'wall', id: wall.id, handle: 'start' };
        if (distance(pos, wall.end) < hitRadius) return { type: 'wall', id: wall.id, handle: 'end' };

        // Line detection (Body)
        // If ignoreWallBody is true, we skip the body check.
        if (!ignoreWallBody) {
             if (pointToLineDistance(pos, wall.start, wall.end) < hitRadius) {
                 return { type: 'wall', id: wall.id, handle: 'center' };
             }
        }
    }

    return null;
  };

  // --- Event Handlers ---

  const handleExport = async () => {
    if (mode === '3D') {
        const canvas = document.getElementById('canvas-3d') as HTMLCanvasElement;
        if (canvas) {
            const link = document.createElement('a');
            link.download = 'wifi-heatmap-3d.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        }
    } else {
        // 2D Export Logic
        const exportCanvas = document.createElement('canvas');
        
        let exportW = floorSize.width;
        let exportH = floorSize.height;
        let bgImg: HTMLImageElement | null = null;

        // If a background image exists, ensure we use its native resolution
        // (floorSize should already match this, but logic persists for safety)
        if (backgroundImage) {
            bgImg = new Image();
            bgImg.src = backgroundImage;
            await new Promise((resolve) => {
                bgImg!.onload = () => resolve(true);
                bgImg!.onerror = () => resolve(false);
            });
            exportW = bgImg.naturalWidth;
            exportH = bgImg.naturalHeight;
        }

        exportCanvas.width = exportW;
        exportCanvas.height = exportH;
        const ctx = exportCanvas.getContext('2d');
        if (!ctx) return;

        // 1. Draw Background
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, exportW, exportH);
        
        if (bgImg) {
            ctx.drawImage(bgImg, 0, 0, exportW, exportH);
        }

        // 2. Draw Heatmap 
        if (showHeatmap && accessPoints.length > 0) {
            // Resolution for export
            const exportRes = 10; 

            for (let y = 0; y < exportH; y += exportRes) {
                for (let x = 0; x < exportW; x += exportRes) {
                    const rx = { x: x + exportRes / 2, y: y + exportRes / 2 };
                    
                    if (vizMode === 'signal') {
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
                                pixelsPerMeter,
                                ap.antennaType,
                                ap.rotation,
                                ap.beamwidth,
                                ap.altitude,
                                1.0
                            );
                            if (signal > maxSignal) maxSignal = signal;
                        }
                        ctx.fillStyle = signalToColor(maxSignal);
                    } else {
                        let maxTp = 0;
                        for (const ap of accessPoints) {
                            const signal = calculateSignal(
                                ap.position, 
                                rx, 
                                ap.txPower,
                                ap.antennaGain,
                                ap.cableLoss,
                                ap.frequency, 
                                walls,
                                pixelsPerMeter,
                                ap.antennaType,
                                ap.rotation,
                                ap.beamwidth,
                                ap.altitude,
                                1.0
                            );
                            const tp = calculateThroughput(signal, ap.wifiStandard, ap.channelWidth);
                            if (tp > maxTp) maxTp = tp;
                        }
                        ctx.fillStyle = throughputToColor(maxTp);
                    }
                    ctx.fillRect(x, y, exportRes, exportRes);
                }
            }
        }

        // 3. Draw Walls
        walls.forEach(w => {
            ctx.beginPath();
            ctx.moveTo(w.start.x, w.start.y);
            ctx.lineTo(w.end.x, w.end.y);
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = w.thickness * pixelsPerMeter;
            ctx.lineCap = 'round';
            ctx.stroke();
        });

        // 4. Draw APs
        accessPoints.forEach(ap => {
             const x = ap.position.x;
             const y = ap.position.y;
             
             // Range Cone
             if (ap.antennaType === AntennaType.DIRECTIONAL) {
                 ctx.save();
                 ctx.translate(x, y);
                 ctx.rotate((ap.rotation * Math.PI) / 180);
                 ctx.beginPath();
                 ctx.moveTo(0,0);
                 ctx.arc(0, 0, 60, -0.25, 0.25);
                 ctx.closePath();
                 ctx.fillStyle = 'rgba(16, 185, 129, 0.1)';
                 ctx.fill();
                 ctx.restore();
             }

             // Circle
             ctx.beginPath();
             ctx.arc(x, y, 15, 0, Math.PI * 2);
             ctx.fillStyle = ap.color;
             ctx.globalAlpha = 0.5;
             ctx.fill();
             ctx.globalAlpha = 1.0;
             ctx.lineWidth = 2;
             ctx.strokeStyle = 'white';
             ctx.stroke();

             // Label
             ctx.fillStyle = 'white';
             ctx.font = `12px sans-serif`;
             ctx.textAlign = 'center';
             ctx.fillText(ap.name, x, y - 25);
        });

        const link = document.createElement('a');
        link.download = 'wifi-heatmap-2d.png';
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (mode === '3D') return;
    const rawWorldPos = screenToWorld(e.clientX, e.clientY);
    const screenPos = { x: e.clientX, y: e.clientY };

    // Scale Tool - Priority
    if (tool === 'scale') {
        setTempScaleLine({ start: rawWorldPos, end: rawWorldPos });
        setInteraction({ type: 'scaling', startScreen: screenPos, startWorld: rawWorldPos });
        return;
    }

    // Right Click -> Pan
    if (e.button === 2 || (tool === 'select' && e.altKey)) { 
        setInteraction({ type: 'panning', startScreen: screenPos, startWorld: rawWorldPos });
        return;
    }

    // Wall Tool (Drawing Room)
    if (tool === 'wall_room') {
        const snappedPos = getSnappedPos(rawWorldPos);
        setInteraction({ 
            type: 'drawing_room', 
            startScreen: screenPos, 
            startWorld: snappedPos, 
            currentWorld: snappedPos
        });
        setSelectedObject(null);
        return;
    }

    // Wall Tool (Drawing Line)
    if (tool === 'wall_line') {
        const snappedPos = getSnappedPos(rawWorldPos);
        setInteraction({
            type: 'drawing_line',
            startScreen: screenPos, 
            startWorld: snappedPos, 
            currentWorld: snappedPos
        });
        setSelectedObject(null);
        return;
    }

    // AP Tool
    if (tool === 'ap') {
        const newAP: AccessPoint = {
            id: Math.random().toString(36).substr(2, 9),
            name: `${activeAPModel.name} - ${accessPoints.length + 1}`,
            position: rawWorldPos,
            altitude: 2.5, // Default ceiling height
            txPower: activeAPModel.txPower,
            frequency: activeAPModel.frequency as 2.4 | 5,
            color: COLORS.accent,
            model: activeAPModel.name,
            antennaType: AntennaType.OMNI,
            rotation: 0,
            beamwidth: 60,
            antennaGain: 3,
            cableLoss: 0,
            wifiStandard: '802.11ax',
            channelWidth: 40
        };
        setAccessPoints([...accessPoints, newAP]);
        setSelectedObject({ type: 'ap', id: newAP.id });
        setTool('select'); 
        return;
    }

    // Hit Testing (Select Mode)
    // When drawing walls (either mode), we ignore clicking on wall bodies so you can start drawing near them
    const hit = getObjectAt(rawWorldPos, tool.startsWith('wall')); 

    if (hit) {
        setSelectedObject({ type: hit.type, id: hit.id });
        
        if (hit.handle === 'rotate') {
             setInteraction({ 
                type: 'rotating', 
                startScreen: screenPos, 
                startWorld: rawWorldPos, 
                activeId: hit.id, 
                handle: 'rotate'
            });
        } else {
            setInteraction({ 
                type: 'dragging', 
                startScreen: screenPos, 
                startWorld: rawWorldPos, 
                activeId: hit.id, 
                handle: hit.handle 
            });
        }
    } else {
        setSelectedObject(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const rawWorldPos = screenToWorld(e.clientX, e.clientY);
    
    // Cursor Metric (RSSI or Throughput)
    if (mode === '2D' && accessPoints.length > 0) {
        let maxMetric = -Infinity;
        
        if (vizMode === 'signal') {
            maxMetric = -120;
            for (const ap of accessPoints) {
                const signal = calculateSignal(
                    ap.position,
                    rawWorldPos,
                    ap.txPower,
                    ap.antennaGain,
                    ap.cableLoss,
                    ap.frequency,
                    walls,
                    pixelsPerMeter,
                    ap.antennaType,
                    ap.rotation,
                    ap.beamwidth,
                    ap.altitude,
                    1.0 // receiver height
                );
                if (signal > maxMetric) maxMetric = signal;
            }
            setCursorMetric({ value: maxMetric, unit: 'dBm' });
        } else {
            // Throughput
            maxMetric = 0;
            for (const ap of accessPoints) {
                const signal = calculateSignal(
                    ap.position,
                    rawWorldPos,
                    ap.txPower,
                    ap.antennaGain,
                    ap.cableLoss,
                    ap.frequency,
                    walls,
                    pixelsPerMeter,
                    ap.antennaType,
                    ap.rotation,
                    ap.beamwidth,
                    ap.altitude,
                    1.0 
                );
                const tp = calculateThroughput(signal, ap.wifiStandard, ap.channelWidth);
                if (tp > maxMetric) maxMetric = tp;
            }
            setCursorMetric({ value: maxMetric, unit: 'Mbps' });
        }
    } else {
        setCursorMetric(null);
    }

    if (!interaction) return;

    const dx = e.clientX - interaction.startScreen.x;
    const dy = e.clientY - interaction.startScreen.y;
    
    if (interaction.type === 'panning') {
        setPan(p => ({ x: p.x + dx, y: p.y + dy }));
        setInteraction(prev => prev ? { ...prev, startScreen: { x: e.clientX, y: e.clientY } } : null);
        return;
    }

    if (interaction.type === 'scaling' && tempScaleLine) {
        setTempScaleLine({ ...tempScaleLine, end: rawWorldPos });
        return;
    }

    // Apply snapping for drawing or dragging objects (not rotation)
    const snappedWorldPos = getSnappedPos(rawWorldPos);

    if (interaction.type === 'drawing_room') {
        setInteraction(prev => prev ? { ...prev, currentWorld: snappedWorldPos } : null);
        return;
    }

    if (interaction.type === 'drawing_line') {
        setInteraction(prev => prev ? { ...prev, currentWorld: snappedWorldPos } : null);
        return;
    }

    if (interaction.type === 'dragging' && interaction.activeId) {
        // Use snapped pos for precise movement
        const targetPos = snappedWorldPos; 
        
        if (selectedObject?.type === 'ap') {
            setAccessPoints(prev => prev.map(ap => 
                ap.id === interaction.activeId ? { ...ap, position: targetPos } : ap
            ));
        }
        
        if (selectedObject?.type === 'wall') {
            setWalls(prev => prev.map(w => {
                if (w.id !== interaction.activeId) return w;
                
                if (interaction.handle === 'start') return { ...w, start: targetPos };
                if (interaction.handle === 'end') return { ...w, end: targetPos };
                
                // For moving the whole wall, we calculate delta from original click
                const dX = rawWorldPos.x - interaction.startWorld.x; 
                const dY = rawWorldPos.y - interaction.startWorld.y;
                
                return {
                    ...w,
                    start: { x: w.start.x + dX, y: w.start.y + dY },
                    end: { x: w.end.x + dX, y: w.end.y + dY }
                };
            }));
            // Update startWorld for continuous delta calculation
            setInteraction(prev => prev ? { ...prev, startWorld: rawWorldPos } : null);
        }
    }

    if (interaction.type === 'rotating' && interaction.activeId) {
        if (selectedObject?.type === 'ap') {
            const ap = accessPoints.find(a => a.id === interaction.activeId);
            if (ap) {
                const angleRad = Math.atan2(rawWorldPos.y - ap.position.y, rawWorldPos.x - ap.position.x);
                let angleDeg = angleRad * (180 / Math.PI);
                setAccessPoints(prev => prev.map(a => 
                    a.id === interaction.activeId ? { ...a, rotation: (angleDeg + 360) % 360 } : a
                ));
            }
        }
    }
  };

  const handleMouseUp = () => {
    if (interaction?.type === 'scaling' && tempScaleLine) {
        const pxLen = distance(tempScaleLine.start, tempScaleLine.end);
        if (pxLen > 5) { 
            // We use the calculated pixel length, prompt user for meters
            setTimeout(() => {
                const input = prompt("Enter the real-world length of this line in meters:", "1");
                const meters = input ? parseFloat(input) : NaN;
                if (!isNaN(meters) && meters > 0) {
                    const newScale = pxLen / meters;
                    setPixelsPerMeter(newScale);
                } else {
                    alert("Invalid length entered. Scale not updated.");
                }
                setTempScaleLine(null);
                setTool('select');
            }, 50);
        } else {
             setTempScaleLine(null);
        }
    }
    
    // Create Box Room
    if (interaction?.type === 'drawing_room' && interaction.currentWorld) {
        const p1 = interaction.startWorld;
        const p3 = interaction.currentWorld;
        const p2 = { x: p3.x, y: p1.y };
        const p4 = { x: p1.x, y: p3.y };

        const w = Math.abs(p3.x - p1.x);
        const h = Math.abs(p3.y - p1.y);

        if (w > 5 || h > 5) { // Minimum size
            const newWalls: Wall[] = [];
            const commonProps = {
                material: MaterialType.CONCRETE,
                thickness: 0.15,
                height: 3,
                attenuation: MATERIAL_ATTENUATION[MaterialType.CONCRETE]
            };

            // Top
            newWalls.push({ id: Math.random().toString(36), start: p1, end: p2, ...commonProps });
            // Right
            newWalls.push({ id: Math.random().toString(36), start: p2, end: p3, ...commonProps });
            // Bottom
            newWalls.push({ id: Math.random().toString(36), start: p3, end: p4, ...commonProps });
            // Left
            newWalls.push({ id: Math.random().toString(36), start: p4, end: p1, ...commonProps });

            setWalls(prev => [...prev, ...newWalls]);
        }
    }

    // Create Single Line Wall
    if (interaction?.type === 'drawing_line' && interaction.currentWorld) {
        const pStart = interaction.startWorld;
        const pEnd = interaction.currentWorld;
        
        if (distance(pStart, pEnd) > 5) { // Minimum length in pixels
            const newWall: Wall = {
                id: Math.random().toString(36).substr(2, 9),
                start: pStart,
                end: pEnd,
                material: MaterialType.CONCRETE,
                thickness: 0.15,
                height: 3,
                attenuation: MATERIAL_ATTENUATION[MaterialType.CONCRETE]
            };
            setWalls(prev => [...prev, newWall]);
        }
    }

    setInteraction(null);
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (mode === '3D') return;
    e.stopPropagation();
    const scaleFactor = 0.1;
    setZoom(z => Math.max(0.1, Math.min(5, z - Math.sign(e.deltaY) * scaleFactor)));
  };

  const handleScaleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setManualScaleInput(e.target.value);
  };

  const handleScaleInputBlur = () => {
    const val = parseFloat(manualScaleInput);
    if (!isNaN(val) && val > 0) {
        setPixelsPerMeter(val);
    } else {
        setManualScaleInput(pixelsPerMeter.toFixed(2));
    }
  };

  const handleScaleInputKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
          handleScaleInputBlur();
      }
  };

  // --- UI Components ---

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Load image to get native dimensions
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    
    img.onload = () => {
        setBackgroundImage(objectUrl);
        setFloorSize({ width: img.naturalWidth, height: img.naturalHeight });
        setZoom(1);
        setPan({ x: 0, y: 0 });
    };
    img.src = objectUrl;
  };

  return (
    <div 
        className="flex h-screen w-screen bg-slate-900 text-slate-100 overflow-hidden"
        onContextMenu={(e) => e.preventDefault()}
    >
      {/* Sidebar */}
      <div className="w-64 bg-slate-800 border-r border-slate-700 flex flex-col z-20 shadow-xl flex-shrink-0 no-print">
        <div className="p-4 border-b border-slate-700">
            <h1 className="text-xl font-bold flex items-center gap-2 text-blue-400">
                <Wifi className="w-6 h-6" /> ELCOMP WiFi Heatmap Sim
            </h1>
        </div>

        <div className="p-4 flex-1 overflow-y-auto space-y-6">
            <div>
                <label className="text-xs font-semibold text-slate-400 uppercase mb-2 block">View</label>
                <div className="flex bg-slate-700 rounded p-1 mb-2">
                    <button onClick={() => setMode('2D')} className={`flex-1 py-1 text-sm rounded ${mode === '2D' ? 'bg-blue-600' : 'hover:text-blue-400'}`}>2D</button>
                    <button onClick={() => setMode('3D')} className={`flex-1 py-1 text-sm rounded ${mode === '3D' ? 'bg-emerald-600' : 'hover:text-emerald-400'}`}>3D</button>
                </div>
                
                <label className="text-xs font-semibold text-slate-400 uppercase mb-2 block">Visualize</label>
                <div className="flex bg-slate-700 rounded p-1">
                    <button onClick={() => setVizMode('signal')} className={`flex-1 py-1 text-xs rounded flex items-center justify-center gap-1 ${vizMode === 'signal' ? 'bg-emerald-600' : 'hover:text-emerald-400'}`}>
                        <Signal className="w-3 h-3" /> Signal
                    </button>
                    <button onClick={() => setVizMode('throughput')} className={`flex-1 py-1 text-xs rounded flex items-center justify-center gap-1 ${vizMode === 'throughput' ? 'bg-purple-600' : 'hover:text-purple-400'}`}>
                        <Gauge className="w-3 h-3" /> Speed
                    </button>
                </div>
            </div>

            {mode === '2D' && (
                <div>
                    <label className="text-xs font-semibold text-slate-400 uppercase mb-2 block">Tools</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setTool('select')} className={`p-2 rounded flex flex-col items-center justify-center text-xs border ${tool === 'select' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'}`}>
                            <MousePointer2 className="w-5 h-5 mb-1" /> Select
                        </button>
                        <button onClick={() => setTool('wall_room')} className={`p-2 rounded flex flex-col items-center justify-center text-xs border ${tool === 'wall_room' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'}`}>
                            <Box className="w-5 h-5 mb-1" /> Wall (Room)
                        </button>
                         <button onClick={() => setTool('wall_line')} className={`p-2 rounded flex flex-col items-center justify-center text-xs border ${tool === 'wall_line' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'}`}>
                            <PenTool className="w-5 h-5 mb-1" /> Wall (Line)
                        </button>
                        <button onClick={() => setTool('ap')} className={`p-2 rounded flex flex-col items-center justify-center text-xs border ${tool === 'ap' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'}`}>
                            <Plus className="w-5 h-5 mb-1" /> Add AP
                        </button>
                        <button onClick={() => setTool('scale')} className={`p-2 rounded flex flex-col items-center justify-center text-xs border ${tool === 'scale' ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'}`}>
                            <Ruler className="w-5 h-5 mb-1" /> Calibrate
                        </button>
                    </div>
                    
                    <button 
                        onClick={() => setSnappingEnabled(!snappingEnabled)}
                        className={`w-full flex items-center justify-center gap-2 text-sm p-2 rounded mt-2 transition-colors border ${snappingEnabled ? 'border-blue-500 bg-blue-900/20 text-blue-300' : 'border-slate-600 text-slate-400 hover:text-white hover:border-slate-500'}`}
                    >
                        <Magnet className="w-4 h-4" /> {snappingEnabled ? 'Snapping On' : 'Snapping Off'}
                    </button>

                    <p className="text-[10px] text-slate-500 mt-2 text-center">
                        Right-Click to Pan. <br/> Drag to draw walls.
                    </p>
                </div>
            )}

            <div>
                 <label className="text-xs font-semibold text-slate-400 uppercase mb-2 block">Project</label>
                 <label className="flex items-center gap-2 text-sm text-slate-300 hover:text-white cursor-pointer p-2 bg-slate-700/50 rounded mb-2">
                    <Upload className="w-4 h-4" /> Import Floor Plan
                    <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                 </label>
                 
                 <button onClick={() => setShowHeatmap(!showHeatmap)} className="w-full flex items-center gap-2 text-sm text-slate-300 hover:text-white p-2 bg-slate-700/50 rounded">
                     <Layers className="w-4 h-4" /> {showHeatmap ? 'Hide' : 'Show'} Heatmap
                 </button>
                 <button onClick={handleExport} className="w-full flex items-center gap-2 text-sm text-slate-300 hover:text-white p-2 bg-slate-700/50 rounded mt-2">
                     <Download className="w-4 h-4" /> Export Snapshot
                 </button>
                 <button onClick={() => { setWalls([]); setAccessPoints([]); }} className="w-full flex items-center gap-2 text-sm text-red-300 hover:text-red-100 p-2 bg-red-900/20 rounded mt-2">
                     <Trash className="w-4 h-4" /> Clear All
                 </button>
                 
                 <div className="mt-4 text-xs bg-slate-950 p-2 rounded border border-slate-700">
                    <label className="block text-slate-500 mb-1">Scale (px/m):</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="number" 
                            step="0.01"
                            className="w-full bg-slate-800 border border-slate-600 rounded px-2 py-1 text-emerald-400 font-mono text-center"
                            value={manualScaleInput}
                            onChange={handleScaleInputChange}
                            onBlur={handleScaleInputBlur}
                            onKeyDown={handleScaleInputKeyDown}
                        />
                    </div>
                 </div>
            </div>
        </div>
      </div>

      {/* Main Canvas */}
      <div className="flex-1 relative bg-slate-950 overflow-hidden print-container" onWheel={handleWheel}>
        
        {/* Zoom Controls (No Print) */}
        {mode === '2D' && (
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2 no-print">
                <button onClick={() => setZoom(z => Math.min(5, z + 0.1))} className="p-2 bg-slate-800 text-white rounded shadow hover:bg-slate-700"><ZoomIn className="w-5 h-5" /></button>
                <button onClick={() => setZoom(z => Math.max(0.1, z - 0.1))} className="p-2 bg-slate-800 text-white rounded shadow hover:bg-slate-700"><ZoomOut className="w-5 h-5" /></button>
            </div>
        )}

        {/* Export Button (Frame) */}
        <button onClick={handleExport} className="absolute top-4 right-4 z-10 p-2 bg-slate-800 text-white rounded shadow hover:bg-slate-700 no-print" title="Export Snapshot">
            <Download className="w-5 h-5" />
        </button>

        {/* Cursor Metric Tooltip */}
        {mode === '2D' && cursorMetric !== null && !interaction && (
            <div className="absolute top-4 left-16 z-10 bg-black/80 text-white px-2 py-1 rounded text-xs pointer-events-none border border-slate-600 flex items-center gap-2 shadow-xl no-print">
                {cursorMetric.unit === 'dBm' ? (
                    <Signal className="w-3 h-3 text-emerald-400" />
                ) : (
                    <Gauge className="w-3 h-3 text-purple-400" />
                )}
                <span className="font-mono">{cursorMetric.value.toFixed(1)} {cursorMetric.unit}</span>
            </div>
        )}

        {/* 2D Canvas */}
        <div ref={canvasRef} className="w-full h-full relative cursor-crosshair">
            {mode === '2D' ? (
                <div 
                    className="origin-top-left"
                    style={{ 
                        width: floorSize.width,
                        height: floorSize.height,
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` 
                    }}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {backgroundImage && <img src={backgroundImage} className="absolute top-0 left-0 w-full h-full opacity-40 pointer-events-none select-none" />}
                    
                    {/* Grid Pattern Background (Visible in Wall Tools) */}
                    {(tool === 'wall_room' || tool === 'wall_line') && (
                        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
                            <defs>
                                <pattern id="grid" width={pixelsPerMeter} height={pixelsPerMeter} patternUnits="userSpaceOnUse">
                                    <path d={`M ${pixelsPerMeter} 0 L 0 0 0 ${pixelsPerMeter}`} fill="none" stroke="white" strokeWidth="0.5"/>
                                </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#grid)" />
                        </svg>
                    )}

                    {showHeatmap && floorSize.width > 0 && (
                        <HeatmapCanvas 
                            walls={walls} accessPoints={accessPoints} 
                            width={floorSize.width} height={floorSize.height} 
                            scale={pixelsPerMeter} resolution={8} opacity={0.6}
                            mode={vizMode}
                        />
                    )}

                    <svg className="absolute top-0 left-0 w-full h-full pointer-events-none">
                        {/* Walls */}
                        {walls.map(wall => (
                            <g key={wall.id}>
                                <line 
                                    x1={wall.start.x} y1={wall.start.y} 
                                    x2={wall.end.x} y2={wall.end.y} 
                                    stroke={selectedObject?.id === wall.id ? "#3b82f6" : "#94a3b8"} 
                                    strokeWidth={wall.thickness * pixelsPerMeter} 
                                    strokeLinecap="round"
                                />
                                {selectedObject?.id === wall.id && (
                                    <>
                                        {/* Selection Handles */}
                                        <circle cx={wall.start.x} cy={wall.start.y} r="4" fill="white" stroke="#3b82f6" />
                                        <circle cx={wall.end.x} cy={wall.end.y} r="4" fill="white" stroke="#3b82f6" />
                                    </>
                                )}
                            </g>
                        ))}

                        {/* Drawing Room Preview */}
                        {interaction?.type === 'drawing_room' && interaction.currentWorld && (
                            <g>
                                <rect 
                                    x={Math.min(interaction.startWorld.x, interaction.currentWorld.x)}
                                    y={Math.min(interaction.startWorld.y, interaction.currentWorld.y)}
                                    width={Math.abs(interaction.currentWorld.x - interaction.startWorld.x)}
                                    height={Math.abs(interaction.currentWorld.y - interaction.startWorld.y)}
                                    fill="rgba(59, 130, 246, 0.1)"
                                    stroke="#3b82f6"
                                    strokeWidth={0.15 * pixelsPerMeter} // Show approximate thickness
                                    strokeDasharray="5,5"
                                />
                                {/* Dimensions Label */}
                                <text 
                                    x={Math.min(interaction.startWorld.x, interaction.currentWorld.x)} 
                                    y={Math.min(interaction.startWorld.y, interaction.currentWorld.y) - 10} 
                                    fill="#3b82f6" fontSize="12" fontWeight="bold"
                                    style={{ textShadow: '0px 1px 2px black' }}
                                >
                                    {(Math.abs(interaction.currentWorld.x - interaction.startWorld.x) / pixelsPerMeter).toFixed(2)}m x {(Math.abs(interaction.currentWorld.y - interaction.startWorld.y) / pixelsPerMeter).toFixed(2)}m
                                </text>
                            </g>
                        )}

                        {/* Drawing Line Preview */}
                        {interaction?.type === 'drawing_line' && interaction.currentWorld && (
                            <g>
                                <line 
                                    x1={interaction.startWorld.x} y1={interaction.startWorld.y}
                                    x2={interaction.currentWorld.x} y2={interaction.currentWorld.y}
                                    stroke="#3b82f6"
                                    strokeWidth={0.15 * pixelsPerMeter}
                                    strokeDasharray="5,5"
                                    strokeLinecap="round"
                                />
                                {/* Length Label */}
                                <text 
                                    x={interaction.currentWorld.x + 10} 
                                    y={interaction.currentWorld.y} 
                                    fill="#3b82f6" fontSize="12" fontWeight="bold"
                                    style={{ textShadow: '0px 1px 2px black' }}
                                >
                                    {(distance(interaction.startWorld, interaction.currentWorld) / pixelsPerMeter).toFixed(2)}m
                                </text>
                            </g>
                        )}

                        {/* Access Points */}
                        {accessPoints.map(ap => (
                            <g key={ap.id} transform={`translate(${ap.position.x}, ${ap.position.y})`}>
                                {/* Range/Direction hint */}
                                {ap.antennaType === AntennaType.DIRECTIONAL && (
                                     <path 
                                        d={`M 0 0 L 50 -15 A 60 60 0 0 1 50 15 Z`} 
                                        fill={ap.color} fillOpacity="0.1" 
                                        stroke={ap.color} strokeOpacity="0.3"
                                        transform={`rotate(${ap.rotation})`}
                                     />
                                )}
                                
                                <circle r="15" fill={ap.color} fillOpacity={selectedObject?.id === ap.id ? "0.8" : "0.5"} stroke="white" strokeWidth="2" />
                                <Wifi className="text-white w-4 h-4" x="-8" y="-8" />
                                
                                {selectedObject?.id === ap.id && (
                                    <g>
                                        <circle r="22" fill="none" stroke="#3b82f6" strokeWidth="1" strokeDasharray="4 2" />
                                        {/* Rotate Handle */}
                                        <circle cx="25" cy="-25" r="8" fill="#3b82f6" />
                                        <RefreshCcw x="19" y="-31" className="w-3 h-3 text-white" />
                                    </g>
                                )}
                                <text y="-25" textAnchor="middle" fill="white" fontSize="10" className="drop-shadow-md">{ap.name}</text>
                            </g>
                        ))}

                        {/* Calibration Line */}
                        {tempScaleLine && (
                            <g>
                                <line 
                                    x1={tempScaleLine.start.x} y1={tempScaleLine.start.y}
                                    x2={tempScaleLine.end.x} y2={tempScaleLine.end.y}
                                    stroke="#ef4444" strokeWidth="2"
                                />
                                <text x={tempScaleLine.end.x + 10} y={tempScaleLine.end.y} fill="#ef4444" fontSize="12">
                                    {distance(tempScaleLine.start, tempScaleLine.end).toFixed(0)} px
                                </text>
                                <text x={tempScaleLine.end.x + 10} y={tempScaleLine.end.y + 15} fill="#ef4444" fontSize="10">Release to set scale</text>
                            </g>
                        )}
                    </svg>
                </div>
            ) : (
                <Viewer3D 
                    walls={walls} 
                    accessPoints={accessPoints} 
                    width={viewportSize.width} 
                    height={viewportSize.height}
                    floorWidth={floorSize.width}
                    floorHeight={floorSize.height} 
                    pixelsPerMeter={pixelsPerMeter}
                    mode={vizMode}
                    onUpdateAP={(id, pos) => {
                         setAccessPoints(prev => prev.map(ap => 
                            ap.id === id ? { ...ap, position: { x: pos.x, y: pos.y }, altitude: pos.z } : ap
                         ));
                    }}
                />
            )}
        </div>

        {/* Property Panel (No Print) */}
        <div className="no-print">
            <PropertyPanel 
                selectedObject={selectedObject}
                walls={walls} accessPoints={accessPoints}
                onUpdateWall={(id, u) => setWalls(prev => prev.map(w => w.id === id ? { ...w, ...u } : w))}
                onUpdateAP={(id, u) => setAccessPoints(prev => prev.map(a => a.id === id ? { ...a, ...u } : a))}
                onDelete={() => {
                    if (selectedObject?.type === 'wall') setWalls(prev => prev.filter(w => w.id !== selectedObject.id));
                    if (selectedObject?.type === 'ap') setAccessPoints(prev => prev.filter(a => a.id !== selectedObject.id));
                    setSelectedObject(null);
                }}
                onClose={() => setSelectedObject(null)}
            />
        </div>
      </div>
    </div>
  );
}
