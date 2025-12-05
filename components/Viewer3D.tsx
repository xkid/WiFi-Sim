
import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { TransformControls } from 'three/examples/jsm/controls/TransformControls';
import { Wall, AccessPoint, AntennaType, VisualizationMode } from '../types';
import { calculateSignal, signalToRGB, calculateFreeSpaceRange, calculateThroughput, throughputToRGB } from '../signalUtils';

interface Viewer3DProps {
  walls: Wall[];
  accessPoints: AccessPoint[];
  width: number; // Viewport Width
  height: number; // Viewport Height
  floorWidth: number; // Actual floor plan width
  floorHeight: number; // Actual floor plan height
  pixelsPerMeter: number;
  mode: VisualizationMode;
  onUpdateAP?: (id: string, position: { x: number, y: number, z: number }) => void;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({ walls, accessPoints, width, height, floorWidth, floorHeight, pixelsPerMeter, mode, onUpdateAP }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const transformControlsRef = useRef<TransformControls | null>(null);
  
  // Keep track of meshes to map back to data
  const apMeshesRef = useRef<Map<THREE.Object3D, string>>(new Map());

  // Helper to safely add objects to scene/group
  const safeAdd = (parent: THREE.Object3D, child: any) => {
      if (child && child.isObject3D) {
          parent.add(child);
      } else {
          console.warn("Viewer3D: Attempted to add invalid object:", child);
      }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    // Safety check for scale
    const scale = Math.max(0.1, pixelsPerMeter);

    // --- Scene Setup ---
    const scene = new THREE.Scene();
    sceneRef.current = scene;
    scene.background = new THREE.Color(0x0f172a); 

    // Camera - Use viewport aspect ratio (width/height)
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 5000);
    const maxDim = Math.max(floorWidth, floorHeight);
    // Center camera on the floor plan
    camera.position.set(floorWidth / 2, -floorHeight / 1.5, maxDim * 0.8);
    camera.lookAt(floorWidth / 2, floorHeight / 2, 0);
    camera.up.set(0, 0, 1);
    cameraRef.current = camera;

    // Renderer - Use Viewport Size
    // preserveDrawingBuffer is required for window.print() and export image
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setSize(width, height);
    renderer.domElement.id = 'canvas-3d'; // Add ID for export
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Orbit Controls
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.05;
    orbit.target.set(floorWidth / 2, floorHeight / 2, 0);
    controlsRef.current = orbit;

    // Transform Controls (Movement)
    // We wrap this in a try-catch and check structure to be safe
    try {
        const transform = new TransformControls(camera, renderer.domElement);
        transform.addEventListener('dragging-changed', (event) => {
            orbit.enabled = !event.value;
        });
        // Update React state when drag ends
        transform.addEventListener('change', () => {
            if (transform.object && onUpdateAP) {
                const mesh = transform.object;
                const apId = apMeshesRef.current.get(mesh);
                if (apId) {
                    // Convert back from 3D coords to Data Coords
                    // Z in 3D is pixels. altitude is meters.
                    onUpdateAP(apId, {
                        x: mesh.position.x,
                        y: mesh.position.y,
                        z: mesh.position.z / scale // px -> meters
                    });
                }
            }
        });
        
        // Only add if it's a valid Object3D (TransformControls extends Object3D)
        safeAdd(scene, transform);
        transformControlsRef.current = transform;
    } catch (e) {
        console.error("Error initializing TransformControls:", e);
    }

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    safeAdd(scene, ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, -100, 200);
    safeAdd(scene, dirLight);

    // Grid - Sized to Floor Plan
    const gridHelper = new THREE.GridHelper(maxDim * 2, 50, 0x1e293b, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(floorWidth/2, floorHeight/2, -0.5);
    safeAdd(scene, gridHelper);

    // --- Interaction ---
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const onClick = (event: MouseEvent) => {
        const rect = renderer.domElement.getBoundingClientRect();
        mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        raycaster.setFromCamera(mouse, camera);
        const intersectable: THREE.Object3D[] = [];
        apMeshesRef.current.forEach((_, mesh) => intersectable.push(mesh));
        
        const intersects = raycaster.intersectObjects(intersectable, true); // recursive for groups
        
        if (intersects.length > 0 && transformControlsRef.current) {
            // Find root group
            let target = intersects[0].object;
            while(target.parent && !apMeshesRef.current.has(target)) {
                target = target.parent;
            }
            if (apMeshesRef.current.has(target)) {
                transformControlsRef.current.attach(target);
            }
        } else if (transformControlsRef.current) {
            transformControlsRef.current.detach();
        }
    };
    renderer.domElement.addEventListener('pointerdown', onClick);

    // Animation
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      orbit.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      renderer.domElement.removeEventListener('pointerdown', onClick);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      if (transformControlsRef.current) transformControlsRef.current.dispose();
    };
  }, []); // Only run once on mount for scene init

  // --- Dynamic Content Updates ---
  // We use a separate effect to update meshes without recreating the scene
  useEffect(() => {
    if (!sceneRef.current) return;
    const scene = sceneRef.current;
    const transform = transformControlsRef.current;
    
    // Clear old AP meshes (but keep other stuff)
    const objectsToRemove: THREE.Object3D[] = [];
    scene.traverse((child) => {
        if (child.userData.isAP || child.userData.isWall || child.userData.isFloor) {
            objectsToRemove.push(child);
        }
    });
    objectsToRemove.forEach(obj => {
        if (transform && transform.object === obj) transform.detach();
        scene.remove(obj);
    });

    apMeshesRef.current.clear();

    const scale = Math.max(0.1, pixelsPerMeter);

    // --- 1. Render Walls ---
    walls.forEach(wall => {
      const wHeight = (wall.height || 3);
      const wThick = (wall.thickness || 0.15);
      
      const length = Math.sqrt(Math.pow(wall.end.x - wall.start.x, 2) + Math.pow(wall.end.y - wall.start.y, 2));
      const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
      
      const wallHeightPx = wHeight * scale; 
      const wallThicknessPx = wThick * scale; // Full thickness

      if (length <= 0 || isNaN(length)) return;

      const geometry = new THREE.BoxGeometry(length, wallThicknessPx, wallHeightPx); 
      const loss = wall.attenuation || 10;
      const grayScale = Math.max(0.1, 0.8 - (loss / 30));
      const color = new THREE.Color().setScalar(grayScale);
      
      const material = new THREE.MeshStandardMaterial({ 
        color: color, 
        transparent: true, 
        opacity: 0.9,
        roughness: 0.5
      });
      
      const mesh = new THREE.Mesh(geometry, material);
      const centerX = (wall.start.x + wall.end.x) / 2;
      const centerY = (wall.start.y + wall.end.y) / 2;
      
      mesh.position.set(centerX, centerY, wallHeightPx / 2);
      mesh.rotation.z = angle;
      mesh.userData.isWall = true;
      
      safeAdd(scene, mesh);
    });

    // --- 2. Render Access Points ---
    accessPoints.forEach(ap => {
      const apAltitudePx = (ap.altitude || 2.5) * scale;

      // Group for AP
      const apGroup = new THREE.Group();
      apGroup.position.set(ap.position.x, ap.position.y, apAltitudePx);
      apGroup.userData.isAP = true;

      // AP Body
      const geometry = new THREE.CylinderGeometry(8, 8, 4, 32);
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x10b981, 
        emissive: 0x10b981,
        emissiveIntensity: 0.5
      });
      const body = new THREE.Mesh(geometry, material);
      body.rotation.x = Math.PI / 2; 
      safeAdd(apGroup, body);
      
      // Antenna / Direction Indicator
      if (ap.antennaType === AntennaType.DIRECTIONAL) {
          const coneGeo = new THREE.ConeGeometry(6, 20, 16);
          const coneMat = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.7, transparent: true });
          const cone = new THREE.Mesh(coneGeo, coneMat);
          
          cone.rotation.z = -Math.PI / 2;
          cone.position.set(15, 0, 0);

          const rotator = new THREE.Group();
          safeAdd(rotator, cone);
          rotator.rotation.z = (ap.rotation || 0) * (Math.PI / 180);
          
          safeAdd(body, rotator);
      } else {
         const sphereGeo = new THREE.SphereGeometry(10, 16, 16);
         const sphereMat = new THREE.MeshBasicMaterial({ 
             color: 0x10b981, 
             transparent: true, 
             opacity: 0.3, 
             wireframe: true
         });
         const sphere = new THREE.Mesh(sphereGeo, sphereMat);
         safeAdd(body, sphere);
      }

      // --- Signal Sphere Visualization ---
      // Estimate range where signal > -75dBm
      const rangeMeters = calculateFreeSpaceRange(
          ap.txPower || 20, 
          ap.frequency || 5, 
          -75, 
          ap.antennaGain || 0, 
          ap.cableLoss || 0
      );
      // Validate range to prevent NaN or infinite geometries
      const safeRangeMeters = isFinite(rangeMeters) && rangeMeters > 0 ? rangeMeters : 1;
      const rangePx = safeRangeMeters * scale;
      
      const signalGeo = new THREE.SphereGeometry(rangePx, 32, 32);
      const signalMat = new THREE.MeshBasicMaterial({
          color: 0x10b981,
          transparent: true,
          opacity: 0.1,
          wireframe: true,
          depthWrite: false
      });
      const signalSphere = new THREE.Mesh(signalGeo, signalMat);
      // signalSphere is centered on the AP
      safeAdd(apGroup, signalSphere);

      // Pole Line (visual guide to floor)
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, -apAltitudePx)
      ]);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x64748b, transparent: true, opacity: 0.5 });
      const line = new THREE.Line(lineGeo, lineMat);
      safeAdd(apGroup, line);

      safeAdd(scene, apGroup);
      apMeshesRef.current.set(apGroup, ap.id);
    });

    // --- 3. Heatmap Floor ---
    if (accessPoints.length > 0) {
        try {
            const res = 20; // Lower resolution for performance in 3D
            const segW = Math.max(1, Math.floor(floorWidth / res));
            const segH = Math.max(1, Math.floor(floorHeight / res));
            
            const floorGeo = new THREE.PlaneGeometry(floorWidth, floorHeight, segW, segH);
            const count = floorGeo.attributes.position.count;
            const colors: number[] = [];

            for (let i = 0; i < count; i++) {
                const vx = floorGeo.attributes.position.getX(i); 
                const vy = floorGeo.attributes.position.getY(i);
                
                const worldX = vx + floorWidth / 2;
                const worldY = vy + floorHeight / 2;
                
                let bestMetric = -Infinity;
                const pt = { x: worldX, y: worldY };
                
                let rgb: [number, number, number] = [0.1, 0.1, 0.1];

                if (mode === 'signal') {
                    for (const ap of accessPoints) {
                        const signal = calculateSignal(
                            ap.position,
                            pt,
                            ap.txPower || 20,
                            ap.antennaGain || 0,
                            ap.cableLoss || 0,
                            ap.frequency || 2.4,
                            walls,
                            scale,
                            ap.antennaType || AntennaType.OMNI,
                            ap.rotation || 0,
                            ap.beamwidth || 360,
                            ap.altitude || 2.5, 
                            1.0 
                        );
                        if (signal > bestMetric) bestMetric = signal;
                    }
                    rgb = signalToRGB(bestMetric);
                } else {
                    // Throughput
                    for (const ap of accessPoints) {
                        const signal = calculateSignal(
                            ap.position,
                            pt,
                            ap.txPower || 20,
                            ap.antennaGain || 0,
                            ap.cableLoss || 0,
                            ap.frequency || 2.4,
                            walls,
                            scale,
                            ap.antennaType || AntennaType.OMNI,
                            ap.rotation || 0,
                            ap.beamwidth || 360,
                            ap.altitude || 2.5, 
                            1.0 
                        );
                        const tp = calculateThroughput(signal, ap.wifiStandard, ap.channelWidth || 40);
                        if (tp > bestMetric) bestMetric = tp;
                    }
                    rgb = throughputToRGB(bestMetric);
                }

                colors.push(...rgb);
            }

            floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

            const floorMat = new THREE.MeshBasicMaterial({ 
                vertexColors: true, 
                transparent: true, 
                opacity: 0.6,
                side: THREE.DoubleSide,
                depthWrite: false 
            });
            const floorMesh = new THREE.Mesh(floorGeo, floorMat);
            floorMesh.position.set(floorWidth/2, floorHeight/2, 0); 
            floorMesh.userData.isFloor = true;
            safeAdd(scene, floorMesh);
        } catch (e) {
            console.error("Error generating 3D heatmap:", e);
        }
    }

  }, [walls, accessPoints, floorWidth, floorHeight, pixelsPerMeter, mode]);

  return <div ref={containerRef} className="w-full h-full cursor-move bg-slate-900" />;
};
