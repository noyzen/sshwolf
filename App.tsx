import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { 
  Terminal, Folder, Settings, Plus, Trash, Upload, Download, 
  FileText, X, Server, LogOut, RefreshCw, FolderPlus, FilePlus,
  Archive, Expand, Edit2, Monitor, ArrowUp, Lock, Edit3,
  Zap, Save, CheckSquare, Square, Key, Shield, Type, WrapText,
  Minus, AlignLeft, AlertTriangle, Search, History, Play, Star,
  Loader2, Copy, Scissors, Clipboard, LayoutGrid, List, Check,
  MoreVertical
} from 'lucide-react';
import { SSHConnection, FileEntry, ServerSession, SubTab, QuickCommand, ClipboardState, ClipboardItem } from './types';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// OS Detection
const isMac = navigator.userAgent.includes('Mac');
const isWindows = navigator.userAgent.includes('Windows');

// --- Helper Components ---

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg", hideClose = false }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode, maxWidth?: string, hideClose?: boolean }) => {
  if (!isOpen) return null;
  // Modal sits BELOW the titlebar (top-10) to respect the separate window controls area
  return (
    <div className="fixed left-0 right-0 bottom-0 top-10 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={cn("bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh]", maxWidth)}>
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

const SimpleInputModal = ({ isOpen, onClose, title, onSubmit, placeholder = "", buttonLabel="Create" }: { isOpen: boolean, onClose: () => void, title: string, onSubmit: (val: string) => void, placeholder?: string, buttonLabel?: string }) => {
  const [value, setValue] = useState("");
  
  useEffect(() => {
    if(isOpen) setValue("");
  }, [isOpen]);

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

const PermissionsManager = ({ item, currentPath, connectionId, onClose, onRefresh }: { item: FileEntry, currentPath: string, connectionId: string, onClose: () => void, onRefresh: () => void }) => {
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

// --- File Editor Pane (Now a SubTab) ---

const FileEditorPane = ({ subTab, connection, visible }: { subTab: SubTab, connection: SSHConnection, visible: boolean }) => {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Load content when visible and not loaded
  useEffect(() => {
    if (visible && !loaded && !loading && !isConnected) {
      loadFile();
    }
  }, [visible, loaded, loading, isConnected]);

  const loadFile = async () => {
    setLoading(true);
    try {
        if (!isConnected) {
           await window.electron?.sshConnect({ ...connection, id: subTab.connectionId });
           setIsConnected(true);
        }
        if (subTab.path) {
          const data = await window.electron?.sftpReadFile(subTab.connectionId, subTab.path);
          setContent(data);
          setLoaded(true);
        }
    } catch (e: any) {
        setContent(`Error loading file: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!subTab.path) return;
    setSaving(true);
    try {
      if (!isConnected) {
          await window.electron?.sshConnect({ ...connection, id: subTab.connectionId });
          setIsConnected(true);
      }
      await window.electron?.sftpWriteFile(subTab.connectionId, subTab.path, content);
    } catch (e: any) {
      alert(`Save Failed: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      setContent(content.substring(0, start) + "  " + content.substring(end));
      setTimeout(() => { target.selectionStart = target.selectionEnd = start + 2; }, 0);
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }
  };

  const updateCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
     const target = e.target as HTMLTextAreaElement;
     const val = target.value.substr(0, target.selectionStart);
     const line = val.split(/\r\n|\r|\n/).length;
     const col = target.selectionStart - val.lastIndexOf('\n');
     setCursorPos({ line, col });
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] font-sans">
       {/* Editor Toolbar */}
       <div className="h-12 bg-[#252526] border-b border-[#3e3e42] flex items-center justify-between px-4 shadow-sm shrink-0">
          <div className="flex items-center gap-4 overflow-hidden">
             <div className="flex items-center gap-2 text-slate-300">
                <FileText className="text-[#4fc1ff]" size={18} />
                <span className="font-mono text-xs truncate max-w-[300px] text-slate-300">{subTab.path}</span>
             </div>
             <div className="h-4 w-px bg-[#3e3e42]" />
             <div className="flex items-center gap-1">
                 <button onClick={() => setFontSize(s => Math.max(10, s-1))} className="p-1.5 hover:bg-[#3e3e42] rounded text-slate-400"><Minus size={14} /></button>
                 <span className="text-xs text-slate-500 w-6 text-center">{fontSize}</span>
                 <button onClick={() => setFontSize(s => Math.min(24, s+1))} className="p-1.5 hover:bg-[#3e3e42] rounded text-slate-400"><Plus size={14} /></button>
                 <div className="h-4 w-px bg-[#3e3e42] mx-1" />
                 <button onClick={() => setWordWrap(!wordWrap)} className={cn("p-1.5 rounded transition-colors", wordWrap ? "bg-[#3e3e42] text-white" : "text-slate-400 hover:bg-[#3e3e42]")}><WrapText size={14} /></button>
             </div>
          </div>
          <div className="flex gap-2">
             <button onClick={loadFile} className="p-2 text-slate-400 hover:text-white hover:bg-[#3e3e42] rounded transition-colors" title="Reload">
                 <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
             </button>
             <button disabled={saving || loading} onClick={handleSave} className="flex items-center gap-2 px-4 py-1.5 text-xs bg-[#007acc] hover:bg-[#0062a3] text-white rounded transition-all disabled:opacity-50 font-medium">
               {saving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />} Save
             </button>
          </div>
       </div>
       
       {/* Editor Body */}
       <div className="flex-1 relative bg-[#1e1e1e]">
         {loading && !content ? (
             <div className="absolute inset-0 flex items-center justify-center text-slate-500 gap-2">
                 <Loader2 className="animate-spin" /> Loading...
             </div>
         ) : (
            <textarea 
            ref={textAreaRef}
            className={cn("absolute inset-0 w-full h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono p-4 outline-none resize-none leading-relaxed custom-scrollbar border-none", wordWrap ? "whitespace-pre-wrap" : "whitespace-pre")}
            style={{ fontSize: `${fontSize}px` }}
            value={content}
            onChange={e => { setContent(e.target.value); updateCursor(e); }}
            onClick={updateCursor} onKeyUp={updateCursor} onKeyDown={handleKeyDown} spellCheck={false}
            />
         )}
       </div>
       
       {/* Status Bar */}
       <div className="h-6 bg-[#007acc] text-white text-[11px] flex items-center px-4 justify-between select-none">
           <div className="flex gap-4">
               <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
               <span>UTF-8</span>
           </div>
           <div>
               {isConnected ? "Connected" : "Disconnected"}
           </div>
       </div>
    </div>
  );
};

// --- Terminal Pane ---

const TerminalPane = ({ subTab, connection, visible }: { subTab: SubTab, connection: SSHConnection, visible: boolean }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // Quick Commands State
  const [quickCommands, setQuickCommands] = useState<QuickCommand[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [showQuickCmds, setShowQuickCmds] = useState(false);
  const [inputCmd, setInputCmd] = useState('');
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('quick-commands');
    if (saved) setQuickCommands(JSON.parse(saved));
    
    const savedHist = localStorage.getItem('cmd-history');
    if (savedHist) setCmdHistory(JSON.parse(savedHist));
  }, []);

  const saveQuickCommand = (name: string, cmd: string) => {
    if (!name || !cmd) return;
    const newCmd = { id: crypto.randomUUID(), name, command: cmd };
    const updated = [...quickCommands, newCmd];
    setQuickCommands(updated);
    localStorage.setItem('quick-commands', JSON.stringify(updated));
  };
  
  const deleteQuickCommand = (id: string) => {
    const updated = quickCommands.filter(c => c.id !== id);
    setQuickCommands(updated);
    localStorage.setItem('quick-commands', JSON.stringify(updated));
  };

  const runCommand = (cmd: string, saveToHistory = true) => {
      window.electron?.sshWrite(subTab.connectionId, cmd + '\r');
      if (saveToHistory && cmd.trim()) {
          const newHist = [cmd, ...cmdHistory.filter(c => c !== cmd)].slice(0, 50);
          setCmdHistory(newHist);
          localStorage.setItem('cmd-history', JSON.stringify(newHist));
      }
      setShowQuickCmds(false);
      setInputCmd('');
  };

  // Only connect when visible and not already connected
  useEffect(() => {
    if (!visible || connectedRef.current) return;
    
    const initTerminal = async () => {
      connectedRef.current = true;
      if (terminalRef.current && !xtermRef.current) {
        const term = new XTerm({
          theme: { background: '#020617', foreground: '#e2e8f0', cursor: '#6366f1', selectionBackground: '#4338ca' },
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: 14, lineHeight: 1.4, cursorBlink: true, allowProposedApi: true, convertEol: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        setTimeout(() => fitAddon.fit(), 100);

        term.attachCustomKeyEventHandler((arg) => {
          if (arg.type === 'keydown') {
            if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyC') {
               const selection = term.getSelection();
               if (selection) { navigator.clipboard.writeText(selection); return false; }
            }
            if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyV') {
               navigator.clipboard.readText().then(text => window.electron?.sshWrite(subTab.connectionId, text));
               return false;
            }
          }
          return true;
        });
        
        term.onData(data => window.electron?.sshWrite(subTab.connectionId, data));

        const resizeObserver = new ResizeObserver(() => {
           if (visible) {
             fitAddon.fit();
             window.electron?.sshResize(subTab.connectionId, term.cols, term.rows);
           }
        });
        resizeObserver.observe(terminalRef.current);

        const cleanupData = window.electron?.onSSHData(({ connectionId, data }) => {
          if (connectionId === subTab.connectionId) term.write(data);
        });
        const cleanupClose = window.electron?.onSSHClosed(({ connectionId }) => {
           if (connectionId === subTab.connectionId) {
             term.writeln('\r\n\x1b[31mConnection closed.\x1b[0m');
             setIsConnected(false);
           }
        });

        try {
          term.writeln(`\x1b[34mConnecting to ${connection.host}...\x1b[0m\r\n`);
          await window.electron?.sshConnect({ ...connection, id: subTab.connectionId, rows: term.rows, cols: term.cols });
          setIsConnected(true);
          fitAddon.fit();
          
          // Initial Path Navigation
          if (subTab.path && subTab.path !== '/') {
             setTimeout(() => {
                 window.electron?.sshWrite(subTab.connectionId, `cd "${subTab.path}"\r`);
                 window.electron?.sshWrite(subTab.connectionId, `clear\r`);
             }, 800);
          }

        } catch (err: any) {
          term.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
          setIsConnected(false);
        }

        return () => {
          resizeObserver.disconnect();
          cleanupData && cleanupData();
          cleanupClose && cleanupClose();
          term.dispose();
          window.electron?.sshDisconnect(subTab.connectionId);
        };
      }
    };
    initTerminal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (visible && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if(xtermRef.current) window.electron?.sshResize(subTab.connectionId, xtermRef.current.cols, xtermRef.current.rows);
      }, 50);
    }
  }, [visible]);

  const filteredQuickCmds = quickCommands.filter(c => c.name.toLowerCase().includes(searchFilter.toLowerCase()) || c.command.toLowerCase().includes(searchFilter.toLowerCase()));
  const filteredHistory = cmdHistory.filter(c => c.toLowerCase().includes(searchFilter.toLowerCase()));

  return (
    <div className="relative w-full h-full">
       <div ref={terminalRef} className="w-full h-full p-1" />
       
       {/* Quick Command Overlay Button */}
       <div className="absolute top-4 right-4 z-20">
            <div className="relative">
                <button 
                  onClick={() => setShowQuickCmds(!showQuickCmds)}
                  className="p-2 bg-slate-800/80 hover:bg-slate-700 backdrop-blur rounded-full text-slate-400 hover:text-amber-400 transition-colors shadow-lg border border-slate-700" 
                  title="Quick Commands"
                >
                  <Zap size={16} />
                </button>
                {showQuickCmds && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[500px]">
                      
                      {/* Header Input */}
                      <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-950/50 rounded-t-lg">
                          <div className="relative">
                              <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                              <input 
                                autoFocus
                                placeholder="Filter or Type new command..." 
                                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 pl-9 text-xs text-white focus:border-indigo-500 outline-none"
                                value={inputCmd}
                                onChange={e => { setInputCmd(e.target.value); setSearchFilter(e.target.value); }}
                                onKeyDown={e => { if(e.key === 'Enter') runCommand(inputCmd); }}
                              />
                          </div>
                          <div className="flex gap-2">
                             <button onClick={() => runCommand(inputCmd)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2 py-1.5 text-xs font-medium flex items-center justify-center gap-2"><Play size={12}/> Run</button>
                             <button onClick={() => saveQuickCommand(inputCmd, inputCmd)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded px-2 py-1.5 text-xs font-medium flex items-center justify-center gap-2"><Save size={12}/> Save</button>
                          </div>
                      </div>

                      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
                          {/* Saved Commands */}
                          {filteredQuickCmds.length > 0 && (
                            <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1">Saved Commands</h4>
                                <div className="space-y-1">
                                    {filteredQuickCmds.map(qc => (
                                        <div key={qc.id} className="flex items-center justify-between group p-2 hover:bg-slate-800 rounded cursor-pointer border border-transparent hover:border-slate-700" onClick={() => runCommand(qc.command, false)}>
                                        <div className="flex flex-col overflow-hidden">
                                            <span className="text-sm text-indigo-300 font-medium truncate">{qc.name}</span>
                                            <span className="text-[10px] text-slate-500 font-mono truncate">{qc.command}</span>
                                        </div>
                                        <button onClick={(e) => { e.stopPropagation(); deleteQuickCommand(qc.id) }} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 p-1"><X size={12}/></button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                          )}

                          {/* History */}
                          {filteredHistory.length > 0 && (
                             <div>
                                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 px-1 flex items-center gap-2"><History size={10}/> Recent History</h4>
                                <div className="space-y-1">
                                    {filteredHistory.map((cmd, i) => (
                                        <div key={i} className="flex items-center justify-between group p-2 hover:bg-slate-800 rounded cursor-pointer border border-transparent hover:border-slate-700" onClick={() => runCommand(cmd, false)}>
                                            <span className="text-xs text-slate-400 font-mono truncate flex-1">{cmd}</span>
                                            <button onClick={(e) => { e.stopPropagation(); saveQuickCommand(cmd, cmd); }} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-amber-400 p-1" title="Save to Quick Commands"><Star size={12}/></button>
                                        </div>
                                    ))}
                                </div>
                             </div>
                          )}

                          {filteredQuickCmds.length === 0 && filteredHistory.length === 0 && (
                              <div className="text-center py-4 text-slate-600 text-xs italic">No commands found.</div>
                          )}
                      </div>
                  </div>
                )}
            </div>
       </div>
    </div>
  );
};

// --- SFTP Pane ---

interface SFTPPaneProps {
  subTab: SubTab;
  connection: SSHConnection;
  visible: boolean;
  onPathChange: (path: string) => void;
  onOpenTerminal: (path: string) => void;
  onOpenFile: (path: string) => void;
  clipboard: ClipboardState | null;
  setClipboard: (state: ClipboardState | null) => void;
}

const SFTPPane = ({ subTab, connection, visible, onPathChange, onOpenTerminal, onOpenFile, clipboard, setClipboard }: SFTPPaneProps) => {
  const [currentPath, setCurrentPath] = useState(subTab.path || '/');
  const [pathInput, setPathInput] = useState(currentPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  
  // Modals
  const [showRename, setShowRename] = useState<{item: FileEntry, name: string} | null>(null);
  const [showPermissions, setShowPermissions] = useState<FileEntry | null>(null);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [isPasting, setIsPasting] = useState(false);

  const refreshFiles = useCallback(async (path: string) => {
    setIsLoading(true);
    setSelected(new Set());
    setLastSelectedIndex(-1);
    try {
      const list = await window.electron?.sftpList(subTab.connectionId, path);
      if (list) {
        const sorted = list.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) return a.filename.localeCompare(b.filename);
          return a.isDirectory ? -1 : 1;
        });
        setFiles(sorted);
        setCurrentPath(path);
        setPathInput(path);
        onPathChange(path);
        setIsConnected(true);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('Not connected')) setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  }, [subTab.connectionId, onPathChange]);

  // Connect only when visible
  useEffect(() => {
    if (!visible) return;
    const connectAndLoad = async () => {
        if (!isConnected) {
            try {
                await window.electron?.sshConnect({ ...connection, id: subTab.connectionId });
                setIsConnected(true);
                refreshFiles(currentPath);
            } catch (e) {
                console.error("SFTP Connect Error", e);
            }
        }
    };
    connectAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Handle hotkeys (Ctrl+A)
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        // Select all
        const all = new Set(files.map(f => f.filename));
        setSelected(all);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, files]);

  const handleNavigate = (folderName: string) => {
    const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    refreshFiles(newPath);
  };

  const handleUpDir = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    const newPath = parts.length === 1 ? '/' : parts.join('/');
    refreshFiles(newPath);
  };

  const openEditor = (file: FileEntry) => {
    onOpenFile(`${currentPath}/${file.filename}`);
  };

  // Selection Logic
  const handleSelect = (file: FileEntry, index: number, e: React.MouseEvent) => {
    e.stopPropagation(); // Stop bubbling to container which clears selection
    
    const filename = file.filename;
    let newSelected = new Set(selected);

    if (e.ctrlKey || e.metaKey) {
        if (newSelected.has(filename)) newSelected.delete(filename);
        else newSelected.add(filename);
        setLastSelectedIndex(index);
    } else if (e.shiftKey && lastSelectedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        newSelected = new Set();
        // Preserve other selections if ctrl not held? Standard is replacement usually
        // We will simple replace for shift range
        for (let i = start; i <= end; i++) {
            newSelected.add(files[i].filename);
        }
    } else {
        newSelected = new Set([filename]);
        setLastSelectedIndex(index);
    }
    setSelected(newSelected);
  };

  const getSelectedFiles = () => files.filter(f => selected.has(f.filename));

  const handleCreateFile = async (name: string) => {
    if (!name || !name.trim()) return;
    try {
        const targetPath = currentPath === '/' ? `/${name.trim()}` : `${currentPath}/${name.trim()}`;
        await window.electron?.sftpWriteFile(subTab.connectionId, targetPath, "");
        refreshFiles(currentPath);
        setShowNewFile(false);
        onOpenFile(targetPath);
    } catch (e: any) {
        alert(`Failed to create file: ${e.message}`);
    }
  };

  const handleCreateFolder = async (name: string) => {
    if (!name || !name.trim()) return;
    try {
        const targetPath = currentPath === '/' ? `/${name.trim()}` : `${currentPath}/${name.trim()}`;
        await window.electron?.sftpCreateFolder(subTab.connectionId, targetPath);
        refreshFiles(currentPath);
        setShowNewFolder(false);
    } catch (e: any) {
        alert(`Failed to create folder: ${e.message}`);
    }
  };

  const handleCopy = (specificFiles?: FileEntry[]) => {
      const selection = specificFiles || getSelectedFiles();
      if (selection.length === 0) return;

      const items: ClipboardItem[] = selection.map(f => ({
          path: currentPath === '/' ? `/${f.filename}` : `${currentPath}/${f.filename}`,
          filename: f.filename,
          isDirectory: f.isDirectory
      }));
      
      setClipboard({
          op: 'copy',
          connectionId: subTab.connectionId,
          items
      });
  };

  const handleCut = (specificFiles?: FileEntry[]) => {
      const selection = specificFiles || getSelectedFiles();
      if (selection.length === 0) return;

      const items: ClipboardItem[] = selection.map(f => ({
          path: currentPath === '/' ? `/${f.filename}` : `${currentPath}/${f.filename}`,
          filename: f.filename,
          isDirectory: f.isDirectory
      }));

      setClipboard({
          op: 'cut',
          connectionId: subTab.connectionId,
          items
      });
  };

  const handleDelete = async (specificFiles?: FileEntry[]) => {
      const selection = specificFiles || getSelectedFiles();
      if (selection.length === 0) return;
      
      if (!confirm(`Are you sure you want to delete ${selection.length} item(s)?`)) return;

      setIsLoading(true);
      try {
          for (const file of selection) {
             const path = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
             await window.electron?.sftpDelete(subTab.connectionId, path, file.isDirectory);
          }
          refreshFiles(currentPath);
      } catch (e: any) {
          alert(`Delete failed: ${e.message}`);
          refreshFiles(currentPath); // Refresh anyway
      } finally {
          setIsLoading(false);
      }
  };

  const handleDownload = async (specificFiles?: FileEntry[]) => {
      const selection = specificFiles || getSelectedFiles();
      if (selection.length === 0) return;

      const filesOnly = selection.filter(f => !f.isDirectory);
      if (filesOnly.length === 0 && selection.length > 0) {
          alert("Folder download is not supported in batch mode yet.");
          return;
      }
      
      const payload = filesOnly.map(f => ({
          path: currentPath === '/' ? `/${f.filename}` : `${currentPath}/${f.filename}`,
          filename: f.filename,
          isDirectory: false
      }));

      try {
          await window.electron?.sftpDownloadBatch(subTab.connectionId, payload);
      } catch (e: any) {
          if (!e.message?.includes('cancelled')) {
              alert(`Download failed: ${e.message}`);
          }
      }
  };

  const handlePaste = async () => {
      if (!clipboard || clipboard.items.length === 0) return;
      if (clipboard.connectionId !== subTab.connectionId) {
          alert("Cross-connection paste not currently supported. Please use Download/Upload.");
          return;
      }
      
      setIsPasting(true);
      try {
          for (const item of clipboard.items) {
              const destDir = currentPath === '/' ? '' : currentPath;
              let destPath = `${destDir}/${item.filename}`;
              
              if (item.path === destPath && clipboard.op === 'copy') {
                 const extIndex = item.filename.lastIndexOf('.');
                 if (extIndex > 0) {
                     destPath = `${destDir}/${item.filename.substring(0, extIndex)} copy${item.filename.substring(extIndex)}`;
                 } else {
                     destPath = `${destDir}/${item.filename} copy`;
                 }
              }

              if (clipboard.op === 'cut') {
                  if (item.path === destPath) continue;
                  await window.electron?.sftpRename(subTab.connectionId, item.path, destPath);
              } else {
                  const escape = (p: string) => p.replace(/(["'$`\\])/g,'\\$1');
                  const cmd = `cp -r "${escape(item.path)}" "${escape(destPath)}"`;
                  const result = await window.electron?.sshExec(subTab.connectionId, cmd);
                  if (result && result.code !== 0) {
                      throw new Error(`Copy failed: ${result.stderr}`);
                  }
              }
          }
          
          if (clipboard.op === 'cut') {
              setClipboard(null);
          }
          await refreshFiles(currentPath);
      } catch (e: any) {
          alert(`Paste failed: ${e.message}`);
      } finally {
          setIsPasting(false);
      }
  };

  return (
    <div className="flex flex-col h-full bg-[#020617] relative" onClick={() => setSelected(new Set())}>
       {/* Address Bar */}
       <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-3 bg-slate-950/50 shrink-0" onClick={e => e.stopPropagation()}>
          <div className="flex gap-1">
             <button onClick={handleUpDir} disabled={currentPath === '/'} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors border border-slate-700/50"><ArrowUp size={16} /></button>
             <button onClick={() => refreshFiles(currentPath)} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700/50"><RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); refreshFiles(pathInput); }} className="flex-1">
             <input type="text" value={pathInput} onChange={(e) => setPathInput(e.target.value)} className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 font-mono transition-all" />
          </form>
          
          <div className="h-6 w-px bg-slate-800 mx-1" />
          
          {/* View Toggle */}
          <div className="flex bg-slate-900 rounded-lg border border-slate-800 p-0.5">
             <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-slate-700 text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-300")} title="List View"><List size={16}/></button>
             <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-slate-700 text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-300")} title="Grid View"><LayoutGrid size={16}/></button>
          </div>

          <div className="h-6 w-px bg-slate-800 mx-1" />
          
          <div className="flex gap-1">
              <button 
                onClick={handlePaste} 
                disabled={!clipboard || isPasting || clipboard.connectionId !== subTab.connectionId}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-slate-800/50 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50" 
                title="Paste from clipboard"
              >
                 {isPasting ? <Loader2 size={14} className="animate-spin"/> : <Clipboard size={14} />} 
                 Paste
              </button>
              <button onClick={() => setShowNewFile(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50"><FilePlus size={14} /> New File</button>
              <button onClick={() => setShowNewFolder(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50"><FolderPlus size={14} /> New Folder</button>
              <button onClick={async () => { await window.electron?.sftpUpload(subTab.connectionId, currentPath); refreshFiles(currentPath); }} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 rounded-lg text-xs font-medium transition-colors border border-indigo-500/20"><Upload size={14} /> Upload</button>
          </div>
       </div>

       {/* Bulk Actions Bar */}
       {selected.size > 0 && (
           <div className="absolute top-14 left-4 right-4 z-20 flex items-center justify-between bg-indigo-900/90 border border-indigo-500/30 backdrop-blur-md text-white px-4 py-2 rounded-lg shadow-xl animate-in slide-in-from-top-2 duration-200" onClick={e => e.stopPropagation()}>
               <div className="flex items-center gap-3">
                   <div className="bg-indigo-500/20 p-1.5 rounded-full"><Check size={14} className="text-indigo-300"/></div>
                   <span className="text-sm font-medium">{selected.size} selected</span>
               </div>
               <div className="flex items-center gap-2">
                   <button onClick={() => handleCopy()} className="p-1.5 hover:bg-white/10 rounded text-slate-200 hover:text-white" title="Copy"><Copy size={16} /></button>
                   <button onClick={() => handleCut()} className="p-1.5 hover:bg-white/10 rounded text-slate-200 hover:text-white" title="Cut"><Scissors size={16} /></button>
                   <div className="w-px h-4 bg-white/20 mx-1"></div>
                   <button onClick={() => handleDownload()} className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium transition-colors"><Download size={14} /> Download</button>
                   <button onClick={() => handleDelete()} className="flex items-center gap-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded text-xs font-medium transition-colors border border-red-500/20"><Trash size={14} /> Delete</button>
                   <button onClick={() => setSelected(new Set())} className="ml-2 p-1 text-indigo-300 hover:text-white"><X size={16}/></button>
               </div>
           </div>
       )}
       
       {/* File List / Grid */}
       <div className="flex-1 overflow-auto custom-scrollbar bg-[#020617] p-2" onClick={() => setSelected(new Set())}>
         {viewMode === 'list' ? (
             <table className="w-full text-left text-xs border-separate border-spacing-0">
               <thead className="bg-slate-900/80 text-slate-500 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
                 <tr>
                   <th className="p-3 pl-4 w-10 border-b border-slate-800 text-center">
                      <div className="w-4 h-4 border border-slate-700 rounded bg-slate-900" />
                   </th>
                   <th className="p-3 border-b border-slate-800">Name</th>
                   <th className="p-3 w-24 border-b border-slate-800">Size</th>
                   <th className="p-3 w-24 border-b border-slate-800">Perms</th>
                   <th className="p-3 w-32 text-right pr-6 border-b border-slate-800">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/30">
                 {files.map((file, i) => {
                     const isSelected = selected.has(file.filename);
                     const fullPath = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
                     const isCut = clipboard?.op === 'cut' && clipboard.items.some(it => it.path === fullPath);
                     
                     return (
                       <tr 
                         key={file.filename} 
                         onClick={(e) => handleSelect(file, i, e)}
                         onDoubleClick={(e) => { e.stopPropagation(); file.isDirectory ? handleNavigate(file.filename) : openEditor(file) }}
                         className={cn(
                             "group transition-colors cursor-pointer select-none", 
                             isSelected ? "bg-indigo-900/20 hover:bg-indigo-900/30" : "hover:bg-slate-800/40",
                             isCut && "opacity-50"
                         )} 
                       >
                         <td className="p-3 pl-4 text-center">
                             {isSelected ? <CheckSquare size={16} className="text-indigo-400 mx-auto" /> : (
                                file.isDirectory ? <Folder size={16} className="text-indigo-400 fill-indigo-400/10 mx-auto" /> : <FileText size={16} className="text-slate-600 mx-auto" />
                             )}
                         </td>
                         <td className={cn("p-3 font-medium", isSelected ? "text-indigo-200" : "text-slate-300")}>{file.filename}</td>
                         <td className="p-3 text-slate-500 font-mono">{file.isDirectory ? '-' : (file.attrs.size < 1024 ? file.attrs.size + ' B' : (file.attrs.size / 1024).toFixed(1) + ' KB')}</td>
                         <td className="p-3 text-slate-500 font-mono text-[10px] uppercase">{file.attrs.mode.toString(8).slice(-3)}</td>
                         <td className="p-3 text-right pr-6">
                            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                               {/* Keep individual actions for quick access even in list mode */}
                               {!file.isDirectory && <button onClick={(e) => { e.stopPropagation(); openEditor(file); }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-300 text-slate-500 rounded" title="Edit"><Edit2 size={14} /></button>}
                               <button onClick={(e) => { e.stopPropagation(); setShowRename({item: file, name: file.filename}) }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-300 text-slate-500 rounded" title="Rename"><Edit3 size={14} /></button>
                               <button onClick={(e) => { e.stopPropagation(); setShowPermissions(file) }} className="p-1.5 hover:bg-slate-700 hover:text-amber-300 text-slate-500 rounded" title="Permissions"><Lock size={14} /></button>
                               <button onClick={(e) => { e.stopPropagation(); handleDelete([file]); }} className="p-1.5 hover:bg-slate-700 hover:text-red-400 text-slate-500 rounded" title="Delete"><Trash size={14} /></button>
                            </div>
                         </td>
                       </tr>
                     );
                 })}
               </tbody>
             </table>
         ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(100px,1fr))] gap-2 p-2">
                 {files.map((file, i) => {
                     const isSelected = selected.has(file.filename);
                     const fullPath = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
                     const isCut = clipboard?.op === 'cut' && clipboard.items.some(it => it.path === fullPath);
                     
                     return (
                         <div 
                             key={file.filename}
                             onClick={(e) => handleSelect(file, i, e)}
                             onDoubleClick={(e) => { e.stopPropagation(); file.isDirectory ? handleNavigate(file.filename) : openEditor(file) }}
                             className={cn(
                                 "flex flex-col items-center p-3 rounded-xl cursor-pointer transition-all border select-none group relative",
                                 isSelected 
                                    ? "bg-indigo-600/20 border-indigo-500/50 shadow-lg shadow-indigo-900/20" 
                                    : "bg-slate-900/30 border-transparent hover:bg-slate-800 hover:border-slate-700",
                                 isCut && "opacity-50"
                             )}
                         >
                             <div className="mb-3 relative">
                                 {file.isDirectory ? (
                                     <Folder size={48} className={cn("fill-current transition-colors", isSelected ? "text-indigo-400" : "text-slate-600 group-hover:text-indigo-400")} />
                                 ) : (
                                     <FileText size={48} className={cn("transition-colors", isSelected ? "text-slate-200" : "text-slate-700 group-hover:text-slate-500")} />
                                 )}
                                 {isSelected && (
                                     <div className="absolute -top-1 -right-1 bg-indigo-500 rounded-full p-0.5 border border-slate-900">
                                         <Check size={10} className="text-white" />
                                     </div>
                                 )}
                             </div>
                             <span className={cn("text-xs text-center w-full break-words line-clamp-2 leading-tight font-medium", isSelected ? "text-indigo-200" : "text-slate-400 group-hover:text-slate-300")}>
                                 {file.filename}
                             </span>
                             
                             {/* Context buttons overlay for Grid View */}
                             <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col gap-1 z-10">
                                  <div className="bg-slate-950/90 border border-slate-700 rounded-md shadow-xl flex flex-col overflow-hidden backdrop-blur-sm">
                                      {!file.isDirectory && <button onClick={(e) => { e.stopPropagation(); openEditor(file); }} className="p-1.5 hover:bg-indigo-600 hover:text-white text-slate-400 transition-colors" title="Edit"><Edit2 size={12}/></button>}
                                      <button onClick={(e) => { e.stopPropagation(); setShowRename({item: file, name: file.filename}) }} className="p-1.5 hover:bg-indigo-600 hover:text-white text-slate-400 transition-colors" title="Rename"><Edit3 size={12}/></button>
                                      <button onClick={(e) => { e.stopPropagation(); setShowPermissions(file) }} className="p-1.5 hover:bg-indigo-600 hover:text-white text-slate-400 transition-colors" title="Permissions"><Lock size={12}/></button>
                                      <button onClick={(e) => { e.stopPropagation(); handleDelete([file]); }} className="p-1.5 hover:bg-red-600 hover:text-white text-slate-400 transition-colors" title="Delete"><Trash size={12}/></button>
                                  </div>
                             </div>
                         </div>
                     );
                 })}
            </div>
         )}
       </div>
       
       <Modal isOpen={!!showRename} onClose={() => setShowRename(null)} title="Rename File">
          {showRename && (
             <form onSubmit={(e) => { e.preventDefault(); window.electron?.sftpRename(subTab.connectionId, `${currentPath}/${showRename.item.filename}`, `${currentPath}/${showRename.name}`).then(() => { setShowRename(null); refreshFiles(currentPath); }); }} className="space-y-4">
                 <input autoFocus value={showRename.name} onChange={e => setShowRename({...showRename, name: e.target.value})} className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white outline-none focus:border-indigo-500" />
                 <div className="flex justify-end gap-2">
                     <button type="button" onClick={() => setShowRename(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                     <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded">Rename</button>
                 </div>
             </form>
          )}
       </Modal>
       <Modal isOpen={!!showPermissions} onClose={() => setShowPermissions(null)} title="Permissions Manager" maxWidth="max-w-xl">
          {showPermissions && <PermissionsManager item={showPermissions} currentPath={currentPath} connectionId={subTab.connectionId} onClose={() => setShowPermissions(null)} onRefresh={() => refreshFiles(currentPath)} />}
       </Modal>
       
       <SimpleInputModal 
         isOpen={showNewFile} 
         onClose={() => setShowNewFile(false)} 
         title="New File" 
         placeholder="filename.txt" 
         onSubmit={handleCreateFile} 
       />
       <SimpleInputModal 
         isOpen={showNewFolder} 
         onClose={() => setShowNewFolder(false)} 
         title="New Folder" 
         placeholder="Folder Name" 
         onSubmit={handleCreateFolder} 
       />
    </div>
  );
}

// Need a SessionView component to handle subtabs logic
const SessionView = ({ session, updateSession, clipboard, setClipboard }: { session: ServerSession, updateSession: (s: ServerSession) => void, clipboard: ClipboardState | null, setClipboard: (c: ClipboardState | null) => void }) => {
    const activeSubTab = session.subTabs.find(t => t.id === session.activeSubTabId);

    const handleAddTab = (type: 'terminal' | 'sftp') => {
        const newTab: SubTab = {
            id: crypto.randomUUID(),
            type,
            title: type === 'terminal' ? 'Terminal' : 'SFTP',
            connectionId: crypto.randomUUID(),
            path: type === 'sftp' ? '/' : undefined
        };
        updateSession({
            ...session,
            subTabs: [...session.subTabs, newTab],
            activeSubTabId: newTab.id
        });
    };
    
    const closeTab = (id: string) => {
        const newTabs = session.subTabs.filter(t => t.id !== id);
        let newActive = session.activeSubTabId;
        if (activeSubTab?.id === id) {
            newActive = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
        }
        updateSession({
            ...session,
            subTabs: newTabs,
            activeSubTabId: newActive
        });
    };

    const handleOpenFile = (path: string) => {
         // Check if already open
         const existing = session.subTabs.find(t => t.type === 'editor' && t.path === path);
         if (existing) {
             updateSession({ ...session, activeSubTabId: existing.id });
             return;
         }

         const newTab: SubTab = {
            id: crypto.randomUUID(),
            type: 'editor',
            title: path.split('/').pop() || 'file',
            connectionId: crypto.randomUUID(),
            path
         };
         updateSession({
             ...session,
             subTabs: [...session.subTabs, newTab],
             activeSubTabId: newTab.id
         });
    };

    return (
        <div className="flex-1 flex flex-col min-h-0">
             {/* SubTabs Bar */}
             <div className="bg-[#18181b] border-b border-[#27272a] flex items-center px-2 gap-1 h-9">
                 {session.subTabs.map(tab => (
                     <div key={tab.id} 
                          onClick={() => updateSession({...session, activeSubTabId: tab.id})}
                          className={cn(
                              "flex items-center gap-2 px-3 py-1 rounded-t text-xs cursor-pointer border-t border-x mb-[-1px] select-none h-full",
                              session.activeSubTabId === tab.id 
                                ? "bg-[#1e1e1e] border-[#3e3e42] text-white" 
                                : "bg-transparent border-transparent text-slate-500 hover:bg-[#1f1f23]"
                          )}
                     >
                         <span className="flex items-center gap-1.5">
                             {tab.type === 'terminal' && <Terminal size={12}/>}
                             {tab.type === 'sftp' && <Folder size={12}/>}
                             {tab.type === 'editor' && <FileText size={12}/>}
                             {tab.title}
                         </span>
                         <button onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} className="hover:text-red-400 p-0.5 rounded"><X size={10}/></button>
                     </div>
                 ))}
                 <div className="flex items-center ml-2 border-l border-slate-700 pl-2 gap-1">
                     <button onClick={() => handleAddTab('terminal')} className="p-1 text-slate-500 hover:text-white" title="New Terminal"><Terminal size={14}/></button>
                     <button onClick={() => handleAddTab('sftp')} className="p-1 text-slate-500 hover:text-white" title="New SFTP"><Folder size={14}/></button>
                 </div>
             </div>
             
             {/* Content */}
             <div className="flex-1 bg-[#1e1e1e] relative">
                 {session.subTabs.map(tab => (
                     <div key={tab.id} className={cn("absolute inset-0 w-full h-full", session.activeSubTabId === tab.id ? "z-10" : "z-0 invisible")}>
                         {tab.type === 'terminal' && (
                             <TerminalPane subTab={tab} connection={session.connection} visible={session.activeSubTabId === tab.id} />
                         )}
                         {tab.type === 'sftp' && (
                             <SFTPPane 
                               subTab={tab} 
                               connection={session.connection} 
                               visible={session.activeSubTabId === tab.id}
                               onPathChange={(p) => { }}
                               onOpenTerminal={(path) => { }}
                               onOpenFile={handleOpenFile}
                               clipboard={clipboard}
                               setClipboard={setClipboard}
                             />
                         )}
                         {tab.type === 'editor' && (
                             <FileEditorPane subTab={tab} connection={session.connection} visible={session.activeSubTabId === tab.id} />
                         )}
                     </div>
                 ))}
             </div>
        </div>
    );
};

const NewConnectionModal = ({ onClose, onSave }: { onClose: () => void, onSave: (c: SSHConnection) => void }) => {
    const [conn, setConn] = useState<Partial<SSHConnection>>({ port: 22, name: 'New Connection' });
    
    const handleSave = () => {
        if (!conn.host || !conn.username) return alert("Host and Username required");
        onSave({ 
            id: crypto.randomUUID(), 
            name: conn.name || conn.host, 
            host: conn.host, 
            port: conn.port || 22, 
            username: conn.username,
            password: conn.password,
            privateKeyPath: conn.privateKeyPath,
            passphrase: conn.passphrase
        });
    };
    
    const selectKey = async () => {
        const path = await window.electron?.selectKeyFile();
        if (path) setConn(c => ({ ...c, privateKeyPath: path }));
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="New Connection">
            <div className="space-y-4">
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Name</label>
                    <input className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm" value={conn.name} onChange={e => setConn({...conn, name: e.target.value})} />
                </div>
                <div className="grid grid-cols-3 gap-4">
                    <div className="col-span-2">
                        <label className="block text-xs text-slate-500 mb-1">Host</label>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm" value={conn.host} onChange={e => setConn({...conn, host: e.target.value})} placeholder="192.168.1.1" />
                    </div>
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Port</label>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm" type="number" value={conn.port} onChange={e => setConn({...conn, port: parseInt(e.target.value)})} />
                    </div>
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Username</label>
                    <input className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm" value={conn.username} onChange={e => setConn({...conn, username: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Password (Optional)</label>
                    <input className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm" type="password" value={conn.password} onChange={e => setConn({...conn, password: e.target.value})} />
                </div>
                <div>
                    <label className="block text-xs text-slate-500 mb-1">Private Key (Optional)</label>
                    <div className="flex gap-2">
                        <input className="flex-1 bg-slate-950 border border-slate-800 rounded p-2 text-sm" value={conn.privateKeyPath || ''} readOnly placeholder="Select key file..." />
                        <button onClick={selectKey} className="px-3 bg-slate-800 rounded hover:bg-slate-700 text-sm"><Folder size={14}/></button>
                    </div>
                </div>
                {conn.privateKeyPath && (
                    <div>
                        <label className="block text-xs text-slate-500 mb-1">Passphrase (if encrypted)</label>
                        <input className="w-full bg-slate-950 border border-slate-800 rounded p-2 text-sm" type="password" value={conn.passphrase} onChange={e => setConn({...conn, passphrase: e.target.value})} />
                    </div>
                )}
                <div className="flex justify-end gap-2 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium">Save Connection</button>
                </div>
            </div>
        </Modal>
    );
};

export default function App() {
  const [connections, setConnections] = useState<SSHConnection[]>([]);
  const [sessions, setSessions] = useState<ServerSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);
  const [showNewConnection, setShowNewConnection] = useState(false);

  // Load connections on mount
  useEffect(() => {
    const saved = localStorage.getItem('connections');
    if (saved) {
      setConnections(JSON.parse(saved));
    }
  }, []);

  // Save connections
  useEffect(() => {
    localStorage.setItem('connections', JSON.stringify(connections));
  }, [connections]);

  const handleConnect = async (conn: SSHConnection) => {
    // Check if session already exists
    const existing = sessions.find(s => s.connection.id === conn.id);
    if (existing) {
      setActiveSessionId(existing.id);
      return;
    }

    const newSession: ServerSession = {
      id: crypto.randomUUID(),
      connection: conn,
      subTabs: [
        { id: crypto.randomUUID(), type: 'terminal', title: 'Terminal', connectionId: crypto.randomUUID() },
        { id: crypto.randomUUID(), type: 'sftp', title: 'SFTP', connectionId: crypto.randomUUID(), path: '/' }
      ],
      activeSubTabId: null // Will set first one active
    };
    newSession.activeSubTabId = newSession.subTabs[0].id;

    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
  };
  
  const handleCloseSession = (sessionId: string) => {
     setSessions(prev => prev.filter(s => s.id !== sessionId));
     if (activeSessionId === sessionId) {
         setActiveSessionId(null);
     }
  };

  const activeSession = sessions.find(s => s.id === activeSessionId);

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
       {/* Sidebar */}
       <div className="w-64 flex flex-col border-r border-slate-800 bg-slate-950 pt-10">
           <div className="h-10 border-b border-slate-800 flex items-center px-4 font-bold text-indigo-400 select-none drag-region">
               TERMINUS
           </div>
           <div className="p-2">
               <button onClick={() => setShowNewConnection(true)} className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white p-2 rounded-lg transition-colors text-sm font-medium">
                   <Plus size={16} /> New Connection
               </button>
           </div>
           <div className="flex-1 overflow-y-auto p-2 space-y-1">
               {connections.map(conn => (
                   <div key={conn.id} className="group flex items-center justify-between p-2 hover:bg-slate-900 rounded-lg cursor-pointer transition-colors" onClick={() => handleConnect(conn)}>
                       <div className="flex items-center gap-3 overflow-hidden">
                           <div className="bg-slate-800 p-1.5 rounded"><Server size={14} className="text-slate-400"/></div>
                           <div className="flex flex-col overflow-hidden">
                               <span className="text-sm font-medium truncate text-slate-300">{conn.name}</span>
                               <span className="text-xs text-slate-500 truncate">{conn.username}@{conn.host}</span>
                           </div>
                       </div>
                       <button onClick={(e) => { e.stopPropagation(); setConnections(connections.filter(c => c.id !== conn.id)) }} className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 hover:text-red-400 rounded transition-all"><Trash size={12}/></button>
                   </div>
               ))}
           </div>
       </div>

       {/* Main Content */}
       <div className="flex-1 flex flex-col min-w-0 bg-[#020617] pt-10">
            {/* Titlebar / Tabs */}
            <div className="h-10 flex items-center bg-slate-950 border-b border-slate-800 drag-region pl-2">
                 <div className="flex items-center gap-1 overflow-x-auto no-scrollbar max-w-[calc(100vw-300px)]">
                     {sessions.map(session => (
                         <div key={session.id} 
                              onClick={() => setActiveSessionId(session.id)}
                              className={cn(
                                  "group flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer border transition-all min-w-[120px] max-w-[200px] no-drag",
                                  activeSessionId === session.id 
                                    ? "bg-indigo-600/10 border-indigo-500/50 text-indigo-300" 
                                    : "bg-slate-900 border-transparent hover:bg-slate-800 text-slate-400"
                              )}
                         >
                             <span className="truncate flex-1">{session.connection.name}</span>
                             <button onClick={(e) => { e.stopPropagation(); handleCloseSession(session.id); }} className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-slate-700 rounded"><X size={10}/></button>
                         </div>
                     ))}
                 </div>
            </div>

            {/* Session Content */}
            {activeSession ? (
                <SessionView session={activeSession} updateSession={(s) => setSessions(prev => prev.map(x => x.id === s.id ? s : x))} clipboard={clipboard} setClipboard={setClipboard} />
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-600 gap-4">
                    <Server size={48} className="opacity-20" />
                    <p className="text-sm">Select a connection to start</p>
                </div>
            )}
       </div>

       {/* New Connection Modal */}
       {showNewConnection && (
           <NewConnectionModal onClose={() => setShowNewConnection(false)} onSave={(conn) => { setConnections([...connections, conn]); setShowNewConnection(false); }} />
       )}
    </div>
  );
}
