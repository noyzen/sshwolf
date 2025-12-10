import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { 
  Terminal, Folder, Settings, Plus, Trash, Upload, Download, 
  FileText, X, Server, LogOut, RefreshCw, FolderPlus, FilePlus,
  Archive, Expand, Edit2, Monitor, ArrowUp, Lock, Edit3,
  Zap, Save, CheckSquare, Square, Key, Shield, Type, WrapText,
  Minus, AlignLeft, AlertTriangle, Search, History, Play, Star
} from 'lucide-react';
import { SSHConnection, FileEntry, ServerSession, SubTab, QuickCommand } from './types';
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
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
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

const FileEditor = ({ file, connectionId, onClose, onRefresh }: { file: {path: string, content: string}, connectionId: string, onClose: () => void, onRefresh: () => void }) => {
  const [content, setContent] = useState(file.content);
  const [saving, setSaving] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.electron?.sftpWriteFile(connectionId, file.path, content);
      onRefresh();
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

  return createPortal(
    <div className="fixed inset-0 z-[100] bg-[#1e1e1e] flex flex-col animate-in fade-in duration-200 font-sans">
       <div className="h-12 bg-[#252526] border-b border-[#3e3e42] flex items-center justify-between px-4 shadow-sm shrink-0">
          <div className="flex items-center gap-4 overflow-hidden">
             <div className="flex items-center gap-2 text-slate-300">
                <FileText className="text-[#4fc1ff]" size={18} />
                <span className="font-mono text-xs truncate max-w-[300px]">{file.path}</span>
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
             <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-300 hover:bg-[#3e3e42] rounded transition-colors">Close</button>
             <button disabled={saving} onClick={handleSave} className="flex items-center gap-2 px-4 py-1.5 text-xs bg-[#007acc] hover:bg-[#0062a3] text-white rounded transition-all disabled:opacity-50">
               {saving ? <RefreshCw className="animate-spin" size={12} /> : <Save size={12} />} Save
             </button>
          </div>
       </div>
       <div className="flex-1 relative bg-[#1e1e1e]">
         <textarea 
           ref={textAreaRef}
           className={cn("absolute inset-0 w-full h-full bg-[#1e1e1e] text-[#d4d4d4] font-mono p-4 outline-none resize-none leading-relaxed custom-scrollbar border-none", wordWrap ? "whitespace-pre-wrap" : "whitespace-pre")}
           style={{ fontSize: `${fontSize}px` }}
           value={content}
           onChange={e => { setContent(e.target.value); updateCursor(e); }}
           onClick={updateCursor} onKeyUp={updateCursor} onKeyDown={handleKeyDown} spellCheck={false}
         />
       </div>
       <div className="h-6 bg-[#007acc] text-white text-[11px] flex items-center px-4 justify-between select-none">
           <div className="flex gap-4"><span>Ln {cursorPos.line}, Col {cursorPos.col}</span><span>UTF-8</span></div>
       </div>
    </div>, document.body
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

const SFTPPane = ({ subTab, connection, visible, onPathChange, onOpenTerminal }: { subTab: SubTab, connection: SSHConnection, visible: boolean, onPathChange: (path: string) => void, onOpenTerminal: (path: string) => void }) => {
  const [currentPath, setCurrentPath] = useState(subTab.path || '/');
  const [pathInput, setPathInput] = useState(currentPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  
  // Modals
  const [editingFile, setEditingFile] = useState<{path: string, content: string} | null>(null);
  const [showRename, setShowRename] = useState<{item: FileEntry, name: string} | null>(null);
  const [showPermissions, setShowPermissions] = useState<FileEntry | null>(null);

  const refreshFiles = useCallback(async (path: string) => {
    setIsLoading(true);
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

  const openEditor = async (file: FileEntry) => {
    try {
      const content = await window.electron?.sftpReadFile(subTab.connectionId, `${currentPath}/${file.filename}`);
      setEditingFile({ path: `${currentPath}/${file.filename}`, content });
    } catch (e: any) { alert(`Error: ${e.message}`); }
  };

  return (
    <div className="flex flex-col h-full bg-[#020617]">
       {/* Address Bar */}
       <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-3 bg-slate-950/50">
          <div className="flex gap-1">
             <button onClick={handleUpDir} disabled={currentPath === '/'} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors border border-slate-700/50"><ArrowUp size={16} /></button>
             <button onClick={() => refreshFiles(currentPath)} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700/50"><RefreshCw size={16} className={isLoading ? "animate-spin" : ""} /></button>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); refreshFiles(pathInput); }} className="flex-1">
             <input type="text" value={pathInput} onChange={(e) => setPathInput(e.target.value)} className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 font-mono transition-all" />
          </form>
          <div className="h-6 w-px bg-slate-800 mx-1" />
          <button onClick={() => onOpenTerminal(currentPath)} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-indigo-400 transition-colors border border-slate-700/50" title="Open Terminal Here"><Terminal size={16} /></button>
          <div className="h-6 w-px bg-slate-800 mx-1" />
          <div className="flex gap-1">
              <button onClick={async () => { const name = prompt("File name:"); if(name) { await window.electron?.sftpWriteFile(subTab.connectionId, currentPath === '/' ? `/${name}` : `${currentPath}/${name}`, ""); refreshFiles(currentPath); } }} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50"><FilePlus size={14} /> New File</button>
              <button onClick={async () => { const name = prompt("Folder name:"); if(name) { await window.electron?.sftpCreateFolder(subTab.connectionId, currentPath === '/' ? `/${name}` : `${currentPath}/${name}`); refreshFiles(currentPath); } }} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50"><FolderPlus size={14} /> New Folder</button>
              <button onClick={async () => { await window.electron?.sftpUpload(subTab.connectionId, currentPath); refreshFiles(currentPath); }} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 rounded-lg text-xs font-medium transition-colors border border-indigo-500/20"><Upload size={14} /> Upload</button>
          </div>
       </div>
       
       {/* File List */}
       <div className="flex-1 overflow-auto custom-scrollbar bg-[#020617]">
         <table className="w-full text-left text-xs border-separate border-spacing-0">
           <thead className="bg-slate-900/80 text-slate-500 sticky top-0 z-10 backdrop-blur-sm shadow-sm">
             <tr>
               <th className="p-3 pl-6 w-10 border-b border-slate-800">Type</th>
               <th className="p-3 border-b border-slate-800">Name</th>
               <th className="p-3 w-24 border-b border-slate-800">Size</th>
               <th className="p-3 w-24 border-b border-slate-800">Perms</th>
               <th className="p-3 w-48 text-right pr-6 border-b border-slate-800">Actions</th>
             </tr>
           </thead>
           <tbody className="divide-y divide-slate-800/30">
             {files.map((file, i) => (
               <tr key={i} className="hover:bg-slate-800/40 group transition-colors cursor-pointer" onDoubleClick={() => file.isDirectory ? handleNavigate(file.filename) : openEditor(file)}>
                 <td className="p-3 pl-6">{file.isDirectory ? <Folder size={16} className="text-indigo-400 fill-indigo-400/10" /> : <FileText size={16} className="text-slate-600" />}</td>
                 <td className="p-3 font-medium text-slate-300 group-hover:text-indigo-200">{file.filename}</td>
                 <td className="p-3 text-slate-500 font-mono">{file.isDirectory ? '-' : (file.attrs.size < 1024 ? file.attrs.size + ' B' : (file.attrs.size / 1024).toFixed(1) + ' KB')}</td>
                 <td className="p-3 text-slate-500 font-mono text-[10px] uppercase">{file.attrs.mode.toString(8).slice(-3)}</td>
                 <td className="p-3 text-right pr-6">
                    <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                       {!file.isDirectory && <button onClick={(e) => { e.stopPropagation(); openEditor(file); }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-300 text-slate-500 rounded" title="Edit"><Edit2 size={14} /></button>}
                       <button onClick={(e) => { e.stopPropagation(); setShowRename({item: file, name: file.filename}) }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-300 text-slate-500 rounded" title="Rename"><Edit3 size={14} /></button>
                       <button onClick={(e) => { e.stopPropagation(); setShowPermissions(file) }} className="p-1.5 hover:bg-slate-700 hover:text-amber-300 text-slate-500 rounded" title="Permissions"><Lock size={14} /></button>
                       {!file.isDirectory && <button onClick={(e) => { e.stopPropagation(); window.electron?.sftpDownload(subTab.connectionId, `${currentPath}/${file.filename}`) }} className="p-1.5 hover:bg-slate-700 hover:text-emerald-400 text-slate-500 rounded" title="Download"><Download size={14} /></button>}
                       <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete?')) window.electron?.sftpDelete(subTab.connectionId, `${currentPath}/${file.filename}`, file.isDirectory).then(() => refreshFiles(currentPath)); }} className="p-1.5 hover:bg-slate-700 hover:text-red-400 text-slate-500 rounded" title="Delete"><Trash size={14} /></button>
                    </div>
                 </td>
               </tr>
             ))}
           </tbody>
         </table>
       </div>
       
       {editingFile && <FileEditor file={editingFile} connectionId={subTab.connectionId} onClose={() => setEditingFile(null)} onRefresh={() => refreshFiles(currentPath)} />}
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
    </div>
  );
};

// --- Session View (Server Tab) ---

const SessionView = ({ session, visible, onUpdate, onClose }: { session: ServerSession, visible: boolean, onUpdate: (s: ServerSession) => void, onClose: () => void }) => {
  
  const addSubTab = (type: 'terminal' | 'sftp', path?: string) => {
    const newTab: SubTab = {
      id: crypto.randomUUID(),
      type,
      title: type === 'terminal' ? (path ? 'Terminal' : `Terminal ${session.subTabs.filter(t => t.type === 'terminal').length + 1}`) : 'Files',
      connectionId: crypto.randomUUID(), // Each subtab gets its own connection
      path: path || '/'
    };
    onUpdate({
      ...session,
      subTabs: [...session.subTabs, newTab],
      activeSubTabId: newTab.id
    });
  };

  const closeSubTab = (tabId: string) => {
    // Cleanup backend connection
    const tab = session.subTabs.find(t => t.id === tabId);
    if (tab) window.electron?.sshDisconnect(tab.connectionId);
    
    const newTabs = session.subTabs.filter(t => t.id !== tabId);
    let newActive = session.activeSubTabId;
    if (newActive === tabId) {
       newActive = newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null;
    }
    onUpdate({ ...session, subTabs: newTabs, activeSubTabId: newActive });
  };

  const updateSubTab = (tabId: string, updates: Partial<SubTab>) => {
    const newTabs = session.subTabs.map(t => t.id === tabId ? { ...t, ...updates } : t);
    onUpdate({ ...session, subTabs: newTabs });
  };

  if (!visible) return null; 

  return (
    <div className="flex flex-col h-full w-full">
      {/* Sub-Tab Bar */}
      <div className="h-9 bg-[#0f172a] border-b border-slate-800 flex items-center px-2 shrink-0 select-none">
         <div className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-none">
            {session.subTabs.map(tab => (
               <div 
                 key={tab.id}
                 onClick={() => onUpdate({ ...session, activeSubTabId: tab.id })}
                 className={cn(
                   "group flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md cursor-pointer border transition-all min-w-[100px] max-w-[200px]",
                   session.activeSubTabId === tab.id 
                     ? "bg-slate-800 text-indigo-400 border-slate-700 shadow-sm" 
                     : "text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300"
                 )}
               >
                  {tab.type === 'terminal' ? <Terminal size={12} /> : <Folder size={12} />}
                  <span className="truncate flex-1">{tab.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); closeSubTab(tab.id); }} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5"><X size={10} /></button>
               </div>
            ))}
            
            <div className="h-4 w-px bg-slate-800 mx-1" />
            
            <button onClick={() => addSubTab('terminal')} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors" title="New Terminal">
              <Plus size={12} /> Term
            </button>
            <button onClick={() => addSubTab('sftp')} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors" title="New File Manager">
              <Plus size={12} /> SFTP
            </button>
         </div>
      </div>

      {/* Content Area - Render ALL tabs but hide inactive ones to preserve state/connections */}
      <div className="flex-1 relative bg-[#020617] overflow-hidden">
         {session.subTabs.map(tab => (
            <div key={tab.id} className={cn("absolute inset-0 w-full h-full", session.activeSubTabId === tab.id ? "z-10" : "z-0 invisible")}>
                {tab.type === 'terminal' ? (
                   <TerminalPane subTab={tab} connection={session.connection} visible={session.activeSubTabId === tab.id} />
                ) : (
                   <SFTPPane 
                     subTab={tab} 
                     connection={session.connection} 
                     visible={session.activeSubTabId === tab.id} 
                     onPathChange={(path) => updateSubTab(tab.id, { path, title: path })}
                     onOpenTerminal={(path) => addSubTab('terminal', path)}
                   />
                )}
            </div>
         ))}
         {session.subTabs.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-slate-600">
               <p className="mb-4">No open tools.</p>
               <div className="flex gap-4">
                  <button onClick={() => addSubTab('terminal')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300">Open Terminal</button>
                  <button onClick={() => addSubTab('sftp')} className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded text-slate-300">Open Files</button>
               </div>
            </div>
         )}
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  // Use lazy initialization for state to prevent overwriting localStorage on initial render
  const [serverSessions, setServerSessions] = useState<ServerSession[]>(() => {
    try {
      const saved = localStorage.getItem('ssh-server-sessions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load sessions", e);
      return [];
    }
  });

  const [activeSessionId, setActiveSessionId] = useState<string | null>(() => {
      const savedId = localStorage.getItem('ssh-active-session-id');
      return savedId || null;
  });

  const [connections, setConnections] = useState<SSHConnection[]>(() => {
    try {
      const saved = localStorage.getItem('ssh-connections');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  const [isManagerOpen, setManagerOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Partial<SSHConnection> | null>(null);
  const [authType, setAuthType] = useState<'password'|'key'>('password');

  // Initial Check
  useEffect(() => {
    if (serverSessions.length === 0) {
      setManagerOpen(true);
    } else if (!activeSessionId) {
      setActiveSessionId(serverSessions[serverSessions.length - 1].id);
    }
  }, []); // Run once on mount

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('ssh-server-sessions', JSON.stringify(serverSessions));
  }, [serverSessions]);

  useEffect(() => {
    if (activeSessionId) localStorage.setItem('ssh-active-session-id', activeSessionId);
  }, [activeSessionId]);

  useEffect(() => {
    localStorage.setItem('ssh-connections', JSON.stringify(connections));
  }, [connections]);


  useEffect(() => {
    if (editingConnection) {
        if (editingConnection.privateKeyPath) setAuthType('key');
        else setAuthType('password');
    }
  }, [editingConnection]);

  const createServerSession = (conn: SSHConnection) => {
    // Single Instance Check
    const existing = serverSessions.find(s => s.connection.id === conn.id);
    if (existing) {
      setActiveSessionId(existing.id);
      setManagerOpen(false);
      return;
    }

    // Default to one terminal
    const initialTab: SubTab = {
       id: crypto.randomUUID(),
       type: 'terminal',
       title: 'Terminal 1',
       connectionId: crypto.randomUUID()
    };
    
    const newSession: ServerSession = {
      id: crypto.randomUUID(),
      connection: conn,
      subTabs: [initialTab],
      activeSubTabId: initialTab.id
    };
    
    setServerSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    setManagerOpen(false);
  };

  const closeServerSession = (id: string) => {
    const session = serverSessions.find(s => s.id === id);
    if (session && session.subTabs.length > 0) {
       if (!confirm(`Close ${session.connection.name} and all ${session.subTabs.length} active tabs?`)) return;
    }
    
    // Disconnect all
    session?.subTabs.forEach(t => window.electron?.sshDisconnect(t.connectionId));

    setServerSessions(prev => {
      const newSessions = prev.filter(s => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(newSessions.length > 0 ? newSessions[newSessions.length - 1].id : null);
      }
      return newSessions;
    });
  };

  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConnection) return;
    const finalConn = { ...editingConnection };
    if (authType === 'password') { delete finalConn.privateKeyPath; delete finalConn.passphrase; } 
    else { delete finalConn.password; }

    if (finalConn.id) {
      const updated = connections.map(c => c.id === finalConn.id ? finalConn as SSHConnection : c);
      setConnections(updated);
    } else {
      const newConn = { ...finalConn, id: Math.random().toString(36).substr(2, 9) } as SSHConnection;
      setConnections([...connections, newConn]);
    }
    setEditingConnection(null);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {/* --- Main Server Tabs (Titlebar) --- */}
      <div className={cn("h-10 flex items-end bg-slate-950 border-b border-slate-800 select-none titlebar w-full z-50 overflow-hidden", isMac && "pl-20", isWindows && "pr-36")}>
        <div className="flex items-center h-full px-2 gap-1 overflow-x-auto w-full scrollbar-none">
          {serverSessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={cn(
                "group relative flex items-center gap-2 px-3 h-8 min-w-[140px] max-w-[200px] rounded-t-lg border-t border-x text-sm cursor-pointer transition-all no-drag",
                activeSessionId === session.id ? "bg-[#0f172a] border-slate-700 text-indigo-400 z-10 font-medium shadow-sm" : "bg-slate-900/50 border-transparent text-slate-500 hover:bg-slate-900 hover:text-slate-300 mb-0.5"
              )}
            >
               <Server size={12} className={activeSessionId === session.id ? "text-indigo-500" : "opacity-50"} />
               <span className="truncate flex-1">{session.connection.name}</span>
               <button onClick={(e) => { e.stopPropagation(); closeServerSession(session.id); }} className="opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 p-0.5 rounded transition-all no-drag"><X size={12} /></button>
               {activeSessionId === session.id && <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-[#0f172a] z-20" />}
            </div>
          ))}
          <button onClick={() => { setEditingConnection(null); setManagerOpen(true); }} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-900 text-slate-500 hover:text-indigo-400 transition-colors mb-0.5 no-drag" title="New Connection"><Plus size={18} /></button>
        </div>
      </div>

      {/* --- Main Content --- */}
      <div className="flex-1 relative overflow-hidden bg-[#020617]">
        {serverSessions.map(session => (
           <div key={session.id} className={cn("absolute inset-0 w-full h-full", activeSessionId === session.id ? "z-0" : "invisible")}>
              <SessionView 
                session={session} 
                visible={activeSessionId === session.id} 
                onUpdate={(updated) => setServerSessions(prev => prev.map(s => s.id === updated.id ? updated : s))}
                onClose={() => closeServerSession(session.id)}
              />
           </div>
        ))}
        {serverSessions.length === 0 && !isManagerOpen && (
           <div className="flex flex-col items-center justify-center h-full text-slate-600">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-black/20"><Server size={32} /></div>
              <h2 className="text-xl font-bold text-slate-400">No Active Sessions</h2>
              <button onClick={() => setManagerOpen(true)} className="mt-4 text-indigo-400 hover:text-indigo-300 hover:underline">Open Connection Manager</button>
           </div>
        )}
      </div>

      {/* --- Connection Manager Modal --- */}
      <Modal isOpen={isManagerOpen} onClose={() => { if(serverSessions.length > 0 || editingConnection) { setEditingConnection(null); if(serverSessions.length > 0) setManagerOpen(false); }}} title={editingConnection ? (editingConnection.id ? "Edit Connection" : "New Connection") : "Connection Manager"} hideClose={!editingConnection && serverSessions.length === 0}>
        {!editingConnection ? (
          <div className="space-y-3">
             <div className="grid grid-cols-1 gap-3">
                {connections.map(conn => (
                  <div key={conn.id} className="group bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 transition-all flex items-center justify-between">
                     <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => createServerSession(conn)}>
                        <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-indigo-500 shadow-inner"><Server size={20} /></div>
                        <div><h4 className="font-bold text-slate-200">{conn.name}</h4><p className="text-xs text-slate-500 font-mono">{conn.username}@{conn.host}</p></div>
                     </div>
                     <div className="flex gap-1">
                        <button onClick={() => setEditingConnection(conn)} className="p-2 text-slate-500 hover:bg-slate-900 hover:text-indigo-400 rounded-lg transition-colors" title="Edit"><Edit2 size={16} /></button>
                        <button onClick={() => { if(confirm(`Delete ${conn.name}?`)) setConnections(connections.filter(c => c.id !== conn.id)); }} className="p-2 text-slate-500 hover:bg-slate-900 hover:text-red-400 rounded-lg transition-colors" title="Delete"><Trash size={16} /></button>
                        <button onClick={() => createServerSession(conn)} className="ml-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20">Connect</button>
                     </div>
                  </div>
                ))}
                <button onClick={() => setEditingConnection({ port: 22 })} className="w-full py-3 border-2 border-dashed border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 text-slate-500 hover:text-slate-300 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"><Plus size={18} /> Add New Connection</button>
             </div>
          </div>
        ) : (
          <form onSubmit={handleSaveConnection} className="space-y-4">
            <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Connection Name</label><input required className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700" placeholder="Production Server" value={editingConnection.name || ''} onChange={e => setEditingConnection({...editingConnection, name: e.target.value})} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2"><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Hostname / IP</label><input required className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm" placeholder="192.168.1.1" value={editingConnection.host || ''} onChange={e => setEditingConnection({...editingConnection, host: e.target.value})} /></div>
              <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Port</label><input type="number" required className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm" value={editingConnection.port || 22} onChange={e => setEditingConnection({...editingConnection, port: parseInt(e.target.value)})} /></div>
            </div>
            <div><label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Username</label><input required className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm" placeholder="root" value={editingConnection.username || ''} onChange={e => setEditingConnection({...editingConnection, username: e.target.value})} /></div>
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-4">
                 <div className="flex items-center justify-between"><label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Authentication</label><div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800"><button type="button" onClick={() => setAuthType('password')} className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", authType === 'password' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300")}>Password</button><button type="button" onClick={() => setAuthType('key')} className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", authType === 'key' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300")}>Private Key</button></div></div>
                 {authType === 'password' ? (<input type="password" className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm" placeholder="Password" value={editingConnection.password || ''} onChange={e => setEditingConnection({...editingConnection, password: e.target.value})} />) : (<div className="space-y-3"><div className="flex gap-2"><div className="relative flex-1"><Key className="absolute left-3 top-3 text-slate-600" size={16} /><input readOnly className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 pl-10 text-slate-300 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-xs" placeholder="No key selected" value={editingConnection.privateKeyPath || ''} /></div><button type="button" onClick={async () => { const path = await window.electron?.selectKeyFile(); if(path) setEditingConnection({...editingConnection, privateKeyPath: path}); }} className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm border border-slate-700 transition-colors">Browse</button></div><div className="relative"><Shield className="absolute left-3 top-3 text-slate-600" size={16} /><input type="password" className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 pl-10 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm" placeholder="Passphrase (Optional)" value={editingConnection.passphrase || ''} onChange={e => setEditingConnection({...editingConnection, passphrase: e.target.value})} /></div></div>)}
            </div>
            <div className="pt-4 flex justify-between items-center border-t border-slate-800 mt-4"><button type="button" onClick={() => setEditingConnection(null)} className="text-slate-500 hover:text-slate-300 text-sm font-medium px-2 py-1">Back to list</button><button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all">Save Connection</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}