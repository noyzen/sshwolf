import React, { useState, useEffect } from 'react';
import { X, CheckSquare, Square, CheckCircle2, PackageOpen, DownloadCloud, Loader2, Copy, Clipboard } from 'lucide-react';
import { cn } from './utils';
import { FileEntry } from './types';

export const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg", hideClose = false }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode, maxWidth?: string, hideClose?: boolean }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 top-10 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200" onClick={onClose}>
      <div className={cn("bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh]", maxWidth)} onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/50 shrink-0">
          <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
          {!hideClose && (
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded">
              <X size={20} />
            </button>
          )}
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

export const SimpleInputModal = ({ isOpen, onClose, title, onSubmit, placeholder = "", buttonLabel="Create", initialValue="" }: { isOpen: boolean, onClose: () => void, title: string, onSubmit: (val: string) => void, placeholder?: string, buttonLabel?: string, initialValue?: string }) => {
  const [value, setValue] = useState(initialValue);
  
  useEffect(() => {
    if(isOpen) setValue(initialValue);
  }, [isOpen, initialValue]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <form onSubmit={(e) => { e.preventDefault(); onSubmit(value); }} className="space-y-4">
        <input 
          autoFocus 
          value={value} 
          onChange={e => setValue(e.target.value)} 
          placeholder={placeholder}
          className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white outline-none focus:border-indigo-500" 
        />
        <div className="flex justify-end gap-2">
           <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
           <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded">{buttonLabel}</button>
        </div>
      </form>
    </Modal>
  );
};

const PermCheckbox = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) => (
  <div className="flex flex-col items-center justify-center p-2 bg-slate-950 rounded border border-slate-800">
    <span className="text-[10px] text-slate-500 mb-1 font-mono uppercase">{label}</span>
    <button onClick={() => onChange(!checked)} className={cn("transition-colors", checked ? "text-indigo-400" : "text-slate-700")}>
      {checked ? <CheckSquare size={18} /> : <Square size={18} />}
    </button>
  </div>
);

