import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { Client } from 'ssh2';
import fs from 'fs';

// Note: __dirname is available globally in CommonJS, provided @types/node is installed.

// Suppress extraneous logs (Windows networking, etc)
app.commandLine.appendSwitch('log-level', '3');

let mainWindow: BrowserWindow | null = null;
const sshClients: Record<string, Client> = {};

// Window State Management
const statePath = path.join(app.getPath('userData'), 'window-state.json');

function loadWindowState() {
  try {
    if (fs.existsSync(statePath)) {
      const data = JSON.parse(fs.readFileSync(statePath, 'utf8'));
      return data;
    }
  } catch (e) {
    console.error('Failed to load window state:', e);
  }
  return { width: 1200, height: 800, isMaximized: false };
}

function saveWindowState() {
  if (!mainWindow) return;
  const bounds = mainWindow.getBounds();
  const isMaximized = mainWindow.isMaximized();
  try {
    fs.writeFileSync(statePath, JSON.stringify({ ...bounds, isMaximized }));
  } catch (e) {
    console.error('Failed to save window state:', e);
  }
}

function createWindow() {
  const state = loadWindowState();

  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#020617', // Slate 950
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#020617',
      symbolColor: '#e2e8f0',
      height: 40 // Match the React titlebar height
    },
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    show: false // Don't show immediately to prevent flash
  });

  if (state.isMaximized) {
    mainWindow.maximize();
  }
  
  mainWindow.show();

  const isDev = process.env.npm_lifecycle_event === 'dev:electron' || process.argv.includes('--dev');

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('close', () => {
    saveWindowState();
  });
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// --- System Dialogs ---

ipcMain.handle('select-key-file', async () => {
  if (!mainWindow) return null;
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'SSH Keys', extensions: ['pem', 'key', 'ppk', 'id_rsa', '*'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  return filePaths.length > 0 ? filePaths[0] : null;
});

// --- SSH IPC Handlers ---

ipcMain.handle('ssh-connect', async (event, config) => {
  return new Promise((resolve, reject) => {
    const conn = new Client();
    const connectionId = config.id;

    conn.on('ready', () => {
      sshClients[connectionId] = conn;
      
      // Default to standard terminal size if not provided
      const rows = config.rows || 24;
      const cols = config.cols || 80;

      conn.shell({ term: 'xterm-256color', rows, cols }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }
        
        // Handle incoming data from the server
        stream.on('data', (data: any) => {
          if (mainWindow) {
            mainWindow.webContents.send('ssh-data', { connectionId, data: data.toString() });
          }
        });

        stream.on('close', () => {
           if (mainWindow) {
            mainWindow.webContents.send('ssh-closed', { connectionId });
          }
          conn.end();
        });

        (conn as any).stream = stream;
        resolve({ success: true, message: 'Connected' });
      });
    }).on('error', (err) => {
      reject({ success: false, message: err.message });
    });

    // Build Connection Config
    const connectConfig: any = {
      host: config.host,
      port: config.port,
      username: config.username,
      readyTimeout: 20000,
      keepaliveInterval: 1000,
      tryKeyboard: true,
    };

    if (config.password) {
      connectConfig.password = config.password;
    }

    if (config.privateKeyPath) {
      try {
        if (fs.existsSync(config.privateKeyPath)) {
            connectConfig.privateKey = fs.readFileSync(config.privateKeyPath);
            if (config.passphrase) {
                connectConfig.passphrase = config.passphrase;
            }
        }
      } catch (err: any) {
        reject({ success: false, message: `Failed to read key file: ${err.message}` });
        return;
      }
    }

    try {
        conn.connect(connectConfig);
    } catch (err: any) {
        reject({ success: false, message: err.message });
    }
  });
});

ipcMain.handle('ssh-write', (event, { connectionId, data }) => {
  const conn = sshClients[connectionId];
  if (conn && (conn as any).stream) {
    (conn as any).stream.write(data);
  }
});

ipcMain.handle('ssh-disconnect', (event, { connectionId }) => {
  const conn = sshClients[connectionId];
  if (conn) {
    conn.end();
    delete sshClients[connectionId];
  }
});

ipcMain.handle('ssh-resize', (event, { connectionId, rows, cols }) => {
   const conn = sshClients[connectionId];
   if (conn && (conn as any).stream) {
     (conn as any).stream.setWindow(rows, cols);
   }
});

