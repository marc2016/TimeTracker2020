const electron = require('electron')
const { shell } = require('electron');

const { clipboard } = require('electron')

var _ = require('lodash');

var dataAccess = require('./dataaccess.js')
var BaseViewModel = require('./base.js')
var ko = require('knockout');
ko.mapping = require('knockout-mapping')

var footer = require('./footer.js')
var timefunctions = require('./timefunctions.js')

const Store = require('electron-store');
const store = new Store();

var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);
var Holidays = require('date-holidays')

var country = store.get('selectedCountry','DE')
var state = store.get('selectedState','NW')
var hd = new Holidays(country,state, {types: ['public']})
var holidays = _.map(hd.getHolidays(), function(value){ return value.date.split(" ")[0] })
moment.updateLocale('de', {
  holidays: holidays,
  holidayFormat: 'YYYY-MM-DD'
});

var utils = require('./utils.js')

const path = require('path')

var toastr = require('toastr');
toastr.options = {
  "closeButton": false,
  "debug": false,
  "newestOnTop": false,
  "progressBar": false,
  "positionClass": "toast-bottom-left",
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

class TimerList extends BaseViewModel {

  constructor(views, jobtimer){
    super(views)
    this.jobtimer = jobtimer
  
    $('#timerList').load('pages/timerlist.html', function(){
      this.hide()

      this.currentDate = ko.observable(new moment())
      this.currentMonth = ko.observable(moment().month())
      this.today = ko.observable(new moment())
      this.currentJob = ko.observable()
      this.currentJobForNote = ko.observable()
      this.currentJobForDuration = ko.observable()
      this.lastJobBeforeJobDurationChange = ko.observable()
      this.itemToDelete = ko.observable()
      this.currentAbsencePeriod = ko.observable()
      this.absenceToday = ko.observable(false)
      this.currentSum = ko.observable()
      
      this.db = dataAccess.getDb('jobs')
      this.db_projects = dataAccess.getDb('projects')
      this.db_tickets = dataAccess.getDb('tickets')
      this.db_absences = dataAccess.getDb('absences')

      this.db.__original.persistence.compactDatafile()
      
      this.jobTimerList = ko.observableArray().extend({ deferred: true })
      this.currentJobTimerList = ko.observableArray().extend({ deferred: true })
      this.currentToDoTicketList = ko.observableArray()
      this.currentDoneTicketList = ko.observableArray()
      this.projectList = ko.observableArray()
      this.ticketList = ko.observableArray()
      this.descriptionList = []

      this.jobListLoadedPostAction = this.jobListLoadedPostAction.bind(this)

      if(this.koWatcherJobTimerList){
        this.koWatcherJobTimerList.dispose()
      }
      var that = this
      this.koWatcherJobTimerList = ko.watch(this.jobTimerList, { depth: -1, tagFields: true, oldValues: 1 }, function(parents, child, item) {
        if(child._fieldName == 'projectId') {
          that.updateProjectScore(child())
        }
        
        if(child._fieldName == 'ticketId') {
          that.updateTicketScore(child())

          var ticket = _.find(this.ticketList(), (item) => item._id() == child())
          parents[0].ticket(ticket)

          parents[0].ticketIsSet(true)
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

        if(child._fieldName == 'ticket') {
          if(child())
            this.currentToDoTicketList.remove(child())
          var oldTicket = child.oldValues[0]
          if(oldTicket) {
            const currentJobForTicket = _.find(that.currentJobTimerList(), function(job) {
              return job.ticketId() == oldTicket._id()
            })
            if(!currentJobForTicket)
              this.currentToDoTicketList.push(oldTicket)
          }
        }
        
        
        if(parents != null && parents.length > 0){
          this.saveItem(parents[0])
        } 
        
      }.bind(this))

      this.koWatcherTicketList = ko.watch(this.ticketList, { depth: -1 }, function(parents, child, item) {
        console.log("TEST");
        
      }.bind(this))

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

      $('#textAbsencePeriod').datepicker({
        range: true,
        toggleSelected: false,
        language: 'de',
        autoClose: true,
        todayButton: false,
        dateFormat: 'dd.mm.yy',
        onSelect:function onSelect(fd, date) {
            if(date && date.length == 2){
                this.currentAbsencePeriod(moment.range(date[0],date[1]))
            }
          }.bind(this)
      })

      footer.onLoad(this.currentDate(), this.db, this.db_absences, jobtimer)
      footer.leftFooterAction = this.goToToday
      
      electron.ipcRenderer.on('browser-window-focus', async function(event, arg){
        if(!(this.today() && this.today().isSame(new moment(), 'day')))
        {
          this.today(new moment())
          $('#textCurrentDate').datepicker({
            language: 'de',
            autoClose:true,
            todayButton: new Date(),
            maxDate: new Date(),
            onSelect:function onSelect(fd, date) {
              this.currentDate(moment(date))
            }.bind(this)
          })

          await this.refreshDescriptionList()
        }

        var dayStarted = moment()
        var isDayStartedString = store.get('isDayStarted')
        if(isDayStartedString) {
          dayStarted = moment(isDayStartedString, 'DD.MM.YYYY-HH:mm:ss')
        } else {
          isDayStartedString = dayStarted.format('DD.MM.YYYY-HH:mm:ss')
          store.set('isDayStarted', isDayStartedString)
        }

        if(!dayStarted.isSame(moment(), 'day')) {
          dayStarted = moment()
          isDayStartedString = dayStarted.format('DD.MM.YYYY-HH:mm:ss')
          store.set('isDayStarted', isDayStartedString)
        }

        footer.refreshDayStarted(dayStarted)
        
      }.bind(this))

      electron.ipcRenderer.on('newJob', function(event, jobDescription){
        this.addNewItem(jobDescription)
      }.bind(this))

      this.jobtimer.timeSignal.subscribe(this.timerStep.bind(this))
      this.jobtimer.stopSignal.subscribe(this.timerStop.bind(this))
      this.jobtimer.startSignal.subscribe(this.timerStart.bind(this))

      this.handleModalChangeJobDuration()

      this.loaded = true
      if(this.callAfterLoad)
        this.callAfterLoad()
    }.bind(this))
  }

  jobListLoadedPostAction() {
    this.applySelectize()
    this.registerFocusEvents()
    this.createAutoComplete()
  }

  async onLoad() {
    super.onLoad()

    $('#background').css('background-image', 'url('+store.get('backgroundSrc')+')')

    await this.refreshProjectList()
    await this.refreshTicketList()
    await this.refreshDescriptionList()
    
    // var tray = remote.getGlobal('tray');
    // tray.setContextMenu(self.trayContextMenu)

    await this.refreshJobLists(moment())

    if(this.currentDate().isSame(moment(), 'day'))
      this.currentSum(this.getTimeSum(this.currentDate()))
    this.refreshTimeSum()
    await this.refreshOvertime(moment())
    var absenceDocs = await this.db_absences.find({date: this.currentDate().format('YYYY-MM-DD')})
    if (absenceDocs.length > 0) {
      this.absenceToday(true)
    } else {
      this.absenceToday(false)
    }
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
      },
      {
        icon: 'fa fa-check-circle',
        name: 'Neues Ticket',
        method: this.addNewTicketDialog.bind(this)
      },
      {
        icon: 'fa fa-umbrella-beach',
        name: 'Neue Abwesenheit',
        method: this.addNewAbsence.bind(this)
      }
    ]
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

  async saveAbsencePeriodButton(data, that){
    for (let day of that.currentAbsencePeriod().by('day')) {
      if(that.currentDate().isSame(day, 'day')) {
        this.absenceToday(true)
      }
      var docs = await this.db_absences.find({date: day.format('YYYY-MM-DD')})
      if(!docs || !day.isBusinessDay()) {
        continue
      }
      var newAbsence = {date:day.format('YYYY-MM-DD')}
      await this.db_absences.insert(newAbsence)
    }
    $('#modalAbsencePeriod').modal('hide');
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
    that.refreshOvertime(moment(match.date()))
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
      if(!item.done){
        item.done = false
      }
      if(!item.projectId){
        item.projectId = ""
      }
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
    this.ticketList.removeAll()
    docs = _.sortBy(docs, 'name')
    var observableDocs = ko.mapping.fromJS(docs)
    _.forEach(observableDocs(), function(item) {
      item['id'] = item._id()
    })
    ko.utils.arrayPushAll(this.ticketList, observableDocs())
  }

  async refreshDescriptionList() {
    var today = new moment()
    var past = moment().subtract(1, 'months');
    var regex =  new RegExp('('+past.format('YYYY-MM')+'|'+today.format('YYYY-MM') + ')' + '-(.*)');
    
    var jobDocs = await this.db.find({date: regex})
    var mappedDocs = _.map(jobDocs,(j) => { return j.description })
    this.descriptionList = _.uniq(mappedDocs)
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
    await this.db_projects.update({ _id:doc._id }, { $set: { score: newScore, lastUse: moment().format('YYYY-MM-DD') } },{ })
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
    await this.db_tickets.update({ _id:doc._id }, { $set: { score: newScore, lastUse: moment().format('YYYY-MM-DD') } },{ })
  }

  applySelectize() {
    var that = this
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
      var regex = /(([A-Z]|\d){2,}-\d+)(:|-)?(.*)?/
      var match = regex.exec(item.name())
      
      if(!match) {
        return '<div class="item">'+item.name()+'</div>';
      }
      var issueNumber = match[1]
      var issueName = match[4]
      return '<div class="item">'+
      '<span class="issueNumber">'+issueNumber+'</span>'+
      '<span class="issueName">: '+issueName+'</span>'+
      '</div>';
    }
  
    var renderOptionFunc = function (item, escape) {
      var regex = /(([A-Z]|\d){2,}-\d+)(:|-)?(.*)?/
      var match = regex.exec(item.name())
      
      if(!match) {
        return '<div class="option">'+item.name()+'</div>';
      }
      var issueNumber = match[1]
      var issueName = match[4]
      return '<div class="option">'+
      '<span class="issueNumber">'+issueNumber+'</span>'+
      '<span class="issueName">: '+issueName+'</span>'+
      '</div>';
    }

    $('select.ticketSelect').selectize(
      {
        options: that.ticketList(),
        create: function(input, callback) {
          that.addNewTicket(input).then((newTicket) => {
            callback( newTicket )
          })
        },
        render: {
          item: renderItemFunc,
          option: renderOptionFunc
        },
        labelField: "name()",
        sortField: [{field: "score()", direction: "desc"},{field: "name()", direction: "asc"}],
        valueField: "id",
        searchField: ["name()"],
        placeholder: "",
        delimiter: "|",
        closeAfterSelect: true,
      }
    )
  }

  async refreshJobLists(momentValue) {
    await this.refreshJobTimerListForRange(momentValue)
    this.refreshSelectedJobTimerList(this.jobTimerList(),momentValue)
    
  }

  refreshSelectedJobTimerList(jobList, selectedDate) {
    this.currentJobTimerList.removeAll()
    var currentJobs = _.filter(jobList, function(d) { 
      var docDate = moment(d.date())
      return selectedDate.isSame(docDate, 'day')
    });

    _.forEach(currentJobs, function(item) {
      var projectId = item.projectId()
      item.projectIsSet = ko.observable(projectId);

      var ticketId = item.ticketId()
      item.ticketIsSet = ko.observable(ticketId ? true : false);
    })

    ko.utils.arrayPushAll(this.currentJobTimerList, currentJobs)

    this.currentToDoTicketList.removeAll()
    this.currentDoneTicketList.removeAll()
    var that = this
    _.forEach(this.ticketList(), function(ticket) {
      const currentJobForTicket = _.find(that.currentJobTimerList(), function(job) {
        return job.ticketId() == ticket._id()
      })
      if(currentJobForTicket)
        return
      if(ticket.done())
        that.currentDoneTicketList.push(ticket)
      else
      that.currentToDoTicketList.push(ticket)
    })
  }

  async refreshJobTimerListForRange(currentDate) {
    if(this.currentJob()) {
      var jobDate = this.currentJob().date()
      var regex =  new RegExp(currentDate.format('YYYY-MM') + '-(.*)'+'|'+jobDate);
    } else {
      var regex =  new RegExp(currentDate.format('YYYY-MM') + '-(.*)');
    }
    
    var jobDocs = await this.db.find({date: regex})

    this.refreshJobTimerList(jobDocs)
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
      item.ticketIsSet = ko.observable(ticketId ? true : false);

      var ticket = _.find(this.ticketList(), function(ticketItem) {
        return ticketItem._id() == ticketId
      })

      item.ticket = ko.observable(ticket)
    }.bind(this))

    ko.utils.arrayPushAll(this.jobTimerList, observableDocs())
    if(this.currentJob && this.currentJob()){
      var newCurrentJob = ko.utils.arrayFirst(this.jobTimerList(), function(value){
        return value._id() == this.currentJob()._id();
      }.bind(this))
      if(newCurrentJob){
        this.currentJob(newCurrentJob)
      }
    }
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
  
  async currentMonthChanged(value){
    await this.refreshJobTimerListForRange(value)

    this.refreshTimeSum()

    var currentMonthRange = moment.range(
      value.clone().startOf('month'),
      value.clone().endOf('month')
    )
  }

  async currentDateChanged(value){
    var month = value.month()
    if(this.currentMonth() != month) {
      await this.currentMonthChanged(value)
    }
    this.currentMonth(month)

    this.refreshSelectedJobTimerList(this.jobTimerList(), value)

    this.refreshTimeSum()
    await this.refreshOvertime(value.clone())
    footer.initChart(value)
    var absenceDocs = await this.db_absences.find({date: value.format('YYYY-MM-DD')})
    if (absenceDocs.length > 0) {
      this.absenceToday(true)
    } else {
      this.absenceToday(false)
    }
  }
  
  async refreshOvertime(momentValue) {
    var monthStart = momentValue.clone().startOf('month')
    var monthEnd = moment()
    if(!momentValue.isSame(monthEnd, 'month')) {
      monthEnd = momentValue.clone().endOf('month')
    }

    var daysUntilToday = timefunctions.getDaysUntil(monthStart, monthEnd)
    var absenceDays = await timefunctions.getAbsenceDays(monthStart, monthEnd)
    daysUntilToday = daysUntilToday-absenceDays

    var currentJobs = _.filter(this.jobTimerList(), function(d) { 
      var docDate = moment(d.date())
      return momentValue.isSame(docDate, 'month')
    });

    var monthTimeSum = _.sumBy(currentJobs, function(o) { return o.elapsedSeconds(); });

    footer.overtimeSubject.next(monthTimeSum-(daysUntilToday*8*60*60))
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

  getFormatedDurationHHmm(seconds){
    if(!seconds)
      return "00:00"
  
    var formated = moment.duration(seconds, "seconds").format("hh:mm",{trim: false})
  
    return formated
  }
  
  previousDay(){
    this.currentDate(this.currentDate().subtract(1,'days'))
  }
  
  async saveAll(){
    await _.forEach(this.jobTimerList(), async function (element) {
      await this.db.update({ _id:element._id() }, { $set: { billable: element.billable(), lastSync: element.lastSync(), jobNote: element.jobNote(), description: element.description(), elapsedSeconds: element.elapsedSeconds(), projectId: element.projectId(), ticketId: element.ticketId() } },{ multi: false })
    }.bind(this))
    
    this.db.__original.persistence.compactDatafile()

    await this.createAutoComplete()
  }

  async saveItem(element){
    await this.db.update({ _id:element._id() }, { $set: { billable: element.billable(), lastSync: element.lastSync(), jobNote: element.jobNote(), description: element.description(), elapsedSeconds: element.elapsedSeconds(), projectId: element.projectId(), ticketId: element.ticketId() } },{ multi: false })

    await this.createAutoComplete()
  }
  
  async createAutoComplete(entryId){
    var autocompleteOptions = {
      data: this.descriptionList,
      list: {
          match: {
              enabled: true
          }
      },
      theme: "bootstrap"
    }
    
    $('.text-input-job').parent().not('.easy-autocomplete').children('.text-input-job').easyAutocomplete(autocompleteOptions).css("height",'31px').css('font-size', '0.875rem')
    $('.easy-autocomplete.eac-bootstrap').removeAttr( 'style' )
    if(entryId)
      $('#text-input-job_'+entryId).focus()
    
  }

  async addNewJobTimer(ticketId, projetcId) {
    var newEntry = {jobNote:"", projectId: projetcId, ticketId: ticketId,elapsedSeconds:0, description:'', date:this.currentDate().format('YYYY-MM-DD'), lastSync: "", billable: false}
    var dbEntry = await this.db.insert(newEntry)
    dbEntry = ko.mapping.fromJS(dbEntry)
    dbEntry.isRunning = ko.observable()
    dbEntry.isRunning(false)

    var projectId = dbEntry.projectId()
    dbEntry.projectIsSet = ko.observable(projectId);

    var ticketId = dbEntry.ticketId()
    dbEntry.ticketIsSet = ko.observable(ticketId ? true : false);

    var ticket = null
    if(ticketId) {
      ticket = _.find(this.ticketList(), (item) => {
        return item._id() == ticketId
      })
    }
    dbEntry.ticket = ko.observable(ticket)

    this.jobTimerList.push(dbEntry)
    this.createAutoComplete(dbEntry._id())

    await this.saveAll()
    this.currentDateChanged(this.currentDate())

    return dbEntry
  }

  async addNewItem(jobDescription, issueKey, issueSummery){

    var ticketId = ""
    if(issueKey) {
      var issueKeyRegex = new RegExp(issueKey);
      var tickets = await this.db_tickets.find({ name: issueKeyRegex })
      if(tickets && tickets.length > 0) {
        ticketId = tickets[0]._id
      } else {
        var newTicket = { name:issueKey+": "+issueSummery, active:true, score: 5, lastUse: moment().format('YYYY-MM-DD') }
        var newTicket = await this.db_tickets.insert(newTicket)
        ticketId = newTicket._id
        this.projectList.push(newTicket)
      }
    }

    if(!jobDescription){
      jobDescription = ""
    }
    var newEntry = {jobNote:"", projectId: "", ticketId: ticketId,elapsedSeconds:0, description:jobDescription, date:this.currentDate().format('YYYY-MM-DD'), lastSync: "", billable: false}
    var dbEntry = await this.db.insert(newEntry)
    dbEntry = ko.mapping.fromJS(dbEntry)
    dbEntry.isRunning = ko.observable()
    dbEntry.isRunning(false)
    
    var projectId = dbEntry.projectId()
    dbEntry.projectIsSet = ko.observable(projectId);

    var ticketId = dbEntry.ticketId()
    dbEntry.ticketIsSet = ko.observable(ticketId ? true : false);

    var ticket = null
    if(ticketId) {
      ticket = _.find(this.ticketList(), (item) => {
        return item._id() == ticketId
      })
    }
    dbEntry.ticket = ko.observable(ticket)

    this.jobTimerList.push(dbEntry)
    this.createAutoComplete(dbEntry._id())

    await this.saveAll()
    this.currentDateChanged(this.currentDate())
  }

  async addNewTicket(ticketName) {
    var newDate = new moment()
    var newTicket = { name:ticketName, active: true, score: 5, lastUse: newDate.format('YYYY-MM-DD'), done: false, projectId: '' }
    var dbEntry = await this.db_tickets.insert(newTicket)
    var observableDbEntry = ko.mapping.fromJS(dbEntry)
    observableDbEntry['id'] = observableDbEntry._id()
    this.ticketList.push(observableDbEntry)
    return observableDbEntry
  }

  addNewAbsence() {
    this.currentAbsencePeriod(null)
    $('#textAbsencePeriod').val('')
    $('#modalAbsencePeriod').modal('show');
  }

  addNewTicketDialog() {
    $('#inputTicketName').val('')
    $('#modalAddNewTicket').modal('show');
  }

  async saveNewTicketButton(data, that) {
    var newTicketName = $('#inputNewTicketName')[0].value
    var newTicket = await that.addNewTicket(newTicketName)
    that.currentToDoTicketList.push(newTicket)
    $('#modalAddNewTicket').modal('hide');
  }

  async removeAbsence() {
    await this.db_absences.remove({date: this.currentDate().format('YYYY-MM-DD')})
    this.absenceToday(false)
  }
  
  removeItemModal(that,data){
    that.itemToDelete(data)
    $('#modalDeleteEntry').modal('show');
  }

  async removeItem(that,data){
    await that.db.remove({ _id: data._id() }, {})
    that.jobTimerList.remove(function (item) { return item._id() == data._id(); })
    await that.refreshJobLists(that.currentDate())
    $('#modalDeleteEntry').modal('hide');
  }

  copyJob(that,data){
    var ticket = _.find(that.ticketList(), {_id: data.ticketId()})
    var project = _.find(that.projectList(), {_id: data.projectId()})

    var copyJobFormat = store.get('copyJobFormat')

    if(copyJobFormat == 'copyJobFormatPlaintext') {
      var result = ""
      result += `Ticket: ${ticket ? ticket.name || "-" : "-"}\n`
      result += `Tätigkeit: ${data.description() || "-"}\n`
      result += `Projekt: ${project ? project.name || "-" : "-"}\n`
      result += `Dauer: ${that.getTimeString(data.elapsedSeconds())}\n`
      clipboard.writeText(result)
    } else {
      var obj = {
        date: data.date(),
        description: data.description(),
        ticket: ticket ? ticket.name || "-" : "-",
        project: project ? project.name || "-" : "-",
        duration: that.getFormatedDurationHHmm(data.elapsedSeconds())
      }
      clipboard.writeText(JSON.stringify(obj))
    }
    toastr["info"]("Eintrag in Zwischenablage kopiert.")
  }

  pauseTimer(){
    this.jobtimer.stop()
    this.refreshTimeSum()
  }

  timerStop(currentData){
    var elementId = this.jobtimer.currentJobId
    this.currentJob().isRunning(false)
    this.lastEntryId = elementId
    this.currentEntryId = undefined
    footer.refreshStatusBarEntry()
    this.currentJob(undefined)
    // remote.getCurrentWindow().setOverlayIcon(null, "TimeTracker")
  }

  timerStart(currentData){
    var match = ko.utils.arrayFirst(this.jobTimerList(), function(item) {
      return currentData.jobId === item._id();
    });
    match.isRunning(true)
    this.currentEntryId = match._id();
    this.currentJob(match)
    var overlayPath = path.join(__dirname,"../icons/overlay.png")
    // remote.getCurrentWindow().setOverlayIcon(overlayPath, 'Aufgabe läuft...')
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

  async startTicket(that,data){
    var newItem = await that.addNewJobTimer(data._id(), data.projectId())

    that.startTimer(that, newItem)
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
    this.refreshTimeSum()
    this.refreshOvertime(moment(match.date()))
    this.refreshTray(updateValue.duration)
  }
  
  refreshTimeSum(){
    var timeSumSelected = this.getTimeSumSelected()
    if(!this.jobtimer.isRunning()) {
      footer.selectedTimerSumSubject.next(undefined)
      footer.timerSumSubject.next(timeSumSelected)
      electron.ipcRenderer.send('window-progress', this.currentSum()/(8*60*60), this.getProgressBarMode())
    } else {
      var currentJobDate = moment(this.currentJob().date(), 'YYYY-MM-DD')
      var timeSumRunning = this.getTimeSum(currentJobDate)
      this.currentSum(timeSumRunning)
      if(this.currentDate().isSame(currentJobDate, 'day')) {
        footer.selectedTimerSumSubject.next(undefined)
        footer.timerSumSubject.next(timeSumRunning)
        electron.ipcRenderer.send('window-progress', timeSumRunning/(8*60*60), this.getProgressBarMode())
      } else {
        electron.ipcRenderer.send('window-progress', timeSumRunning/(8*60*60), this.getProgressBarMode())
        footer.selectedTimerSumSubject.next(timeSumSelected)
        footer.timerSumSubject.next(timeSumRunning)
      }
    }
  }
  
  getProgressBarMode() {
    if(this.jobtimer.isRunning()) {
      return 'normal'
    }
    return 'paused'
  }

  getTimeSumSelected(){
    return _.sumBy(this.currentJobTimerList(), function(o) { return o.elapsedSeconds(); });
  }

  getTimeSum(momentValue){
    var currentJobs = _.filter(this.jobTimerList(), function(d) { 
      var docDate = moment(d.date())
      return momentValue.isSame(docDate, 'day')
    });
    return _.sumBy(currentJobs, function(o) { return o.elapsedSeconds(); });
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
  
  getTicketNumber(that, ticketId) {
    var ticket = _.find(that.ticketList(), {_id: ticketId})
    var regex = /(([A-Z]|\d){2,}-\d+)(:|-)?(.*)?/
    var match = regex.exec(ticket.name())
    
    if(!match) {
      toastr["error"]("Keine Ticket Nummer gefunden.")
      return
    }
    var issueNumber = match[1]
    return issueNumber
  }

  openTicket(that,data) {
    var issueNumber = that.getTicketNumber(that, data.ticketId())
    if(!issueNumber)
      return
    var ticketSystemBaseUrl = store.get('ticketSystemBaseUrl')
    shell.openExternal(ticketSystemBaseUrl+'/'+issueNumber)
    toastr["info"]("Ticket wurde geöffnet.")
  }

  copyTicket(that,data) {
    var ticket = _.find(that.ticketList(), {_id: data.ticketId()})
    clipboard.writeText(ticket.name)
    toastr["info"]("Ticket wurde kopiert.")
  }

  copyTicketNumber(that,data) {
    var issueNumber = that.getTicketNumber(that,data.ticketId())
    if(!issueNumber)
      return
    clipboard.writeText(issueNumber)
    toastr["info"]("Ticket wurde kopiert.")
  }

  refreshTray(elapsedTime){
    // var tray = remote.getGlobal('tray');
    // var timeSum = this.getTimeSum()
    // tray.setToolTip("Ʃ "+this.getTimeString(timeSum)+", Aufgabe: "+ this.getTimeString(elapsedTime))
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

