
import React from 'react';

export const Button: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' | 'warning' }> = 
  ({ children, className, variant = 'primary', type = 'button', ...props }) => {
  
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20',
    secondary: 'bg-slate-700 hover:bg-slate-600 text-white shadow-lg shadow-black/20',
    danger: 'bg-red-600 hover:bg-red-700 text-white',
    warning: 'bg-amber-500 hover:bg-amber-600 text-black'
  };

  return (
    <button 
      type={type}
      className={`${variants[variant]} px-4 py-3 rounded-xl font-semibold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export const Fab: React.FC<React.ButtonHTMLAttributes<HTMLButtonElement> & { label?: string; isActive?: boolean; colorClass?: string }> = 
  ({ children, className, label, isActive, colorClass = 'bg-slate-800 border-slate-600', type = 'button', ...props }) => {
  return (
    <div className="flex flex-col items-center gap-1 group relative">
      {label && (
        <div className="absolute -top-8 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-slate-700 shadow-xl z-50">
          {label}
        </div>
      )}
      <button 
        type={type}
        className={`w-14 h-14 rounded-full shadow-xl border-2 flex items-center justify-center transition-all active:scale-90 ${isActive ? 'ring-4 ring-blue-500/30 scale-110' : ''} ${colorClass} ${className}`}
        {...props}
      >
        {children}
      </button>
      {label && (
        <span className="text-[10px] font-bold text-slate-300 bg-slate-900/80 px-1.5 py-0.5 rounded backdrop-blur-sm shadow-sm">{label}</span>
      )}
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; title?: string; onClose?: () => void; className?: string }> = ({ children, title, onClose, className }) => (
  <div className={`bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl p-5 text-slate-100 shadow-xl animate-fade-in ${className}`}>
    {(title || onClose) && (
      <div className="flex justify-between items-center mb-4 border-b border-slate-700 pb-2">
        {title && <h3 className="text-lg font-bold text-slate-100">{title}</h3>}
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-700 transition-colors">
            <i className="fas fa-times" />
          </button>
        )}
      </div>
    )}
    {children}
  </div>
);

export const Modal: React.FC<{ children: React.ReactNode; title: string; onClose: () => void }> = ({ children, title, onClose }) => (
  <div className="absolute inset-0 z-[2000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
    <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
      <div className="flex justify-between items-center p-5 border-b border-slate-800">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800">
          <i className="fas fa-times text-lg" />
        </button>
      </div>
      <div className="p-6 overflow-y-auto custom-scrollbar">
        {children}
      </div>
    </div>
  </div>
);

export const StatBox: React.FC<{ label: string; value: string; icon?: string; color?: string }> = ({ label, value, icon, color = 'text-blue-400' }) => (
  <div className="bg-slate-900/50 p-3 rounded-lg border border-slate-700/50 hover:border-slate-600 transition-colors">
    <div className="text-xs text-slate-400 uppercase tracking-wider font-semibold mb-1">{label}</div>
    <div className={`text-lg font-mono font-bold flex items-center gap-2 ${color}`}>
      {icon && <i className={`fas ${icon} text-sm`} />}
      {value}
    </div>
  </div>
);
