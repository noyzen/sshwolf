import React, { useRef, useEffect, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SubTab, SSHConnection } from './types';
import { ContextMenu, ContextMenuOption } from './Modals';
import { cn } from './utils';

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export const TerminalPane = ({ subTab, connection, visible, onLoading }: { subTab: SubTab, connection: SSHConnection, visible: boolean, onLoading: (l: boolean) => void }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, options: ContextMenuOption[]} | null>(null);
  const [fontSize, setFontSize] = useState(14);

  // Update font size dynamically
  useEffect(() => {
    if (xtermRef.current && fitAddonRef.current) {
        xtermRef.current.options.fontSize = fontSize;
        // Re-fit after a brief delay to allow DOM to settle
        setTimeout(() => {
            if (fitAddonRef.current && xtermRef.current) {
                fitAddonRef.current.fit();
                window.electron?.sshResize(subTab.connectionId, xtermRef.current.cols, xtermRef.current.rows);
            }
        }, 50);
    }
  }, [fontSize, visible]);

  useEffect(() => {
    if (!visible) return;
    
    // Reset connected state on new attempt if needed
    if (reconnectAttempt > 0) {
        connectedRef.current = false;
        // If reusing instance, we might need to clear or reset. 
        // For now, we dispose and recreate to ensure clean slate.
        if (xtermRef.current) {
            xtermRef.current.dispose();
            xtermRef.current = null;
        }
        setStatus('connecting');
    }

    if (connectedRef.current) return;

    const initTerminal = async () => {
      connectedRef.current = true;
      setStatus('connecting');
      
      if (terminalRef.current && !xtermRef.current) {
        const term = new XTerm({
          theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#ffffff', selectionBackground: '#5b21b6' }, 
          fontFamily: 'Menlo, Monaco, "Courier New", monospace',
          fontSize: fontSize, 
          lineHeight: 1.4, cursorBlink: true, allowProposedApi: true, convertEol: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        term.open(terminalRef.current);
        xtermRef.current = term;
        fitAddonRef.current = fitAddon;
        setTimeout(() => fitAddon.fit(), 100);

        term.attachCustomKeyEventHandler((arg) => {
          // Zoom Shortcuts
          if (arg.type === 'keydown' && (arg.ctrlKey || arg.metaKey)) {
             if (arg.key === '=' || arg.key === '+') {
                 arg.preventDefault();
                 setFontSize(s => Math.min(s + 1, 36));
                 return false;
             }
             if (arg.key === '-') {
                 arg.preventDefault();
                 setFontSize(s => Math.max(s - 1, 8));
                 return false;
             }
             if (arg.key === '0') {
                 arg.preventDefault();
                 setFontSize(14);
                 return false;
             }
             
             // Copy/Paste
             if (arg.code === 'KeyC') {
                const selection = term.getSelection();
                if (selection) { navigator.clipboard.writeText(selection); return false; }
             }
             if (arg.code === 'KeyV') {
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
             setStatus('disconnected');
           }
        });

        try {
          onLoading(true);
          // Removed manual "Connecting..." log since we have a proper UI overlay now
          await window.electron?.sshConnect({ ...connection, id: subTab.connectionId, rows: term.rows, cols: term.cols });
          setStatus('connected');
          fitAddon.fit();
          if (subTab.path && subTab.path !== '/') {
             setTimeout(() => {
                 window.electron?.sshWrite(subTab.connectionId, `cd "${subTab.path}"\r`);
                 window.electron?.sshWrite(subTab.connectionId, `clear\r`);
             }, 800);
          }
        } catch (err: any) {
          term.writeln(`\r\n\x1b[31mError: ${err.message}\x1b[0m`);
          setStatus('disconnected');
        } finally {
          onLoading(false);
        }
        return () => {
          resizeObserver.disconnect();
          cleanupData && cleanupData();
          cleanupClose && cleanupClose();
          term.dispose();
          xtermRef.current = null;
          connectedRef.current = false;
          window.electron?.sshDisconnect(subTab.connectionId);
        };
      }
    };
    initTerminal();
  }, [visible, reconnectAttempt]);

  // Handle fit when visible changes or initial load
  useEffect(() => {
    if (visible && fitAddonRef.current) {
      setTimeout(() => {
        fitAddonRef.current?.fit();
        if(xtermRef.current) window.electron?.sshResize(subTab.connectionId, xtermRef.current.cols, xtermRef.current.rows);
      }, 50);
    }
  }, [visible]);

  const handleRightClick = (e: React.MouseEvent) => {
    e.preventDefault();
    const selection = xtermRef.current?.getSelection();
    setContextMenu({
        x: e.clientX,
        y: e.clientY,
        options: [
            { 
                label: "Copy", 
                icon: <i className="fa-regular fa-copy text-[14px]"/>, 
                onClick: () => { 
                    navigator.clipboard.writeText(selection || ''); 
                    setContextMenu(null);
                } 
            },
            { 
                label: "Paste", 
                icon: <i className="fa-regular fa-clipboard text-[14px]"/>, 
                onClick: () => { 
                    navigator.clipboard.readText().then(text => {
                        window.electron?.sshWrite(subTab.connectionId, text);
                    });
                    setContextMenu(null);
                } 
            },
            { separator: true, label: "", onClick: () => {} },
            { 
                label: "Zoom In (Ctrl +)", 
                icon: <i className="fa-solid fa-magnifying-glass-plus text-[14px]"/>, 
                onClick: () => { setFontSize(s => Math.min(s + 1, 36)); } 
            },
            { 
                label: "Zoom Out (Ctrl -)", 
                icon: <i className="fa-solid fa-magnifying-glass-minus text-[14px]"/>, 
                onClick: () => { setFontSize(s => Math.max(s - 1, 8)); } 
            },
            { 
                label: "Reset Zoom (Ctrl 0)", 
                icon: <i className="fa-solid fa-magnifying-glass text-[14px]"/>, 
                onClick: () => { setFontSize(14); } 
            },
            { separator: true, label: "", onClick: () => {} },
            { 
                label: "Reconnect", 
                icon: <i className="fa-solid fa-rotate-right text-[14px]"/>, 
                onClick: () => { setReconnectAttempt(prev => prev + 1); },
                danger: status !== 'connected'
            },
            { 
                label: "Cancel (Ctrl+C)", 
                icon: <i className="fa-solid fa-xmark text-[14px]"/>, 
                onClick: () => {
                    window.electron?.sshWrite(subTab.connectionId, '\x03');
                    setContextMenu(null);
                } 
            }
        ]
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
            setFontSize(s => Math.min(s + 1, 36));
        } else {
            setFontSize(s => Math.max(s - 1, 8));
        }
    }
  };

  return (
    <div className="relative w-full h-full group bg-[#09090b]" onContextMenu={handleRightClick} onWheel={handleWheel}>
       <div ref={terminalRef} className="w-full h-full pl-4 pt-4 pb-4" />
       {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} options={contextMenu.options} onClose={() => setContextMenu(null)} />}
       
       {status === 'connecting' && (
         <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#09090b] animate-in fade-in duration-200">
             <div className="flex flex-col items-center gap-4">
                  <div className="relative w-12 h-12">
                     <div className="absolute inset-0 rounded-full border-4 border-zinc-800"></div>
                     <div className="absolute inset-0 rounded-full border-4 border-t-violet-500 border-r-transparent border-b-transparent border-l-transparent animate-spin"></div>
                     <div className="absolute inset-0 flex items-center justify-center">
                        <i className="fa-solid fa-terminal text-zinc-600 text-sm" />
                     </div>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <h3 className="text-sm font-medium text-zinc-300">Connecting to Server</h3>
                    <p className="text-xs text-zinc-500 font-mono">{connection.username}@{connection.host}</p>
                  </div>
             </div>
         </div>
       )}

       {status === 'disconnected' && (
         <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-[2px] animate-in fade-in duration-300">
             <div className="bg-zinc-900 border border-zinc-700 p-6 rounded-xl shadow-2xl flex flex-col items-center">
                 <div className="h-12 w-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
                    <i className="fa-solid fa-plug-circle-xmark text-red-400 text-2xl" />
                 </div>
                 <h3 className="text-lg font-semibold text-zinc-200 mb-1">Disconnected</h3>
                 <p className="text-zinc-500 text-sm mb-6 text-center max-w-[200px]">The connection to {connection.host} was closed.</p>
                 <button 
                   onClick={() => setReconnectAttempt(prev => prev + 1)}
                   className="flex items-center gap-2 px-6 py-2 bg-violet-600 hover:bg-violet-500 text-white rounded-lg font-medium shadow-lg shadow-violet-500/20 transition-all hover:scale-105"
                 >
                    <i className="fa-solid fa-rotate-right" /> Reconnect
                 </button>
             </div>
         </div>
       )}
    </div>
  );
};