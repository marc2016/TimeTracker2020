const electron = require('electron')
const app = electron.app
const { ipcMain } = require('electron')

const Store = require('electron-store');
Store.initRenderer()

const log = require('electron-log');
const {autoUpdater} = require("electron-updater");

var ko = require('knockout')
ko.options.deferUpdates = true

const splashScreen = require('@trodi/electron-splashscreen')
const electronLocalshortcut = require('electron-localshortcut');

const _ = require('lodash')

const nativeImage = require('electron').nativeImage

autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'debug';
log.info('App starting...');

const {
  Menu,
  Tray
} = require('electron')

// Module to create native browser window.
const BrowserWindow = electron.BrowserWindow

const path = require('path')
const url = require('url');

let tray = null
let mainWindow

const mainOpts = {
  width: 680,
  height: 820,
  minWidth: 480,
  minHeight: 450,
  icon: path.join(__dirname, 'icons/logo.ico'),
  show: false,
  frame: false,
  webPreferences: {
    nodeIntegration: true,
    nodeIntegrationInWorker: true,
    contextIsolation: false,
    enableRemoteModule: true, sandbox: false,
    nativeWindowOpen: true
  }
}

// configure the splashscreen
const splashscreenConfig = {
  windowOpts: mainOpts,
  templateUrl: path.join(__dirname,"pages/splashscreen.html"),
  minVisible: 1000,
  splashScreenOpts: {
      width: 600,
      height: 600,
      transparent: true,
      icon: path.join(__dirname, 'icons/logo.ico'),
      webPreferences: {
        nodeIntegration: true,
        nodeIntegrationInWorker: true,
        contextIsolation: false,
        enableRemoteModule: true, sandbox: false,
        nativeWindowOpen: true
      }
  }
};

app.setAsDefaultProtocolClient('tt')

const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  log.warn('App already starting and is locked.');
  app.quit()
} else {
  app.on('ready', function(){
    log.debug('App is ready. Loading Splashscreen.');
    mainWindow = splashScreen.initSplashScreen(splashscreenConfig);
    log.debug('Start loading index.html.');
    mainWindow.loadFile('index.html')
    log.debug('index.html loaded.');

    mainWindow.setMenu(null);

    electronLocalshortcut.register(mainWindow, 'F12', () => {mainWindow.webContents.toggleDevTools()}); 
    
    let trayIconPath = undefined
    if (process.platform == 'darwin') {
      trayIconPath = path.join(__dirname, 'icons/logo_tray@2x.png')
    } else {
      trayIconPath = path.join(__dirname, 'icons/logo.ico')
    }

    const trayIcon = nativeImage.createFromPath(trayIconPath);
    tray = new Tray(trayIcon)
    tray.on('click', () => {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    })

    mainWindow.on('closed', function () {
      mainWindow = null
    })
    
    tray.setToolTip('TimeTracker')
  })
  app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') {
      app.quit()
    }
  })
  app.on('activate', function () {
    if (mainWindow === null) {
      createWindow()
      
    }
  })
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (process.platform == 'win32') {
      url = commandLine.slice(1)
    }
  
    handleUrl(url)

    if (mainWindow) {
      if (mainWindow.isMinimized()) myWindow.restore()
      mainWindow.focus()
    }
  })
  app.on('open-url', function (event, url) {
    event.preventDefault()
    handleUrl(url)
    if (mainWindow) {
      if (mainWindow.isMinimized()) myWindow.restore()
      mainWindow.focus()
    }
  })
  app.on('browser-window-focus', function (event, win) {
    mainWindow.webContents.send('browser-window-focus')
    
  })

  ipcMain.on('get-app-path', (event, arg) => {
    var userDataPath = app.getPath('userData')+'/userdata/'
    event.reply('get-app-path-reply', userDataPath)
  })

  ipcMain.on('window-operations', (event, arg) => {
    if(arg == 'close') {
      mainWindow.close()
    } else if(arg == 'minimize') {
      mainWindow.minimize();
    } else if(arg == 'maximize') {
      mainWindow.maximize();
    }
  })
  
  ipcMain.on('window-progress', (event, timeRatio) => {
    if(timeRatio > 1) {
      timeRatio = 1
    }
    mainWindow.setProgressBar(timeRatio)
  })

  ipcMain.on('updater', (event, arg) => {
    if(arg == 'quitAndInstall') {
      autoUpdater.quitAndInstall()
    } else if(arg == 'check') {
      autoUpdater.checkForUpdates();
    }
  })
  
  autoUpdater.on('update-available', () => {
    log.info("Update is available.")
    mainWindow.webContents.send('app-update', true)
  })
  autoUpdater.on('update-not-available', () => {
    log.info("Update is not available.")
    mainWindow.webContents.send('app-update', false)
  })
  autoUpdater.on('update-downloaded', (ev, progressObj) => {
    log.info("Update is downloaded.")
    mainWindow.webContents.send('app-update', 'ready')
  })
  
  autoUpdater.on('download-progress', (info) => {
    if(info) {
      var progress = _.round(info.percent)
      mainWindow.webContents.send('app-update-download-progress', progress)
    }
  })
}

function createWindow() {
  log.info("Create window.")
  mainWindow = new BrowserWindow(mainOpts)
}

function handleUrl(url) {
  var decodedUrl = decodeURI(url)
  var jiraIssueKeyRegex = /(issuekey)\=([^&]+)/
  var jiraIssueKeyMatch = jiraIssueKeyRegex.exec(decodedUrl)
  var jiraIssueSummeryRegex =  /(issuesummery)\=([^&]+)/
  var jiraIssueSummeryMatch = jiraIssueSummeryRegex.exec(decodedUrl)
  if(jiraIssueKeyMatch && jiraIssueSummeryMatch) {
    openTimerList()
    this.timerlistViewModel.addNewItem("", jiraIssueKeyMatch[2], jiraIssueSummeryMatch[2])
  }
}


