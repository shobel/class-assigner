const { app, BrowserWindow, shell, Menu, dialog } = require('electron');
const { spawn, execFile } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');
const os = require('os');

const PORT = 5001;
const SERVICE_LABEL   = 'com.classify.server';
const SERVICE_PLIST   = path.join(os.homedir(), 'Library', 'LaunchAgents', `${SERVICE_LABEL}.plist`);
const SERVICE_LOG_DIR = path.join(os.homedir(), 'Library', 'Logs', 'Classify');

let mainWindow   = null;
let flaskProcess = null; // dev mode only

// Returns the server binary path inside the app bundle (includes _internal/ alongside it)
function getServerBin() {
  const name = process.platform === 'win32' ? 'classify-server.exe' : 'classify-server';
  return path.join(process.resourcesPath, 'server', name);
}

// ── Health check ──────────────────────────────────────────────────────────────

function checkHealth() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/health`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1500, () => { req.destroy(); resolve(false); });
  });
}

function waitForServer(timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const poll = async () => {
      if (await checkHealth()) return resolve();
      if (Date.now() - start > timeout) {
        return reject(new Error(
          'Server did not respond within 20 seconds.\n\nCheck logs at:\n' + SERVICE_LOG_DIR
        ));
      }
      setTimeout(poll, 500);
    };
    poll();
  });
}

// ── launchd service management (macOS packaged) ───────────────────────────────

function makePlist() {
  const bin    = getServerBin();
  const logOut = path.join(SERVICE_LOG_DIR, 'server.log');
  const logErr = path.join(SERVICE_LOG_DIR, 'server-error.log');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${SERVICE_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${bin}</string>
    </array>
    <key>WorkingDirectory</key>
    <string>${path.dirname(bin)}</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>CLASSIFY_SERVICE</key>
        <string>1</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logOut}</string>
    <key>StandardErrorPath</key>
    <string>${logErr}</string>
</dict>
</plist>`;
}

function launchctl(...args) {
  return new Promise((resolve, reject) => {
    execFile('launchctl', args, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || err.message));
      else resolve(stdout);
    });
  });
}

async function checkRunningVersion() {
  try {
    const res = await new Promise((resolve, reject) => {
      const req = http.get(`http://127.0.0.1:${PORT}/api/version`, (r) => {
        let body = '';
        r.on('data', d => body += d);
        r.on('end', () => resolve(JSON.parse(body)));
      });
      req.on('error', reject);
      req.setTimeout(1500, () => { req.destroy(); reject(new Error('timeout')); });
    });
    return res.version || null;
  } catch {
    return null;
  }
}

async function ensureService() {
  const healthy = await checkHealth();

  if (healthy) {
    // Check if the running version matches this app bundle
    const runningVersion = await checkRunningVersion();
    const appVersion = app.getVersion();
    if (runningVersion === appVersion) return; // all good

    // Version mismatch — restart service with new binary
    if (fs.existsSync(SERVICE_PLIST)) {
      try { await launchctl('unload', SERVICE_PLIST); } catch {}
    }
    await new Promise(r => setTimeout(r, 1000)); // let it stop
  } else if (fs.existsSync(SERVICE_PLIST)) {
    try { await launchctl('unload', SERVICE_PLIST); } catch {}
  }

  // Ensure binary is executable and dirs exist
  const bin = getServerBin();
  fs.chmodSync(bin, 0o755);
  fs.mkdirSync(path.dirname(SERVICE_PLIST), { recursive: true });
  fs.mkdirSync(SERVICE_LOG_DIR, { recursive: true });

  // Write plist pointing to binary inside app bundle (where _internal/ lives)
  fs.writeFileSync(SERVICE_PLIST, makePlist());
  await launchctl('load', SERVICE_PLIST);
  await waitForServer();
}

// ── Dev mode: spawn Flask directly ───────────────────────────────────────────

function startFlaskDev() {
  return new Promise((resolve, reject) => {
    const projectRoot = path.join(__dirname, '..');
    const appPy = path.join(projectRoot, 'webapp', 'app.py');
    const python = process.platform === 'win32' ? 'python' : 'python3';
    const env = { ...process.env, CLASSIFY_ELECTRON: '1' };

    flaskProcess = spawn(python, [appPy], { env, cwd: projectRoot });
    let stderrOutput = '';

    const timeout = setTimeout(() => {
      reject(new Error(`Flask did not start within 30 seconds.\n\n${stderrOutput}`));
    }, 30000);

    flaskProcess.stdout.on('data', (data) => {
      if (data.toString().includes('CLASSIFY_PORT:')) {
        clearTimeout(timeout);
        resolve();
      }
    });
    flaskProcess.stderr.on('data', (data) => {
      stderrOutput += data.toString();
      console.error('[Flask]', data.toString().trim());
    });
    flaskProcess.on('error', (err) => { clearTimeout(timeout); reject(err); });
  });
}

