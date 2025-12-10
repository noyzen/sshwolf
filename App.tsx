import React, { useState, useEffect, useRef } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { 
  Terminal, Folder, Settings, Plus, Trash, Upload, Download, 
  FileText, X, Server, LogOut, ChevronRight, RefreshCw, FolderPlus,
  Archive, Expand
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

// --- Components ---

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean; onClose: () => void; title: string; children?: React.ReactNode }) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-950/50">
          <h3 className="text-lg font-semibold text-slate-200">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [view, setView] = useState<'connections' | 'session'>('connections');
  const [activeTab, setActiveTab] = useState<'terminal' | 'sftp'>('terminal');
  const [connections, setConnections] = useState<SSHConnection[]>([]);
  const [activeConnection, setActiveConnection] = useState<SSHConnection | null>(null);
  
  // Connection Form State
  const [showAddModal, setShowAddModal] = useState(false);
  const [newConn, setNewConn] = useState<Partial<SSHConnection>>({ port: 22 });

  // Terminal State
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);

  // SFTP State
  const [currentPath, setCurrentPath] = useState('/root');
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [showEditor, setShowEditor] = useState(false);
  const [editingFile, setEditingFile] = useState<{path: string, content: string} | null>(null);

  // Load connections on mount
  useEffect(() => {
    const saved = localStorage.getItem('ssh-connections');
    if (saved) {
      setConnections(JSON.parse(saved));
    }
  }, []);

  // Save connections
  const saveConnections = (conns: SSHConnection[]) => {
    setConnections(conns);
    localStorage.setItem('ssh-connections', JSON.stringify(conns));
  };

  const handleConnect = async (conn: SSHConnection) => {
    setActiveConnection(conn);
    setView('session');
    
    // Initialize Terminal
    setTimeout(async () => {
      if (terminalRef.current && !xtermRef.current) {
        const term = new XTerm({
          theme: {
            background: '#020617', // slate-950
            foreground: '#e2e8f0', // slate-200
            cursor: '#6366f1',
          },
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: 14,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        fitAddon.fit();
        
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        term.onData(data => {
          window.electron?.sshWrite(conn.id, data);
        });

        // Handle resize
        const resizeObserver = new ResizeObserver(() => {
          fitAddon.fit();
          window.electron?.sshResize(conn.id, term.cols, term.rows);
        });
        resizeObserver.observe(terminalRef.current);

        try {
          term.writeln('\x1b[34mConnecting to ' + conn.host + '...\x1b[0m\r\n');
          await window.electron?.sshConnect(conn);
          window.electron?.sshResize(conn.id, term.cols, term.rows);
          
          window.electron?.onSSHData(({ connectionId, data }) => {
            if (connectionId === conn.id) term.write(data);
          });
          
          window.electron?.onSSHClosed(({ connectionId }) => {
             if (connectionId === conn.id) {
               term.writeln('\r\n\x1b[31mConnection closed.\x1b[0m');
             }
          });

          // Initial SFTP Load
          refreshFiles(conn.id, '/root'); // Default to root or home
          setCurrentPath('/root');

        } catch (err: any) {
          term.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
        }
      }
    }, 100);
  };

  const handleDisconnect = async () => {
    if (activeConnection) {
      await window.electron?.sshDisconnect(activeConnection.id);
      setActiveConnection(null);
      setView('connections');
      xtermRef.current?.dispose();
      xtermRef.current = null;
    }
  };

  // --- SFTP Functions ---

  const refreshFiles = async (connId: string, path: string) => {
    setIsLoadingFiles(true);
    try {
      const list = await window.electron?.sftpList(connId, path);
      if (list) {
        // Sort: Folders first, then files
        const sorted = list.sort((a, b) => {
          if (a.isDirectory === b.isDirectory) return a.filename.localeCompare(b.filename);
          return a.isDirectory ? -1 : 1;
        });
        setFiles(sorted);
        setCurrentPath(path);
      }
    } catch (err) {
      console.error(err);
      xtermRef.current?.writeln(`\r\nSFTP Error: ${err}`);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleNavigate = (folderName: string) => {
    if (!activeConnection) return;
    const newPath = currentPath === '/' ? `/${folderName}` : `${currentPath}/${folderName}`;
    refreshFiles(activeConnection.id, newPath);
  };

  const handleUpDir = () => {
    if (!activeConnection || currentPath === '/') return;
    const parts = currentPath.split('/');
    parts.pop();
    const newPath = parts.length === 1 ? '/' : parts.join('/');
    refreshFiles(activeConnection.id, newPath);
  };

  const handleUpload = async () => {
    if (!activeConnection) return;
    await window.electron?.sftpUpload(activeConnection.id, currentPath);
    refreshFiles(activeConnection.id, currentPath);
  };

  const handleDownload = async (filename: string) => {
    if (!activeConnection) return;
    const remotePath = currentPath === '/' ? `/${filename}` : `${currentPath}/${filename}`;
    await window.electron?.sftpDownload(activeConnection.id, remotePath);
  };

  const handleDelete = async (file: FileEntry) => {
    if (!activeConnection) return;
    if (!confirm(`Are you sure you want to delete ${file.filename}?`)) return;
    const remotePath = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
    try {
      await window.electron?.sftpDelete(activeConnection.id, remotePath, file.isDirectory);
      refreshFiles(activeConnection.id, currentPath);
    } catch (e) {
      alert("Error deleting file");
    }
  };

  const handleCreateFolder = async () => {
    if (!activeConnection) return;
    const name = prompt("Folder name:");
    if (!name) return;
    const remotePath = currentPath === '/' ? `/${name}` : `${currentPath}/${name}`;
    try {
      await window.electron?.sftpCreateFolder(activeConnection.id, remotePath);
      refreshFiles(activeConnection.id, currentPath);
    } catch (e) {
      alert("Error creating folder");
    }
  };

  const handleEditFile = async (filename: string) => {
     if (!activeConnection) return;
     const remotePath = currentPath === '/' ? `/${filename}` : `${currentPath}/${filename}`;
     try {
       const content = await window.electron?.sftpReadFile(activeConnection.id, remotePath);
       setEditingFile({ path: remotePath, content: content || '' });
       setShowEditor(true);
     } catch (e) {
       alert("Could not read file (maybe binary?)");
     }
  };

  const handleSaveFile = async () => {
    if (!activeConnection || !editingFile) return;
    try {
      await window.electron?.sftpWriteFile(activeConnection.id, editingFile.path, editingFile.content);
      setShowEditor(false);
      setEditingFile(null);
    } catch (e) {
      alert("Error saving file");
    }
  };

  const handleZip = async (file: FileEntry) => {
    if (!activeConnection) return;
    const remotePath = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
    const zipName = `${file.filename}.tar.gz`;
    
    // We use tar because it's universally available on Linux.
    // Command: cd currentPath && tar -czf zipName fileName
    const cmd = `cd "${currentPath}" && tar -czf "${zipName}" "${file.filename}"`;
    
    try {
      const result = await window.electron?.sshExec(activeConnection.id, cmd);
      if (result && result.code === 0) {
        refreshFiles(activeConnection.id, currentPath);
      } else {
        alert("Zip failed: " + result?.stderr);
      }
    } catch (e) {
      alert("Error executing zip command");
    }
  };

  const handleUnzip = async (file: FileEntry) => {
    if (!activeConnection) return;
    
    // Simple logic for .tar.gz and .zip
    let cmd = '';
    if (file.filename.endsWith('.tar.gz') || file.filename.endsWith('.tgz')) {
      cmd = `cd "${currentPath}" && tar -xzf "${file.filename}"`;
    } else if (file.filename.endsWith('.zip')) {
      cmd = `cd "${currentPath}" && unzip "${file.filename}"`;
    } else {
      alert("Unsupported archive format. Only .tar.gz and .zip supported.");
      return;
    }

    try {
       const result = await window.electron?.sshExec(activeConnection.id, cmd);
       if (result && result.code === 0) {
         refreshFiles(activeConnection.id, currentPath);
       } else {
         alert("Unzip failed (Make sure unzip/tar is installed): " + result?.stderr);
       }
    } catch (e) {
      alert("Error executing unzip command");
    }
  };

  // --- Views ---

  if (view === 'connections') {
    return (
      <div className="flex h-screen bg-slate-950 text-slate-200">
        {/* Sidebar - Made draggable by removing no-drag and keeping titlebar */}
        <div className={cn(
          "w-20 lg:w-64 bg-slate-950 border-r border-slate-800 flex flex-col items-center lg:items-start p-4 titlebar",
          isMac ? "pt-12" : "pt-8" // Add space for Mac traffic lights
        )}>
          <div className="flex items-center gap-3 mb-8 px-2">
            <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Terminal className="text-white" size={24} />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent hidden lg:block">SSH Wolf</h1>
          </div>
          
          <nav className="flex-1 w-full space-y-2">
            <button className="w-full flex items-center gap-3 p-3 rounded-lg bg-slate-900 text-indigo-400 border border-slate-800 transition-all no-drag">
              <Server size={20} />
              <span className="hidden lg:block font-medium">Connections</span>
            </button>
            <button className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-900 text-slate-400 hover:text-slate-200 transition-all no-drag">
              <Settings size={20} />
              <span className="hidden lg:block font-medium">Settings</span>
            </button>
          </nav>
        </div>

        {/* Connection Grid */}
        <div className="flex-1 p-8 overflow-y-auto no-drag">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-bold">Saved Connections</h2>
            <button 
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2 rounded-lg transition-colors font-medium shadow-lg shadow-indigo-500/20 no-drag"
            >
              <Plus size={20} />
              Add Connection
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {connections.map(conn => (
              <div key={conn.id} className="group bg-slate-900/50 border border-slate-800 rounded-xl p-5 hover:border-indigo-500/50 transition-all no-drag relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                   <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      const newConns = connections.filter(c => c.id !== conn.id);
                      saveConnections(newConns);
                    }}
                    className="text-slate-500 hover:text-red-400"
                   >
                     <Trash size={18} />
                   </button>
                </div>
                <div className="flex items-start gap-4 mb-4">
                   <div className="w-12 h-12 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-indigo-400 group-hover:bg-slate-950 transition-colors">
                     <Server size={24} />
                   </div>
                   <div>
                     <h3 className="font-bold text-lg text-slate-200">{conn.name}</h3>
                     <p className="text-slate-500 text-sm">{conn.username}@{conn.host}</p>
                   </div>
                </div>
                <button 
                  onClick={() => handleConnect(conn)}
                  className="w-full py-2 rounded-lg bg-slate-800 hover:bg-indigo-600 text-slate-300 hover:text-white font-medium transition-colors"
                >
                  Connect
                </button>
              </div>
            ))}

            {connections.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center p-12 border-2 border-dashed border-slate-800 rounded-xl text-slate-500">
                <Server size={48} className="mb-4 opacity-50" />
                <p>No connections saved. Create one to get started.</p>
              </div>
            )}
          </div>
        </div>

        {/* Add Connection Modal */}
        <Modal isOpen={showAddModal} onClose={() => setShowAddModal(false)} title="New Connection">
          <form onSubmit={(e) => {
            e.preventDefault();
            const id = Math.random().toString(36).substr(2, 9);
            saveConnections([...connections, { ...newConn, id } as SSHConnection]);
            setShowAddModal(false);
            setNewConn({ port: 22 });
          }} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">Name</label>
              <input 
                required
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="My Server"
                value={newConn.name || ''}
                onChange={e => setNewConn({...newConn, name: e.target.value})}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2">
                <label className="block text-sm font-medium text-slate-400 mb-1">Host</label>
                <input 
                  required
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="192.168.1.1"
                  value={newConn.host || ''}
                  onChange={e => setNewConn({...newConn, host: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Port</label>
                <input 
                  type="number"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  value={newConn.port || 22}
                  onChange={e => setNewConn({...newConn, port: parseInt(e.target.value)})}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
               <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Username</label>
                  <input 
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="root"
                    value={newConn.username || ''}
                    onChange={e => setNewConn({...newConn, username: e.target.value})}
                  />
               </div>
               <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Password</label>
                  <input 
                    type="password"
                    required
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="••••••"
                    value={newConn.password || ''}
                    onChange={e => setNewConn({...newConn, password: e.target.value})}
                  />
               </div>
            </div>
            <div className="pt-4 flex justify-end gap-3">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-400 hover:text-white">Cancel</button>
              <button type="submit" className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium">Save Connection</button>
            </div>
          </form>
        </Modal>
      </div>
    );
  }

  // Session View
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className={cn(
        "h-14 bg-slate-950 border-b border-slate-800 flex items-center justify-between px-4 titlebar", 
        isMac && "pl-20", // Move content right on Mac for traffic lights
        isWindows && "pr-40" // Move content left on Windows for window controls
      )}>
        <div className="flex items-center gap-4">
           <div className="font-bold text-lg flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.5)]"></div>
             {activeConnection?.name}
           </div>
           <div className="h-6 w-px bg-slate-800 mx-2"></div>
           <div className="flex p-1 bg-slate-900 rounded-lg border border-slate-800 no-drag">
             <button 
               onClick={() => setActiveTab('terminal')}
               className={cn("px-4 py-1 text-sm rounded-md transition-all flex items-center gap-2", activeTab === 'terminal' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200")}
             >
               <Terminal size={14} /> Terminal
             </button>
             <button 
               onClick={() => setActiveTab('sftp')}
               className={cn("px-4 py-1 text-sm rounded-md transition-all flex items-center gap-2", activeTab === 'sftp' ? "bg-indigo-600 text-white shadow-lg" : "text-slate-400 hover:text-slate-200")}
             >
               <Folder size={14} /> Files
             </button>
           </div>
        </div>
        <button onClick={handleDisconnect} className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-900 rounded-lg transition-colors no-drag">
          <LogOut size={20} />
        </button>
      </header>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden flex flex-col no-drag">
        {/* Terminal Layer */}
        <div className={cn("absolute inset-0 p-1 bg-[#020617]", activeTab === 'terminal' ? 'z-10' : 'z-0 invisible')}>
           <div ref={terminalRef} className="w-full h-full" />
        </div>

        {/* SFTP Layer */}
        <div className={cn("absolute inset-0 flex flex-col bg-slate-950 z-10", activeTab === 'sftp' ? 'visible' : 'invisible')}>
           {/* SFTP Toolbar */}
           <div className="h-12 border-b border-slate-800 flex items-center px-4 gap-2 bg-slate-950">
              <button onClick={() => refreshFiles(activeConnection!.id, currentPath)} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400">
                <RefreshCw size={18} className={isLoadingFiles ? "animate-spin" : ""} />
              </button>
              <button onClick={handleUpDir} disabled={currentPath === '/'} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 disabled:opacity-30">
                 <div className="font-bold -mt-2 text-xl">..</div>
              </button>
              
              {/* Breadcrumb */}
              <div className="flex-1 flex items-center gap-1 bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-md text-sm font-mono text-slate-300 mx-2 overflow-hidden">
                 <span className="text-indigo-400">sftp://</span>
                 {currentPath.split('/').filter(Boolean).map((part, i, arr) => (
                   <React.Fragment key={i}>
                      <span className="text-slate-500">/</span>
                      <span className="cursor-pointer hover:text-white" onClick={() => {
                        const newPath = '/' + arr.slice(0, i + 1).join('/');
                        refreshFiles(activeConnection!.id, newPath);
                      }}>{part}</span>
                   </React.Fragment>
                 ))}
                 {currentPath === '/' && <span className="text-slate-500">/</span>}
              </div>

              <div className="flex items-center gap-1">
                 <button onClick={handleCreateFolder} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-md text-sm text-slate-200 border border-slate-700">
                   <FolderPlus size={16} /> New Folder
                 </button>
                 <button onClick={handleUpload} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-md text-sm text-white shadow-lg shadow-indigo-500/20">
                   <Upload size={16} /> Upload
                 </button>
              </div>
           </div>

           {/* File List */}
           <div className="flex-1 overflow-auto bg-[#020617]">
             <table className="w-full text-left text-sm">
               <thead className="bg-slate-900/50 text-slate-400 sticky top-0 z-10 font-medium">
                 <tr>
                   <th className="p-3 pl-4 w-8"></th>
                   <th className="p-3">Name</th>
                   <th className="p-3 w-32">Size</th>
                   <th className="p-3 w-32">Rights</th>
                   <th className="p-3 w-40 text-right pr-4">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/50">
                 {files.map((file, i) => (
                   <tr 
                      key={i} 
                      className="hover:bg-slate-900/40 group transition-colors cursor-pointer"
                      onDoubleClick={() => file.isDirectory ? handleNavigate(file.filename) : handleEditFile(file.filename)}
                   >
                     <td className="p-3 pl-4 text-slate-400">
                       {file.isDirectory ? <Folder size={18} className="text-yellow-500 fill-yellow-500/20" /> : <FileText size={18} className="text-slate-500" />}
                     </td>
                     <td className="p-3 font-medium text-slate-200">
                       {file.filename}
                     </td>
                     <td className="p-3 text-slate-500 font-mono text-xs">
                       {file.isDirectory ? '-' : (file.attrs.size / 1024).toFixed(1) + ' KB'}
                     </td>
                     <td className="p-3 text-slate-500 font-mono text-xs">
                       {file.attrs.mode.toString(8).slice(-3)}
                     </td>
                     <td className="p-3 text-right pr-4">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                           {/* Context Actions */}
                           {(file.filename.endsWith('.tar.gz') || file.filename.endsWith('.zip')) && (
                             <button onClick={(e) => { e.stopPropagation(); handleUnzip(file); }} className="p-1 hover:text-indigo-400" title="Unzip"><Expand size={16} /></button>
                           )}
                           
                           {!file.filename.endsWith('.tar.gz') && !file.filename.endsWith('.zip') && (
                             <button onClick={(e) => { e.stopPropagation(); handleZip(file); }} className="p-1 hover:text-indigo-400" title="Zip"><Archive size={16} /></button>
                           )}

                          {!file.isDirectory && (
                             <>
                                <button onClick={(e) => { e.stopPropagation(); handleEditFile(file.filename); }} className="p-1 hover:text-indigo-400" title="Edit"><FileText size={16} /></button>
                                <button onClick={(e) => { e.stopPropagation(); handleDownload(file.filename); }} className="p-1 hover:text-green-400" title="Download"><Download size={16} /></button>
                             </>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); handleDelete(file); }} className="p-1 hover:text-red-400" title="Delete"><Trash size={16} /></button>
                        </div>
                     </td>
                   </tr>
                 ))}
                 {files.length === 0 && !isLoadingFiles && (
                   <tr>
                     <td colSpan={5} className="p-8 text-center text-slate-500">Directory is empty</td>
                   </tr>
                 )}
               </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col no-drag">
           <div className="h-12 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4">
              <span className="font-mono text-sm text-slate-300">{editingFile?.path}</span>
              <div className="flex gap-2">
                 <button onClick={() => setShowEditor(false)} className="px-4 py-1.5 text-sm hover:text-white text-slate-400">Cancel</button>
                 <button onClick={handleSaveFile} className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md">Save Changes</button>
              </div>
           </div>
           <textarea 
             className="flex-1 bg-[#020617] text-slate-200 font-mono text-sm p-4 outline-none resize-none"
             value={editingFile?.content}
             onChange={e => setEditingFile(prev => prev ? ({...prev, content: e.target.value}) : null)}
           />
        </div>
      )}
    </div>
  );
}