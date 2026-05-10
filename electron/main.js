const { app, BrowserWindow, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

let mainWindow = null;
let flaskProcess = null;
let flaskPort = null;

// ── Find the bundled Flask server binary ──────────────────────────────────────

function getServerPath() {
  if (app.isPackaged) {
    const serverDir = path.join(process.resourcesPath, 'server');
    const bin = process.platform === 'win32'
      ? path.join(serverDir, 'classify-server.exe')
      : path.join(serverDir, 'classify-server');
    return bin;
  } else {
    // Development: run app.py directly with python
    return null;
  }
}

// ── Start the Flask backend ───────────────────────────────────────────────────

function startFlask() {
  return new Promise((resolve, reject) => {
    const serverBin = getServerPath();
    const env = { ...process.env, CLASSIFY_ELECTRON: '1' };

    if (serverBin) {
      // Production: run bundled binary
      flaskProcess = spawn(serverBin, [], { env });
    } else {
      // Development: run via python from project root
      const projectRoot = path.join(__dirname, '..');
      const appPy = path.join(projectRoot, 'webapp', 'app.py');
      const python = process.platform === 'win32' ? 'python' : 'python3';
      flaskProcess = spawn(python, [appPy], { env, cwd: projectRoot });
    }

    const timeout = setTimeout(() => {
      reject(new Error('Flask server did not start within 15 seconds'));
    }, 15000);

    flaskProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const match = text.match(/CLASSIFY_PORT:(\d+)/);
      if (match) {
        flaskPort = parseInt(match[1], 10);
        clearTimeout(timeout);
        resolve(flaskPort);
      }
    });

    flaskProcess.stderr.on('data', (data) => {
      // Flask dev server writes to stderr — ignore in production, log in dev
      if (!app.isPackaged) {
        console.error('[Flask]', data.toString().trim());
      }
    });

    flaskProcess.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    flaskProcess.on('exit', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`Flask exited with code ${code}`);
      }
    });
  });
}

// ── Create the main window ────────────────────────────────────────────────────

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${port}`);

  // Show window once content is ready to avoid white flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open external links in the system browser, not inside the app
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// ── App menu (macOS) ──────────────────────────────────────────────────────────

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' },
      ],
    }] : []),
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(!app.isPackaged ? [{ type: 'separator' }, { role: 'toggleDevTools' }] : []),
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  buildMenu();

  try {
    const port = await startFlask();
    createWindow(port);
  } catch (err) {
    const { dialog } = require('electron');
    dialog.showErrorBox(
      'Classify — startup error',
      `Could not start the backend server:\n\n${err.message}`
    );
    app.quit();
  }

  app.on('activate', () => {
    // macOS: re-open window when clicking dock icon with no windows open
    if (BrowserWindow.getAllWindows().length === 0 && flaskPort) {
      createWindow(flaskPort);
    }
  });
});

app.on('window-all-closed', () => {
  // On macOS, keep the app running until Cmd+Q
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (flaskProcess) {
    flaskProcess.kill();
    flaskProcess = null;
  }
});
