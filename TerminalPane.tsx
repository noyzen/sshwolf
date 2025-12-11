import React, { useRef, useEffect, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { SubTab, SSHConnection } from './types';
import { ContextMenu, ContextMenuOption } from './Modals';

export const TerminalPane = ({ subTab, connection, visible }: { subTab: SubTab, connection: SSHConnection, visible: boolean }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const connectedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const [contextMenu, setContextMenu] = useState<{x: number, y: number, options: ContextMenuOption[]} | null>(null);

  useEffect(() => {
    if (!visible || connectedRef.current) return;
    const initTerminal = async () => {
      connectedRef.current = true;
      if (terminalRef.current && !xtermRef.current) {
        const term = new XTerm({
          theme: { background: '#09090b', foreground: '#e4e4e7', cursor: '#ffffff', selectionBackground: '#3f3f46' },
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
          term.writeln(`\x1b[97mConnecting to ${connection.host}...\x1b[0m\r\n`);
          await window.electron?.sshConnect({ ...connection, id: subTab.connectionId, rows: term.rows, cols: term.cols });
          setIsConnected(true);
          fitAddon.fit();
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
  }, [visible]);

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

  return (
    <div className="relative w-full h-full" onContextMenu={handleRightClick}>
       <div ref={terminalRef} className="w-full h-full p-1" />
       {contextMenu && <ContextMenu x={contextMenu.x} y={contextMenu.y} options={contextMenu.options} onClose={() => setContextMenu(null)} />}
    </div>
  );
};