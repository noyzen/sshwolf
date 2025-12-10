import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { 
  Terminal, Folder, Settings, Plus, Trash, Upload, Download, 
  FileText, X, Server, LogOut, RefreshCw, FolderPlus,
  Archive, Expand, Edit2, Monitor
} from 'lucide-react';
import { SSHConnection, FileEntry } from './types';
import clsx from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs));
}

// OS Detection
const isMac = navigator.userAgent.includes('Mac');
const isWindows = navigator.userAgent.includes('Windows');

// --- Types ---

interface Session {
  id: string; // Unique Session ID (UUID)
  connection: SSHConnection;
  startedAt: number;
}

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
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

const SessionView = ({ session, visible, onRemove }: { session: Session; visible: boolean; onRemove: () => void }) => {
  const [activeTab, setActiveTab] = useState<'terminal' | 'sftp'>('terminal');
  
  // Terminal
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);

  // SFTP
  const [currentPath, setCurrentPath] = useState('/root');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingFile, setEditingFile] = useState<{path: string, content: string} | null>(null);

  // Initialize Connection
  useEffect(() => {
    if (connectedRef.current) return;
    
    const initSession = async () => {
      connectedRef.current = true;
      
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
          fontSize: 13,
          lineHeight: 1.4,
          cursorBlink: true,
          allowProposedApi: true,
        });
        
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

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
           }
        });

        try {
          term.writeln(`\x1b[34mConnecting to ${session.connection.host}...\x1b[0m\r\n`);
          
          // Connect using the SESSION ID, not the connection ID
          await window.electron?.sshConnect({ ...session.connection, id: session.id });
          
          fitAddon.fit();
          window.electron?.sshResize(session.id, term.cols, term.rows);
          
          // Initial SFTP
          refreshFiles(session.id, '/root'); 
          setCurrentPath('/root');

        } catch (err: any) {
          term.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
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
  }, []);

  // Handle Resize Visibility
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      // Small delay to allow layout to settle
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if (xtermRef.current) {
          window.electron?.sshResize(session.id, xtermRef.current.cols, xtermRef.current.rows);
        }
      }, 50);
    }
  }, [visible]);

  // --- SFTP Logic (Scoped to Session) ---

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
      }
    } catch (err) {
      xtermRef.current?.writeln(`\r\nSFTP Error: ${err}`);
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

  const handleAction = async (action: () => Promise<any>, errorMsg: string) => {
    try {
      await action();
      refreshFiles(session.id, currentPath);
    } catch (e: any) {
      alert(`${errorMsg}: ${e.message}`);
    }
  };

  return (
    <div className={cn("absolute inset-0 flex flex-col bg-slate-950", visible ? "z-10" : "z-0 invisible")}>
      {/* Session Toolbar */}
      <div className="h-10 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
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
         {/* Breadcrumb for SFTP (Only visible in SFTP tab) */}
         {activeTab === 'sftp' && (
           <div className="flex-1 mx-4 overflow-hidden flex items-center justify-center">
             <div className="flex items-center gap-1 text-xs font-mono text-slate-400 bg-slate-900/50 px-3 py-1 rounded border border-slate-800/50 truncate max-w-full">
                <span className="text-indigo-400">sftp://{session.connection.host}</span>
                <span className="text-slate-300">{currentPath}</span>
             </div>
           </div>
         )}
      </div>

      <div className="flex-1 relative overflow-hidden">
        {/* Terminal Layer */}
        <div className={cn("absolute inset-0 bg-[#020617] p-1", activeTab === 'terminal' ? "z-10" : "invisible")}>
           <div ref={terminalRef} className="w-full h-full" />
        </div>

        {/* SFTP Layer */}
        <div className={cn("absolute inset-0 flex flex-col bg-[#020617] z-10", activeTab === 'sftp' ? "visible" : "invisible")}>
           <div className="h-10 border-b border-slate-800 flex items-center px-2 gap-1 bg-slate-950/50">
              <button onClick={() => refreshFiles(session.id, currentPath)} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white transition-colors">
                <RefreshCw size={16} className={isLoadingFiles ? "animate-spin" : ""} />
              </button>
              <button onClick={handleUpDir} disabled={currentPath === '/'} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white disabled:opacity-30 transition-colors">
                 <div className="font-bold -mt-1 text-lg leading-none">..</div>
              </button>
              <div className="h-4 w-px bg-slate-800 mx-1" />
              <button onClick={() => handleAction(async () => {
                  const name = prompt("Folder name:");
                  if(name) await window.electron?.sftpCreateFolder(session.id, currentPath === '/' ? `/${name}` : `${currentPath}/${name}`);
              }, "Create Folder Failed")} className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-800 rounded text-xs text-slate-300 transition-colors">
                <FolderPlus size={14} /> New Folder
              </button>
              <button onClick={() => handleAction(() => window.electron?.sftpUpload(session.id, currentPath), "Upload Failed")} className="flex items-center gap-1.5 px-2 py-1 hover:bg-slate-800 rounded text-xs text-slate-300 transition-colors">
                <Upload size={14} /> Upload
              </button>
           </div>
           
           <div className="flex-1 overflow-auto custom-scrollbar">
             <table className="w-full text-left text-xs">
               <thead className="bg-slate-900/80 text-slate-500 sticky top-0 z-10 backdrop-blur-sm">
                 <tr>
                   <th className="p-2 pl-4 w-8"></th>
                   <th className="p-2">Name</th>
                   <th className="p-2 w-24">Size</th>
                   <th className="p-2 w-24">Rights</th>
                   <th className="p-2 w-32 text-right pr-4">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/30">
                 {files.map((file, i) => (
                   <tr 
                      key={i} 
                      className="hover:bg-slate-800/30 group transition-colors cursor-pointer"
                      onDoubleClick={() => file.isDirectory ? handleNavigate(file.filename) : handleAction(async () => {
                          const content = await window.electron?.sftpReadFile(session.id, `${currentPath}/${file.filename}`);
                          setEditingFile({ path: `${currentPath}/${file.filename}`, content });
                          setShowEditor(true);
                      }, "Read Failed")}
                   >
                     <td className="p-2 pl-4">
                       {file.isDirectory ? <Folder size={16} className="text-indigo-400 fill-indigo-400/10" /> : <FileText size={16} className="text-slate-600" />}
                     </td>
                     <td className="p-2 font-medium text-slate-300 group-hover:text-indigo-200">
                       {file.filename}
                     </td>
                     <td className="p-2 text-slate-500 font-mono">
                       {file.isDirectory ? '-' : (file.attrs.size / 1024).toFixed(1) + ' KB'}
                     </td>
                     <td className="p-2 text-slate-500 font-mono">
                       {file.attrs.mode.toString(8).slice(-3)}
                     </td>
                     <td className="p-2 text-right pr-4">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                           {(file.filename.endsWith('.tar.gz') || file.filename.endsWith('.zip')) ? (
                             <button onClick={(e) => { e.stopPropagation(); window.electron?.sshExec(session.id, `cd "${currentPath}" && ${file.filename.endsWith('.zip') ? 'unzip' : 'tar -xzf'} "${file.filename}"`).then(() => refreshFiles(session.id, currentPath)); }} className="p-1 hover:bg-indigo-500/20 hover:text-indigo-400 rounded"><Expand size={14} /></button>
                           ) : (
                             !file.isDirectory && <button onClick={(e) => { e.stopPropagation(); window.electron?.sshExec(session.id, `cd "${currentPath}" && tar -czf "${file.filename}.tar.gz" "${file.filename}"`).then(() => refreshFiles(session.id, currentPath)); }} className="p-1 hover:bg-indigo-500/20 hover:text-indigo-400 rounded"><Archive size={14} /></button>
                           )}
                           
                           {!file.isDirectory && (
                             <button onClick={(e) => { e.stopPropagation(); handleAction(async () => window.electron?.sftpDownload(session.id, `${currentPath}/${file.filename}`), "Download Failed")}} className="p-1 hover:bg-green-500/20 hover:text-green-400 rounded"><Download size={14} /></button>
                           )}
                           <button onClick={(e) => { e.stopPropagation(); if(confirm('Delete?')) handleAction(async () => window.electron?.sftpDelete(session.id, `${currentPath}/${file.filename}`, file.isDirectory), "Delete Failed")}} className="p-1 hover:bg-red-500/20 hover:text-red-400 rounded"><Trash size={14} /></button>
                        </div>
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* Simple Editor Modal */}
      {showEditor && editingFile && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col animate-in fade-in duration-100">
           <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
              <span className="font-mono text-xs text-slate-400">{editingFile.path}</span>
              <div className="flex gap-2">
                 <button onClick={() => setShowEditor(false)} className="px-3 py-1 text-sm hover:text-white text-slate-400 transition-colors">Cancel</button>
                 <button onClick={() => handleAction(async () => {
                   await window.electron?.sftpWriteFile(session.id, editingFile.path, editingFile.content);
                   setShowEditor(false);
                 }, "Save Failed")} className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded transition-colors">Save</button>
              </div>
           </div>
           <textarea 
             className="flex-1 bg-[#020617] text-slate-200 font-mono text-sm p-4 outline-none resize-none leading-relaxed"
             value={editingFile.content}
             onChange={e => setEditingFile({ ...editingFile, content: e.target.value })}
             spellCheck={false}
           />
        </div>
      )}
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

  useEffect(() => {
    const saved = localStorage.getItem('ssh-connections');
    if (saved) {
      setConnections(JSON.parse(saved));
    }
    // Open manager if no sessions initially
    setManagerOpen(true);
  }, []);

  const saveConnections = (conns: SSHConnection[]) => {
    setConnections(conns);
    localStorage.setItem('ssh-connections', JSON.stringify(conns));
  };

  const createSession = (conn: SSHConnection) => {
    const newSession: Session = {
      id: crypto.randomUUID(), // Unique session ID
      connection: conn,
      startedAt: Date.now()
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
    // If no sessions left, open manager
    if (sessions.length <= 1) { // 1 because we haven't updated state yet in this closure
       setManagerOpen(true);
    }
  };

  const handleSaveConnection = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingConnection) return;

    if (editingConnection.id) {
      // Edit existing
      const updated = connections.map(c => c.id === editingConnection.id ? editingConnection as SSHConnection : c);
      saveConnections(updated);
    } else {
      // Create new
      const newConn = { ...editingConnection, id: Math.random().toString(36).substr(2, 9) } as SSHConnection;
      saveConnections([...connections, newConn]);
    }
    setEditingConnection(null); // Return to list view
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 font-sans selection:bg-indigo-500/30">
      
      {/* --- Custom Titlebar --- */}
      <div className={cn(
        "h-10 flex items-end bg-slate-950 border-b border-slate-800 select-none titlebar w-full z-50",
        isMac && "pl-20", // Traffic lights area
        isWindows && "pr-36" // Window controls area
      )}>
        <div className="flex items-center h-full px-2 gap-1 overflow-x-auto no-drag w-full scrollbar-none">
          {sessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={cn(
                "group relative flex items-center gap-2 px-3 h-8 min-w-[140px] max-w-[200px] rounded-t-lg border-t border-x text-sm cursor-pointer transition-all",
                activeSessionId === session.id 
                  ? "bg-[#020617] border-slate-700 text-indigo-400 z-10 font-medium shadow-sm" 
                  : "bg-slate-900/50 border-transparent text-slate-500 hover:bg-slate-900 hover:text-slate-300 mb-0.5"
              )}
            >
               <Monitor size={12} className={activeSessionId === session.id ? "text-indigo-500" : "opacity-50"} />
               <span className="truncate flex-1">{session.connection.name}</span>
               <button 
                 onClick={(e) => { e.stopPropagation(); closeSession(session.id); }}
                 className="opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 p-0.5 rounded transition-all"
               >
                 <X size={12} />
               </button>
               {/* Bottom cover for active tab to blend with content */}
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
            className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-slate-900 text-slate-500 hover:text-indigo-400 transition-colors mb-0.5"
            title="New Connection"
          >
            <Plus size={18} />
          </button>
        </div>
      </div>

      {/* --- Main Content Area --- */}
      <div className="flex-1 relative overflow-hidden bg-[#020617]">
        {/* Render all active sessions (hidden/visible) to preserve state */}
        {sessions.map(session => (
          <SessionView 
            key={session.id} 
            session={session} 
            visible={activeSessionId === session.id} 
            onRemove={() => closeSession(session.id)}
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
            <div className="grid grid-cols-2 gap-4">
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
               <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Password</label>
                  <input 
                    type="password"
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-700 font-mono text-sm"
                    placeholder="••••••"
                    value={editingConnection.password || ''}
                    onChange={e => setEditingConnection({...editingConnection, password: e.target.value})}
                  />
               </div>
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