const electron = require('electron')
const app = require('electron').remote.app
const { clipboard } = require('electron')

const { Observable, Subject, ReplaySubject, from, of, range } = require('rxjs');
const { auditTime } = require('rxjs/operators');

var dataAccess = require('./dataaccess.js')
var BaseViewModel = require('./base.js')
var ko = require('knockout');
ko.mapping = require('knockout-mapping')

var moment = require('moment');
var _ = require('lodash');
var momentDurationFormatSetup = require("moment-duration-format");
var remote = require('electron').remote;
var vars = remote.getGlobal('vars');
var Client = require('node-rest-client').Client;
const Store = require('electron-store');
const store = new Store();
var format = require("string-template")
var utils = require('./utils.js')
var log = require('electron-log');
var sync = require('./sync.js')
sync.baseUrl = store.get('syncRestBaseUrl')

const path = require('path')

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

var footer = require('./footer.js')

class TimerList extends BaseViewModel {

  constructor(views, jobtimer){
    super(views)
    this.jobtimer = jobtimer

    dataAccess.projectsChanged.subscribe(value => this.refreshProjectList())
  
    $('#timerList').load('pages/timerlist.html', function(){
      this.hide()

      this.currentDate = ko.observable(new moment())
      this.today = ko.observable(new moment())
      this.currentJob = ko.observable()
      this.currentJobForNote = ko.observable()
      this.currentJobForDuration = ko.observable()
      this.lastJobBeforeJobDurationChange = ko.observable()
      this.itemToDelete = ko.observable()
      this.itemToSync = ko.observable()
      
      this.db = dataAccess.getDb('jobs')
      this.db_projects = dataAccess.getDb('projects')
      this.db_tickets = dataAccess.getDb('tickets')
      
      this.jobTimerList = ko.observableArray().extend({ deferred: true })
      this.projectList = ko.observableArray()
      this.ticketList = ko.observableArray()

      this.myPostProcessingLogic = this.myPostProcessingLogic.bind(this)

      if(this.koWatcher){
        this.koWatcher.dispose()
      }
      var that = this
      this.koWatcher = ko.watch(this.jobTimerList, { depth: -1 }, function(parents, child, item) {
        var isProject = _.find(parents, function(e) {
          return e.projectId() == child()
        })
        if(isProject) {
          that.updateProjectScore(child())
        }
        var isTicket = _.find(parents, function(e) {
          return e.ticketId() == child()
        })
        if(isTicket) {
          that.updateTicketScore(child())

          var docs = async () => await this.db.find({ticketId: child()}).sort({date: -1})
          docs().then((jobs) => {
            var job = _.find(jobs, function(o) { return o.projectId != undefined })
            if (!job) return
            
            var element = $('#project-job_'+parents[0]._id())[0].selectize
            element.addItem(job.projectId)
            that.jobTimerList()[0].projectId(job.projectId)
            parents[0].projectIsSet(true)
          })
        }
        this.saveAll()
      }.bind(this));

      this.currentDate.subscribe(this.currentDateChanged.bind(this))

      $('#textCurrentDate').datepicker({
        language: 'de',
        autoClose:true,
        todayButton: new Date(),
        maxDate: new Date(),
        onSelect:function onSelect(fd, date) {
          this.currentDate(moment(date))
        }.bind(this)
      })

    
      footer.onLoad(this.currentDate(), this.db, jobtimer)
      footer.leftFooterAction = this.goToToday

      app.on('browser-window-focus', function (event, win) {
        this.today(new moment())
      }.bind(this))

      this.jobtimer.timeSignal.subscribe(this.timerStep.bind(this))
      this.jobtimer.stopSignal.subscribe(this.timerStop.bind(this))
      this.jobtimer.startSignal.subscribe(this.timerStart.bind(this))

      this.handleModalChangeJobDuration()

      this.loaded = true
      if(this.callAfterLoad)
        this.callAfterLoad()
    }.bind(this))

    electron.ipcRenderer.on('newJob', function(event, jobDescription){
      this.addNewItem(jobDescription)
    }.bind(this))
    
  }

  myPostProcessingLogic() {
    this.applySelectize()
    this.registerFocusEvents()
  }

  async onLoad() {
    super.onLoad()

    $('#background').css('background-image', 'url('+store.get('backgroundSrc')+')')

    await this.refreshProjectList()
    await this.refreshTicketList()    
    
    // var tray = remote.getGlobal('tray');
    // tray.setContextMenu(self.trayContextMenu)
  
    this.db.ensureIndex({ fieldName: '_id', unique: true }, function (err) {});
    this.db.ensureIndex({ fieldName: 'date' }, function (err) {});

    var docs = await this.db.find({date: this.currentDate().format('YYYY-MM-DD')})
    this.refreshJobTimerList(docs)
    this.refreshTimeSum()
  }

