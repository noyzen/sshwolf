import React, { useState, useEffect } from 'react';
import { Terminal, FileText, Folder, Plus, X, Zap, Search, Play, Save, History, Star } from 'lucide-react';
import { ServerSession, SubTab, QuickCommand, ClipboardState } from './types';
import { cn } from './utils';
import { TerminalPane } from './TerminalPane';
import { FileEditorPane } from './FileEditorPane';
import { SFTPPane } from './SFTPPane';

export const SessionView = ({ session, visible, onUpdate, onClose, clipboard, setClipboard }: { session: ServerSession, visible: boolean, onUpdate: (s: ServerSession) => void, onClose: () => void, clipboard: ClipboardState | null, setClipboard: (s: ClipboardState | null) => void }) => {
  const [showQuickCmds, setShowQuickCmds] = useState(false);
  const [quickCommands, setQuickCommands] = useState<QuickCommand[]>([]);
  const [cmdHistory, setCmdHistory] = useState<string[]>([]);
  const [inputCmd, setInputCmd] = useState('');

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
      if (!session.activeSubTabId) return;
      const tab = session.subTabs.find(t => t.id === session.activeSubTabId);
      if (tab && tab.type === 'terminal') {
         window.electron?.sshWrite(tab.connectionId, cmd + '\r');
         if (saveToHistory && cmd.trim()) {
            const newHist = [cmd, ...cmdHistory.filter(c => c !== cmd)].slice(0, 50);
            setCmdHistory(newHist);
            localStorage.setItem('cmd-history', JSON.stringify(newHist));
         }
         setShowQuickCmds(false);
         setInputCmd('');
      } else {
        alert("Quick commands can only be run on a terminal tab.");
      }
  };

  const addSubTab = (type: 'terminal' | 'sftp' | 'editor', path?: string) => {
    let title = 'Files';
    if (type === 'terminal') title = path ? 'Terminal' : `Terminal ${session.subTabs.filter(t => t.type === 'terminal').length + 1}`;
    if (type === 'editor') title = path?.split('/').pop() || 'Untitled';

    const newTab: SubTab = {
      id: crypto.randomUUID(),
      type,
      title,
      connectionId: crypto.randomUUID(),
      path: path || '/'
    };
    onUpdate({
      ...session,
      subTabs: [...session.subTabs, newTab],
      activeSubTabId: newTab.id
    });
  };

  const closeSubTab = (tabId: string) => {
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

  const activeTab = session.subTabs.find(t => t.id === session.activeSubTabId);
  const isTerminal = activeTab?.type === 'terminal';

  const filteredQuickCmds = quickCommands.filter(c => c.name.toLowerCase().includes(inputCmd.toLowerCase()) || c.command.toLowerCase().includes(inputCmd.toLowerCase()));
  const filteredHistory = cmdHistory.filter(c => c.toLowerCase().includes(inputCmd.toLowerCase()));

  return (
    <div className="flex flex-col h-full w-full">
      <div className="h-9 bg-[#0f172a] border-b border-slate-800 flex items-center px-2 shrink-0 select-none justify-between">
         <div className="flex items-center gap-1 overflow-x-auto flex-1 scrollbar-none min-w-0">
            {session.subTabs.map(tab => (
               <div 
                 key={tab.id}
                 onClick={() => onUpdate({ ...session, activeSubTabId: tab.id })}
                 className={cn(
                   "group flex items-center gap-2 px-3 py-1 text-xs font-medium rounded-md cursor-pointer border transition-all min-w-[120px] max-w-[200px] shrink-0",
                   session.activeSubTabId === tab.id 
                     ? "bg-slate-800 text-indigo-400 border-slate-700 shadow-sm" 
                     : "text-slate-500 border-transparent hover:bg-slate-800/50 hover:text-slate-300"
                 )}
                 title={tab.path}
               >
                  {tab.type === 'terminal' ? <Terminal size={12} /> : tab.type === 'editor' ? <FileText size={12} className="text-emerald-500" /> : <Folder size={12} />}
                  <span className="truncate flex-1">{tab.title}</span>
                  <button onClick={(e) => { e.stopPropagation(); closeSubTab(tab.id); }} className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5"><X size={10} /></button>
               </div>
            ))}
            <div className="h-4 w-px bg-slate-800 mx-1 shrink-0" />
            <button onClick={() => addSubTab('terminal')} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors shrink-0" title="New Terminal">
              <Plus size={12} /> Term
            </button>
            <button onClick={() => addSubTab('sftp')} className="flex items-center gap-1 px-2 py-1 text-xs text-slate-500 hover:text-indigo-400 hover:bg-slate-800 rounded transition-colors shrink-0" title="New File Manager">
              <Plus size={12} /> SFTP
            </button>
         </div>
         {isTerminal && (
           <div className="relative ml-2">
             <button 
                onClick={() => setShowQuickCmds(!showQuickCmds)}
                className={cn("flex items-center gap-1.5 px-2 py-1 text-xs font-medium rounded transition-colors border", showQuickCmds ? "bg-indigo-600 border-indigo-500 text-white" : "bg-slate-800 border-slate-700 text-slate-400 hover:text-white")}
             >
                <Zap size={12} /> Commands
             </button>
             {showQuickCmds && (
                  <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-700 rounded-lg shadow-xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[500px] z-50">
                      <div className="p-3 border-b border-slate-800 space-y-2 bg-slate-950/50 rounded-t-lg">
                          <div className="relative">
                              <Search size={14} className="absolute left-3 top-2.5 text-slate-500" />
                              <input 
                                autoFocus
                                placeholder="Filter or Type command..." 
                                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 pl-9 text-xs text-white focus:border-indigo-500 outline-none"
                                value={inputCmd}
                                onChange={e => setInputCmd(e.target.value)}
                                onKeyDown={e => { if(e.key === 'Enter') runCommand(inputCmd); }}
                              />
                          </div>
                          <div className="flex gap-2">
                             <button onClick={() => runCommand(inputCmd)} className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded px-2 py-1.5 text-xs font-medium flex items-center justify-center gap-2"><Play size={12}/> Run</button>
                             <button onClick={() => saveQuickCommand(inputCmd, inputCmd)} className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded px-2 py-1.5 text-xs font-medium flex items-center justify-center gap-2"><Save size={12}/> Save</button>
                          </div>
                      </div>
                      <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-4">
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
                      </div>
                  </div>
             )}
           </div>
         )}
         <div className="w-2"></div>
      </div>
      <div className="flex-1 relative bg-[#020617] overflow-hidden" onClick={() => setShowQuickCmds(false)}>
         {session.subTabs.map(tab => (
            <div key={tab.id} className={cn("absolute inset-0 w-full h-full", session.activeSubTabId === tab.id ? "z-10" : "z-0 invisible")}>
                {tab.type === 'terminal' ? (
                   <TerminalPane subTab={tab} connection={session.connection} visible={session.activeSubTabId === tab.id} />
                ) : tab.type === 'editor' ? (
                   <FileEditorPane subTab={tab} connection={session.connection} visible={session.activeSubTabId === tab.id} />
                ) : (
                   <SFTPPane 
                     subTab={tab} 
                     connection={session.connection} 
                     visible={session.activeSubTabId === tab.id} 
                     onPathChange={(path) => updateSubTab(tab.id, { path, title: path })}
                     onOpenTerminal={(path) => addSubTab('terminal', path)}
                     onOpenFile={(path) => addSubTab('editor', path)}
                     clipboard={clipboard}
                     setClipboard={setClipboard}
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
