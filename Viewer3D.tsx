

import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import { Wall, AccessPoint, AntennaType } from '../types';
import { calculateSignal, signalToRGB } from '../signalUtils';

interface Viewer3DProps {
  walls: Wall[];
  accessPoints: AccessPoint[];
  width: number;
  height: number;
  pixelsPerMeter: number;
}

export const Viewer3D: React.FC<Viewer3DProps> = ({ walls, accessPoints, width, height, pixelsPerMeter }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (!containerRef.current) return;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a); // Match slate-900

    // Camera
    const camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 5000);
    // Position camera to see the whole floor plan
    camera.position.set(width / 2, -height / 1.5, Math.max(width, height) * 0.8);
    camera.lookAt(width / 2, height / 2, 0);
    camera.up.set(0, 0, 1); // Z is up

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(width, height);
    containerRef.current.appendChild(renderer.domElement);

    // Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(width / 2, height / 2, 0);

    // Lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dirLight.position.set(0, -100, 200);
    scene.add(dirLight);

    // Grid Helper
    const gridHelper = new THREE.GridHelper(Math.max(width, height) * 2, 50, 0x1e293b, 0x1e293b);
    gridHelper.rotation.x = Math.PI / 2;
    gridHelper.position.set(width/2, height/2, -1);
    scene.add(gridHelper);

    // --- 3D Heatmap Floor ---
    if (accessPoints.length > 0) {
        const res = 15; // Lower resolution for performance in 3D
        const segW = Math.floor(width / res);
        const segH = Math.floor(height / res);
        
        const floorGeo = new THREE.PlaneGeometry(width, height, segW, segH);
        const count = floorGeo.attributes.position.count;
        const colors: number[] = [];

        // Center offset for PlaneGeometry
        for (let i = 0; i < count; i++) {
            const vx = floorGeo.attributes.position.getX(i); 
            const vy = floorGeo.attributes.position.getY(i);
            
            // Transform to world coords for signal calc
            const worldX = vx + width / 2;
            const worldY = vy + height / 2;
            
            let maxSignal = -120;
            const pt = { x: worldX, y: worldY };
            
            for (const ap of accessPoints) {
                const signal = calculateSignal(
                    ap.position,
                    pt,
                    ap.txPower,
                    ap.antennaGain,
                    ap.cableLoss,
                    ap.frequency,
                    walls,
                    pixelsPerMeter,
                    ap.antennaType,
                    ap.rotation,
                    ap.beamwidth
                );
                if (signal > maxSignal) maxSignal = signal;
            }

            const rgb = signalToRGB(maxSignal);
            colors.push(...rgb);
        }

        floorGeo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const floorMat = new THREE.MeshBasicMaterial({ 
            vertexColors: true, 
            transparent: true, 
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const floorMesh = new THREE.Mesh(floorGeo, floorMat);
        floorMesh.position.set(width/2, height/2, 0.5); 
        scene.add(floorMesh);
    }

    // Render Walls
    walls.forEach(wall => {
      const length = Math.sqrt(
        Math.pow(wall.end.x - wall.start.x, 2) + Math.pow(wall.end.y - wall.start.y, 2)
      );
      const angle = Math.atan2(wall.end.y - wall.start.y, wall.end.x - wall.start.x);
      
      // Convert wall height from meters to pixels using scale
      const wallHeightPx = wall.height * pixelsPerMeter; 
      
      const geometry = new THREE.BoxGeometry(length, wall.thickness * pixelsPerMeter * 2, wallHeightPx); 
      
      const loss = wall.attenuation;
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
      
      scene.add(mesh);
    });

    // Render Access Points
    accessPoints.forEach(ap => {
      const apHeight = 2.5 * pixelsPerMeter; // Default AP height ~2.5m

      // AP Body
      const geometry = new THREE.CylinderGeometry(8, 8, 4, 32);
      const material = new THREE.MeshStandardMaterial({ 
        color: 0x10b981, 
        emissive: 0x10b981,
        emissiveIntensity: 0.5
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.rotation.x = Math.PI / 2; 
      mesh.position.set(ap.position.x, ap.position.y, apHeight);
      
      // Antenna / Direction Indicator
      if (ap.antennaType === AntennaType.DIRECTIONAL) {
          // Cone to show direction
          const coneGeo = new THREE.ConeGeometry(6, 20, 16);
          const coneMat = new THREE.MeshBasicMaterial({ color: 0xffff00, opacity: 0.7, transparent: true });
          const cone = new THREE.Mesh(coneGeo, coneMat);
          
          // Rotate cone to point along X axis first
          cone.rotation.z = -Math.PI / 2;
          cone.position.set(15, 0, 0);

          // Wrapper for rotation
          const rotator = new THREE.Group();
          rotator.add(cone);
          rotator.rotation.z = ap.rotation * (Math.PI / 180);
          
          mesh.add(rotator);
      } else {
         // Omni Sphere
         const sphereGeo = new THREE.SphereGeometry(10, 16, 16);
         const sphereMat = new THREE.MeshBasicMaterial({ 
             color: 0x10b981, 
             transparent: true, 
             opacity: 0.3,
             wireframe: true
         });
         const sphere = new THREE.Mesh(sphereGeo, sphereMat);
         mesh.add(sphere);
      }

      scene.add(mesh);
      
      // Pole/Mount
      const poleGeo = new THREE.CylinderGeometry(1, 1, apHeight, 8);
      const poleMat = new THREE.MeshBasicMaterial({ color: 0x64748b });
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.rotation.x = Math.PI / 2;
      pole.position.set(ap.position.x, ap.position.y, apHeight/2);
      scene.add(pole);
    });

    // Animation Loop
    let animationId: number;
    const animate = () => {
      animationId = requestAnimationFrame(animate);
      controls.update();
      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationId);
      if (containerRef.current) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [walls, accessPoints, width, height, pixelsPerMeter]);

  return <div ref={containerRef} className="w-full h-full cursor-move bg-slate-900" />;
};