  show(){
    if(!this.loaded){
      this.callAfterLoad = this.show
      return
    }
    this.onLoad()
    $('#timerList').removeClass('invisible')
  }

  hide(){
    $('#timerList').addClass('invisible')
  }

  getMenu(){
    return [
      {
        icon: 'fa fa-plus-circle',
        name: 'Neuer Eintrag',
        method: this.addNewItem.bind(this)
      }
    ]
  }

  addNoneWorkingDayToday(){
    this.addNoneWorkingDay(new moment(),new moment())
  }

  addNoneWorkingDay(start, end){

  }

  saveJobDurationInput(data, that){
    if(event.keyCode === 13) {
      var jobId = $(data).attr('jobId')
      that.saveJobDuration(jobId, that)
    }
    
  }

  saveJobDurationButton(data, that){
    var jobId = $(data).attr('jobId')
    that.saveJobDuration(jobId, that)
  }

  saveJobDuration(jobId, that){
    var match = ko.utils.arrayFirst(that.jobTimerList(), function(item) {
      return item._id() == jobId;
    });
    var newDuration = $('#inputJobDuration')[0].value
    
    var time = utils.durationConvertBack(newDuration)

    if(time || time === 0){
      match.elapsedSeconds(time)
      $('#modalChangeJobDuration').modal('toggle');
    }

    if(!that.jobtimer.isRunning() && that.lastJobBeforeJobDurationChange()){
      var job = that.lastJobBeforeJobDurationChange()
      that.jobtimer.start(job._id(), job.elapsedSeconds(), job.description())
    }

    that.refreshTimeSum()
  }

  handleModalChangeJobDuration(){
    var that = this
    $('#modalChangeJobDuration').on('shown.bs.modal', function (event) {
      var button = $(event.relatedTarget)
      var duration = button.attr('duration')
      var jobId = button.attr('jobId')
      if(that.currentJob() && that.currentJob()._id() == jobId){
        that.lastJobBeforeJobDurationChange(that.currentJob())
        that.jobtimer.stop()
      }
      var modal = $(this)
      modal.find('.modal-body input').val(duration)
      $('#btnSaveDuration').attr('jobId', jobId)
      $('#inputJobDuration').attr('jobId', jobId)
      modal.find("#inputJobDuration").focus()
      modal.find("#inputJobDuration").select()
    })
  }
  async refreshProjectList(){
    var docs = await this.db_projects.find({active:true})
    var newDate = new moment()
    var that = this
    await _.forEach(docs, async function(item, index){
      if(!item.score){
        item.score = 0
      }
      if(!item.lastUse){
        item.lastUse = newDate.format('YYYY-MM-DD')
      } else {
        var date = new moment(item.lastUse)
        var diff = (new moment()).diff(date, 'days')
        if(diff > 5) {
          await that.db_projects.update({ _id:item._id }, { $set: { score: 0 }},{ })
        }
      }
    }.bind(this))
    docs = _.sortBy(docs, 'name')
    this.projectList.removeAll()
    ko.utils.arrayPushAll(this.projectList, docs)
  }

  async refreshTicketList(){
    var docs = await this.db_tickets.find({active:true})
    var newDate = new moment()
    var that = this
    await _.forEach(docs, async function(item, index){
      if(!item.score){
        item.score = 0
      }
      if(!item.lastUse){
        item.lastUse = newDate.format('YYYY-MM-DD')
      } else {
        var date = new moment(item.lastUse)
        var diff = (new moment()).diff(date, 'days')
        if(diff > 5) {
          await that.db_tickets.update({ _id:item._id }, { $set: { score: 0 }},{ })
        }
      }
    }.bind(this))
    docs = _.sortBy(docs, 'name')
    this.ticketList.removeAll()
    ko.utils.arrayPushAll(this.ticketList, docs)
  }

  async updateProjectScore(id) {
    if(!id) {
      return
    }
    var doc = await this.db_projects.findOne({_id:id})
    var oldScore = doc.score
    if(!oldScore) {
      oldScore = 0
    }
    var newScore = oldScore + 1
    await this.db_projects.update({ _id:doc._id }, { $set: { score: newScore } },{ })
  }

