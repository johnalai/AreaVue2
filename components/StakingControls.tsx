
import React from 'react';
import { Card, Button } from './UIComponents';
import { StakingState } from '../types';

interface StakingControlsProps {
  state: StakingState;
  onUpdate: (newState: StakingState) => void;
  onClose: () => void;
  currentBearing: number | null;
  liveStats?: { crossTrackError: number; direction: string; distanceToLast: number } | null;
}

export const StakingControls: React.FC<StakingControlsProps> = ({ state, onUpdate, onClose, currentBearing, liveStats }) => {
  const toggleStaking = () => {
    onUpdate({ ...state, isActive: !state.isActive });
  };

  const handleToleranceChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({ ...state, collinearityTolerance: parseFloat(e.target.value) });
  };

  const handleBearingChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    // Don't update if it's the same effective number to prevent cursor jump,
    // but update if previous was null and now it is valid 0.
    if (state.targetBearing === val) return;
    
    // Explicitly handle 0 as a valid number, and NaN as null
    onUpdate({ ...state, targetBearing: isNaN(val) ? null : val });
  };

  const setBearingFromCurrent = () => {
    if (currentBearing !== null) {
      onUpdate({ ...state, targetBearing: currentBearing });
    }
  };

  const flipBearing = () => {
    if (state.targetBearing !== null) {
        let newBearing = state.targetBearing + 180;
        if (newBearing >= 360) newBearing -= 360;
        onUpdate({ ...state, targetBearing: newBearing });
    }
  };

  return (
    <Card title="Staking Controls" onClose={onClose} className="w-full max-w-sm absolute top-20 right-4 z-[1000]">
      <div className="space-y-4">
        <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-lg border border-slate-700">
          <span className="text-sm font-bold text-slate-200">Staking Mode</span>
          <div 
             onClick={toggleStaking}
             className={`w-12 h-6 rounded-full p-1 cursor-pointer transition-colors ${state.isActive ? 'bg-amber-500' : 'bg-slate-600'}`}
          >
             <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${state.isActive ? 'translate-x-6' : 'translate-x-0'}`} />
          </div>
        </div>

        {state.isActive && (
          <div className="space-y-3 animate-fade-in">
             <div className="p-3 bg-slate-800 border border-slate-700 rounded-lg space-y-2">
                <label className="text-xs text-slate-400 font-bold uppercase block">Target Bearing</label>
                <div className="flex gap-2">
                   <input 
                      type="number"
                      placeholder="0-360" 
                      className="w-full bg-slate-900 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:border-amber-500 outline-none"
                      // Use raw state or empty string, do not fix decimals to prevent typing issues
                      value={state.targetBearing !== null ? state.targetBearing : ''}
                      onChange={handleBearingChange}
                   />
                   <Button variant="secondary" className="px-2 py-1 text-[10px] whitespace-nowrap" onClick={flipBearing} title="Flip 180° (Backsight)">
                      <i className="fas fa-sync-alt"></i> 180°
                   </Button>
                   <Button variant="secondary" className="px-2 py-1 text-[10px] whitespace-nowrap" onClick={() => onUpdate({ ...state, targetBearing: null })}>
                      Clear
                   </Button>
                </div>
                {currentBearing !== null && (
                   <Button variant="secondary" className="w-full text-[10px] py-1.5" onClick={setBearingFromCurrent}>
                      <i className="fas fa-vector-square mr-1"></i> Snap to Last Line ({currentBearing.toFixed(1)}°)
                   </Button>
                )}
             </div>

             {state.targetBearing !== null && liveStats && (
                 <div className="p-3 bg-blue-900/20 border border-blue-800/50 rounded-lg space-y-2 animate-pulse-slow">
                     <label className="text-[10px] text-blue-300 font-bold uppercase block tracking-wider">Live Deviation</label>
                     <div className="flex justify-between items-end">
                        <div className="flex flex-col">
                            <span className="text-[10px] text-slate-400">Offline</span>
                            <span className={`text-xl font-bold ${liveStats.crossTrackError > state.collinearityTolerance ? 'text-red-400' : 'text-green-400'}`}>
                                {liveStats.direction === 'Left' ? 'L' : 'R'} {liveStats.crossTrackError.toFixed(1)}m
                            </span>
                        </div>
                        <div className="flex flex-col text-right">
                            <span className="text-[10px] text-slate-400">Dist to Last</span>
                            <span className="text-lg font-bold text-white">{liveStats.distanceToLast.toFixed(1)}m</span>
                        </div>
                     </div>
                 </div>
             )}

             <div className="space-y-2 pt-2 border-t border-slate-700/50">
                <label className="text-xs text-slate-400 font-bold uppercase block">Configuration</label>
                
                <div className="flex items-center gap-3">
                   <div className="flex-1">
                       <span className="text-[10px] text-slate-400 block mb-1">Tolerance (Degrees)</span>
                       <input 
                          type="range" 
                          min="0.1" 
                          max="5.0" 
                          step="0.1" 
                          value={state.collinearityTolerance}
                          onChange={handleToleranceChange}
                          className="w-full accent-amber-500 h-1.5 bg-slate-700 rounded-lg appearance-none cursor-pointer"
                       />
                   </div>
                   <span className="text-sm font-mono font-bold w-10 text-right">{state.collinearityTolerance}°</span>
                </div>

                <div className="flex justify-between items-center py-1">
                   <span className="text-xs text-slate-300">Show Map Labels</span>
                   <input 
                      type="checkbox" 
                      checked={state.showLabels}
                      onChange={(e) => onUpdate({...state, showLabels: e.target.checked})}
                      className="accent-amber-500 w-4 h-4 rounded"
                   />
                </div>

                <div className="flex justify-between items-center py-1">
                   <span className="text-xs text-slate-300">Strict Mode (Red Alert)</span>
                   <input 
                      type="checkbox" 
                      checked={state.strictCollinearity}
                      onChange={(e) => onUpdate({...state, strictCollinearity: e.target.checked})}
                      className="accent-red-500 w-4 h-4 rounded"
                   />
                </div>
             </div>
             
             <div className="p-3 bg-amber-900/20 border border-amber-800/50 rounded text-xs text-amber-200 mt-2">
                <i className="fas fa-info-circle mr-1"></i>
                Set a target bearing to detect left/right deviation. Use the dashed orange line as a visual guide.
             </div>
          </div>
        )}
      </div>
    </Card>
  );
};