ipcMain.handle('ssh-exec', async (event, { connectionId, command }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.exec(command, (err, stream) => {
      if (err) return reject(err);
      let stdout = '';
      let stderr = '';
      stream.on('close', (code: any, signal: any) => {
        resolve({ code, signal, stdout, stderr });
      }).on('data', (data: any) => {
        stdout += data.toString();
      }).stderr.on('data', (data: any) => {
        stderr += data.toString();
      });
    });
  });
});

// --- SFTP IPC Handlers ---

ipcMain.handle('sftp-list', async (event, { connectionId, path: remotePath }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) {
        reject(err);
        return;
      }
      sftp.readdir(remotePath, (err, list) => {
        if (err) {
          sftp.end();
          reject(err);
          return;
        }
        const enhancedList = list.map(item => ({
          ...item,
          isDirectory: item.attrs.mode && (item.attrs.mode & 0o40000) === 0o40000
        }));
        resolve(enhancedList);
        sftp.end();
      });
    });
  });
});

ipcMain.handle('sftp-upload', async (event, { connectionId, remotePath }) => {
  if (!mainWindow) return;
  const { filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections']
  });

  if (filePaths.length === 0) return { success: false, cancelled: true };

  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }

      let completed = 0;
      let errors: any[] = [];

      filePaths.forEach(localPath => {
        const filename = path.basename(localPath);
        const fullRemotePath = remotePath.endsWith('/') 
          ? remotePath + filename 
          : remotePath + '/' + filename;

        sftp.fastPut(localPath, fullRemotePath, (err) => {
          if (err) errors.push(err);
          completed++;
          if (completed === filePaths.length) {
            sftp.end();
            if (errors.length > 0) reject(errors[0]);
            else resolve({ success: true });
          }
        });
      });
    });
  });
});

ipcMain.handle('sftp-download', async (event, { connectionId, remoteFile }) => {
  if (!mainWindow) return;
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: path.basename(remoteFile)
  });

  if (!filePath) return { success: false, cancelled: true };

  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      sftp.fastGet(remoteFile, filePath, (err) => {
        sftp.end();
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  });
});

ipcMain.handle('sftp-delete', async (event, { connectionId, path: remotePath, isDirectory }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      const cb = (err: any) => {
        sftp.end();
        if (err) reject(err);
        else resolve({ success: true });
      };

      if (isDirectory) {
        sftp.end();
        conn.exec(`rm -rf "${remotePath}"`, (err, stream) => {
             if (err) reject(err);
             else stream.on('close', (code: any) => {
                 if (code === 0) resolve({ success: true });
                 else reject(new Error(`Exit code ${code}`));
             });
        });
      } else {
        sftp.unlink(remotePath, cb);
      }
    });
  });
});

ipcMain.handle('sftp-create-folder', async (event, { connectionId, path: remotePath }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      sftp.mkdir(remotePath, (err) => {
        sftp.end();
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  });
});

ipcMain.handle('sftp-rename', async (event, { connectionId, oldPath, newPath }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      sftp.rename(oldPath, newPath, (err) => {
        sftp.end();
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  });
});

ipcMain.handle('sftp-chmod', async (event, { connectionId, path: remotePath, mode }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      sftp.chmod(remotePath, mode, (err) => {
        sftp.end();
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  });
});

ipcMain.handle('sftp-read-file', async (event, { connectionId, path: remotePath }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }
      const chunks: any[] = [];
      const stream = sftp.createReadStream(remotePath);
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('end', () => {
        sftp.end();
        resolve(Buffer.concat(chunks).toString('utf8'));
      });
      stream.on('error', (err) => {
        sftp.end();
        reject(err);
      });
    });
  });
});

ipcMain.handle('sftp-write-file', async (event, { connectionId, path: remotePath, content }) => {
  const conn = sshClients[connectionId];
  if (!conn) throw new Error('Not connected');

  return new Promise((resolve, reject) => {
    conn.sftp((err, sftp) => {
      if (err) { reject(err); return; }

      // Handle file write (including empty content for 'touch')
      // sftp.writeFile handles string content efficiently
      sftp.writeFile(remotePath, content, (err) => {
        sftp.end();
        if (err) reject(err);
        else resolve({ success: true });
      });
    });
  });
});
