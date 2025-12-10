import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  FileText, Minus, Plus, WrapText, RefreshCw, Save, Loader2, 
  Search, X, ArrowDown, ArrowUp, Replace, Type 
} from 'lucide-react';
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
  
  // Find & Replace State
  const [showFind, setShowFind] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [findText, setFindText] = useState("");
  const [replaceText, setReplaceText] = useState("");

  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (visible && !loaded && !loading && !isConnected) {
      loadFile();
    }
  }, [visible, loaded, loading, isConnected]);

  useEffect(() => {
    // Focus textarea when visible
    if (visible && textAreaRef.current) {
      textAreaRef.current.focus();
    }
  }, [visible]);

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
    // Tab Indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      // Insert 2 spaces
      const spaces = "  ";
      const newContent = content.substring(0, start) + spaces + content.substring(end);
      setContent(newContent);
      // Restore cursor position
      setTimeout(() => { 
          if(textAreaRef.current) {
            textAreaRef.current.value = newContent;
            textAreaRef.current.selectionStart = textAreaRef.current.selectionEnd = start + 2; 
          }
      }, 0);
    }
    
    // Save Shortcut
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      handleSave();
    }

    // Find Shortcut
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setShowFind(true);
      setTimeout(() => document.getElementById('find-input')?.focus(), 10);
    }
    
    // Escape to close Find
    if (e.key === 'Escape' && showFind) {
      setShowFind(false);
      textAreaRef.current?.focus();
    }
  };

  const updateCursor = (e: React.SyntheticEvent<HTMLTextAreaElement>) => {
     const target = e.target as HTMLTextAreaElement;
     const val = target.value.substr(0, target.selectionStart);
     const line = val.split(/\r\n|\r|\n/).length;
     const col = target.selectionStart - val.lastIndexOf('\n');
     setCursorPos({ line, col });
  };

  const handleScroll = (e: React.UIEvent<HTMLTextAreaElement>) => {
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  // --- Find & Replace Logic ---

  const performFind = (direction: 'next' | 'prev') => {
    if (!findText || !textAreaRef.current) return;
    const ta = textAreaRef.current;
    const val = ta.value;
    const currentStart = ta.selectionStart;
    const currentEnd = ta.selectionEnd;

    let index = -1;

    if (direction === 'next') {
        // Search after current selection
        index = val.indexOf(findText, currentEnd);
        // Wrap around
        if (index === -1) index = val.indexOf(findText);
    } else {
        // Search before current selection
        const sub = val.substring(0, currentStart);
        index = sub.lastIndexOf(findText);
        // Wrap around
        if (index === -1) index = val.lastIndexOf(findText);
    }

    if (index !== -1) {
        ta.focus();
        ta.setSelectionRange(index, index + findText.length);
        // Basic scroll into view (browser default behavior on focus/select usually works)
        const lineHeight = fontSize * 1.5;
        const linesBefore = val.substring(0, index).split('\n').length;
        const topPos = (linesBefore - 1) * lineHeight;
        
        // Check if out of view and scroll if needed
        if (topPos < ta.scrollTop || topPos > ta.scrollTop + ta.clientHeight) {
            ta.scrollTop = Math.max(0, topPos - ta.clientHeight / 2);
        }
    }
  };

  const performReplace = () => {
    if (!textAreaRef.current || !findText) return;
    const ta = textAreaRef.current;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selectedText = content.substring(start, end);

    // Only replace if the current selection matches the find text
    if (selectedText === findText) {
       const newContent = content.substring(0, start) + replaceText + content.substring(end);
       setContent(newContent);
       // Preserve cursor/selection logic after state update
       setTimeout(() => {
           ta.value = newContent; // Force update for immediate calculation
           performFind('next');
       }, 0);
    } else {
       performFind('next');
    }
  };

  const performReplaceAll = () => {
     if (!findText) return;
     const newContent = content.split(findText).join(replaceText);
     setContent(newContent);
  };

  // --- Line Numbers ---
  
  const lineNumbers = useMemo(() => {
     const lines = content.split('\n').length;
     // Generating a single string is more performant than thousands of DOM nodes
     return Array.from({ length: lines }, (_, i) => i + 1).join('\n');
  }, [content]);

  // Theme matching colors
  const theme = {
      bg: "bg-slate-950",
      toolbar: "bg-slate-900 border-b border-slate-800",
      text: "text-slate-300",
      gutter: "bg-slate-900 text-slate-500 border-r border-slate-800",
      statusbar: "bg-indigo-600 text-white"
  };

  return (
    <div className={cn("flex flex-col h-full font-sans relative group", theme.bg)}>
       {/* Toolbar */}
       <div className={cn("h-12 flex items-center justify-between px-4 shadow-sm shrink-0 z-20 relative", theme.toolbar)}>
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
                 <button onClick={() => setShowFind(!showFind)} className={cn("p-1.5 rounded transition-colors", showFind ? "bg-indigo-600/20 text-indigo-400" : "text-slate-400 hover:bg-slate-800 hover:text-white")} title="Find & Replace (Ctrl+F)"><Search size={14} /></button>
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

       {/* Find Widget */}
       {showFind && (
         <div className="absolute top-14 right-4 z-30 w-80 bg-slate-900 border border-slate-700 shadow-2xl rounded-lg p-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2">
                   <div className="flex-1 relative">
                      <Search size={14} className="absolute left-2.5 top-2 text-slate-500"/>
                      <input 
                        id="find-input"
                        autoFocus
                        value={findText} 
                        onChange={e => setFindText(e.target.value)}
                        onKeyDown={e => { if(e.key === 'Enter') performFind(e.shiftKey ? 'prev' : 'next') }}
                        placeholder="Find"
                        className="w-full bg-slate-950 border border-slate-800 rounded-md py-1.5 pl-8 pr-2 text-xs text-white outline-none focus:border-indigo-500"
                      />
                   </div>
                   <div className="flex gap-0.5">
                       <button onClick={() => performFind('prev')} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded" title="Previous (Shift+Enter)"><ArrowUp size={14}/></button>
                       <button onClick={() => performFind('next')} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded" title="Next (Enter)"><ArrowDown size={14}/></button>
                   </div>
                   <button onClick={() => setShowReplace(!showReplace)} className={cn("p-1.5 rounded transition-colors", showReplace ? "bg-indigo-500/20 text-indigo-400" : "hover:bg-slate-800 text-slate-400 hover:text-white")} title="Toggle Replace"><Replace size={14}/></button>
                   <button onClick={() => setShowFind(false)} className="p-1.5 hover:bg-slate-800 text-slate-400 hover:text-white rounded"><X size={14}/></button>
               </div>
               
               {showReplace && (
                  <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                          <Type size={14} className="absolute left-2.5 top-2 text-slate-500"/>
                          <input 
                            value={replaceText} 
                            onChange={e => setReplaceText(e.target.value)}
                            onKeyDown={e => { if(e.key === 'Enter') performReplace() }}
                            placeholder="Replace"
                            className="w-full bg-slate-950 border border-slate-800 rounded-md py-1.5 pl-8 pr-2 text-xs text-white outline-none focus:border-indigo-500"
                          />
                      </div>
                      <button onClick={performReplace} className="px-2 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white text-xs rounded transition-colors">Replace</button>
                      <button onClick={performReplaceAll} className="px-2 py-1.5 bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white text-xs rounded transition-colors">All</button>
                  </div>
               )}
            </div>
         </div>
       )}
       
       {/* Editor Area */}
       <div className="flex-1 relative flex overflow-hidden">
         {loading && !content ? (
             <div className="absolute inset-0 flex items-center justify-center text-slate-500 gap-2 z-10 bg-slate-950">
                 <Loader2 className="animate-spin" /> Loading...
             </div>
         ) : (
            <>
              {/* Line Numbers Gutter */}
              <div 
                ref={lineNumbersRef}
                className={cn("h-full py-4 text-right pr-3 pl-2 select-none overflow-hidden text-slate-600 font-mono hidden md:block w-[3.5rem] shrink-0", theme.gutter)}
                style={{ 
                    fontSize: `${fontSize}px`, 
                    lineHeight: '1.5',
                }}
              >
                 <pre className="font-inherit">{lineNumbers}</pre>
              </div>

              {/* Text Area */}
              <textarea 
                ref={textAreaRef}
                className={cn(
                    "flex-1 h-full font-mono py-4 px-3 outline-none resize-none leading-relaxed custom-scrollbar border-none bg-transparent", 
                    theme.text,
                    wordWrap ? "whitespace-pre-wrap" : "whitespace-pre"
                )}
                style={{ 
                    fontSize: `${fontSize}px`, 
                    lineHeight: '1.5' 
                }}
                value={content}
                onChange={e => { setContent(e.target.value); updateCursor(e); }}
                onScroll={handleScroll}
                onClick={updateCursor} 
                onKeyUp={updateCursor} 
                onKeyDown={handleKeyDown} 
                spellCheck={false}
                autoCapitalize="off"
                autoComplete="off"
                autoCorrect="off"
              />
            </>
         )}
       </div>
       
       {/* Status Bar */}
       <div className={cn("h-6 text-[11px] flex items-center px-4 justify-between select-none shrink-0", theme.statusbar)}>
           <div className="flex gap-4">
               <span className="font-mono">Ln {cursorPos.line}, Col {cursorPos.col}</span>
               <span>UTF-8</span>
               <span>{content.length} chars</span>
           </div>
           <div>{isConnected ? "Connected" : "Disconnected"}</div>
       </div>
    </div>
  );
};