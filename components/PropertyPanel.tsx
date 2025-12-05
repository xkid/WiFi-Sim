import React from 'react';
import { Wall, AccessPoint, MaterialType, AntennaType } from '../types';
import { MATERIAL_ATTENUATION, MOXA_PRODUCTS } from '../constants';
import { X, Trash2, Info } from 'lucide-react';

interface PropertyPanelProps {
  selectedObject: { type: 'wall' | 'ap', id: string } | null;
  walls: Wall[];
  accessPoints: AccessPoint[];
  onUpdateWall: (id: string, updates: Partial<Wall>) => void;
  onUpdateAP: (id: string, updates: Partial<AccessPoint>) => void;
  onDelete: () => void;
  onClose: () => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({
  selectedObject,
  walls,
  accessPoints,
  onUpdateWall,
  onUpdateAP,
  onDelete,
  onClose
}) => {
  if (!selectedObject) return null;

  const isWall = selectedObject.type === 'wall';
  const object = isWall 
    ? walls.find(w => w.id === selectedObject.id)
    : accessPoints.find(ap => ap.id === selectedObject.id);

  if (!object) return null;

  return (
    <div 
        className="absolute top-4 right-4 w-72 bg-slate-800 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-40 animate-in slide-in-from-right fade-in duration-200"
        onWheel={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between p-3 bg-slate-900 border-b border-slate-700">
        <h3 className="font-semibold text-white text-sm">
          {isWall ? 'Wall Properties' : 'Access Point Properties'}
        </h3>
        <button onClick={onClose} className="text-slate-400 hover:text-white">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 space-y-4 max-h-[80vh] overflow-y-auto">
        {isWall ? (
          <>
            <div>
              <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Material</label>
              <select 
                value={(object as Wall).material}
                onChange={(e) => {
                  const mat = e.target.value as MaterialType;
                  onUpdateWall(object.id, { 
                    material: mat, 
                    attenuation: MATERIAL_ATTENUATION[mat] 
                  });
                }}
                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
              >
                {Object.values(MaterialType).map(m => (
                  <option key={m} value={m}>{m} (-{MATERIAL_ATTENUATION[m]}dB)</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Attenuation (dB)</label>
              <input 
                type="number"
                value={(object as Wall).attenuation}
                onChange={(e) => onUpdateWall(object.id, { attenuation: Number(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Height (m) (3D)</label>
                  <input 
                    type="number"
                    value={(object as Wall).height}
                    onChange={(e) => onUpdateWall(object.id, { height: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Thickness (m)</label>
                  <input 
                    type="number"
                    step="0.05"
                    value={(object as Wall).thickness}
                    onChange={(e) => onUpdateWall(object.id, { thickness: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                  />
                </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Name</label>
              <input 
                type="text"
                value={(object as AccessPoint).name}
                onChange={(e) => onUpdateAP(object.id, { name: e.target.value })}
                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 uppercase font-bold block mb-1">WiFi Standard</label>
              <select 
                value={(object as AccessPoint).wifiStandard}
                onChange={(e) => onUpdateAP(object.id, { wifiStandard: e.target.value as any })}
                className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
              >
                <option value="802.11n">802.11n (Wi-Fi 4)</option>
                <option value="802.11ac">802.11ac (Wi-Fi 5)</option>
                <option value="802.11ax">802.11ax (Wi-Fi 6)</option>
                <option value="802.11be">802.11be (Wi-Fi 7)</option>
              </select>
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Tx Power (dBm)</label>
                  <input 
                    type="number"
                    value={(object as AccessPoint).txPower}
                    onChange={(e) => onUpdateAP(object.id, { txPower: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                  />
                </div>
                 <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Freq (GHz)</label>
                  <select 
                    value={(object as AccessPoint).frequency}
                    onChange={(e) => onUpdateAP(object.id, { frequency: Number(e.target.value) as 2.4 | 5 })}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                  >
                    <option value={2.4}>2.4</option>
                    <option value={5}>5.0</option>
                  </select>
                </div>
            </div>

            <div>
                 <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Channel Width (MHz)</label>
                 <select 
                   value={(object as AccessPoint).channelWidth}
                   onChange={(e) => onUpdateAP(object.id, { channelWidth: Number(e.target.value) as any })}
                   className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                 >
                   <option value={20}>20 MHz</option>
                   <option value={40}>40 MHz</option>
                   <option value={80}>80 MHz</option>
                   <option value={160}>160 MHz</option>
                 </select>
            </div>

            <div>
                <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Altitude (m)</label>
                <input 
                    type="number" step="0.5"
                    value={(object as AccessPoint).altitude || 2.5}
                    onChange={(e) => onUpdateAP(object.id, { altitude: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                />
            </div>
            
            <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Ant. Gain (dBi)</label>
                  <input 
                    type="number"
                    value={(object as AccessPoint).antennaGain}
                    onChange={(e) => onUpdateAP(object.id, { antennaGain: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 uppercase font-bold block mb-1">Cable Loss (dB)</label>
                  <input 
                    type="number"
                    value={(object as AccessPoint).cableLoss}
                    onChange={(e) => onUpdateAP(object.id, { cableLoss: Number(e.target.value) })}
                    className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-sm"
                  />
                </div>
            </div>

            <div className="bg-slate-700/30 p-2 rounded border border-slate-700/50">
                <div className="flex items-center gap-2 mb-2">
                    <Info className="w-3 h-3 text-emerald-400" />
                    <label className="text-xs text-emerald-400 uppercase font-bold">Calculated EIRP (dBm)</label>
                </div>
                <div className="text-lg font-mono text-center">
                    {((object as AccessPoint).txPower + (object as AccessPoint).antennaGain - (object as AccessPoint).cableLoss).toFixed(2)}
                </div>
            </div>

            <div className="bg-slate-700/30 p-2 rounded">
                <label className="text-xs text-blue-400 uppercase font-bold block mb-2">Antenna Pattern</label>
                
                <div className="mb-2">
                    <label className="text-[10px] text-slate-400 block mb-1">Type</label>
                    <select 
                        value={(object as AccessPoint).antennaType}
                        onChange={(e) => onUpdateAP(object.id, { antennaType: e.target.value as AntennaType })}
                        className="w-full bg-slate-900 border border-slate-600 rounded p-2 text-xs"
                    >
                        {Object.values(AntennaType).map(t => (
                        <option key={t} value={t}>{t}</option>
                        ))}
                    </select>
                </div>

                <div className="mb-2">
                     <label className="text-[10px] text-slate-400 block mb-1">Rotation ({Math.round((object as AccessPoint).rotation)}°)</label>
                     <input 
                        type="range" min="0" max="360"
                        value={(object as AccessPoint).rotation}
                        onChange={(e) => onUpdateAP(object.id, { rotation: Number(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-600 rounded appearance-none"
                     />
                </div>

                <div>
                     <label className="text-[10px] text-slate-400 block mb-1">Beamwidth ({(object as AccessPoint).beamwidth}°)</label>
                     <input 
                        type="range" min="10" max="360"
                        value={(object as AccessPoint).beamwidth}
                        onChange={(e) => onUpdateAP(object.id, { beamwidth: Number(e.target.value) })}
                        className="w-full accent-emerald-500 h-1 bg-slate-600 rounded appearance-none"
                     />
                </div>
            </div>
          </>
        )}

        <div className="pt-4 border-t border-slate-700">
             <button 
                onClick={onDelete}
                className="w-full flex items-center justify-center gap-2 bg-red-500/10 border border-red-500/50 hover:bg-red-500/20 text-red-400 py-2 rounded text-sm transition-colors"
             >
                <Trash2 className="w-4 h-4" /> Delete {isWall ? 'Wall' : 'AP'}
             </button>
        </div>
      </div>
    </div>
  );
};