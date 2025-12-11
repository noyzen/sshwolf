import React, { useState, useEffect, useRef, useMemo } from 'react';
import { SubTab, SSHConnection } from './types';
import { cn } from './utils';

export const FileEditorPane = ({ subTab, connection, visible, onLoading }: { subTab: SubTab, connection: SSHConnection, visible: boolean, onLoading: (l: boolean) => void }) => {
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
    onLoading(true);
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
        onLoading(false);
    }
  };

  const handleSave = async () => {
    if (!subTab.path) return;
    setSaving(true);
    onLoading(true);
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
      onLoading(false);
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
      bg: "bg-zinc-950",
      toolbar: "bg-zinc-900 border-b border-zinc-800",
      text: "text-zinc-300",
      gutter: "bg-zinc-950 text-zinc-600 border-r border-zinc-800/50",
      statusbar: "bg-zinc-900 text-zinc-400 border-t border-zinc-800"
  };

  return (
    <div className={cn("flex flex-col h-full font-sans relative group", theme.bg)}>
       {/* Toolbar */}
       <div className={cn("h-10 flex items-center justify-between px-3 shadow-sm shrink-0 z-20 relative select-none", theme.toolbar)}>
          <div className="flex items-center gap-3 overflow-hidden">
             <div className="flex items-center gap-2 text-zinc-300">
                <i className="fa-regular fa-file-lines text-violet-400 text-[16px]" />
                <span className="font-mono text-xs truncate max-w-[300px] text-zinc-200">{subTab.path}</span>
             </div>
             <div className="h-4 w-px bg-zinc-700" />
             <div className="flex items-center gap-1">
                 <button onClick={() => setFontSize(s => Math.max(10, s-1))} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"><i className="fa-solid fa-minus text-[12px]" /></button>
                 <span className="text-xs text-zinc-500 w-6 text-center">{fontSize}</span>
                 <button onClick={() => setFontSize(s => Math.min(24, s+1))} className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-white"><i className="fa-solid fa-plus text-[12px]" /></button>
                 <div className="h-4 w-px bg-zinc-700 mx-1" />
                 <button onClick={() => setWordWrap(!wordWrap)} className={cn("p-1 rounded transition-colors", wordWrap ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white")} title="Toggle Word Wrap"><i className="fa-solid fa-paragraph text-[12px]" /></button>
                 <button onClick={() => setShowFind(!showFind)} className={cn("p-1 rounded transition-colors", showFind ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-800 hover:text-white")} title="Find & Replace (Ctrl+F)"><i className="fa-solid fa-magnifying-glass text-[12px]" /></button>
             </div>
          </div>
          <div className="flex gap-2">
             <button onClick={loadFile} className="h-7 w-7 flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-800 rounded transition-colors" title="Reload">
                 <i className={cn("fa-solid fa-rotate text-[12px]", loading && "fa-spin")} />
             </button>
             <button disabled={saving || loading} onClick={handleSave} className="flex items-center gap-2 h-7 px-3 text-xs bg-violet-600 hover:bg-violet-500 text-white rounded transition-all disabled:opacity-50 font-medium shadow-sm">
               {saving ? <i className="fa-solid fa-spinner fa-spin text-[12px]" /> : <i className="fa-regular fa-floppy-disk text-[12px]" />} Save
             </button>
          </div>
       </div>

       {/* Find Widget */}
       {showFind && (
         <div className="absolute top-12 right-4 z-30 w-80 bg-zinc-900 border border-zinc-700 shadow-2xl rounded-lg p-2 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex flex-col gap-2">
               <div className="flex items-center gap-2">
                   <div className="flex-1 relative">
                      <i className="fa-solid fa-magnifying-glass absolute left-2.5 top-2 text-zinc-500 text-[14px]"/>
                      <input 
                        id="find-input"
                        autoFocus
                        value={findText} 
                        onChange={e => setFindText(e.target.value)}
                        onKeyDown={e => { if(e.key === 'Enter') performFind(e.shiftKey ? 'prev' : 'next') }}
                        placeholder="Find"
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-8 pr-2 text-xs text-white outline-none focus:border-violet-500"
                      />
                   </div>
                   <div className="flex gap-0.5">
                       <button onClick={() => performFind('prev')} className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded" title="Previous (Shift+Enter)"><i className="fa-solid fa-arrow-up text-[14px]"/></button>
                       <button onClick={() => performFind('next')} className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded" title="Next (Enter)"><i className="fa-solid fa-arrow-down text-[14px]"/></button>
                   </div>
                   <button onClick={() => setShowReplace(!showReplace)} className={cn("p-1.5 rounded transition-colors", showReplace ? "bg-zinc-800 text-white" : "hover:bg-zinc-800 text-zinc-400 hover:text-white")} title="Toggle Replace"><i className="fa-solid fa-right-left text-[14px]"/></button>
                   <button onClick={() => setShowFind(false)} className="p-1.5 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded"><i className="fa-solid fa-xmark text-[14px]"/></button>
               </div>
               
               {showReplace && (
                  <div className="flex items-center gap-2">
                      <div className="flex-1 relative">
                          <i className="fa-solid fa-font absolute left-2.5 top-2 text-zinc-500 text-[14px]"/>
                          <input 
                            value={replaceText} 
                            onChange={e => setReplaceText(e.target.value)}
                            onKeyDown={e => { if(e.key === 'Enter') performReplace() }}
                            placeholder="Replace"
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-md py-1.5 pl-8 pr-2 text-xs text-white outline-none focus:border-violet-500"
                          />
                      </div>
                      <button onClick={performReplace} className="px-2 py-1.5 bg-zinc-800 hover:bg-white hover:text-zinc-950 text-zinc-400 text-xs rounded transition-colors">Replace</button>
                      <button onClick={performReplaceAll} className="px-2 py-1.5 bg-zinc-800 hover:bg-white hover:text-zinc-950 text-zinc-400 text-xs rounded transition-colors">All</button>
                  </div>
               )}
            </div>
         </div>
       )}
       
       {/* Editor Area */}
       <div className="flex-1 relative flex overflow-hidden">
         {loading && !content ? (
             <div className="absolute inset-0 flex items-center justify-center text-zinc-500 gap-2 z-10 bg-zinc-950">
                 <i className="fa-solid fa-spinner fa-spin" /> Loading...
             </div>
         ) : (
            <>
              {/* Line Numbers Gutter */}
              <div 
                ref={lineNumbersRef}
                className={cn("h-full py-4 text-right pr-3 pl-2 select-none overflow-hidden font-mono hidden md:block w-[3.5rem] shrink-0", theme.gutter)}
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
                    "flex-1 h-full font-mono py-4 px-3 outline-none resize-none leading-relaxed custom-scrollbar border-none bg-transparent selection:bg-violet-500/30", 
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