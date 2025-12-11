# SSH Wolf

![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Electron](https://img.shields.io/badge/Electron-29.0-orange.svg)
![React](https://img.shields.io/badge/React-18.0-blue.svg)

**SSH Wolf** is a modern, cross-platform SSH client and SFTP file manager built with speed and aesthetics in mind. Designed for developers and sysadmins who need a reliable, dark-themed tool to manage remote servers, edit files, and execute commands efficiently.

## 🚀 Features

### 🖥️ Modern Terminal
- **Full xterm.js Integration:** A fully functional terminal supporting colors, mouse events, and resizing.
- **Quick Commands:** Save frequently used commands and execute them with a click.
- **Command History:** Local history of your executed commands for quick access.
- **Zoom Controls:** Adjust terminal font size on the fly (`Ctrl +`, `Ctrl -`).

### 📂 Advanced SFTP Manager
- **Visual File Management:** Drag-and-drop uploads, context menus, and grid/list views.
- **Batch Operations:** Download, delete, or change permissions for multiple files at once.
- **Clipboard Integration:** Copy/Cut/Paste files remotely or between folders.
- **Smart Dependency Installer:** Automatically detects missing utilities (like `zip` or `unzip`) on the server and offers to install them for you.
- **Archive Support:** Create and extract `.zip`, `.tar`, and `.tar.gz` archives directly on the server.

### 📝 Built-in Code Editor
- **Remote Editing:** Edit files directly on the server without downloading them manually.
- **Find & Replace:** Robust search functionality within files.
- **Auto-Save:** Keyboard shortcuts (`Ctrl+S`) to save directly to the remote server.

### 🔐 Connection Manager
- **Session Management:** Keep multiple tabs (Terminal, SFTP, Editor) open for a single connection.
- **Auth Support:** Supports both Password and Private Key (PEM/PPK) authentication.
- **Encrypted Storage:** Connection details are stored locally.

---

## 🛠️ Installation & Development

### Prerequisites
- **Node.js** (v18 or higher)
- **NPM** or **Yarn**

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/ssh-wolf.git
cd ssh-wolf
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Run in Development Mode
This will start the Vite server for React and launch the Electron application window. Hot-reload is enabled.
```bash
npm run dev
```

---

## 📦 Building Executables

SSH Wolf uses `electron-builder` to package the application for production.

### Build for Windows
To create a Windows installer (`.exe` / `.msi`) and portable executable:
```bash
# Run on a Windows machine
npm run build
```
*Output will be located in `dist-electron/`*

### Build for Linux
To create Linux packages (`.AppImage`, `.deb`, etc.):
```bash
# Run on a Linux machine
npm run build
```
*Output will be located in `dist-electron/`*

---

## 📖 Usage Guide

### Managing Connections
1. Launch SSH Wolf.
2. Click the **"New Connection"** button (or the `+` icon).
3. Enter your Host IP, Port (default 22), Username, and choose between **Password** or **Private Key** authentication.
4. Click **Connect**.

### Using the SFTP Browser
- **Navigation:** Double-click folders to navigate. Use the address bar to jump to specific paths.
- **Upload:** Drag files from your OS into the window or use the "Upload" button.
- **Permissions:** Right-click a file and select "Permissions" to change Read/Write/Execute bits (chmod).
- **Editor:** Double-click any file to open it in the built-in editor tab.

### Using the Terminal
- **Tabs:** You can open multiple terminal tabs for the same session using the `+ Term` button in the top bar.
- **Copy/Paste:** Select text to copy (or Right Click -> Copy). Right Click -> Paste to insert text.

---

## 🏗️ Tech Stack

- **Core:** [Electron](https://www.electronjs.org/)
- **Frontend:** [React](https://react.dev/), [Vite](https://vitejs.dev/)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **SSH/SFTP:** [ssh2](https://github.com/mscdex/ssh2)
- **Terminal:** [xterm.js](https://xtermjs.org/)
- **Icons:** FontAwesome & Lucide React

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
