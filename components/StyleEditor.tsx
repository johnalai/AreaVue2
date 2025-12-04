
import React, { useState } from 'react';
import { Card, Button } from './UIComponents';
import { PointType, StyleConfiguration, MarkerShape } from '../types';

interface StyleEditorProps {
  config: StyleConfiguration;
  onUpdate: (newConfig: StyleConfiguration) => void;
  onClose: () => void;
}

export const StyleEditor: React.FC<StyleEditorProps> = ({ config, onUpdate, onClose }) => {
  const [activeType, setActiveType] = useState<PointType>(PointType.GPS);

  const handleChange = (key: keyof typeof config[PointType], value: any) => {
    onUpdate({
      ...config,
      [activeType]: {
        ...config[activeType],
        [key]: value
      }
    });
  };

  const currentStyle = config[activeType];

  return (
    <Card title="Point Style Editor" onClose={onClose} className="w-full max-w-sm absolute top-20 right-4 z-[1000]">
      <div className="space-y-4">
        {/* Type Selector */}
        <div className="flex overflow-x-auto gap-2 pb-2 custom-scrollbar">
          {Object.values(PointType).map((type) => (
            <button
              key={type}
              onClick={() => setActiveType(type)}
              className={`px-3 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors border ${
                activeType === type
                  ? 'bg-blue-600 border-blue-500 text-white'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Controls */}
        <div className="bg-slate-800/50 p-4 rounded-xl border border-slate-700 space-y-4">
          
          {/* Color Picker */}
          <div>
            <label className="text-xs text-slate-400 font-bold uppercase block mb-2">Color</label>
            <div className="flex gap-2 items-center">
              <input 
                type="color" 
                value={typeof currentStyle.color === 'string' ? currentStyle.color : '#3b82f6'} 
                onChange={(e) => handleChange('color', e.target.value)}
                className="w-10 h-10 rounded cursor-pointer bg-transparent border-0 p-0"
              />
              <span className="text-xs font-mono text-slate-300">
                {typeof currentStyle.color === 'string' ? currentStyle.color.toUpperCase() : 'INVALID'}
              </span>
            </div>
          </div>

          {/* Shape Selector */}
          <div>
            <label className="text-xs text-slate-400 font-bold uppercase block mb-2">Shape</label>
            <div className="grid grid-cols-3 gap-2">
              {(['circle', 'square', 'rounded'] as MarkerShape[]).map((shape) => (
                <button
                  key={shape}
                  onClick={() => handleChange('shape', shape)}
                  className={`p-2 rounded border flex flex-col items-center gap-1 transition-all ${
                    currentStyle.shape === shape
                      ? 'bg-blue-900/30 border-blue-500 text-white'
                      : 'bg-slate-700/50 border-slate-600 text-slate-400 hover:bg-slate-700'
                  }`}
                >
                  <div 
                    style={{ backgroundColor: typeof currentStyle.color === 'string' ? currentStyle.color : '#ccc' }} 
                    className={`w-4 h-4 ${
                      shape === 'circle' ? 'rounded-full' : shape === 'rounded' ? 'rounded-md' : 'rounded-none'
                    }`}
                  />
                  <span className="text-[10px] capitalize">{shape}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Size Slider */}
          <div>
            <label className="text-xs text-slate-400 font-bold uppercase block mb-2">Size Scale</label>
            <div className="flex items-center gap-3">
               <input 
                  type="range" 
                  min="0.5" 
                  max="2.0" 
                  step="0.1" 
                  value={typeof currentStyle.size === 'number' ? currentStyle.size : 1}
                  onChange={(e) => handleChange('size', parseFloat(e.target.value))}
                  className="w-full accent-blue-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
               />
               <span className="text-sm font-mono font-bold text-white w-10 text-right">
                 {(typeof currentStyle.size === 'number' ? currentStyle.size : 1).toFixed(1)}x
               </span>
            </div>
          </div>

          {/* Live Preview */}
          <div className="pt-2 border-t border-slate-700 flex flex-col items-center gap-2 h-24 justify-center">
             <span className="text-xs text-slate-500 uppercase font-bold tracking-wider">Preview</span>
             <div className="relative flex items-center justify-center">
                <div 
                  className="flex items-center justify-center shadow-lg border-white transition-all duration-200"
                  style={{
                    backgroundColor: typeof currentStyle.color === 'string' ? currentStyle.color : '#ccc',
                    width: `${32 * (currentStyle.size || 1)}px`,
                    height: `${32 * (currentStyle.size || 1)}px`,
                    borderRadius: currentStyle.shape === 'circle' ? '50%' : currentStyle.shape === 'rounded' ? '20%' : '0%',
                    borderWidth: `${Math.max(1, 3 * (currentStyle.size || 1))}px`,
                    borderStyle: 'solid',
                    borderColor: 'white'
                  }}
                >
                  <span 
                    className="font-bold text-white drop-shadow-md" 
                    style={{ fontSize: `${Math.max(8, 12 * (currentStyle.size || 1))}px` }}
                  >
                    A
                  </span>
                </div>
             </div>
          </div>

        </div>
        
        <div className="text-center">
           <p className="text-[10px] text-slate-500">Styles are saved automatically.</p>
        </div>
      </div>
    </Card>
  );
};
