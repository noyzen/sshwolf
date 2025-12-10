import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { 
  Terminal, Folder, Settings, Plus, Trash, Upload, Download, 
  FileText, X, Server, LogOut, RefreshCw, FolderPlus,
  Archive, Expand, Edit2, Monitor, ArrowUp, Lock, Edit3,
  Zap, Save, CheckSquare, Square, Key, Shield
} from 'lucide-react';
import { SSHConnection, FileEntry, SavedSessionState, QuickCommand } from './types';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// OS Detection
const isMac = navigator.userAgent.includes('Mac');
const isWindows = navigator.userAgent.includes('Windows');

// --- Types ---

interface Session extends SavedSessionState {
  connected: boolean;
  isLoaded: boolean; // Has the user clicked the tab yet?
}

// --- Components ---

const Modal = ({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode, maxWidth?: string }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className={cn("bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[90vh]", maxWidth)}>
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/50 shrink-0">
          <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1 hover:bg-slate-800 rounded">
            <X size={20} />
          </button>
        </div>
        <div className="p-6 overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );
};

// --- Session View Component ---

const SessionView = ({ session, visible, onRemove, onUpdateState }: { 
  session: Session; 
  visible: boolean; 
  onRemove: () => void;
  onUpdateState: (updates: Partial<Session>) => void;
}) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'sftp'>(session.activeView || 'terminal');
  
  // Terminal State
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);
  const [quickCommands, setQuickCommands] = useState<QuickCommand[]>([]);
  const [showQuickCmds, setShowQuickCmds] = useState(false);
  const [newCmdName, setNewCmdName] = useState('');
  const [newCmdVal, setNewCmdVal] = useState('');

  // SFTP State
  const [currentPath, setCurrentPath] = useState(session.lastPath || '/');
  const [pathInput, setPathInput] = useState(session.lastPath || '/');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  // SFTP Modals
  const [showEditor, setShowEditor] = useState(false);
  const [editingFile, setEditingFile] = useState<{path: string, content: string} | null>(null);
  const [showRename, setShowRename] = useState<{item: FileEntry, name: string} | null>(null);
  const [showPermissions, setShowPermissions] = useState<{item: FileEntry, mode: number} | null>(null);
  const [permRecursive, setPermRecursive] = useState(false);

  // Load Quick Commands
  useEffect(() => {
    const saved = localStorage.getItem('quick-commands');
    if (saved) setQuickCommands(JSON.parse(saved));
  }, []);

  const saveQuickCommand = () => {
    if (!newCmdName || !newCmdVal) return;
    const newCmd = { id: crypto.randomUUID(), name: newCmdName, command: newCmdVal };
    const updated = [...quickCommands, newCmd];
    setQuickCommands(updated);
    localStorage.setItem('quick-commands', JSON.stringify(updated));
    setNewCmdName('');
    setNewCmdVal('');
  };

  const deleteQuickCommand = (id: string) => {
    const updated = quickCommands.filter(c => c.id !== id);
    setQuickCommands(updated);
    localStorage.setItem('quick-commands', JSON.stringify(updated));
  }

  // Lazy Connect Logic
  useEffect(() => {
    if (!visible) return; // Only start if tab is visible
    if (connectedRef.current) return; // Already connected
    if (session.connected) return; // Session marked as connected

    const initSession = async () => {
      connectedRef.current = true;
      onUpdateState({ isLoaded: true, connected: true });
      
      // Init XTerm
      if (terminalRef.current && !xtermRef.current) {
        const term = new XTerm({
          theme: {
            background: '#020617', // slate-950
            foreground: '#e2e8f0', // slate-200
            cursor: '#6366f1',
            selectionBackground: '#4338ca',
          },
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: 14,
          lineHeight: 1.4,
          cursorBlink: true,
          allowProposedApi: true,
          convertEol: true, // Fixes the "staircase" effect
        });
        
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        
        // Wait for DOM to render size
        setTimeout(() => {
           fitAddon.fit();
        }, 100);
        
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        // Key Handling (Ctrl+C / Ctrl+V)
        term.attachCustomKeyEventHandler((arg) => {
          if (arg.type === 'keydown') {
            if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyC') {
               const selection = term.getSelection();
               if (selection) {
                 navigator.clipboard.writeText(selection);
                 return false;
               }
            }
            if ((arg.ctrlKey || arg.metaKey) && arg.code === 'KeyV') {
               navigator.clipboard.readText().then(text => {
                 window.electron?.sshWrite(session.id, text);
               });
               return false;
            }
          }
          return true;
        });

        term.onData(data => {
          window.electron?.sshWrite(session.id, data);
        });

        // Resize handler
        const resizeObserver = new ResizeObserver(() => {
           if (visible) {
             fitAddon.fit();
             window.electron?.sshResize(session.id, term.cols, term.rows);
           }
        });
        resizeObserver.observe(terminalRef.current);

        // Cleanup listener for this session
        const cleanupData = window.electron?.onSSHData(({ connectionId, data }) => {
          if (connectionId === session.id) {
            term.write(data);
          }
        });

        const cleanupClose = window.electron?.onSSHClosed(({ connectionId }) => {
           if (connectionId === session.id) {
             term.writeln('\r\n\x1b[31mConnection closed.\x1b[0m');
             onUpdateState({ connected: false });
           }
        });

        try {
          term.writeln(`\x1b[34mConnecting to ${session.connection.host}...\x1b[0m\r\n`);
          
          // Connect using the SESSION ID
          await window.electron?.sshConnect({ 
             ...session.connection, 
             id: session.id,
             rows: term.rows,
             cols: term.cols
          });
          
          fitAddon.fit();
          
          // Initial SFTP
          refreshFiles(session.id, currentPath); 

        } catch (err: any) {
          term.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
          onUpdateState({ connected: false });
        }

        return () => {
          resizeObserver.disconnect();
          cleanupData && cleanupData();
          cleanupClose && cleanupClose();
          term.dispose();
          window.electron?.sshDisconnect(session.id);
        };
      }
    };

    initSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // Handle Resize Visibility
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (xtermRef.current) {
          window.electron?.sshResize(session.id, xtermRef.current.cols, xtermRef.current.rows);
        }
      }, 50);
    }
  }, [visible]);

  // Update persistent state when tabs change
  useEffect(() => {
    onUpdateState({ activeView: activeTab });
  }, [activeTab]);

  // --- SFTP Logic ---

  const refreshFiles = async (connId: string, path: string) => {
    setIsLoadingFiles(true);
    try {
      const list = await window.electron?.sftpList(connId, path);
      if (list) {
        const sorted = list.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) return a.filename.localeCompare(b.filename);
          return a.isDirectory ? -1 : 1;
        });
        setFiles(sorted);
        setCurrentPath(path);
        setPathInput(path);
        onUpdateState({ lastPath: path });
      }
    } catch (err) {
      xtermRef.current?.writeln(`\r\nSFTP Error: ${err}`);
      console.error(err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleNavigate = (folderName: string) => {
    const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    refreshFiles(session.id, newPath);
  };

  const handleUpDir = () => {
    if (currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    const newPath = parts.length === 1 ? '/' : parts.join('/');
    refreshFiles(session.id, newPath);
  };

  const handlePathSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    refreshFiles(session.id, pathInput);
  };

  const handleAction = async (action: () => Promise<any>, errorMsg: string) => {
    try {
      await action();
      refreshFiles(session.id, currentPath);
    } catch (e: any) {
      alert(`${errorMsg}: ${e.message}`);
    }
  };

  // --- Permission Helper ---
  
  const PermCheckbox = ({ label, checked, onChange }: { label: string, checked: boolean, onChange: (v: boolean) => void }) => (
    <div className="flex flex-col items-center justify-center p-2 bg-slate-950 rounded border border-slate-800">
      <span className="text-[10px] text-slate-500 mb-1 font-mono uppercase">{label}</span>
      <button onClick={() => onChange(!checked)} className={cn("transition-colors", checked ? "text-indigo-400" : "text-slate-700")}>
        {checked ? <CheckSquare size={18} /> : <Square size={18} />}
      </button>
    </div>
  );

  return (
    <div className={cn("absolute inset-0 flex flex-col bg-slate-950", visible ? "z-10" : "z-0 invisible")}>
      {/* Session Toolbar */}
      <div className="h-10 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 shrink-0 shadow-sm z-20">
         <div className="flex items-center gap-4">
            <div className="flex p-0.5 bg-slate-900 rounded-lg border border-slate-800">
             <button 
               onClick={() => setActiveTab('terminal')}
               className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'terminal' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200")}
             >
               <Terminal size={12} /> Terminal
             </button>
             <button 
               onClick={() => setActiveTab('sftp')}
               className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all flex items-center gap-2", activeTab === 'sftp' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-400 hover:text-slate-200")}
             >
               <Folder size={12} /> Files
             </button>
           </div>
         </div>
         {/* Status */}
         <div className="flex items-center gap-3">
             {activeTab === 'terminal' && (
                <div className="relative">
                   <button 
                      onClick={() => setShowQuickCmds(!showQuickCmds)}
                      className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-amber-400 transition-colors" title="Quick Commands"
                    >
                      <Zap size={14} />
                   </button>
                   {showQuickCmds && (
                      <div className="absolute right-0 top-full mt-2 w-64 bg-slate-900 border border-slate-700 rounded-lg shadow-xl z-50 p-2">
                          <h4 className="text-xs font-semibold text-slate-500 mb-2 px-1">QUICK COMMANDS</h4>
                          <div className="space-y-1 max-h-48 overflow-y-auto">
                             {quickCommands.map(qc => (
                               <div key={qc.id} className="flex items-center justify-between group p-1.5 hover:bg-slate-800 rounded cursor-pointer" onClick={() => {
                                 window.electron?.sshWrite(session.id, qc.command + '\r');
                                 setShowQuickCmds(false);
                               }}>
                                  <span className="text-sm text-slate-300">{qc.name}</span>
                                  <button onClick={(e) => { e.stopPropagation(); deleteQuickCommand(qc.id) }} className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400"><X size={12}/></button>
                               </div>
                             ))}
                          </div>
                          <div className="border-t border-slate-800 mt-2 pt-2 space-y-2">
                             <input placeholder="Name (e.g. htop)" className="w-full bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs" value={newCmdName} onChange={e => setNewCmdName(e.target.value)} />
                             <div className="flex gap-1">
                                <input placeholder="Command" className="flex-1 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs" value={newCmdVal} onChange={e => setNewCmdVal(e.target.value)} />
                                <button onClick={saveQuickCommand} className="bg-indigo-600 text-white rounded px-2 py-1 text-xs"><Plus size={12}/></button>
                             </div>
                          </div>
                      </div>
                   )}
                </div>
             )}
            <div className="flex items-center gap-2 text-xs text-slate-500 font-mono">
                <div className={cn("w-2 h-2 rounded-full", session.connected ? "bg-emerald-500 animate-pulse" : "bg-slate-700")} />
                {session.connected ? `Connected: ${session.connection.host}` : 'Disconnected'}
            </div>
         </div>
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* Terminal Layer */}
        <div className={cn("absolute inset-0 bg-[#020617] p-1", activeTab === 'terminal' ? "z-10" : "invisible")}>
           {!session.isLoaded && !visible && (
             <div className="flex h-full items-center justify-center text-slate-600 flex-col gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-slate-700 border-t-indigo-500 animate-spin" />
                <span className="text-xs">Initializing Session...</span>
             </div>
           )}
           <div ref={terminalRef} className="w-full h-full" />
        </div>

        {/* SFTP Layer */}
        <div className={cn("absolute inset-0 flex flex-col bg-[#020617] z-10", activeTab === 'sftp' ? "visible" : "invisible")}>
           {/* Address Bar */}
           <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-3 bg-slate-950/50">
              <div className="flex gap-1">
                 <button onClick={handleUpDir} disabled={currentPath === '/'} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white disabled:opacity-30 transition-colors border border-slate-700/50">
                   <ArrowUp size={16} />
                 </button>
                 <button onClick={() => refreshFiles(session.id, currentPath)} className="p-2 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors border border-slate-700/50">
                    <RefreshCw size={16} className={isLoadingFiles ? "animate-spin" : ""} />
                 </button>
              </div>
              
              <form onSubmit={handlePathSubmit} className="flex-1">
                 <input 
                    type="text" 
                    value={pathInput}
                    onChange={(e) => setPathInput(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-slate-300 text-sm rounded-lg px-3 py-1.5 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 font-mono transition-all"
                 />
              </form>

              <div className="h-6 w-px bg-slate-800 mx-1" />
              
              <div className="flex gap-1">
                 <button onClick={() => handleAction(async () => {
                      const name = prompt("Folder name:");
                      if(name) await window.electron?.sftpCreateFolder(session.id, currentPath === '/' ? `/${name}` : `${currentPath}/${name}`);
                  }, "Create Folder Failed")} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50">
                    <FolderPlus size={14} /> New Folder
                  </button>
                  <button onClick={() => handleAction(() => window.electron?.sftpUpload(session.id, currentPath), "Upload Failed")} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 rounded-lg text-xs font-medium transition-colors border border-indigo-500/20">
                    <Upload size={14} /> Upload
                  </button>
              </div>
           </div>
           
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
                   <tr 
                      key={i} 
                      className="hover:bg-slate-800/40 group transition-colors cursor-pointer"
                      onDoubleClick={() => file.isDirectory ? handleNavigate(file.filename) : handleAction(async () => {
                          // Check if text based
                          const ext = file.filename.split('.').pop()?.toLowerCase();
                          const isText = ['txt', 'js', 'ts', 'tsx', 'json', 'md', 'html', 'css', 'conf', 'cfg', 'log', 'sh', 'py', 'env', 'xml', 'yaml', 'yml'].includes(ext || '');
                          
                          if (isText || confirm("This file might not be text. Open editor anyway?")) {
                              const content = await window.electron?.sftpReadFile(session.id, `${currentPath}/${file.filename}`);
                              setEditingFile({ path: `${currentPath}/${file.filename}`, content });
                              setShowEditor(true);
                          }
                      }, "Read Failed")}
                   >
                     <td className="p-3 pl-6">
                       {file.isDirectory ? <Folder size={16} className="text-indigo-400 fill-indigo-400/10" /> : <FileText size={16} className="text-slate-600" />}
                     </td>
                     <td className="p-3 font-medium text-slate-300 group-hover:text-indigo-200">
                       {file.filename}
                     </td>
                     <td className="p-3 text-slate-500 font-mono">
                       {file.isDirectory ? '-' : (file.attrs.size < 1024 ? file.attrs.size + ' B' : (file.attrs.size / 1024).toFixed(1) + ' KB')}
                     </td>
                     <td className="p-3 text-slate-500 font-mono text-[10px] uppercase">
                       {file.attrs.mode.toString(8).slice(-3)}
                     </td>
                     <td className="p-3 text-right pr-6">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           {/* Context Actions */}
                           <button onClick={(e) => { e.stopPropagation(); setShowRename({item: file, name: file.filename}) }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-300 text-slate-500 rounded" title="Rename"><Edit3 size={14} /></button>
                           <button onClick={(e) => { e.stopPropagation(); setShowPermissions({item: file, mode: file.attrs.mode}) }} className="p-1.5 hover:bg-slate-700 hover:text-amber-300 text-slate-500 rounded" title="Permissions"><Lock size={14} /></button>
                           
                           {(file.filename.endsWith('.tar.gz') || file.filename.endsWith('.zip')) ? (
                             <button onClick={(e) => { e.stopPropagation(); window.electron?.sshExec(session.id, `cd "${currentPath}" && ${file.filename.endsWith('.zip') ? 'unzip' : 'tar -xzf'} "${file.filename}"`).then(() => refreshFiles(session.id, currentPath)); }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-400 text-slate-500 rounded" title="Extract"><Expand size={14} /></button>
                           ) : (
                             !file.isDirectory && <button onClick={(e) => { e.stopPropagation(); window.electron?.sshExec(session.id, `cd "${currentPath}" && tar -czf "${file.filename}.tar.gz" "${file.filename}"`).then(() => refreshFiles(session.id, currentPath)); }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-400 text-slate-500 rounded" title="Compress"><Archive size={14} /></button>
                           )}
                           
                           {!file.isDirectory && (
                             <button onClick={(e) => { e.stopPropagation(); handleAction(async () => window.electron?.sftpDownload(session.id, `${currentPath}/${file.filename}`), "Download Failed")}} className="p-1.5 hover:bg-slate-700 hover:text-emerald-400 text-slate-500 rounded" title="Download"><Download size={14} /></button>
                           )}
                           <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete?')) handleAction(async () => window.electron?.sftpDelete(session.id, `${currentPath}/${file.filename}`, file.isDirectory), "Delete Failed")}} className="p-1.5 hover:bg-slate-700 hover:text-red-400 text-slate-500 rounded" title="Delete"><Trash size={14} /></button>
                        </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* Built-in Editor Modal */}
      {showEditor && editingFile && (
        <div className="fixed inset-0 z-[60] bg-slate-950 flex flex-col animate-in slide-in-from-bottom-5 duration-200">
           <div className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 shadow-md">
              <div className="flex items-center gap-3">
                 <FileText className="text-indigo-400" size={18} />
                 <span className="font-mono text-sm text-slate-300">{editingFile.path}</span>
              </div>
              <div className="flex gap-3">
                 <button onClick={() => setShowEditor(false)} className="px-4 py-2 text-sm font-medium hover:text-white text-slate-400 transition-colors">Cancel</button>
                 <button onClick={() => handleAction(async () => {
                   await window.electron?.sftpWriteFile(session.id, editingFile.path, editingFile.content);
                   setShowEditor(false);
                 }, "Save Failed")} className="flex items-center gap-2 px-6 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg shadow-lg shadow-indigo-500/20 transition-all">
                   <Save size={16} /> Save Changes
                 </button>
              </div>
           </div>
           <div className="flex-1 relative">
             <textarea 
               className="absolute inset-0 w-full h-full bg-[#0d1117] text-slate-200 font-mono text-[13px] p-6 outline-none resize-none leading-relaxed"
               value={editingFile.content}
               onChange={e => setEditingFile({ ...editingFile, content: e.target.value })}
               spellCheck={false}
             />
           </div>
        </div>
      )}

      {/* Rename Modal */}
      <Modal isOpen={!!showRename} onClose={() => setShowRename(null)} title="Rename File">
          {showRename && (
             <form onSubmit={(e) => {
                 e.preventDefault();
                 handleAction(async () => {
                     await window.electron?.sftpRename(session.id, `${currentPath}/${showRename.item.filename}`, `${currentPath}/${showRename.name}`);
                     setShowRename(null);
                 }, "Rename Failed");
             }} className="space-y-4">
                 <input 
                   autoFocus
                   value={showRename.name} 
                   onChange={e => setShowRename({...showRename, name: e.target.value})}
                   className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-white outline-none focus:border-indigo-500"
                 />
                 <div className="flex justify-end gap-2">
                     <button type="button" onClick={() => setShowRename(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                     <button type="submit" className="px-4 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded">Rename</button>
                 </div>
             </form>
          )}
      </Modal>

      {/* Advanced Permission Manager */}
      <Modal isOpen={!!showPermissions} onClose={() => setShowPermissions(null)} title="Permissions Manager" maxWidth="max-w-xl">
          {showPermissions && (() => {
             // Decode Octal
             const currentOctal = showPermissions.mode.toString(8).slice(-3);
             const [own, grp, pub] = currentOctal.split('').map(Number);

             // State for Checkboxes
             const [perms, setPerms] = useState({
               own: { r: (own & 4) > 0, w: (own & 2) > 0, x: (own & 1) > 0 },
               grp: { r: (grp & 4) > 0, w: (grp & 2) > 0, x: (grp & 1) > 0 },
               pub: { r: (pub & 4) > 0, w: (pub & 2) > 0, x: (pub & 1) > 0 },
             });
             
             // Calculate Octal from State
             const calculateOctal = () => {
                const getDigit = (p: {r: boolean, w: boolean, x: boolean}) => (p.r ? 4 : 0) + (p.w ? 2 : 0) + (p.x ? 1 : 0);
                return `${getDigit(perms.own)}${getDigit(perms.grp)}${getDigit(perms.pub)}`;
             }
             
             const updatePerm = (cat: 'own'|'grp'|'pub', type: 'r'|'w'|'x', val: boolean) => {
               setPerms(prev => ({ ...prev, [cat]: { ...prev[cat], [type]: val } }));
             }

             return (
               <div className="space-y-6">
                 <div className="grid grid-cols-4 gap-4 text-center">
                    <div className="col-span-1"></div>
                    <div className="text-sm font-semibold text-slate-400">Read</div>
                    <div className="text-sm font-semibold text-slate-400">Write</div>
                    <div className="text-sm font-semibold text-slate-400">Execute</div>

                    {/* Owner */}
                    <div className="flex items-center text-sm font-bold text-slate-200">Owner</div>
                    <PermCheckbox label="R" checked={perms.own.r} onChange={v => updatePerm('own', 'r', v)} />
                    <PermCheckbox label="W" checked={perms.own.w} onChange={v => updatePerm('own', 'w', v)} />
                    <PermCheckbox label="X" checked={perms.own.x} onChange={v => updatePerm('own', 'x', v)} />

                    {/* Group */}
                    <div className="flex items-center text-sm font-bold text-slate-200">Group</div>
                    <PermCheckbox label="R" checked={perms.grp.r} onChange={v => updatePerm('grp', 'r', v)} />
                    <PermCheckbox label="W" checked={perms.grp.w} onChange={v => updatePerm('grp', 'w', v)} />
                    <PermCheckbox label="X" checked={perms.grp.x} onChange={v => updatePerm('grp', 'x', v)} />

                    {/* Public */}
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
                    {showPermissions.item.isDirectory && (
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-indigo-500" checked={permRecursive} onChange={e => setPermRecursive(e.target.checked)} />
                        <span className="text-sm text-slate-300">Apply recursively</span>
                      </label>
                    )}
                 </div>

                 <div className="flex justify-end gap-2 pt-2">
                     <button type="button" onClick={() => setShowPermissions(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white">Cancel</button>
                     <button onClick={() => handleAction(async () => {
                         const octal = parseInt(calculateOctal(), 8);
                         const targetPath = `${currentPath}/${showPermissions.item.filename}`;
                         
                         if (permRecursive && showPermissions.item.isDirectory) {
                           // Use Exec for recursive
                           await window.electron?.sshExec(session.id, `chmod -R ${calculateOctal()} "${targetPath}"`);
                         } else {
                           await window.electron?.sftpChmod(session.id, targetPath, octal);
                         }
                         setShowPermissions(null);
                         setPermRecursive(false);
                     }, "Update Failed")} className="px-6 py-2 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded font-medium shadow-lg shadow-indigo-500/20">
                       Apply Permissions
                     </button>
                 </div>
               </div>
             );
          })()}
      </Modal>
    </div>
  );
};

// --- Main App Component ---

export default function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [connections, setConnections] = useState<SSHConnection[]>([]);
  
  // Modal State
  const [isManagerOpen, setManagerOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState<Partial<SSHConnection> | null>(null);
  const [authType, setAuthType] = useState<'password'|'key'>('password');

  // Load Connections & Sessions on startup
  useEffect(() => {
    const savedConns = localStorage.getItem('ssh-connections');
    if (savedConns) setConnections(JSON.parse(savedConns));

    const savedSessions = localStorage.getItem('ssh-sessions');
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions) as SavedSessionState[];
      // Hydrate sessions (connected=false initially)
      setSessions(parsed.map(s => ({
        ...s,
        connected: false,
        isLoaded: false
      })));
      if (parsed.length > 0) setActiveSessionId(parsed[parsed.length - 1].id);
      else setManagerOpen(true);
    } else {
      setManagerOpen(true);
    }
  }, []);

  useEffect(() => {
      if (editingConnection) {
          if (editingConnection.privateKeyPath) setAuthType('key');
          else setAuthType('password');
      }
  }, [editingConnection]);

  // Persist sessions whenever they change structure (added/removed/navigated)
  useEffect(() => {
    const stateToSave: SavedSessionState[] = sessions.map(s => ({
      id: s.id,
      connection: s.connection,
      activeView: s.activeView,
      lastPath: s.lastPath
    }));
    localStorage.setItem('ssh-sessions', JSON.stringify(stateToSave));
  }, [sessions]);

  const saveConnections = (conns: SSHConnection[]) => {
    setConnections(conns);
    localStorage.setItem('ssh-connections', JSON.stringify(conns));
  };

  const createSession = (conn: SSHConnection) => {
    const newSession: Session = {
      id: crypto.randomUUID(),
      connection: conn,
      activeView: 'terminal',
      lastPath: '/',
      connected: false,
      isLoaded: false // Will trigger load when switched to
    };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newSession.id);
    setManagerOpen(false);
  };

  const closeSession = (id: string) => {
    setSessions(prev => {
      const newSessions = prev.filter(s => s.id !== id);
      if (activeSessionId === id) {
        setActiveSessionId(newSessions.length > 0 ? newSessions[newSessions.length - 1].id : null);
      }
      return newSessions;
    });
  };

  const updateSessionState = (id: string, updates: Partial<Session>) => {
    setSessions(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConnection) return;

    // Clean up based on auth type
    const finalConn = { ...editingConnection };
    if (authType === 'password') {
        delete finalConn.privateKeyPath;
        delete finalConn.passphrase;
    } else {
        delete finalConn.password;
    }

    if (finalConn.id) {
      const updated = connections.map(c => c.id === finalConn.id ? finalConn as SSHConnection : c);
      saveConnections(updated);
    } else {
      const newConn = { ...finalConn, id: Math.random().toString(36).substr(2, 9) } as SSHConnection;
      saveConnections([...connections, newConn]);
    }
    setEditingConnection(null);
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {/* --- Custom Titlebar --- */}
      <div className={cn(
        "h-10 flex items-end bg-slate-950 border-b border-slate-800 select-none titlebar w-full z-50 overflow-hidden",
        isMac && "pl-20",
        isWindows && "pr-36" 
      )}>
        <div className="flex items-center h-full px-2 gap-1 overflow-x-auto w-full scrollbar-none">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={cn(
                "group relative flex items-center gap-2 px-3 h-8 min-w-[140px] max-w-[200px] rounded-t-lg border-t border-x text-sm cursor-pointer transition-all no-drag",
                activeSessionId === session.id 
                  ? "bg-[#020617] border-slate-700 text-indigo-400 z-10 font-medium shadow-sm" 
                  : "bg-slate-900/50 border-transparent text-slate-500 hover:bg-slate-900 hover:text-slate-300 mb-0.5"
              )}
            >
               <Monitor size={12} className={activeSessionId === session.id ? "text-indigo-500" : "opacity-50"} />
               <span className="truncate flex-1">{session.connection.name}</span>
               <button 
                 onClick={(e) => { e.stopPropagation(); closeSession(session.id); }}
                 className="opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 p-0.5 rounded transition-all no-drag"
               >
                 <X size={12} />
               </button>
               {activeSessionId === session.id && (
                 <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-[#020617] z-20" />
               )}
            </div>
          ))}
          
          <button 
            onClick={() => {
              setEditingConnection(null);
              setManagerOpen(true);
            }}
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-900 text-slate-500 hover:text-indigo-400 transition-colors mb-0.5 no-drag"
            title="New Connection"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <div className="flex-1 relative overflow-hidden bg-[#020617]">
        {sessions.map(session => (
          <SessionView 
            key={session.id} 
            session={session} 
            visible={activeSessionId === session.id} 
            onRemove={() => closeSession(session.id)}
            onUpdateState={(u) => updateSessionState(session.id, u)}
          />
        ))}

        {sessions.length === 0 && !isManagerOpen && (
           <div className="flex flex-col items-center justify-center h-full text-slate-600">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 shadow-xl shadow-black/20">
                <Server size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-400">No Active Sessions</h2>
              <button onClick={() => setManagerOpen(true)} className="mt-4 text-indigo-400 hover:text-indigo-300 hover:underline">Open Connection Manager</button>
           </div>
        )}
      </div>

      {/* --- Connection Manager Modal --- */}
      <Modal 
        isOpen={isManagerOpen} 
        onClose={() => sessions.length > 0 && setManagerOpen(false)} 
        title={editingConnection ? (editingConnection.id ? "Edit Connection" : "New Connection") : "Connection Manager"}
      >
        {!editingConnection ? (
          // LIST VIEW
          <div className="space-y-3">
             <div className="grid grid-cols-1 gap-3">
                {connections.map(conn => (
                  <div key={conn.id} className="group bg-slate-950 border border-slate-800 hover:border-indigo-500/50 rounded-xl p-4 transition-all flex items-center justify-between">
                     <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => createSession(conn)}>
                        <div className="w-10 h-10 rounded-lg bg-slate-900 flex items-center justify-center text-indigo-500 shadow-inner">
                           <Server size={20} />
                        </div>
                        <div>
                           <h4 className="font-bold text-slate-200">{conn.name}</h4>
                           <p className="text-xs text-slate-500 font-mono">{conn.username}@{conn.host}</p>
                        </div>
                     </div>
                     <div className="flex gap-1">
                        <button 
                          onClick={() => setEditingConnection(conn)}
                          className="p-2 text-slate-500 hover:bg-slate-900 hover:text-indigo-400 rounded-lg transition-colors"
                          title="Edit"
                        >
                           <Edit2 size={16} />
                        </button>
                        <button 
                          onClick={() => {
                            if(confirm(`Delete ${conn.name}?`)) {
                               saveConnections(connections.filter(c => c.id !== conn.id));
                            }
                          }}
                          className="p-2 text-slate-500 hover:bg-slate-900 hover:text-red-400 rounded-lg transition-colors"
                          title="Delete"
                        >
                           <Trash size={16} />
                        </button>
                        <button 
                           onClick={() => createSession(conn)}
                           className="ml-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-500/20"
                        >
                           Connect
                        </button>
                     </div>
                  </div>
                ))}
                
                <button 
                  onClick={() => setEditingConnection({ port: 22 })}
                  className="w-full py-3 border-2 border-dashed border-slate-800 hover:border-slate-700 hover:bg-slate-900/50 text-slate-500 hover:text-slate-300 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"
                >
                   <Plus size={18} /> Add New Connection
                </button>
             </div>
          </div>
        ) : (
          // EDIT/CREATE VIEW
          <form onSubmit={handleSaveConnection} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Connection Name</label>
              <input 
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700"
                placeholder="Production Server"
                value={editingConnection.name || ''}
                onChange={e => setEditingConnection({...editingConnection, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Hostname / IP</label>
                <input 
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                  placeholder="192.168.1.1"
                  value={editingConnection.host || ''}
                  onChange={e => setEditingConnection({...editingConnection, host: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Port</label>
                <input 
                  type="number"
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                  value={editingConnection.port || 22}
                  onChange={e => setEditingConnection({...editingConnection, port: parseInt(e.target.value)})}
                />
              </div>
            </div>
            
            <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Username</label>
                <input 
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                  placeholder="root"
                  value={editingConnection.username || ''}
                  onChange={e => setEditingConnection({...editingConnection, username: e.target.value})}
                />
             </div>

            {/* Authentication Section */}
            <div className="bg-slate-950/50 p-4 rounded-xl border border-slate-800 space-y-4">
                 <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Authentication</label>
                    <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
                        <button 
                          type="button" 
                          onClick={() => setAuthType('password')}
                          className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", authType === 'password' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300")}
                        >
                          Password
                        </button>
                        <button 
                          type="button" 
                          onClick={() => setAuthType('key')}
                          className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", authType === 'key' ? "bg-indigo-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-300")}
                        >
                          Private Key
                        </button>
                    </div>
                 </div>

                 {authType === 'password' ? (
                     <div className="animate-in fade-in zoom-in-95 duration-200">
                        <input 
                          type="password"
                          className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                          placeholder="Password"
                          value={editingConnection.password || ''}
                          onChange={e => setEditingConnection({...editingConnection, password: e.target.value})}
                        />
                     </div>
                 ) : (
                     <div className="space-y-3 animate-in fade-in zoom-in-95 duration-200">
                         <div className="flex gap-2">
                             <div className="relative flex-1">
                                <Key className="absolute left-3 top-3 text-slate-600" size={16} />
                                <input 
                                  readOnly
                                  className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 pl-10 text-slate-300 focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-xs"
                                  placeholder="No key selected"
                                  value={editingConnection.privateKeyPath || ''}
                                />
                             </div>
                             <button 
                               type="button" 
                               onClick={async () => {
                                  const path = await window.electron?.selectKeyFile();
                                  if(path) setEditingConnection({...editingConnection, privateKeyPath: path});
                               }}
                               className="px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm border border-slate-700 transition-colors"
                             >
                                Browse
                             </button>
                         </div>
                         <div className="relative">
                            <Shield className="absolute left-3 top-3 text-slate-600" size={16} />
                            <input 
                              type="password"
                              className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 pl-10 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                              placeholder="Passphrase (Optional)"
                              value={editingConnection.passphrase || ''}
                              onChange={e => setEditingConnection({...editingConnection, passphrase: e.target.value})}
                            />
                         </div>
                     </div>
                 )}
            </div>
            
            <div className="pt-4 flex justify-between items-center border-t border-slate-800 mt-4">
              <button type="button" onClick={() => setEditingConnection(null)} className="text-slate-500 hover:text-slate-300 text-sm font-medium px-2 py-1">Back to list</button>
              <button type="submit" className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium shadow-lg shadow-indigo-500/20 transition-all">Save Connection</button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  );
}