import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { 
  ArrowUp, RefreshCw, List, LayoutGrid, Clipboard, FilePlus, FolderPlus, Upload, 
  Check, Copy, Scissors, Package, Download, Trash, X, CheckCircle2, 
  SortAsc, SortDesc, Folder, FileText, Edit3, MoreVertical, Edit2, Lock, PackageOpen, CheckSquare 
} from 'lucide-react';
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
  clipboard: ClipboardState | null;
  setClipboard: (state: ClipboardState | null) => void;
}

export const SFTPPane = ({ subTab, connection, visible, onPathChange, onOpenTerminal, onOpenFile, clipboard, setClipboard }: SFTPPaneProps) => {
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
      if(mounted.current) setIsLoading(false);
    }
  }, [subTab.connectionId, onPathChange]);

  useEffect(() => {
    if (!visible) return;
    const connectAndLoad = async () => {
        if (!isConnected) {
            try {
                await window.electron?.sshConnect({ ...connection, id: subTab.connectionId });
                if(mounted.current) {
                  setIsConnected(true);
                  refreshFiles(currentPath);
                }
            } catch (e) {
                console.error("SFTP Connect Error", e);
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
      try {
          for (const file of filesToProcess) {
             const path = currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`;
             await window.electron?.sftpDelete(subTab.connectionId, path, file.isDirectory);
          }
          refreshFiles(currentPath);
      } catch (e: any) { alert(e.message); refreshFiles(currentPath); } 
      finally { setIsLoading(false); }
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
      try { await window.electron?.sftpDownloadBatch(subTab.connectionId, payload); } 
      catch (e: any) { if (!e.message?.includes('cancelled')) alert(e.message); }
  };

  const handlePaste = async () => {
      if (!clipboard || clipboard.items.length === 0 || clipboard.connectionId !== subTab.connectionId) return;
      setIsPasting(true);
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
      } catch (e: any) { alert(e.message); } 
      finally { setIsPasting(false); }
  };

  const handleArchive = async (name: string) => {
    if (!name || getSelectedFiles().length === 0) return;
    
    // Smart dependency check
    if (!(await ensureDependency('zip'))) return;

    setIsLoading(true);
    const filename = name.endsWith('.zip') ? name : name + '.zip';
    const items = getSelectedFiles().map(f => `"${f.filename}"`).join(' ');
    
    try {
       const cmd = `cd "${currentPath}" && zip -r "${filename}" ${items}`;
       await window.electron?.sshExec(subTab.connectionId, cmd);
       setShowArchive(null);
       refreshFiles(currentPath);
    } catch (e: any) { alert(e.message); }
    finally { setIsLoading(false); }
  };

  const handleExtract = async (file: FileEntry) => {
     setIsLoading(true);
     try {
        let cmd = '';
        if (file.filename.endsWith('.zip')) {
            if (!(await ensureDependency('unzip'))) { setIsLoading(false); return; }
            cmd = `cd "${currentPath}" && unzip "${file.filename}"`;
        } else if (file.filename.endsWith('.tar.gz') || file.filename.endsWith('.tgz')) {
            cmd = `cd "${currentPath}" && tar -xzf "${file.filename}"`;
        } else if (file.filename.endsWith('.tar')) {
            cmd = `cd "${currentPath}" && tar -xf "${file.filename}"`;
        } else {
            alert('Unsupported archive format');
            setIsLoading(false);
            return;
        }
        await window.electron?.sshExec(subTab.connectionId, cmd);
        refreshFiles(currentPath);
     } catch (e: any) { alert(e.message); }
     finally { setIsLoading(false); }
  };

  const getContextMenuOptions = () => {
      const selectedFiles = getSelectedFiles();
      if (contextMenu?.item) {
          const file = contextMenu.item;
          const isArchive = file.filename.match(/\.(zip|tar|tar\.gz|tgz)$/);
          return [
              ...(file.isDirectory ? [
                  { label: "Open", icon: <Folder size={14}/>, onClick: () => handleNavigate(file.filename) },
                  { label: "Open in Terminal", icon: <List size={14}/>, onClick: () => onOpenTerminal(currentPath === '/' ? `/${file.filename}` : `${currentPath}/${file.filename}`) }
              ] : [
                  { label: "Edit", icon: <Edit2 size={14}/>, onClick: () => openEditor(file) }
              ]),
              { separator: true, label: "", onClick: () => {} },
              { label: "Rename", icon: <Edit3 size={14}/>, onClick: () => setShowRename({item: file, name: file.filename}) },
              { label: "Permissions", icon: <Lock size={14}/>, onClick: () => setShowPermissions(file) },
              { separator: true, label: "", onClick: () => {} },
              { label: "Copy", icon: <Copy size={14}/>, onClick: () => handleCopy([file]) },
              { label: "Cut", icon: <Scissors size={14}/>, onClick: () => handleCut([file]) },
              { label: "Compress (Zip)", icon: <Package size={14}/>, onClick: () => setShowArchive('archive') },
              ...(isArchive ? [{ label: "Extract Here", icon: <PackageOpen size={14}/>, onClick: () => handleExtract(file) }] : []),
              { separator: true, label: "", onClick: () => {} },
              { label: "Download", icon: <Download size={14}/>, onClick: () => handleDownload([file]) },
              { label: "Delete", icon: <Trash size={14}/>, onClick: () => handleDeleteItem(file), danger: true }
          ];
      }
      return [
          { label: "New File", icon: <FilePlus size={14}/>, onClick: () => setShowNewFile(true) },
          { label: "New Folder", icon: <FolderPlus size={14}/>, onClick: () => setShowNewFolder(true) },
          { separator: true, label: "", onClick: () => {} },
          { label: "Paste", icon: <Clipboard size={14}/>, onClick: handlePaste },
          { separator: true, label: "", onClick: () => {} },
          { label: "Compress Selected", icon: <Package size={14}/>, onClick: () => setShowArchive('archive') },
          { separator: true, label: "", onClick: () => {} },
          { label: "Select All", icon: <CheckCircle2 size={14}/>, onClick: handleSelectAll },
          { label: "Refresh", icon: <RefreshCw size={14}/>, onClick: () => refreshFiles(currentPath) }
      ];
  };

  return (
    <div className="flex flex-col h-full bg-[#020617]" onClick={() => setSelected(new Set())} onContextMenu={(e) => handleContextMenu(e)}>
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
          <div className="flex bg-slate-900 rounded-lg border border-slate-800 p-0.5">
             <button onClick={() => setViewMode('list')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'list' ? "bg-slate-700 text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-300")} title="List View"><List size={16}/></button>
             <button onClick={() => setViewMode('grid')} className={cn("p-1.5 rounded-md transition-all", viewMode === 'grid' ? "bg-slate-700 text-indigo-400 shadow-sm" : "text-slate-500 hover:text-slate-300")} title="Grid View"><LayoutGrid size={16}/></button>
          </div>
          <div className="h-6 w-px bg-slate-800 mx-1" />
          <div className="flex gap-1">
              <button onClick={handlePaste} disabled={!clipboard || isPasting || clipboard.connectionId !== subTab.connectionId} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 disabled:opacity-30 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50" title="Paste"><Clipboard size={14} /> Paste</button>
              <button onClick={() => setShowNewFile(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50"><FilePlus size={14} /></button>
              <button onClick={() => setShowNewFolder(true)} className="flex items-center gap-2 px-3 py-1.5 bg-slate-800/50 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 transition-colors border border-slate-700/50"><FolderPlus size={14} /></button>
              <button onClick={async () => { await window.electron?.sftpUpload(subTab.connectionId, currentPath); refreshFiles(currentPath); }} className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 hover:text-indigo-300 rounded-lg text-xs font-medium transition-colors border border-indigo-500/20"><Upload size={14} /> Upload</button>
          </div>
       </div>

       {/* Bulk Actions Bar (Relative Flow) */}
       {selected.size > 0 && (
           <div className="bg-indigo-900/95 border-b border-indigo-500/30 text-white px-4 py-2 shadow-xl animate-in slide-in-from-top-2 duration-200 shrink-0" onClick={e => e.stopPropagation()}>
             <div className="flex items-center justify-between">
               <div className="flex items-center gap-3">
                   <div className="bg-indigo-500/20 p-1.5 rounded-full"><Check size={14} className="text-indigo-300"/></div>
                   <span className="text-sm font-medium">{selected.size} selected</span>
               </div>
               <div className="flex items-center gap-2">
                   <button onClick={() => handleCopy()} className="p-1.5 hover:bg-white/10 rounded text-slate-200 hover:text-white" title="Copy"><Copy size={16} /></button>
                   <button onClick={() => handleCut()} className="p-1.5 hover:bg-white/10 rounded text-slate-200 hover:text-white" title="Cut"><Scissors size={16} /></button>
                   <button onClick={() => setShowArchive('archive')} className="p-1.5 hover:bg-white/10 rounded text-slate-200 hover:text-white" title="Zip"><Package size={16} /></button>
                   <div className="w-px h-4 bg-white/20 mx-1"></div>
                   <button onClick={() => handleDownload()} className="flex items-center gap-2 px-3 py-1 bg-white/10 hover:bg-white/20 rounded text-xs font-medium transition-colors"><Download size={14} /> Download</button>
                   <button onClick={() => handleDelete()} className="flex items-center gap-2 px-3 py-1 bg-red-500/20 hover:bg-red-500/30 text-red-200 rounded text-xs font-medium transition-colors border border-red-500/20"><Trash size={14} /> Delete</button>
                   <button onClick={() => setSelected(new Set())} className="ml-2 p-1 text-indigo-300 hover:text-white"><X size={16}/></button>
               </div>
             </div>
           </div>
       )}
       
       {/* File View Area */}
       <div className="flex-1 overflow-auto custom-scrollbar bg-[#020617] p-2" onClick={() => setSelected(new Set())}>
         {viewMode === 'list' ? (
             <table className="w-full text-left text-xs border-separate border-spacing-0">
               <thead className="bg-slate-900/80 text-slate-500 sticky top-0 z-10 backdrop-blur-sm shadow-sm select-none">
                 <tr>
                   <th className="p-3 pl-4 w-10 border-b border-slate-800 text-center"><button onClick={handleSelectAll} className="hover:text-indigo-400"><CheckCircle2 size={16}/></button></th>
                   <th className="p-3 border-b border-slate-800 cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('filename')}>
                       <div className="flex items-center gap-2">Name {sortConfig.key === 'filename' && (sortConfig.direction === 'asc' ? <SortAsc size={12}/> : <SortDesc size={12}/>)}</div>
                   </th>
                   <th className="p-3 w-24 border-b border-slate-800 cursor-pointer hover:text-slate-300 transition-colors" onClick={() => handleSort('size')}>
                       <div className="flex items-center gap-2">Size {sortConfig.key === 'size' && (sortConfig.direction === 'asc' ? <SortAsc size={12}/> : <SortDesc size={12}/>)}</div>
                   </th>
                   <th className="p-3 w-24 border-b border-slate-800">Perms</th>
                   <th className="p-3 w-32 text-right pr-6 border-b border-slate-800">Actions</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-800/30">
                 {sortedFiles.map((file, i) => {
                     const isSelected = selected.has(file.filename);
                     const isCut = clipboard?.op === 'cut' && clipboard.items.some(it => it.filename === file.filename); 
                     return (
                       <tr 
                         key={file.filename} 
                         onClick={(e) => handleSelect(file, i, e)}
                         onContextMenu={(e) => handleContextMenu(e, file)}
                         onDoubleClick={(e) => { e.stopPropagation(); file.isDirectory ? handleNavigate(file.filename) : openEditor(file) }}
                         className={cn("group transition-colors cursor-pointer select-none", isSelected ? "bg-indigo-900/20 hover:bg-indigo-900/30" : "hover:bg-slate-800/40", isCut && "opacity-50")} 
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
                               <button onClick={(e) => { e.stopPropagation(); setShowRename({item: file, name: file.filename}) }} className="p-1.5 hover:bg-slate-700 hover:text-indigo-300 text-slate-500 rounded" title="Rename"><Edit3 size={14} /></button>
                               <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(file) }} className="p-1.5 hover:bg-slate-700 hover:text-red-400 text-slate-500 rounded" title="Delete"><Trash size={14} /></button>
                               <button onClick={(e) => { e.stopPropagation(); handleContextMenu(e, file); }} className="p-1.5 hover:bg-slate-700 hover:text-white text-slate-500 rounded"><MoreVertical size={14}/></button>
                            </div>
                         </td>
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
                                 isSelected ? "bg-indigo-600/20 border-indigo-500/50 shadow-lg shadow-indigo-900/20" : "bg-slate-900/30 border-transparent hover:bg-slate-800 hover:border-slate-700",
                                 isCut && "opacity-50")}
                         >
                             {/* Selection Checkbox Overlay */}
                             <div className={cn("absolute top-2 left-2 z-10 transition-opacity", isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                                <div onClick={(e) => { e.stopPropagation(); toggleSelect(file.filename); }} className={cn("w-5 h-5 rounded border flex items-center justify-center cursor-pointer shadow-sm", isSelected ? "bg-indigo-600 border-indigo-500" : "bg-slate-900/90 border-slate-600 hover:border-slate-400")}>
                                    {isSelected && <Check size={12} className="text-white" />}
                                </div>
                             </div>

                             {/* Action Toolbar Overlay */}
                             <div className="absolute top-2 right-2 flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10">
                                 <button onClick={(e) => { e.stopPropagation(); setShowRename({item: file, name: file.filename}) }} className="p-1.5 bg-slate-900/90 hover:bg-indigo-600 text-slate-400 hover:text-white rounded shadow-sm border border-slate-700" title="Rename"><Edit3 size={12}/></button>
                                 <button onClick={(e) => { e.stopPropagation(); handleDeleteItem(file) }} className="p-1.5 bg-slate-900/90 hover:bg-red-600 text-slate-400 hover:text-white rounded shadow-sm border border-slate-700" title="Delete"><Trash size={12}/></button>
                                 {!file.isDirectory && <button onClick={(e) => { e.stopPropagation(); openEditor(file) }} className="p-1.5 bg-slate-900/90 hover:bg-emerald-600 text-slate-400 hover:text-white rounded shadow-sm border border-slate-700" title="Edit"><Edit2 size={12}/></button>}
                                 <button onClick={(e) => { e.stopPropagation(); setShowPermissions(file) }} className="p-1.5 bg-slate-900/90 hover:bg-amber-600 text-slate-400 hover:text-white rounded shadow-sm border border-slate-700" title="Permissions"><Lock size={12}/></button>
                             </div>

                             <div className="flex-1 flex items-center justify-center mt-2">
                                 {file.isDirectory ? (
                                     <Folder size={40} className={cn("fill-current transition-colors", isSelected ? "text-indigo-400" : "text-slate-600 group-hover:text-indigo-400")} />
                                 ) : (
                                     <FileText size={40} className={cn("transition-colors", isSelected ? "text-slate-200" : "text-slate-700 group-hover:text-slate-500")} />
                                 )}
                             </div>
                             <span className={cn("text-xs text-center w-full break-words line-clamp-2 leading-tight font-medium mt-2", isSelected ? "text-indigo-200" : "text-slate-400 group-hover:text-slate-300")}>
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