const { app, BrowserWindow } = require('electron');

// Persist tasks/completions in the per-user data dir, not inside the read-only asar.
process.env.DATA_DIR = app.getPath('userData');

const { server, PORT } = require('./server');

function createWindow() {
    const win = new BrowserWindow({
        width: 1100,
        height: 800,
        title: 'Completion Calendar',
    });
    win.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(() => {
    if (server.listening) createWindow();
    else server.once('listening', createWindow);

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