export const PermissionsManager = ({ item, currentPath, connectionId, onClose, onRefresh }: { item: FileEntry, currentPath: string, connectionId: string, onClose: () => void, onRefresh: () => void }) => {
  const currentOctal = item.attrs.mode.toString(8).slice(-3);
  const [own, grp, pub] = currentOctal.split('').map(Number);
  const [perms, setPerms] = useState({
    own: { r: (own & 4) > 0, w: (own & 2) > 0, x: (own & 1) > 0 },
    grp: { r: (grp & 4) > 0, w: (grp & 2) > 0, x: (grp & 1) > 0 },
    pub: { r: (pub & 4) > 0, w: (pub & 2) > 0, x: (pub & 1) > 0 },
  });
  const [permRecursive, setPermRecursive] = useState(false);

  const calculateOctal = () => {
    const getDigit = (p: {r: boolean, w: boolean, x: boolean}) => (p.r ? 4 : 0) + (p.w ? 2 : 0) + (p.x ? 1 : 0);
    return `${getDigit(perms.own)}${getDigit(perms.grp)}${getDigit(perms.pub)}`;
  };

  const updatePerm = (cat: 'own'|'grp'|'pub', type: 'r'|'w'|'x', val: boolean) => {
    setPerms(prev => ({ ...prev, [cat]: { ...prev[cat], [type]: val } }));
  };

  const handleApply = async () => {
    try {
      const octal = parseInt(calculateOctal(), 8);
      const targetPath = `${currentPath}/${item.filename}`;
      if (permRecursive && item.isDirectory) {
        await window.electron?.sshExec(connectionId, `chmod -R ${calculateOctal()} "${targetPath}"`);
      } else {
        await window.electron?.sftpChmod(connectionId, targetPath, octal);
      }
      onRefresh();
      onClose();
    } catch (e: any) {
      alert(`Permission Update Failed: ${e.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-4 gap-4 text-center">
        <div className="col-span-1"></div>
        <div className="text-sm font-semibold text-slate-400">Read</div>
        <div className="text-sm font-semibold text-slate-400">Write</div>
        <div className="text-sm font-semibold text-slate-400">Execute</div>
        <div className="flex items-center text-sm font-bold text-slate-200">Owner</div>
        <PermCheckbox label="R" checked={perms.own.r} onChange={v => updatePerm('own', 'r', v)} />
        <PermCheckbox label="W" checked={perms.own.w} onChange={v => updatePerm('own', 'w', v)} />
        <PermCheckbox label="X" checked={perms.own.x} onChange={v => updatePerm('own', 'x', v)} />
        <div className="flex items-center text-sm font-bold text-slate-200">Group</div>
        <PermCheckbox label="R" checked={perms.grp.r} onChange={v => updatePerm('grp', 'r', v)} />
        <PermCheckbox label="W" checked={perms.grp.w} onChange={v => updatePerm('grp', 'w', v)} />
        <PermCheckbox label="X" checked={perms.grp.x} onChange={v => updatePerm('grp', 'x', v)} />
        <div className="flex items-center text-sm font-bold text-slate-200">Public</div>
        <PermCheckbox label="R" checked={perms.pub.r} onChange={v => updatePerm('pub', 'r', v)} />
        <PermCheckbox label="W" checked={perms.pub.w} onChange={v => updatePerm('pub', 'w', v)} />
        <PermCheckbox label="X" checked={perms.pub.x} onChange={v => updatePerm('pub', 'x', v)} />
      </div>
      <div className="flex items-center justify-between bg-slate-950 p-4 rounded-lg border border-slate-800">
        <div className="flex items-center gap-3">
            <span className="text-sm text-slate-400">Numeric Value:</span>
            <span className="font-mono text-xl text-indigo-400 font-bold">{calculateOctal()}</span>
        </div>
        {item.isDirectory && (
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" checked={permRecursive} onChange={e => setPermRecursive(e.target.checked)} />
            <span className="text-sm text-slate-300">Apply recursively</span>
          </label>
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
          <button onClick={handleApply} className="px-6 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium shadow-lg shadow-indigo-500/20">Apply Permissions</button>
      </div>
    </div>
  );
};

export const SmartDependencyInstaller = ({ 
  isOpen, 
  onClose, 
  connectionId, 
  tool, 
  onSuccess 
}: { 
  isOpen: boolean, 
  onClose: () => void, 
  connectionId: string, 
  tool: 'zip' | 'unzip', 
  onSuccess: () => void 
}) => {
  const [status, setStatus] = useState<'prompt' | 'installing' | 'success' | 'error'>('prompt');
  const [logs, setLogs] = useState<string[]>([]);

  const addLog = (msg: string) => setLogs(prev => [...prev, `> ${msg}`]);

  const install = async () => {
    setStatus('installing');
    setLogs([]);
    addLog(`Detecting package manager...`);
    
    try {
      // 1. Detect OS/Package Manager
      const checkCmd = `
        if command -v apt-get &> /dev/null; then echo "apt";
        elif command -v yum &> /dev/null; then echo "yum";
        elif command -v apk &> /dev/null; then echo "apk";
        else echo "unknown"; fi
      `;
      const res = await window.electron?.sshExec(connectionId, checkCmd);
      const pm = res?.stdout.trim();
      
      if (!pm || pm === 'unknown') {
        throw new Error("Could not detect a supported package manager (apt, yum, apk).");
      }
      
      addLog(`Detected package manager: ${pm}`);
      addLog(`Installing ${tool}...`);

      // 2. Install
      let installCmd = '';
      if (pm === 'apt') installCmd = `export DEBIAN_FRONTEND=noninteractive && sudo apt-get update && sudo apt-get install -y ${tool}`;
      if (pm === 'yum') installCmd = `sudo yum install -y ${tool}`;
      if (pm === 'apk') installCmd = `sudo apk add ${tool}`;

      // Stream fake progress for UX
      addLog(`Running: ${installCmd}`);
      
      const installRes = await window.electron?.sshExec(connectionId, installCmd);
      
      if (installRes?.code === 0) {
         addLog(`Successfully installed ${tool}!`);
         setStatus('success');
      } else {
         addLog(`Exit Code: ${installRes?.code}`);
         addLog(`Error: ${installRes?.stderr}`);
         throw new Error("Installation command failed.");
      }

    } catch (e: any) {
      addLog(`ERROR: ${e.message}`);
      setStatus('error');
    }
  };

  useEffect(() => {
    if (isOpen) {
      setStatus('prompt');
      setLogs([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Install ${tool}`} hideClose={status === 'installing'}>
      <div className="space-y-4">
        {status === 'prompt' && (
          <>
            <div className="flex items-center gap-4 bg-amber-500/10 border border-amber-500/20 p-4 rounded-lg">
               <div className="bg-amber-500/20 p-2 rounded-lg text-amber-500">
                  <PackageOpen size={24} />
               </div>
               <div>
                  <h4 className="font-semibold text-amber-200">Missing Dependency</h4>
                  <p className="text-sm text-slate-400 mt-1">
                    The command <code>{tool}</code> is required for this operation but is not found on the server.
                    Would you like to attempt to install it automatically?
                  </p>
               </div>
            </div>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
              <button onClick={install} className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20">
                <DownloadCloud size={16} /> Install {tool}
              </button>
            </div>
          </>
        )}

        {(status === 'installing' || status === 'success' || status === 'error') && (
           <div className="space-y-4">
              <div className="bg-slate-950 rounded-lg border border-slate-800 p-4 font-mono text-xs h-64 overflow-y-auto custom-scrollbar shadow-inner">
                 {logs.map((log, i) => (
                   <div key={i} className={cn("mb-1", log.startsWith('ERROR') ? "text-red-400" : log.startsWith('Successfully') ? "text-emerald-400" : "text-slate-400")}>
                     {log}
                   </div>
                 ))}
                 {status === 'installing' && (
                   <div className="animate-pulse text-indigo-400 mt-2">_</div>
                 )}
              </div>
              
              <div className="flex justify-end gap-3">
                 {status === 'installing' && <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 className="animate-spin" size={14}/> Installing...</div>}
                 
                 {status === 'success' && (
                   <button onClick={onSuccess} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium shadow-lg shadow-emerald-500/20">
                     <CheckCircle2 size={16} /> Continue
                   </button>
                 )}
                 
                 {status === 'error' && (
                   <button onClick={onClose} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg">Close</button>
                 )}
              </div>
           </div>
        )}
      </div>
    </Modal>
  );
};

export interface ContextMenuOption {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  separator?: boolean;
}

export const ContextMenu = ({ x, y, options, onClose }: { x: number, y: number, options: ContextMenuOption[], onClose: () => void }) => {
  useEffect(() => {
    const handleClick = () => onClose();
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [onClose]);

  // Adjust position to stay in viewport
  const adjustedX = Math.min(x, window.innerWidth - 220);
  const adjustedY = Math.min(y, window.innerHeight - (options.length * 36 + 20));

  return (
    <div 
      className="fixed z-[9999] w-52 bg-slate-900 border border-slate-700 rounded-lg shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: adjustedX, top: adjustedY }}
      onClick={e => e.stopPropagation()}
      onContextMenu={e => e.preventDefault()}
    >
      {options.map((opt, i) => (
        <React.Fragment key={i}>
          {opt.separator && <div className="h-px bg-slate-800 my-1" />}
          <button
            onClick={() => { opt.onClick(); onClose(); }}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors text-left",
              opt.danger ? "text-red-400 hover:bg-red-500/10" : "text-slate-300 hover:bg-slate-800 hover:text-white"
            )}
          >
            {opt.icon && <span className="opacity-70">{opt.icon}</span>}
            {opt.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
};