  async updateTicketScore(id) {
    if(!id) {
      return
    }
    var doc = await this.db_tickets.findOne({_id:id})
    var oldScore = doc.score
    if(!oldScore) {
      oldScore = 0
    }
    var newScore = oldScore + 1
    await this.db_tickets.update({ _id:doc._id }, { $set: { score: newScore } },{ })
  }

  applySelectize() {
    var that = this
    var jiraIssueRegex = "[A-Z]{2,}-\d+"
    $('select.projectSelect').selectize(
        {
          options: that.projectList(),
          create: function(input, callback) {
            var newDate = new moment()
            var newProject = { name:input, active:true, score: 5, lastUse: newDate.format('YYYY-MM-DD') }
            that.db_projects.insert(newProject).then((dbEntry) => {
              that.projectList.push(dbEntry)
              callback( { 'name': dbEntry.name, '_id': dbEntry._id, 'score': dbEntry.score } )
              $('select.projectSelect').each(function(index, item) {
                item.selectize.addOption({ 'name': dbEntry.name, '_id': dbEntry._id, 'score': dbEntry.score })
              })
              
            })
          },
          labelField: "name",
          sortField: [{field: "score", direction: "desc"},{field: "name", direction: "asc"}],
          valueField: "_id",
          searchField: ["name"],
          placeholder: " ",
          delimiter: "|",
          closeAfterSelect: true,
        }
    )
    var renderItemFunc = function (item, escape) {
      var regex = /([A-Z]{2,}-\d+)(:|-)?(.*)?/
      var match = regex.exec(item.name)
      
      if(!match) {
        return '<div class="item">'+item.name+'</div>';
      }
      var issueNumber = match[1]
      var issueName = match[3]
      return '<div class="item">'+
      '<span class="issueNumber">'+issueNumber+'</span>'+
      '<span class="issueName">: '+issueName+'</span>'+
      '</div>';
    }
  
    var renderOptionFunc = function (item, escape) {
      var regex = /([A-Z]{2,}-\d+)(:|-)?(.*)?/
      var match = regex.exec(item.name)
      
      if(!match) {
        return '<div class="option">'+item.name+'</div>';
      }
      var issueNumber = match[1]
      var issueName = match[3]
      return '<div class="option">'+
      '<span class="issueNumber">'+issueNumber+'</span>'+
      '<span class="issueName">: '+issueName+'</span>'+
      '</div>';
    }

    $('select.ticketSelect').selectize(
      {
        options: that.ticketList(),
        create: function(input, callback) {
          var newDate = new moment()
          var newTicket = { name:input, active:true, score: 5, lastUse: newDate.format('YYYY-MM-DD') }
          that.db_tickets.insert(newTicket).then((dbEntry) => {
            that.ticketList.push(dbEntry)
            callback( { 'name': dbEntry.name, '_id': dbEntry._id, 'score': dbEntry.score } )
            $('select.ticketSelect').each(function(index, item) {
              item.selectize.addOption({ 'name': dbEntry.name, '_id': dbEntry._id, 'score': dbEntry.score })
            })
            
          })
        },
        render: {
          item: renderItemFunc,
          option: renderOptionFunc
        },
        labelField: "name",
        sortField: [{field: "score", direction: "desc"},{field: "name", direction: "asc"}],
        valueField: "_id",
        searchField: ["name"],
        placeholder: "",
        delimiter: "|",
        closeAfterSelect: true,
      }
    )
  }

  refreshJobTimerList(docs){
    docs.forEach(function(item, index){
      if(!item.projectId){
        item.projectId = ""
      }
      if(!item.ticketId){
        item.ticketId = ""
      }
      if(!item.jobNote){
        item.jobNote = ""
      }
      if(!item.lastSync){
        item.lastSync = ""
      }
      item.isRunning = false
      if(this.currentJob && this.currentJob() && this.currentJob()._id && this.currentJob()._id() == item._id){
        item.isRunning = true
      }
      
    }.bind(this))
    this.jobTimerList.removeAll()
    var observableDocs = ko.mapping.fromJS(docs,this.jobTimerList);

    _.forEach(observableDocs(), function(item) {
      var projectId = item.projectId()
      item.projectIsSet = ko.observable(projectId);

      var ticketId = item.ticketId()
      item.ticketIsSet = ko.observable(ticketId);
    })

    ko.utils.arrayPushAll(this.jobTimerList, observableDocs())
    if(this.currentJob && this.currentJob()){
      var newCurrentJob = ko.utils.arrayFirst(this.jobTimerList(), function(value){
        return value._id() == this.currentJob()._id();
      }.bind(this))
      if(newCurrentJob){
        this.currentJob(newCurrentJob)
      }
    }

    this.createAutoComplete()
    // this.applySelectize()

    // this.registerFocusEvents()
  }

