
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
        <div className="absolute -left-2 top-1/2 -translate-x-full -translate-y-1/2 mr-2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none border border-slate-700 shadow-xl z-50">
          {label}
        </div>
      )}
      <button 
        type={type}
        className={`w-12 h-12 rounded-full shadow-xl border-2 flex items-center justify-center transition-all active:scale-90 ${isActive ? 'ring-4 ring-blue-500/30 scale-110' : ''} ${colorClass} ${className}`}
        {...props}
      >
        {children}
      </button>
    </div>
  );
};

export const Card: React.FC<{ children: React.ReactNode; title?: string; onClose?: () => void; className?: string }> = ({ children, title, onClose, className }) => (
  <div className={`bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl p-4 text-slate-100 shadow-xl animate-fade-in ${className}`}>
    {(title || onClose) && (
      <div className="flex justify-between items-center mb-3 border-b border-slate-700 pb-2">
        {title && <h3 className="text-base font-bold text-slate-100">{title}</h3>}
        {onClose && (
          <button onClick={onClose} className="text-slate-400 hover:text-white w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-700 transition-colors">
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
      <div className="flex justify-between items-center p-4 border-b border-slate-800">
        <h2 className="text-lg font-bold text-white">{title}</h2>
        <button onClick={onClose} className="text-slate-400 hover:text-white w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-800">
          <i className="fas fa-times text-lg" />
        </button>
      </div>
      <div className="p-5 overflow-y-auto custom-scrollbar">
        {children}
      </div>
    </div>
  </div>
);

// Updated StatBox for thinner profile and clearer text
export const StatBox: React.FC<{ label: string; value: string; icon?: string; color?: string }> = ({ label, value, icon, color = 'text-blue-400' }) => (
  <div className="flex-1 flex flex-row items-center justify-center gap-2 px-1">
    <div className={`text-xs ${color} opacity-80`}>
       {icon && <i className={`fas ${icon}`} />}
    </div>
    <div className="flex flex-col items-start leading-none">
      {/* Improved contrast: text-slate-400 instead of text-slate-500 */}
      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mb-0.5">{label}</div>
      <div className="text-xs font-bold text-white tracking-wide whitespace-pre-line">{String(value)}</div>
    </div>
  </div>
);

export const Toast: React.FC<{ message: string; onUndo: () => void; onClose: () => void }> = ({ message, onUndo, onClose }) => (
  <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[2000] bg-slate-900/95 backdrop-blur border border-slate-600 text-slate-100 px-5 py-3 rounded-xl shadow-2xl flex items-center gap-4 animate-bounce">
    <div className="flex items-center gap-2">
      <i className="fas fa-info-circle text-blue-400"></i>
      <span className="text-sm font-medium">{message}</span>
    </div>
    <div className="h-4 w-px bg-slate-700 mx-1"></div>
    <button onClick={onUndo} className="text-blue-400 font-bold hover:text-blue-300 uppercase text-xs tracking-wider flex items-center gap-1">
      <i className="fas fa-undo"></i> Undo
    </button>
    <button onClick={onClose} className="text-slate-500 hover:text-white ml-2">
      <i className="fas fa-times"/>
    </button>
  </div>
);
