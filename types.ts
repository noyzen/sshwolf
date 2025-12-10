

export interface SSHConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
  passphrase?: string;
  lastUsed?: number;
}

export interface FileEntry {
  filename: string;
  longname: string;
  attrs: {
    mode: number;
    uid: number;
    gid: number;
    size: number;
    atime: number;
    mtime: number;
  };
  isDirectory: boolean;
}

export interface QuickCommand {
  id: string;
  name: string;
  command: string;
}

export type SubTabType = 'terminal' | 'sftp' | 'editor';

export interface SubTab {
  id: string;
  type: SubTabType;
  title: string;
  connectionId: string; // Unique ID used for the backend connection
  path?: string; // For SFTP to remember location, or Editor to remember file path
}

export interface ServerSession {
  id: string;
  connection: SSHConnection;
  subTabs: SubTab[];
  activeSubTabId: string | null;
}

export interface ClipboardItem {
  path: string;
  filename: string;
  isDirectory: boolean;
}

export interface ClipboardState {
  op: 'copy' | 'cut';
  connectionId: string;
  items: ClipboardItem[];
}

// For persistence
export interface SavedState {
  connections: SSHConnection[];
  sessions: ServerSession[];
  quickCommands: QuickCommand[];
}

declare global {
  interface Window {
    electron?: {
      sshConnect: (config: SSHConnection & { term?: string; rows?: number; cols?: number }) => Promise<any>;
      sshWrite: (connectionId: string, data: string) => Promise<void>;
      sshDisconnect: (connectionId: string) => Promise<void>;
      sshResize: (connectionId: string, rows: number, cols: number) => Promise<void>;
      sshExec: (connectionId: string, command: string) => Promise<{ code: number, stdout: string, stderr: string }>;
      onSSHData: (callback: (data: { connectionId: string, data: string }) => void) => () => void;
      onSSHClosed: (callback: (data: { connectionId: string }) => void) => () => void;
      
      selectKeyFile: () => Promise<string | null>;

      sftpList: (connectionId: string, path: string) => Promise<FileEntry[]>;
      sftpUpload: (connectionId: string, remotePath: string) => Promise<{ success: boolean; cancelled?: boolean }>;
      sftpDownload: (connectionId: string, remoteFile: string) => Promise<{ success: boolean; cancelled?: boolean }>;
      sftpDownloadBatch: (connectionId: string, remoteFiles: { path: string, filename: string, isDirectory: boolean }[]) => Promise<{ success: boolean; cancelled?: boolean }>;
      sftpDelete: (connectionId: string, path: string, isDirectory: boolean) => Promise<void>;
      sftpCreateFolder: (connectionId: string, path: string) => Promise<void>;
      sftpRename: (connectionId: string, oldPath: string, newPath: string) => Promise<void>;
      sftpChmod: (connectionId: string, path: string, mode: number) => Promise<void>;
      sftpReadFile: (connectionId: string, path: string) => Promise<string>;
      sftpWriteFile: (connectionId: string, path: string, content: string) => Promise<void>;
    }
  }
}