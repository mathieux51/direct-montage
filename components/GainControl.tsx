'use client';

import { useState } from 'react';

interface GainControlProps {
  onGainChange: (gain: number) => void;
}

export default function GainControl({ onGainChange }: GainControlProps) {
  const [gain, setGain] = useState(1);

  const handleGainChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newGain = parseFloat(event.target.value);
    setGain(newGain);
    onGainChange(newGain);
  };

  const getGainDb = () => {
    return (20 * Math.log10(gain)).toFixed(1);
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50">
      <h3 className="text-sm font-medium text-gray-700 mb-4">Gain Control</h3>
      
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label htmlFor="gain-slider" className="text-sm text-gray-600">
            Volume
          </label>
          <span className="text-sm font-mono text-gray-700">
            {getGainDb()} dB
          </span>
        </div>
        
        <input
          id="gain-slider"
          type="range"
          min="0"
          max="2"
          step="0.01"
          value={gain}
          onChange={handleGainChange}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer slider"
        />
        
        <div className="flex justify-between text-xs text-gray-500">
          <span>-∞</span>
          <span>0 dB</span>
          <span>+6 dB</span>
        </div>
      </div>
      
      <style jsx>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 16px;
          height: 16px;
          background: #4F46E5;
          cursor: pointer;
          border-radius: 50%;
        }
        
        .slider::-moz-range-thumb {
          width: 16px;
          height: 16px;
          background: #4F46E5;
          cursor: pointer;
          border-radius: 50%;
          border: none;
        }
      `}</style>
    </div>
  );
}