  registerFocusEvents() {
    $('.text-input-job').off('focusin')
    $('.projectSelect').off('focusin')
    $('.ticketSelect').off('focusin')
    $('.text-input-job').off('focusout')
    $('.projectSelect').off('focusout')
    $('.ticketSelect').off('focusout')

    $('.text-input-job').on('focusin', function() {
      $(this).parent().parent().find('label').addClass('active');
    });
    
    $('.text-input-job').on('focusout', function() {
      if (!this.value) {
        $(this).parent().parent().find('label').removeClass('active');
      }
    });

    $('.selectbox').on('focusin', function() {
      $(this).parent().find('label').addClass('active');
    });
    
    $('.selectbox').on('focusout', function() {
      if ($(this).find('.item').length < 1) {
        $(this).parent().find('label').removeClass('active');
      }
    });
  }
  
  async currentDateChanged(value){
    this.saveAll()
    var lastEntryId = this.currentEntryId
    // $.find('#textCurrentDate')[0].value = this.currentDate().format('DD.MM.YYYY')
    var docs = await this.db.find({date: value.format('YYYY-MM-DD')})
    this.refreshJobTimerList(docs)
    this.refreshTimeSum()
    footer.initChart(value)
  }
  
  nextDay(){
    this.currentDate(this.currentDate().add(1,'days'))
  }
  
  getTimeString(seconds){
    if(!seconds)
      return "00:00:00/0.00"
  
    var formated = moment.duration(seconds, "seconds").format("hh:mm:ss",{trim: false})
    var decimal = moment.duration(seconds, "seconds").format("h", 2)
  
    return formated + "/" + decimal
  }

  getDecimalDuration(seconds){
    if(!seconds)
      return "0.00"
    var decimal = moment.duration(seconds, "seconds").format("h", 2)
  
    return decimal
  }

  getFormatedDuration(seconds){
    if(!seconds)
      return "00:00:00"
  
    var formated = moment.duration(seconds, "seconds").format("hh:mm:ss",{trim: false})
  
    return formated
  }

  
  async transferEntry(that,data){
    var newDate = new moment()
    var newEntry = {jobNote:data.jobNote(), ticketId: data.ticketId(), projectId: data.projectId(),elapsedSeconds:0, description:data.description(), date:newDate.format('YYYY-MM-DD'), billable:that.billable(), lastSync: ""}
    await that.db.insert(newEntry)
    that.currentDate(newDate)
  }
  
  previousDay(){
    this.currentDate(this.currentDate().subtract(1,'days'))
  }
  
  async saveAll(){
    await _.forEach(this.jobTimerList(), async function (element) {
      await this.db.update({ _id:element._id() }, { $set: { billable: element.billable(), lastSync: element.lastSync(), jobNote: element.jobNote(), description: element.description(), elapsedSeconds: element.elapsedSeconds(), projectId: element.projectId(), ticketId: element.ticketId() } },{ multi: false })
    }.bind(this))
    
    this.db.__original.persistence.compactDatafile()

    this.createAutoComplete()
  }
  
  async createAutoComplete(entryId){
    var docs = await this.db.find({})
    var mappedDocs = _.map(docs,'description')
    var uniqDocs = _.uniq(mappedDocs)
    this.autocompleteOptions = {
      data: uniqDocs,
      list: {
          match: {
              enabled: true
          }
      },
      theme: "bootstrap"
    }
    
    $('.text-input-job').parent().not('.easy-autocomplete').children('.text-input-job').easyAutocomplete(this.autocompleteOptions).css("height",'31px')
    $('.easy-autocomplete.eac-bootstrap').removeAttr( 'style' )
    if(entryId)
      $('#text-input-job_'+entryId).focus()
    
  }

  async addNewItem(jobDescription){
    if(!jobDescription){
      jobDescription = ""
    }
    var newEntry = {jobNote:"", projectId: "", ticketId: "",elapsedSeconds:0, description:jobDescription, date:this.currentDate().format('YYYY-MM-DD'), lastSync: "", billable: false}
    var dbEntry = await this.db.insert(newEntry)
    dbEntry = ko.mapping.fromJS(dbEntry)
    dbEntry.isRunning = ko.observable()
    dbEntry.isRunning(false)
    
    var projectId = dbEntry.projectId()
    dbEntry.projectIsSet = ko.observable(projectId);

    var ticketId = dbEntry.ticketId()
    dbEntry.ticketIsSet = ko.observable(ticketId);

    this.jobTimerList.push(dbEntry)
    this.createAutoComplete(dbEntry._id())
    // this.applySelectize()

    // this.registerFocusEvents()
    await this.saveAll()
  }
  
