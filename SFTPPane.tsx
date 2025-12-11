import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { SubTab, SSHConnection, ClipboardState, FileEntry, ClipboardItem } from './types';
import { cn } from './utils';
import { Modal, SimpleInputModal, PermissionsManager, SmartDependencyInstaller, ContextMenu, ContextMenuOption } from './Modals';

interface SFTPPaneProps {
  subTab: SubTab;
  connection: SSHConnection;
  visible: boolean;
  onPathChange: (path: string) => void;
  onOpenTerminal: (path: string) => void;
  onOpenFile: (path: string) => void;
  onLoading: (isLoading: boolean) => void;
  clipboard: ClipboardState | null;
  setClipboard: (state: ClipboardState | null) => void;
}

export const SFTPPane = ({ subTab, connection, visible, onPathChange, onOpenTerminal, onOpenFile, onLoading, clipboard, setClipboard }: SFTPPaneProps) => {
  const [currentPath, setCurrentPath] = useState(subTab.path || '/');
  const [pathInput, setPathInput] = useState(currentPath);
  const [files, setFiles] = useState<FileEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  
  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
  
  // Sorting
  const [sortConfig, setSortConfig] = useState<{key: 'filename'|'size'|'mtime', direction: 'asc'|'desc'}>({ key: 'filename', direction: 'asc' });

  // Modals & Menu
  const [showRename, setShowRename] = useState<{item: FileEntry, name: string} | null>(null);
  const [showPermissions, setShowPermissions] = useState<FileEntry | null>(null);
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showArchive, setShowArchive] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, item?: FileEntry } | null>(null);
  
  // Smart Installer State
  const [installerState, setInstallerState] = useState<{ isOpen: boolean, tool: 'zip'|'unzip', resolve?: (v: boolean) => void } | null>(null);

  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const sortedFiles = useMemo(() => {
    let sorted = [...files];
    sorted.sort((a, b) => {
       if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
       let valA, valB;
       switch(sortConfig.key) {
           case 'size': valA = a.attrs.size; valB = b.attrs.size; break;
           case 'mtime': valA = a.attrs.mtime; valB = b.attrs.mtime; break;
           default: valA = a.filename.toLowerCase(); valB = b.filename.toLowerCase();
       }
       if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
       if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
       return 0;
    });
    return sorted;
  }, [files, sortConfig]);

  const refreshFiles = useCallback(async (path: string) => {
    if (!mounted.current) return;
    setIsLoading(true);
    onLoading(true);
    setSelected(new Set());
    setLastSelectedIndex(-1);
    try {
      const list = await window.electron?.sftpList(subTab.connectionId, path);
      if (list && mounted.current) {
        setFiles(list);
        setCurrentPath(path);
        setPathInput(path);
        onPathChange(path);
        setIsConnected(true);
      }
    } catch (err: any) {
      console.error(err);
      if (err.message.includes('Not connected') && mounted.current) setIsConnected(false);
    } finally {
      if(mounted.current) {
         setIsLoading(false);
         onLoading(false);
      }
    }
  }, [subTab.connectionId, onPathChange, onLoading]);

  useEffect(() => {
    if (!visible) return;
    const connectAndLoad = async () => {
        if (!isConnected) {
            try {
                onLoading(true);
                await window.electron?.sshConnect({ ...connection, id: subTab.connectionId });
                if(mounted.current) {
                  setIsConnected(true);
                  // refreshFiles handles the onLoading(false)
                  refreshFiles(currentPath);
                } else {
                  onLoading(false);
                }
            } catch (e) {
                console.error("SFTP Connect Error", e);
                onLoading(false);
            }
        }
    };
    connectAndLoad();
  }, [visible]);

  // Select All Hotkey
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, files]);

  const handleSelectAll = () => {
    setSelected(new Set(files.map(f => f.filename)));
  };

  const handleSort = (key: 'filename'|'size'|'mtime') => {
      setSortConfig(current => ({
          key,
          direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc'
      }));
  };

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

  const handleSelect = (file: FileEntry, index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const filename = file.filename;
    
    if (e.ctrlKey || e.metaKey) {
        const newSelected = new Set(selected);
        if (newSelected.has(filename)) newSelected.delete(filename);
        else newSelected.add(filename);
        setSelected(newSelected);
        setLastSelectedIndex(index);
    } else if (e.shiftKey && lastSelectedIndex !== -1) {
        const start = Math.min(lastSelectedIndex, index);
        const end = Math.max(lastSelectedIndex, index);
        const newSelected = new Set(selected); 
        const range = new Set<string>();
        for (let i = start; i <= end; i++) {
            range.add(sortedFiles[i].filename);
        }
        setSelected(range);
    } else {
        setSelected(new Set([filename]));
        setLastSelectedIndex(index);
    }
  };

  const toggleSelect = (filename: string) => {
      const newSelected = new Set(selected);
      if (newSelected.has(filename)) newSelected.delete(filename);
      else newSelected.add(filename);
      setSelected(newSelected);
  };

  const handleContextMenu = (e: React.MouseEvent, item?: FileEntry) => {
      e.preventDefault();
      e.stopPropagation();
      if (item && !selected.has(item.filename)) {
          setSelected(new Set([item.filename]));
      }
      setContextMenu({ x: e.clientX, y: e.clientY, item });
  };

  // --- Dependency Check Logic ---

  const ensureDependency = async (tool: 'zip' | 'unzip'): Promise<boolean> => {
      const check = await window.electron?.sshExec(subTab.connectionId, `which ${tool}`);
      if (check && check.stdout.trim().length > 0) return true;

      // Ask user via UI
      return new Promise((resolve) => {
          setInstallerState({ 
             isOpen: true, 
             tool, 
             resolve: (result) => {
                 setInstallerState(null);
                 resolve(result);
             }
          });
      });
  };

  // --- File Actions ---

  const handleCreateFile = async (name: string) => {
    if (!name.trim()) return;
    try {
        const targetPath = currentPath === '/' ? `/${name.trim()}` : `${currentPath}/${name.trim()}`;
        await window.electron?.sftpWriteFile(subTab.connectionId, targetPath, "");
        refreshFiles(currentPath);
        setShowNewFile(false);
        onOpenFile(targetPath);
    } catch (e: any) { alert(e.message); }
  };

  const handleCreateFolder = async (name: string) => {
    if (!name.trim()) return;
    try {
        const targetPath = currentPath === '/' ? `/${name.trim()}` : `${currentPath}/${name.trim()}`;
        await window.electron?.sftpCreateFolder(subTab.connectionId, targetPath);
        refreshFiles(currentPath);
        setShowNewFolder(false);
    } catch (e: any) { alert(e.message); }
  };

  const getSelectedFiles = () => sortedFiles.filter(f => selected.has(f.filename));

  const handleCopy = (filesToProcess = getSelectedFiles()) => {
      if (filesToProcess.length === 0) return;
      const items: ClipboardItem[] = filesToProcess.map(f => ({
          path: currentPath === '/' ? `/${f.filename}` : `${currentPath}/${f.filename}`,
          filename: f.filename,
          isDirectory: f.isDirectory
      }));
      setClipboard({ op: 'copy', connectionId: subTab.connectionId, items });
  };

  const handleCut = (filesToProcess = getSelectedFiles()) => {
      if (filesToProcess.length === 0) return;
      const items: ClipboardItem[] = filesToProcess.map(f => ({
          path: currentPath === '/' ? `/${f.filename}` : `${currentPath}/${f.filename}`,
          filename: f.filename,
          isDirectory: f.isDirectory
      }));
      setClipboard({ op: 'cut', connectionId: subTab.connectionId, items });
  };

  const handleDelete = async (filesToProcess = getSelectedFiles()) => {
      if (filesToProcess.length === 0) return;
      if (!confirm(`Delete ${filesToProcess.length} item(s)?`)) return;
      setIsLoading(true);
      onLoading(true);
      try {
          for (const file of filesToProcess) {
             const path = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
             await window.electron?.sftpDelete(subTab.connectionId, path, file.isDirectory);
          }
          refreshFiles(currentPath);
      } catch (e: any) { 
        alert(e.message); 
        refreshFiles(currentPath); 
        setIsLoading(false);
        onLoading(false);
      } 
  };

  const handleDeleteItem = async (file: FileEntry) => {
     if(!confirm(`Delete ${file.filename}?`)) return;
     try {
         const path = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
         await window.electron?.sftpDelete(subTab.connectionId, path, file.isDirectory);
         refreshFiles(currentPath);
     } catch(e: any) { alert(e.message); }
  };

  const handleDownload = async (filesToProcess = getSelectedFiles()) => {
      if (filesToProcess.length === 0) return;
      const filesOnly = filesToProcess.filter(f => !f.isDirectory);
      if (filesOnly.length === 0 && filesToProcess.length > 0) { alert("Folder download is not supported in batch mode yet."); return; }
      
      const payload = filesOnly.map(f => ({
          path: currentPath === '/' ? `/${f.filename}` : `${currentPath}/${f.filename}`,
          filename: f.filename,
          isDirectory: false
      }));
      try { 
          onLoading(true);
          await window.electron?.sftpDownloadBatch(subTab.connectionId, payload); 
      } 
      catch (e: any) { if (!e.message?.includes('cancelled')) alert(e.message); }
      finally { onLoading(false); }
  };

  const handlePaste = async () => {
      if (!clipboard || clipboard.items.length === 0 || clipboard.connectionId !== subTab.connectionId) return;
      setIsPasting(true);
      onLoading(true);
      try {
          for (const item of clipboard.items) {
              const destDir = currentPath === '/' ? '' : currentPath;
              let destPath = `${destDir}/${item.filename}`;
              if (item.path === destPath && clipboard.op === 'copy') {
                 const extIndex = item.filename.lastIndexOf('.');
                 destPath = extIndex > 0 
                    ? `${destDir}/${item.filename.substring(0, extIndex)} copy${item.filename.substring(extIndex)}`
                    : `${destDir}/${item.filename} copy`;
              }
              if (clipboard.op === 'cut') {
                  if (item.path === destPath) continue;
                  await window.electron?.sftpRename(subTab.connectionId, item.path, destPath);
              } else {
                  const cmd = `cp -r "${item.path.replace(/(["'$`\\])/g,'\\$1')}" "${destPath.replace(/(["'$`\\])/g,'\\$1')}"`;
                  const result = await window.electron?.sshExec(subTab.connectionId, cmd);
                  if (result && result.code !== 0) throw new Error(result.stderr);
              }
          }
          if (clipboard.op === 'cut') setClipboard(null);
          await refreshFiles(currentPath);
      } catch (e: any) { 
          alert(e.message); 
          setIsPasting(false);
          onLoading(false);
      } finally {
          setIsPasting(false);
          // refreshFiles (called above) will turn off loading
      }
  };

  const handleArchive = async (name: string) => {
    if (!name || getSelectedFiles().length === 0) return;
    
    // Smart dependency check
    if (!(await ensureDependency('zip'))) return;

    setIsLoading(true);
    onLoading(true);
    const filename = name.endsWith('.zip') ? name : name + '.zip';
    const items = getSelectedFiles().map(f => `"${f.filename}"`).join(' ');
    
    try {
       const cmd = `cd "${currentPath}" && zip -r "${filename}" ${items}`;
       await window.electron?.sshExec(subTab.connectionId, cmd);
       setShowArchive(null);
       refreshFiles(currentPath);
    } catch (e: any) { 
        alert(e.message); 
        setIsLoading(false); 
        onLoading(false); 
    }
  };

  const handleExtract = async (file: FileEntry) => {
     setIsLoading(true);
     onLoading(true);
     try {
        let cmd = '';
        if (file.filename.endsWith('.zip')) {
            if (!(await ensureDependency('unzip'))) { setIsLoading(false); onLoading(false); return; }
            cmd = `cd "${currentPath}" && unzip "${file.filename}"`;
        } else if (file.filename.endsWith('.tar.gz') || file.filename.endsWith('.tgz')) {
            cmd = `cd "${currentPath}" && tar -xzf "${file.filename}"`;
        } else if (file.filename.endsWith('.tar')) {
            cmd = `cd "${currentPath}" && tar -xf "${file.filename}"`;
        } else {
            alert('Unsupported archive format');
            setIsLoading(false);
            onLoading(false);
            return;
        }
        await window.electron?.sshExec(subTab.connectionId, cmd);
        refreshFiles(currentPath);
     } catch (e: any) { 
         alert(e.message); 
         setIsLoading(false); 
         onLoading(false); 
     }
  };

  const getContextMenuOptions = () => {
      const selectedFiles = getSelectedFiles();
      if (contextMenu?.item) {
          const file = contextMenu.item;
          const isArchive = file.filename.match(/\.(zip|tar|tar\.gz|tgz)$/);
          return [
              ...(file.isDirectory ? [
                  { label: "Open", icon: <i className="fa-regular fa-folder text-[14px]"/>, onClick: () => handleNavigate(file.filename) },
                  { label: "Open in Terminal", icon: <i className="fa-solid fa-list-ul text-[14px]"/>, onClick: () => onOpenTerminal(currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`) }
              ] : [
                  { label: "Edit", icon: <i className="fa-solid fa-pen-to-square text-[14px]"/>, onClick: () => openEditor(file) }
              ]),
              { separator: true, label: "", onClick: () => {} },
              { label: "Rename", icon: <i className="fa-solid fa-pen text-[14px]"/>, onClick: () => setShowRename({item: file, name: file.filename}) },
              { label: "Permissions", icon: <i className="fa-solid fa-lock text-[14px]"/>, onClick: () => setShowPermissions(file) },
              { separator: true, label: "", onClick: () => {} },
              { label: "Copy", icon: <i className="fa-regular fa-copy text-[14px]"/>, onClick: () => handleCopy([file]) },
              { label: "Cut", icon: <i className="fa-solid fa-scissors text-[14px]"/>, onClick: () => handleCut([file]) },
              { label: "Compress (Zip)", icon: <i className="fa-solid fa-box-archive text-[14px]"/>, onClick: () => setShowArchive('archive') },
              ...(isArchive ? [{ label: "Extract Here", icon: <i className="fa-solid fa-box-open text-[14px]"/>, onClick: () => handleExtract(file) }] : []),
              { separator: true, label: "", onClick: () => {} },
              { label: "Download", icon: <i className="fa-solid fa-download text-[14px]"/>, onClick: () => handleDownload([file]) },
              { label: "Delete", icon: <i className="fa-solid fa-trash-can text-[14px]"/>, onClick: () => handleDeleteItem(file), danger: true }
          ];
      }
      return [
          { label: "New File", icon: <i className="fa-solid fa-file-circle-plus text-[14px]"/>, onClick: () => setShowNewFile(true) },
          { label: "New Folder", icon: <i className="fa-solid fa-folder-plus text-[14px]"/>, onClick: () => setShowNewFolder(true) },
          { separator: true, label: "", onClick: () => {} },
          { label: "Paste", icon: <i className="fa-regular fa-clipboard text-[14px]"/>, onClick: handlePaste },
          { separator: true, label: "", onClick: () => {} },
          { label: "Compress Selected", icon: <i className="fa-solid fa-box-archive text-[14px]"/>, onClick: () => setShowArchive('archive') },
          { separator: true, label: "", onClick: () => {} },
          { label: "Select All", icon: <i className="fa-solid fa-circle-check text-[14px]"/>, onClick: handleSelectAll },
          { label: "Refresh", icon: <i className="fa-solid fa-rotate text-[14px]"/>, onClick: () => refreshFiles(currentPath) }
      ];
  };

  return (
    <div className="flex flex-col h-full bg-[#09090b]" onClick={() => setSelected(new Set())} onContextMenu={(e) => handleContextMenu(e)}>
       
       {/* Header Toolbar Container - Refactored for better spacing and colors */}
       <div className="h-14 shrink-0 relative z-20 bg-zinc-950 border-b border-zinc-800 flex items-center px-4 gap-4">
          {selected.size === 0 ? (
            <>
                {/* Navigation Group */}
                <div className="flex items-center gap-2">
                   <button onClick={handleUpDir} disabled={currentPath === '/'} className="h-9 w-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-violet-300 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900 disabled:hover:text-zinc-400 disabled:hover:border-zinc-800" title="Up Directory">
                      <i className="fa-solid fa-arrow-up text-[14px]" />
                   </button>
                   <button 
                     onClick={() => refreshFiles(currentPath)} 
                     className={cn(
                       "h-9 w-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 transition-all",
                       isLoading 
                         ? "text-violet-300 border-violet-500/50 shadow-[0_0_15px_rgba(139,92,246,0.3)] bg-violet-500/10 cursor-not-allowed" 
                         : "text-zinc-400 hover:text-violet-300 hover:border-violet-500/50 hover:bg-violet-500/10"
                     )}
                     disabled={isLoading}
                     title="Refresh"
                   >
                     <i className={cn("fa-solid fa-sync text-[14px]", isLoading && "animate-spin")} />
                   </button>
                </div>

                {/* Address Bar */}
                <form onSubmit={(e) => { e.preventDefault(); refreshFiles(pathInput); }} className="flex-1">
                   <div className="relative group">
                       <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
                           <i className="fa-solid fa-folder-open text-zinc-600 group-focus-within:text-violet-500 transition-colors text-sm" />
                       </div>
                       <input 
                         type="text" 
                         value={pathInput} 
                         onChange={(e) => setPathInput(e.target.value)} 
                         className="w-full bg-zinc-900/50 border border-zinc-800 text-zinc-200 text-sm rounded-lg pl-10 pr-4 py-2 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/50 font-mono transition-all placeholder:text-zinc-600" 
                         placeholder="/path/to/directory"
                       />
                   </div>
                </form>

                <div className="h-6 w-px bg-zinc-800" />

                {/* View Toggles */}
                <div className="flex bg-zinc-900/50 rounded-lg p-1 border border-zinc-800 gap-1">
                   <button onClick={() => setViewMode('list')} className={cn("h-7 w-7 flex items-center justify-center rounded transition-all", viewMode === 'list' ? "bg-violet-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")} title="List View"><i className="fa-solid fa-list-ul text-[14px]"/></button>
                   <button onClick={() => setViewMode('grid')} className={cn("h-7 w-7 flex items-center justify-center rounded transition-all", viewMode === 'grid' ? "bg-violet-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")} title="Grid View"><i className="fa-solid fa-table-cells text-[14px]"/></button>
                </div>

                <div className="h-6 w-px bg-zinc-800" />

                {/* Actions Group */}
                <div className="flex items-center gap-2">
                    <button onClick={handlePaste} disabled={!clipboard || isPasting || clipboard.connectionId !== subTab.connectionId} className="h-9 px-3 flex items-center gap-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-violet-300 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all disabled:opacity-30 disabled:hover:bg-zinc-900 text-xs font-medium" title="Paste">
                        <i className="fa-regular fa-clipboard text-[14px]" /> Paste
                    </button>
                    <div className="flex gap-1">
                        <button onClick={() => setShowNewFile(true)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-violet-300 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all" title="New File"><i className="fa-solid fa-file-circle-plus text-[14px]" /></button>
                        <button onClick={() => setShowNewFolder(true)} className="h-9 w-9 flex items-center justify-center rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-400 hover:text-violet-300 hover:border-violet-500/50 hover:bg-violet-500/10 transition-all" title="New Folder"><i className="fa-solid fa-folder-plus text-[14px]" /></button>
                    </div>
                    <button onClick={async () => { await window.electron?.sftpUpload(subTab.connectionId, currentPath); refreshFiles(currentPath); }} className="h-9 px-3 flex items-center gap-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white border border-transparent shadow-lg shadow-violet-500/20 transition-all text-xs font-medium">
                        <i className="fa-solid fa-upload text-[14px]" /> Upload
                    </button>
                </div>
            </>
          ) : (
             /* Selection Toolbar */
             <div className="absolute inset-0 bg-violet-900 border-b border-violet-700 text-white px-4 flex items-center justify-between shadow-xl animate-in fade-in zoom-in-95 duration-150 z-30" onClick={e => e.stopPropagation()}>
               <div className="flex items-center gap-3">
                   <div className="bg-violet-500/40 p-1.5 rounded-full"><i className="fa-solid fa-check text-[14px] text-white"/></div>
                   <span className="text-sm font-medium">{selected.size} selected</span>
               </div>
               <div className="flex items-center gap-2">
                   <button onClick={() => handleCopy()} className="p-1.5 hover:bg-white/10 rounded text-violet-100 hover:text-white" title="Copy"><i className="fa-regular fa-copy text-[16px]" /></button>
                   <button onClick={() => handleCut()} className="p-1.5 hover:bg-white/10 rounded text-violet-100 hover:text-white" title="Cut"><i className="fa-solid fa-scissors text-[16px]" /></button>
                   <button onClick={() => setShowArchive('archive')} className="p-1.5 hover:bg-white/10 rounded text-violet-100 hover:text-white" title="Zip"><i className="fa-solid fa-box-archive text-[16px]" /></button>
                   <div className="w-px h-4 bg-white/20 mx-1"></div>
                   <button onClick={() => handleDownload()} className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium transition-colors"><i className="fa-solid fa-download text-[14px]" /> Download</button>
                   <button onClick={() => handleDelete()} className="flex items-center gap-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-100 rounded text-xs font-medium transition-colors border border-red-500/20"><i className="fa-solid fa-trash-can text-[14px]" /> Delete</button>
                   <button onClick={() => setSelected(new Set())} className="ml-2 p-1 text-violet-200 hover:text-white"><i className="fa-solid fa-xmark text-[16px]"/></button>
               </div>
             </div>
          )}
       </div>
       
       {/* File View Area */}
       <div className="flex-1 overflow-auto custom-scrollbar bg-[#09090b] p-2" onClick={() => setSelected(new Set())}>
         {viewMode === 'list' ? (
             <table className="w-full text-left text-xs border-separate border-spacing-0">
               <thead className="bg-zinc-900/80 text-zinc-500 sticky top-0 z-10 backdrop-blur-sm shadow-sm select-none">
                 <tr>
                   <th className="p-3 pl-4 w-10 border-b border-zinc-800 text-center"><button onClick={handleSelectAll} className="hover:text-violet-400"><i className="fa-solid fa-circle-check text-[16px]"/></button></th>
                   <th className="p-3 border-b border-zinc-800 cursor-pointer hover:text-violet-300 transition-colors" onClick={() => handleSort('filename')}>
                       <div className="flex items-center gap-2">Name {sortConfig.key === 'filename' && (sortConfig.direction === 'asc' ? <i className="fa-solid fa-arrow-down-a-z text-[12px]"/> : <i className="fa-solid fa-arrow-down-z-a text-[12px]"/>)}</div>
                   </th>
                   <th className="p-3 w-24 border-b border-zinc-800 cursor-pointer hover:text-violet-300 transition-colors" onClick={() => handleSort('size')}>
                       <div className="flex items-center gap-2">Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? <i className="fa-solid fa-arrow-down-a-z text-[12px]"/> : <i className="fa-solid fa-arrow-down-z-a text-[12px]"/>)}</div>
                   </th>
                   <th className="p-3 w-24 border-b border-zinc-800">Perms</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-zinc-800/30">
                 {sortedFiles.map((file, i) => {
                     const isSelected = selected.has(file.filename);
                     const isCut = clipboard?.op === 'cut' && clipboard.items.some(it => it.filename === file.filename); 
                     return (
                       <tr 
                         key={file.filename} 
                         onClick={(e) => handleSelect(file, i, e)}
                         onContextMenu={(e) => handleContextMenu(e, file)}
                         onDoubleClick={(e) => { e.stopPropagation(); file.isDirectory ? handleNavigate(file.filename) : openEditor(file) }}
                         className={cn("group transition-colors cursor-pointer select-none", isSelected ? "bg-violet-500/10" : "hover:bg-zinc-800/40", isCut && "opacity-50")} 
                       >
                         <td className="p-3 pl-4 text-center">
                             {isSelected ? <i className="fa-solid fa-square-check text-[16px] text-violet-500 mx-auto" /> : (
                                file.isDirectory ? <i className="fa-solid fa-folder text-[16px] text-violet-400 fill-violet-400/10 mx-auto" /> : <i className="fa-regular fa-file-lines text-[16px] text-zinc-500 mx-auto" />
                             )}
                         </td>
                         <td className={cn("p-3 font-medium", isSelected ? "text-violet-200" : "text-zinc-300")}>{file.filename}</td>
                         <td className="p-3 text-zinc-500 font-mono">{file.isDirectory ? '-' : (file.attrs.size < 1024 ? file.attrs.size + ' B' : (file.attrs.size / 1024).toFixed(1) + ' KB')}</td>
                         <td className="p-3 text-zinc-500 font-mono text-[10px] uppercase">{file.attrs.mode.toString(8).slice(-3)}</td>
                       </tr>
                     );
                 })}
               </tbody>
             </table>
         ) : (
            <div className="grid grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 p-2">
                 {sortedFiles.map((file, i) => {
                     const isSelected = selected.has(file.filename);
                     const isCut = clipboard?.op === 'cut' && clipboard.items.some(it => it.filename === file.filename);
                     return (
                         <div 
                             key={file.filename}
                             onClick={(e) => handleSelect(file, i, e)}
                             onContextMenu={(e) => handleContextMenu(e, file)}
                             onDoubleClick={(e) => { e.stopPropagation(); file.isDirectory ? handleNavigate(file.filename) : openEditor(file) }}
                             className={cn("flex flex-col items-center p-3 rounded-xl cursor-pointer transition-all border select-none group relative h-32 justify-between",
                                 isSelected ? "bg-violet-500/10 border-violet-500/30 shadow-lg" : "bg-zinc-900/30 border-transparent hover:bg-zinc-800 hover:border-zinc-700",
                                 isCut && "opacity-50")}
                         >
                             {/* Selection Checkbox Overlay */}
                             <div className={cn("absolute top-2 left-2 z-10 transition-opacity", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                                <div onClick={(e) => { e.stopPropagation(); toggleSelect(file.filename); }} className={cn("w-5 h-5 rounded border flex items-center justify-center cursor-pointer shadow-sm", isSelected ? "bg-violet-600 border-violet-600" : "bg-zinc-900/90 border-zinc-600 hover:border-zinc-400")}>
                                    {isSelected && <i className="fa-solid fa-check text-[12px] text-white" />}
                                </div>
                             </div>

                             <div className="flex-1 flex items-center justify-center mt-2">
                                 {file.isDirectory ? (
                                     <i className={cn("fa-solid fa-folder text-[40px] fill-current transition-colors", isSelected ? "text-violet-300" : "text-violet-400/80 group-hover:text-violet-400")} />
                                 ) : (
                                     <i className={cn("fa-regular fa-file-lines text-[40px] transition-colors", isSelected ? "text-violet-200" : "text-zinc-600 group-hover:text-zinc-500")} />
                                 )}
                             </div>
                             <span className={cn("text-xs text-center w-full break-words line-clamp-2 leading-tight font-medium mt-2", isSelected ? "text-violet-100" : "text-zinc-400 group-hover:text-zinc-300")}>
                                 {file.filename}
                             </span>
                         </div>
                     );
                 })}
            </div>
         )}
       </div>

       {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} options={getContextMenuOptions()} onClose={() => setContextMenu(null)} />}
       
       <Modal isOpen={!!showRename} onClose={() => setShowRename(null)} title="Rename File">
          {showRename && (
             <form onSubmit={(e) => { e.preventDefault(); window.electron?.sftpRename(subTab.connectionId, `${currentPath}/${showRename.item.filename}`, `${currentPath}/${showRename.name}`).then(() => { setShowRename(null); refreshFiles(currentPath); }); }} className="space-y-4">
                 <input autoFocus value={showRename.name} onChange={e => setShowRename({...showRename, name: e.target.value})} className="w-full bg-zinc-950 border border-zinc-800 rounded p-3 text-white outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/50" />
                 <div className="flex justify-end gap-2">
                     <button type="button" onClick={() => setShowRename(null)} className="px-4 py-2 text-sm text-zinc-400 hover:text-white">Cancel</button>
                     <button type="submit" className="px-4 py-2 text-sm bg-violet-600 hover:bg-violet-500 text-white rounded">Rename</button>
                 </div>
             </form>
          )}
       </Modal>
       <Modal isOpen={!!showPermissions} onClose={() => setShowPermissions(null)} title="Permissions Manager" maxWidth="max-w-xl">
          {showPermissions && <PermissionsManager item={showPermissions} currentPath={currentPath} connectionId={subTab.connectionId} onClose={() => setShowPermissions(null)} onRefresh={() => refreshFiles(currentPath)} />}
       </Modal>
       
       {/* Smart Installer Modal */}
       {installerState && (
          <SmartDependencyInstaller 
             isOpen={installerState.isOpen} 
             onClose={() => installerState.resolve && installerState.resolve(false)}
             connectionId={subTab.connectionId}
             tool={installerState.tool}
             onSuccess={() => installerState.resolve && installerState.resolve(true)}
          />
       )}

       <SimpleInputModal isOpen={showNewFile} onClose={() => setShowNewFile(false)} title="New File" placeholder="filename.txt" onSubmit={handleCreateFile} />
       <SimpleInputModal isOpen={showNewFolder} onClose={() => setShowNewFolder(false)} title="New Folder" placeholder="Folder Name" onSubmit={handleCreateFolder} />
       <SimpleInputModal isOpen={!!showArchive} onClose={() => setShowArchive(null)} title="Create Archive" placeholder="archive.zip" onSubmit={handleArchive} buttonLabel="Compress" initialValue={showArchive || ""} />
    </div>
  );
};