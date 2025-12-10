export interface SSHConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  password?: string;
  privateKeyPath?: string;
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

export interface SSHSession {
  connectionId: string;
  connected: boolean;
}

declare global {
  interface Window {
    electron?: {
      sshConnect: (config: SSHConnection) => Promise<any>;
      sshWrite: (connectionId: string, data: string) => Promise<void>;
      sshDisconnect: (connectionId: string) => Promise<void>;
      sshResize: (connectionId: string, rows: number, cols: number) => Promise<void>;
      onSSHData: (callback: (data: { connectionId: string, data: string }) => void) => () => void;
      onSSHClosed: (callback: (data: { connectionId: string }) => void) => () => void;
      
      sftpList: (connectionId: string, path: string) => Promise<FileEntry[]>;
      sftpUpload: (connectionId: string, remotePath: string) => Promise<{ success: boolean; cancelled?: boolean }>;
      sftpDownload: (connectionId: string, remoteFile: string) => Promise<{ success: boolean; cancelled?: boolean }>;
      sftpDelete: (connectionId: string, path: string, isDirectory: boolean) => Promise<void>;
      sftpCreateFolder: (connectionId: string, path: string) => Promise<void>;
      sftpReadFile: (connectionId: string, path: string) => Promise<string>;
      sftpWriteFile: (connectionId: string, path: string, content: string) => Promise<void>;
    }
  }
}