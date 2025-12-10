import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
  sshConnect: (config: any) => ipcRenderer.invoke('ssh-connect', config),
  sshWrite: (connectionId: string, data: string) => ipcRenderer.invoke('ssh-write', { connectionId, data }),
  sshDisconnect: (connectionId: string) => ipcRenderer.invoke('ssh-disconnect', { connectionId }),
  sshResize: (connectionId: string, rows: number, cols: number) => ipcRenderer.invoke('ssh-resize', { connectionId, rows, cols }),
  sshExec: (connectionId: string, command: string) => ipcRenderer.invoke('ssh-exec', { connectionId, command }),
  onSSHData: (callback: (data: any) => void) => {
    const handler = (_event: any, value: any) => callback(value);
    ipcRenderer.on('ssh-data', handler);
    return () => ipcRenderer.removeListener('ssh-data', handler);
  },
  onSSHClosed: (callback: (data: any) => void) => {
    const handler = (_event: any, value: any) => callback(value);
    ipcRenderer.on('ssh-closed', handler);
    return () => ipcRenderer.removeListener('ssh-closed', handler);
  },
  
  selectKeyFile: () => ipcRenderer.invoke('select-key-file'),

  // SFTP
  sftpList: (connectionId: string, path: string) => ipcRenderer.invoke('sftp-list', { connectionId, path }),
  sftpUpload: (connectionId: string, remotePath: string) => ipcRenderer.invoke('sftp-upload', { connectionId, remotePath }),
  sftpDownload: (connectionId: string, remoteFile: string) => ipcRenderer.invoke('sftp-download', { connectionId, remoteFile }),
  sftpDelete: (connectionId: string, path: string, isDirectory: boolean) => ipcRenderer.invoke('sftp-delete', { connectionId, path, isDirectory }),
  sftpCreateFolder: (connectionId: string, path: string) => ipcRenderer.invoke('sftp-create-folder', { connectionId, path }),
  sftpRename: (connectionId: string, oldPath: string, newPath: string) => ipcRenderer.invoke('sftp-rename', { connectionId, oldPath, newPath }),
  sftpChmod: (connectionId: string, path: string, mode: number) => ipcRenderer.invoke('sftp-chmod', { connectionId, path, mode }),
  sftpReadFile: (connectionId: string, path: string) => ipcRenderer.invoke('sftp-read-file', { connectionId, path }),
  sftpWriteFile: (connectionId: string, path: string, content: string) => ipcRenderer.invoke('sftp-write-file', { connectionId, path, content }),
});