// ── Windows packaged: spawn bundled exe directly ──────────────────────────────

async function startWindowsServer() {
  const bin = getServerBin();
  const logDir = path.join(app.getPath('appData'), 'Classify', 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const outLog = path.join(logDir, 'server.log');
  const errLog = path.join(logDir, 'server-error.log');
  const out = fs.openSync(outLog, 'a');
  const err = fs.openSync(errLog, 'a');

  flaskProcess = spawn(bin, [], {
    cwd: path.dirname(bin),
    stdio: ['ignore', out, err],
    detached: false,
  });

  flaskProcess.on('error', (e) => {
    dialog.showErrorBox('Classify — server error', `Could not start server:\n\n${e.message}\n\nBinary: ${bin}`);
  });

  await waitForServer(30000);
}

// ── Window ────────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'default',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  mainWindow.loadURL(`http://127.0.0.1:${PORT}`);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Menu ──────────────────────────────────────────────────────────────────────

async function uninstallClassify() {
  const isMac = process.platform === 'darwin';
  const afterDetail = isMac
    ? 'After uninstalling, drag Classify from your Applications folder to the Trash to finish removing it.'
    : 'After uninstalling, remove Classify via Settings → Apps to finish removing it.';

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    buttons: ['Cancel', 'Uninstall'],
    defaultId: 0,
    cancelId: 0,
    title: 'Uninstall Classify',
    message: 'This will permanently delete all Classify data.',
    detail: `All student rosters, class placements, school years, user accounts, and settings will be deleted from this computer. This cannot be undone.\n\n${afterDetail}`,
  });
  if (response !== 1) return;

  if (isMac) {
    // Stop and remove launchd service
    if (fs.existsSync(SERVICE_PLIST)) {
      try { await launchctl('unload', SERVICE_PLIST); } catch {}
      fs.rmSync(SERVICE_PLIST, { force: true });
    }
    const dataDir = path.join(os.homedir(), 'Library', 'Application Support', 'Classify');
    const electronDir = path.join(os.homedir(), 'Library', 'Application Support', 'classify');
    const logsDir = path.join(os.homedir(), 'Library', 'Logs', 'Classify');
    for (const dir of [dataDir, electronDir, logsDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  } else {
    // Windows: kill server process, remove data dirs
    if (flaskProcess) { flaskProcess.kill(); flaskProcess = null; }
    const dataDir = path.join(app.getPath('appData'), 'Classify');
    const electronDir = path.join(app.getPath('appData'), 'classify');
    for (const dir of [dataDir, electronDir]) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }

  await dialog.showMessageBox({
    type: 'info',
    buttons: ['Quit'],
    title: 'Classify uninstalled',
    message: 'Classify has been uninstalled.',
    detail: isMac
      ? 'All data has been removed. Drag Classify from your Applications folder to the Trash to finish.'
      : 'All data has been removed. Remove Classify via Settings → Apps to finish.',
  });
  app.quit();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';
  const template = [
    ...(isMac ? [{ label: app.name, submenu: [
      { role: 'about' }, { type: 'separator' }, { role: 'services' },
      { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' },
      { role: 'unhide' }, { type: 'separator' },
      { label: 'Uninstall Classify…', click: () => uninstallClassify() },
      { type: 'separator' }, { role: 'quit' },
    ]}] : [
      { label: 'File', submenu: [
        { label: 'Uninstall Classify…', click: () => uninstallClassify() },
        { type: 'separator' },
        { role: 'quit' },
      ]},
    ]),
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ]},
    { label: 'View', submenu: [
      { role: 'reload' }, { type: 'separator' },
      { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' },
      { type: 'separator' }, { role: 'togglefullscreen' },
      { type: 'separator' }, { role: 'toggleDevTools' },
    ]},
    { label: 'Window', submenu: [
      { role: 'minimize' }, { role: 'zoom' },
      ...(isMac ? [{ type: 'separator' }, { role: 'front' }] : [{ role: 'close' }]),
    ]},
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  buildMenu();

  try {
    if (app.isPackaged) {
      if (process.platform === 'darwin') {
        await ensureService();
      } else {
        await startWindowsServer();
      }
    } else {
      await startFlaskDev();
    }
    createWindow();
  } catch (err) {
    dialog.showErrorBox('Classify — startup error', `Could not start the server:\n\n${err.message}`);
    app.quit();
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // macOS: don't quit — launchd service keeps running
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  // Dev mode only: kill spawned Flask process
  if (flaskProcess) {
    flaskProcess.kill();
    flaskProcess = null;
  }
  // Packaged: service keeps running — teachers stay connected
});
