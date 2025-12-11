import React, { useState, useEffect } from 'react';
import { SSHConnection, ServerSession, SubTab, ClipboardState } from './types';
import { cn, isMac, isWindows } from './utils';
import { Modal } from './Modals';
import { SessionView } from './SessionView';

// --- Main App ---

export default function App() {
  const [serverSessions, setServerSessions] = useState<ServerSession[]>(() => {
    try {
      const saved = localStorage.getItem('ssh-server-sessions');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
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
  const [clipboard, setClipboard] = useState<ClipboardState | null>(null);

  useEffect(() => {
    if (serverSessions.length === 0) {
      setManagerOpen(true);
    } else if (!activeSessionId) {
      setActiveSessionId(serverSessions[serverSessions.length - 1].id);
    }
  }, []);

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
    const existing = serverSessions.find(s => s.connection.id === conn.id);
    if (existing) {
      setActiveSessionId(existing.id);
      setManagerOpen(false);
      return;
    }

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
    <div className="flex flex-col h-screen bg-zinc-950 text-zinc-200 font-sans selection:bg-violet-500/30">
      <div className={cn("h-10 flex items-end bg-zinc-950 border-b border-zinc-800 select-none titlebar w-full z-[60] overflow-hidden fixed top-0 left-0 right-0", isMac && "pl-20", isWindows && "pr-36")}>
        <div className="flex items-center h-full px-2 gap-1 overflow-x-auto w-full scrollbar-none">
          {serverSessions.map(session => (
            <div 
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              className={cn(
                "group relative flex items-center gap-2 px-3 h-8 min-w-[140px] max-w-[200px] rounded-t-lg border-t border-x text-sm cursor-pointer transition-all no-drag",
                activeSessionId === session.id 
                  ? "bg-zinc-900 border-zinc-700 text-violet-100 z-10 font-medium shadow-sm" 
                  : "bg-zinc-900/50 border-transparent text-zinc-500 hover:bg-zinc-900 hover:text-zinc-300 mb-0.5"
              )}
            >
               <i className={cn("fa-solid fa-server text-[12px]", activeSessionId === session.id ? "text-violet-400" : "opacity-50")} />
               <span className="truncate flex-1">{session.connection.name}</span>
               <button onClick={(e) => { e.stopPropagation(); closeServerSession(session.id); }} className="opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400 p-0.5 rounded transition-all no-drag"><i className="fa-solid fa-xmark text-[12px]" /></button>
               {activeSessionId === session.id && <div className="absolute -bottom-[1px] left-0 right-0 h-[1px] bg-zinc-900 z-20" />}
               {activeSessionId === session.id && <div className="absolute top-0 left-0 right-0 h-[2px] bg-violet-500 rounded-t-lg opacity-50" />}
            </div>
          ))}
          <button onClick={() => { setEditingConnection(null); setManagerOpen(true); }} className="flex items-center justify-center w-8 h-8 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-violet-300 transition-colors mb-0.5 no-drag" title="New Connection"><i className="fa-solid fa-plus text-lg" /></button>
        </div>
      </div>

      <div className="flex-1 relative overflow-hidden bg-[#09090b] mt-10">
        {serverSessions.map(session => (
           <div key={session.id} className={cn("absolute inset-0 w-full h-full", activeSessionId === session.id ? "z-0" : "invisible")}>
              <SessionView 
                session={session} 
                visible={activeSessionId === session.id} 
                onUpdate={(updated) => setServerSessions(prev => prev.map(s => s.id === updated.id ? updated : s))}
                onClose={() => closeServerSession(session.id)}
                clipboard={clipboard}
                setClipboard={setClipboard}
              />
           </div>
        ))}
        {serverSessions.length === 0 && !isManagerOpen && (
           <div className="flex flex-col items-center justify-center h-full text-zinc-600">
              <div className="w-20 h-20 mb-4 drop-shadow-2xl grayscale opacity-50">
                <img src="./appicon.png" alt="SSH Wolf" className="w-full h-full object-contain" />
              </div>
              <h2 className="text-xl font-bold text-zinc-400">No Active Sessions</h2>
              <button onClick={() => setManagerOpen(true)} className="mt-4 text-violet-400 hover:text-violet-300 hover:underline">Open Connection Manager</button>
           </div>
        )}
      </div>

      <Modal isOpen={isManagerOpen} onClose={() => { if(serverSessions.length > 0 || editingConnection) { setEditingConnection(null); if(serverSessions.length > 0) setManagerOpen(false); }}} title={editingConnection ? (editingConnection.id ? "Edit Connection" : "New Connection") : "Connection Manager"} hideClose={!editingConnection && serverSessions.length === 0}>
        {!editingConnection ? (
          <div className="space-y-3">
             <div className="grid grid-cols-1 gap-3">
                {connections.map(conn => (
                  <div key={conn.id} className="group bg-zinc-950 border border-zinc-800 hover:border-violet-500/30 rounded-xl p-4 transition-all flex items-center justify-between">
                     <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => createServerSession(conn)}>
                        <div className="w-10 h-10 rounded-lg bg-zinc-900 group-hover:bg-violet-900/20 flex items-center justify-center text-zinc-400 group-hover:text-violet-400 shadow-inner transition-colors"><i className="fa-solid fa-server text-xl" /></div>
                        <div><h4 className="font-bold text-zinc-200 group-hover:text-violet-100 transition-colors">{conn.name}</h4><p className="text-xs text-zinc-500 font-mono">{conn.username}@{conn.host}</p></div>
                     </div>
                     <div className="flex gap-1">
                        <button onClick={() => setEditingConnection(conn)} className="p-2 text-zinc-500 hover:bg-zinc-900 hover:text-violet-300 rounded-lg transition-colors" title="Edit"><i className="fa-solid fa-pen-to-square text-base" /></button>
                        <button onClick={() => { if(confirm(`Delete ${conn.name}?`)) setConnections(connections.filter(c => c.id !== conn.id)); }} className="p-2 text-zinc-500 hover:bg-zinc-900 hover:text-red-400 rounded-lg transition-colors" title="Delete"><i className="fa-solid fa-trash-can text-base" /></button>
                        <button onClick={() => createServerSession(conn)} className="ml-2 px-4 py-1.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-violet-500/20">Connect</button>
                     </div>
                  </div>
                ))}
                <button onClick={() => setEditingConnection({ port: 22 })} className="w-full py-3 border-2 border-dashed border-zinc-800 hover:border-violet-500/30 hover:bg-violet-500/5 text-zinc-500 hover:text-violet-300 rounded-xl transition-all flex items-center justify-center gap-2 font-medium"><i className="fa-solid fa-plus text-lg" /> Add New Connection</button>
             </div>
          </div>
        ) : (
          <form onSubmit={handleSaveConnection} className="space-y-4">
            <div><label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Connection Name</label><input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700" placeholder="Production Server" value={editingConnection.name || ''} onChange={e => setEditingConnection({...editingConnection, name: e.target.value})} /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="col-span-2"><label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Hostname / IP</label><input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700 font-mono text-sm" placeholder="192.168.1.1" value={editingConnection.host || ''} onChange={e => setEditingConnection({...editingConnection, host: e.target.value})} /></div>
              <div><label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Port</label><input type="number" required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700 font-mono text-sm" value={editingConnection.port || 22} onChange={e => setEditingConnection({...editingConnection, port: parseInt(e.target.value)})} /></div>
            </div>
            <div><label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1.5">Username</label><input required className="w-full bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700 font-mono text-sm" placeholder="root" value={editingConnection.username || ''} onChange={e => setEditingConnection({...editingConnection, username: e.target.value})} /></div>
            <div className="bg-zinc-950/50 p-4 rounded-xl border border-zinc-800 space-y-4">
                 <div className="flex items-center justify-between"><label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Authentication</label><div className="flex bg-zinc-900 p-0.5 rounded-lg border border-zinc-800"><button type="button" onClick={() => setAuthType('password')} className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", authType === 'password' ? "bg-violet-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>Password</button><button type="button" onClick={() => setAuthType('key')} className={cn("px-3 py-1 text-xs font-medium rounded-md transition-all", authType === 'key' ? "bg-violet-600 text-white shadow-sm" : "text-zinc-500 hover:text-zinc-300")}>Private Key</button></div></div>
                 {authType === 'password' ? (<input type="password" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-white focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700 font-mono text-sm" placeholder="Password" value={editingConnection.password || ''} onChange={e => setEditingConnection({...editingConnection, password: e.target.value})} />) : (<div className="space-y-3"><div className="flex gap-2"><div className="relative flex-1"><i className="fa-solid fa-key absolute left-3 top-3 text-zinc-600 text-base" /><input readOnly className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 pl-10 text-zinc-300 focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700 font-mono text-xs" placeholder="No key selected" value={editingConnection.privateKeyPath || ''} /></div><button type="button" onClick={async () => { const path = await window.electron?.selectKeyFile(); if(path) setEditingConnection({...editingConnection, privateKeyPath: path}); }} className="px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm border border-zinc-700 transition-colors">Browse</button></div><div className="relative"><i className="fa-solid fa-shield-halved absolute left-3 top-3 text-zinc-600 text-base" /><input type="password" className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-3 pl-10 text-white focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500 outline-none transition-all placeholder:text-zinc-700 font-mono text-sm" placeholder="Passphrase (Optional)" value={editingConnection.passphrase || ''} onChange={e => setEditingConnection({...editingConnection, passphrase: e.target.value})} /></div></div>)}
            </div>
            <div className="pt-4 flex justify-between items-center border-t border-zinc-800 mt-4"><button type="button" onClick={() => setEditingConnection(null)} className="text-zinc-500 hover:text-zinc-300 text-sm font-medium px-2 py-1">Back to list</button><button type="submit" className="px-6 py-2.5 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium shadow-lg shadow-violet-500/20 transition-all">Save Connection</button></div>
          </form>
        )}
      </Modal>
    </div>
  );
}