  removeItemModal(that,data){
    that.itemToDelete(data)
    $('#modalDeleteEntry').modal('show');
  }

  async removeItem(that,data){
    await that.db.remove({ _id: data._id() }, {})
    that.jobTimerList.remove(function (item) { return item._id() == data._id(); })
    $('#modalDeleteEntry').modal('hide');
  }

  copyJob(that,data){
    var ticket = _.find(that.ticketList(), {_id: data.ticketId()})
    var project = _.find(that.projectList(), {_id: data.projectId()})
    var result = ""
    result += `Ticket: ${ticket ? ticket.name || "-" : "-"}\n`
    result += `Tätigkeit: ${data.description() || "-"}\n`
    result += `Projekt: ${project ? project.name || "-" : "-"}\n`
    result += `Dauer: ${that.getTimeString(data.elapsedSeconds())}\n`
    clipboard.writeText(result)
  }

  pauseTimer(){
    this.jobtimer.stop()
  }

  timerStop(currentData){
    var elementId = this.jobtimer.currentJobId
    this.currentJob().isRunning(false)
    this.lastEntryId = elementId
    this.currentEntryId = undefined
    footer.refreshStatusBarEntry()
    this.currentJob(undefined)
    remote.getCurrentWindow().setOverlayIcon(null, "TimeTracker")
  }

  timerStart(currentData){
    var match = ko.utils.arrayFirst(this.jobTimerList(), function(item) {
      return currentData.jobId === item._id();
    });
    match.isRunning(true)
    this.currentEntryId = match._id();
    this.currentJob(match)
    var overlayPath = path.join(__dirname,"../icons/overlay.png")
    remote.getCurrentWindow().setOverlayIcon(overlayPath, 'Aufgabe läuft...')
  }

  
  startTimer(that,data){
    if(that.jobtimer.isRunning() && that.jobtimer.currentJobId == data._id()){
      that.pauseTimer()
      return;
    }
    if(that.jobtimer.isRunning()){
      that.pauseTimer()
    }
    
    that.jobtimer.start(data._id(), data.elapsedSeconds(), data.description())
    
  }
  
  goToToday(){
    this.currentDate(new moment())
  }
  
  timerStep(updateValue){
    
    var match = ko.utils.arrayFirst(this.jobTimerList(), function(item) {
      return updateValue.jobId === item._id();
    });

    if(match){
      match.elapsedSeconds(updateValue.duration)  
      this.jobtimer.currentJobDescription = match.description()
    }

    this.saveAll()
    this.refreshTimeSum()
    this.refreshTray(updateValue.duration)
  }
  
  refreshTimeSum(){
    var timeSum = this.getTimeSum()
  
    $.find('#textTimeSum')[0].textContent = this.getTimeString(timeSum)
  }
  
  getTimeSum(){
    return _.sumBy(this.jobTimerList(), function(o) { return o.elapsedSeconds(); });
  }

  changeNoteClick(that,data){
    that.currentJobForNote(data)
    $('#modalAddNote').modal('show')
  }

  changeDurationClick(that,data){
    that.currentJobForDuration(data)
    var button = $(event.relatedTarget)
    var duration = button.attr('duration')
    var jobId = button.attr('jobId')
    var modal = $(this)
    modal.find('.modal-body input').val(duration)
    $('#btnSaveDuration').attr('jobId', jobId)
    document.getElementById("inputJobDuration").focus();
    $('#modalChangeJobDuration').modal('show')
  }
  
  refreshTray(elapsedTime){
    var tray = remote.getGlobal('tray');
    var timeSum = this.getTimeSum()
    tray.setToolTip("Ʃ "+this.getTimeString(timeSum)+", Aufgabe: "+ this.getTimeString(elapsedTime))
  }
  
  // trayContextMenu: remote.getGlobal('menu').buildFromTemplate([
  //     {id: 0, label: 'Weiter', click() {
  //       if(lastEntryId){
  //         var lastEntry = $('#'+lastEntryId)[0]
  //         var tmpMethod = startTimer.bind(lastEntry)
  //         tmpMethod()
  //       }
  //     }},
  //     {id: 1, label: 'Stopp', click() {
  //       self.pauseTimer()
  //     }},
  //     {type: 'separator'},
  //     {id: 2, label: 'Beenden', click() {
  //       let w = remote.getCurrentWindow()
  //       w.close()
  //     }}
  
  //   ])


}

module.exports = TimerList

