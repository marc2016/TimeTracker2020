const { ipcRenderer } = require('electron')
var log = require('electron-log')

var $ = require("jquery");
require( 'jquery-ui')

require( 'datatables.net' )( window, $ );
require( 'datatables.net-bs4' )( window, $ );
require( './libs/dataTables.cellEdit')

const { Observable, Subject, ReplaySubject, from, of, range } = require('rxjs');
const { auditTime } = require('rxjs/operators');

var pjson = require('./package.json')

const Store = require('electron-store');
const store = new Store();

const path = require('path')

var gravatar = require('gravatar');

var utils = require('./js/utils.js')
var ko = require('knockout');

var _ = require('lodash');


var toastr = require('toastr');
toastr.options = {
  "closeButton": false,
  "debug": false,
  "newestOnTop": false,
  "progressBar": false,
  "positionClass": "toast-bottom-right",
  "preventDuplicates": false,
  "onclick": null,
  "showDuration": "300",
  "hideDuration": "1000",
  "timeOut": "5000",
  "extendedTimeOut": "1000",
  "showEasing": "swing",
  "hideEasing": "linear",
  "showMethod": "fadeIn",
  "hideMethod": "fadeOut"
}

var ProjectsSettings = require('./js/projectssettings.js')
var AppSettings = require('./js/appsettings.js')
var jobtable = require('./js/jobtable.js')
var TimerList = require('./js/timerlist.js')

var jobtimer = require('./js/jobtimer.js')
var footer = require('./js/footer.js')

this.projectsSettingViewModel = undefined
this.appSettingsViewModel = undefined
this.jobtableViewModel = undefined
this.timerlistViewModel = undefined

const WindowsToaster = require('node-notifier').WindowsToaster;
var windowsToaster = new WindowsToaster({
  withFallback: false,
  customPath: void 0 ,
  appID: "TimeTracker",
  wait: true
});
// windowsToaster.on('click', function (notifierObject, options) {
//   var window = require('electron').remote.getCurrentWindow()
//     window.show()
//     window.focus()
// });

onload = function() {
  log.info("App started.")

  
  this.userEmail = ko.observable()
  this.avatar =  ko.computed(function() {
    return gravatar.url(this.userEmail(), {protocol: 'http', s: '25', d: 'retro'});
  }, this);
  this.accountName = ko.observable('nicht angemeldet')
  this.appVersion = ko.computed(function() {
    return ' '+pjson.version
  }, this);

  this.updateAvailable = ko.observable(false)
  this.downloadProgress = ko.observable()

  ipcRenderer.on('app-update', (event, arg) => {
    this.updateAvailable(arg)
  })

  ipcRenderer.on('app-update-download-progress', (event, arg) => {
    this.downloadProgress(arg)
  })

  this.checkForUpdatesClick = checkForUpdatesClick
  this.closeApp = closeApp
  this.openTimerList = openTimerList
  this.closeWindow = closeWindow
  this.minimizeWindow = minimizeWindow
  this.maximizeWindow = maximizeWindow

  jobtimer.timeSignal.pipe(auditTime(store.get('timerNotificationsInterval'), 600000)).subscribe(timerUpdateNotifier)
  
  $('#modals').load("pages/modals.html")
  
  Number.prototype.toHHMMSS = function () {
      var sec_num = parseInt(this, 10); // don't forget the second param
      var hours   = Math.floor(sec_num / 3600);
      var minutes = Math.floor((sec_num - (hours * 3600)) / 60);
      var seconds = sec_num - (hours * 3600) - (minutes * 60);

      if (hours   < 10) {hours   = "0"+hours;}
      if (minutes < 10) {minutes = "0"+minutes;}
      if (seconds < 10) {seconds = "0"+seconds;}
      return hours+':'+minutes+':'+seconds;
  }

  var btnJobTable = document.getElementById('btnJobTable')
  btnJobTable.addEventListener("click", openJobTable.bind(this) )
  
  var btnJobTimer = document.getElementById('btnJobTimer')
  btnJobTimer.addEventListener("click", openTimerList.bind(this) )

  var btnAppSettings = document.getElementById('btnAppSettings')
  btnAppSettings.addEventListener("click", openAppSettings.bind(this) )

  this.projectsSettingViewModel = new ProjectsSettings(['projectssettingsMainContent','modalAddNewProject'])
  this.appSettingsViewModel = new AppSettings(['appsettingsMainContent'], store)
  this.timerlistViewModel = new TimerList(['timerlistMainContent','modalAddNote', 'modalAbsencePeriod','modalChangeJobDuration','modalDeleteEntry','modalUploadEntryAgain'], jobtimer)
  this.jobtableViewModel = new jobtable(['jobtableMainContent', 'modalDelete'])

  this.pagemenu = ko.observableArray()
  this.menuClick = menuClick

  ko.applyBindings(this, document.getElementById('mainNavbar'))
  ko.applyBindings(this, document.getElementById('modalAbout'))
  
  openTimerList()

}

function closeWindow(){
  ipcRenderer.send('window-operations', 'close')
}

function minimizeWindow(){
  ipcRenderer.send('window-operations', 'minimize')
}

function maximizeWindow(){
  ipcRenderer.send('window-operations', 'maximize')
}

async function closeApp(){
  log.info("App is closed for Update.")
  ipcRenderer.send('updater', 'quitAndInstall')
}

function checkForUpdatesClick(){
  this.updateAvailable('checking')
  this.downloadProgress(0)
  ipcRenderer.send('updater', 'check')
}

function timerUpdateNotifier(updateValue){
  var enabled = store.get('timerNotificationsEnabled', false)
  if(!enabled){
    return
  }

  var iconPath = path.join(__dirname, "icons/logonotification.png")
  var jobDescription = updateValue.jobDescription
  if(!jobDescription){
    jobDescription = "Unbenannte Aufgabe"
  }
    
  windowsToaster.notify({
      title: "Aufgabe läuft...",
      message: "Aufgabe: "+_.truncate(jobDescription,{'length': 25})+"\nDauer: "+utils.getTimeString(updateValue.duration),
      icon: iconPath,
      sound: true, 
      wait: true,
      appID: "TimeTracker"
  }, function(error, response) {
      console.log(response);
  });
}

function menuClick(that,data){
  that.method()
}

function openTimerList(){
  changeView(this.timerlistViewModel)
}

function openJobTable(){
  changeView(this.jobtableViewModel)
}

function openAppSettings(){
  changeView(this.appSettingsViewModel)
}

function openProjectsSettings(){
  changeView(undefined)
  $('#mainContent').show()
  $('#mainContent').load('pages/projectssettings.html', function(){
    this.projectsSettingViewModel.onLoad()
  }.bind(this))
  $('#navProjectsSettings').addClass("selected");
}

function changeView(newViewModel){
  if(this.currentViewModel && this.currentViewModel == newViewModel)
    return;
  $('#mainContent').hide()
  if(this.currentViewModel)
    this.currentViewModel.hide()
  pagemenu.removeAll()
  if(newViewModel){
    newViewModel.show()
    if(newViewModel.getMenu)
      ko.utils.arrayPushAll(pagemenu, newViewModel.getMenu())
  }
  this.currentViewModel = newViewModel
}
