import React, { useState, useEffect, useRef } from 'react';
import { FileText, Minus, Plus, WrapText, RefreshCw, Save, Loader2 } from 'lucide-react';
import { SubTab, SSHConnection } from './types';
import { cn } from './utils';

export const FileEditorPane = ({ subTab, connection, visible }: { subTab: SubTab, connection: SSHConnection, visible: boolean }) => {
  const [content, setContent] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [fontSize, setFontSize] = useState(14);
  const [wordWrap, setWordWrap] = useState(false);
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (visible && !loaded && !loading && !isConnected) {
      loadFile();
    }
  }, [visible, loaded, loading, isConnected]);

  const loadFile = async () => {
    setLoading(true);
    try {
        if (!isConnected) {
           await window.electron?.sshConnect({ ...connection, id: subTab.connectionId });
           setIsConnected(true);
        }
        if (subTab.path) {
          const data = await window.electron?.sftpReadFile(subTab.connectionId, subTab.path);
          setContent(data);
          setLoaded(true);
        }
    } catch (e: any) {
        setContent(`Error loading file: ${e.message}`);
    } finally {
        setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!subTab.path) return;
    setSaving(true);
    try {
      if (!isConnected) {
          await window.electron?.sshConnect({ ...connection, id: subTab.connectionId });
          setIsConnected(true);
      }
      await window.electron?.sftpWriteFile(subTab.connectionId, subTab.path, content);
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

  // Theme matching colors
  const theme = {
      bg: "bg-slate-950",
      toolbar: "bg-slate-900 border-b border-slate-800",
      text: "text-slate-300",
      gutter: "bg-slate-900 text-slate-500",
      statusbar: "bg-indigo-600 text-white"
  };

  return (
    <div className={cn("flex flex-col h-full font-sans", theme.bg)}>
       {/* Toolbar */}
       <div className={cn("h-12 flex items-center justify-between px-4 shadow-sm shrink-0", theme.toolbar)}>
          <div className="flex items-center gap-4 overflow-hidden">
             <div className="flex items-center gap-2 text-slate-300">
                <FileText className="text-indigo-400" size={18} />
                <span className="font-mono text-xs truncate max-w-[300px] text-slate-200">{subTab.path}</span>
             </div>
             <div className="h-4 w-px bg-slate-700" />
             <div className="flex items-center gap-1">
                 <button onClick={() => setFontSize(s => Math.max(10, s-1))} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"><Minus size={14} /></button>
                 <span className="text-xs text-slate-500 w-6 text-center">{fontSize}</span>
                 <button onClick={() => setFontSize(s => Math.min(24, s+1))} className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-white"><Plus size={14} /></button>
                 <div className="h-4 w-px bg-slate-700 mx-1" />
                 <button onClick={() => setWordWrap(!wordWrap)} className={cn("p-1.5 rounded transition-colors", wordWrap ? "bg-indigo-600/20 text-indigo-400" : "text-slate-400 hover:bg-slate-800 hover:text-white")} title="Toggle Word Wrap"><WrapText size={14} /></button>
             </div>
          </div>
          <div className="flex gap-2">
             <button onClick={loadFile} className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors" title="Reload">
                 <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
             </button>
             <button disabled={saving || loading} onClick={handleSave} className="flex items-center gap-2 px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-all disabled:opacity-50 font-medium shadow-lg shadow-indigo-500/20">
               {saving ? <Loader2 className="animate-spin" size={12} /> : <Save size={12} />} Save
             </button>
          </div>
       </div>
       
       {/* Editor Area */}
       <div className="flex-1 relative">
         {loading && !content ? (
             <div className="absolute inset-0 flex items-center justify-center text-slate-500 gap-2">
                 <Loader2 className="animate-spin" /> Loading...
             </div>
         ) : (
            <textarea 
            ref={textAreaRef}
            className={cn(
                "absolute inset-0 w-full h-full font-mono p-4 outline-none resize-none leading-relaxed custom-scrollbar border-none", 
                theme.bg, theme.text,
                wordWrap ? "whitespace-pre-wrap" : "whitespace-pre"
            )}
            style={{ fontSize: `${fontSize}px` }}
            value={content}
            onChange={e => { setContent(e.target.value); updateCursor(e); }}
            onClick={updateCursor} onKeyUp={updateCursor} onKeyDown={handleKeyDown} spellCheck={false}
            />
         )}
       </div>
       
       {/* Status Bar */}
       <div className={cn("h-6 text-[11px] flex items-center px-4 justify-between select-none", theme.statusbar)}>
           <div className="flex gap-4">
               <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
               <span>UTF-8</span>
           </div>
           <div>{isConnected ? "Connected" : "Disconnected"}</div>
       </div>
    </div>
  );
};
