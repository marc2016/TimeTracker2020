const electron = require('electron')

const { clipboard } = require('electron')

var _ = require('lodash');

const { watchTimerList } = require('./timerlist/timerlist-operations.js')
const { copyTicket, copyTicketNumber, openTicket, addNewTicketWithKeyInternal, addNewTicketInternal, archiveTicket, formatTicketDescriptionAsHtml, formatTicketDescriptionAsList } = require('./timerlist/ticket-operations.js')
const { getJobTimerForTicket, sortTickets, watchTicketList } = require('./timerlist/ticketlist.js')
const { createTimerTemplateList, insertTimerTemplate, deleteTimerTemplate } = require('./timerlist/timer-templates.js')

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

const AirDatepicker = require('air-datepicker');
const localDe = require('air-datepicker/locale/de.js')

var tippy = require('tippy.js')

var toastr = require('toastr');
const { add } = require('lodash');
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

      this.loadedDoneTicketsCount = ko.observable(10)
      
      this.db = dataAccess.getDb('jobs')
      this.db_projects = dataAccess.getDb('projects')
      this.db_tickets = dataAccess.getDb('tickets')
      this.db_absences = dataAccess.getDb('absences')

      this.db.__original.persistence.compactDatafile()
      
      this.jobTimerList = ko.observableArray().extend({ deferred: true })

      this.projectList = ko.observableArray()
      this.ticketList = ko.observableArray().extend({ deferred: true, rateLimit: 50 })
      this.timerTemplates = ko.observableArray()
      this.descriptionList = []

      var that = this

      this.activeTicketList = ko.pureComputed(function() {
        var filteredTickets = ko.utils.arrayFilter(this.ticketList(), function(ticket) {
          return ticket.active() == true
        });
        var sortedTickets = filteredTickets.sort(sortTickets)
        return sortedTickets
      }, this);

      this.currentToDoTicketList = ko.pureComputed(function() {
        var filteredTickets = ko.utils.arrayFilter(this.ticketList(), function(ticket) {
          const currentJobForTicket = getJobTimerForTicket(that.currentJobTimerList(), ticket)
          return !currentJobForTicket && ticket.done() == false && ticket.active() == true
        });
        var sortedTickets = filteredTickets.sort(sortTickets)
        return sortedTickets
      }, this);

      this.currentDoneTicketList = ko.pureComputed(function() {
        var filteredTickets = ko.utils.arrayFilter(this.ticketList(), function(ticket) {
          const currentJobForTicket = getJobTimerForTicket(that.currentJobTimerList(), ticket)
          return !currentJobForTicket && ticket.done() == true && ticket.active() == true
        });
        var sortedTickets = filteredTickets.sort(sortTickets)
        sortedTickets = _.take(sortedTickets, this.loadedDoneTicketsCount())
        return sortedTickets
      }, this);

      this.showListElement = function(elem) {
        if (elem.nodeType === 1) {
          $(elem).hide().slideDown(600,'swing')
          const id = $(elem).attr('id')
          const jobDescription = $('#text-input-job_'+id).val()
          if(jobDescription) {
            tippy.default('#text-input-job_'+id, {
              content: formatTicketDescriptionAsHtml(jobDescription, 'Tätigkeit'),
              theme: 'light-border',
              delay: [2000, 500],
              allowHTML: true,
            })
          }

          const jobForElement = _.find(that.currentJobTimerList(), i => i._id() == id)
          if(jobForElement) {
            const jobTimerDatePickerOpts = {
              locale: localDe.default,
              autoClose:true,
              toggleSelected: false,
              inline: false,
              selectedDates: [jobForElement.date()],
              onSelect:function onSelect(obj) {
                jobForElement.date(moment(obj.date))
              }.bind(this)
            }
  
            jobForElement.datePicker = new AirDatepicker('#timer-change-date_'+id, jobTimerDatePickerOpts)
          }
        } 
      }
      this.hideListElement = function(elem) { if (elem.nodeType === 1) $(elem).slideUp(600,'swing',function() { $(elem).remove(); }) }

      this.currentJobTimerList = ko.pureComputed(function() {
        var selectedJobs = ko.utils.arrayFilter(this.jobTimerList(), function(jobTimer) {
          var jobDate = moment(jobTimer.date())
          return that.currentDate().isSame(jobDate, 'day')
        })
        var sortedJobs = _.sortBy(selectedJobs, (job) => {
            var doneSortValue = 0
            if(job.ticket()) {
              doneSortValue = job.ticket().done() ? 2 : 1
            }
            return job.ticket() ? doneSortValue + job.ticket().name() : ''
          })
        _.each(sortedJobs, j => {j.copied(false)})
        return sortedJobs
      }, this);

      this.currentJobTimerList.subscribe(this.refreshTimeSum.bind(this))

      this.jobListLoadedPostAction = this.jobListLoadedPostAction.bind(this)

      if(this.koWatcherJobTimerList){
        this.koWatcherJobTimerList.dispose()
      }
      
      this.koWatcherJobTimerList = ko.watch(this.jobTimerList, { depth: -1, tagFields: true, oldValues: 1, hideFieldNames: ['datePicker'] }, watchTimerList.bind(this))

      this.currentDate.subscribe(this.currentDateChanged.bind(this))

      let toDayButton = {
        content: 'Heute',
        className: 'custom-button-classname',
        onClick: (dp) => {
            let date = new Date();
            dp.selectDate(date);
            dp.setViewDate(date);
        }
      }

      this.currentDateDatePickerOpts = {
        locale: localDe.default,
        autoClose:true,
        toggleSelected: false,
        buttons: [toDayButton],
        selectedDates: [new Date()],
        multipleDatesSeparator: ' - ',
        maxDate: new Date(),
        onSelect:function onSelect(obj) {
          this.currentDate(moment(obj.date))
        }.bind(this)
      }

      this.textCurrentDate = new AirDatepicker('#textCurrentDate', this.currentDateDatePickerOpts)
      this.textCurrentDate.update(this.currentDateDatePickerOpts)
      this.absencePeriodDatePicker = {
        range: true,
        toggleSelected: false,
        locale: localDe.default,
        autoClose: true,
        buttons: [toDayButton],
        multipleDatesSeparator: ' - ',
        container: '#modalAbsencePeriod',
        onSelect:function onSelect(obj) {
            if(obj.date && obj.date.length == 2){
                this.currentAbsencePeriod(moment.range(obj.date[0],obj.date[1]))
            }
          }.bind(this)
      }
      this.textAbsencePeriod = new AirDatepicker('#textAbsencePeriod', this.absencePeriodDatePicker)

      footer.onLoad(this.currentDate(), this.db, this.db_absences, jobtimer)
      footer.leftFooterAction = this.goToToday
      
      electron.ipcRenderer.on('browser-window-focus', async function(event, arg){
        if(!(this.today() && this.today().isSame(new moment(), 'day')))
        {
          this.today(new moment())
          this.currentDateDatePickerOpts.maxDate = new Date()
          this.currentDateDatePickerOpts.selectedDates = [new Date()]
          this.textCurrentDate.update(this.currentDateDatePickerOpts)

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
    if(this.koWatcherTicketList)
      this.koWatcherTicketList.dispose()
    this.koWatcherTicketList = ko.watch(this.ticketList, { depth: 1, tagFields: true, oldValues: 1 }, watchTicketList.bind(this))
    await this.refreshDescriptionList()

    var timerTemplatesList = await createTimerTemplateList()
    this.timerTemplates.removeAll()
    ko.utils.arrayPushAll(this.timerTemplates, timerTemplatesList())
    
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

    var that = this
    //var bindedFunc = that.reloadDoneTickets.bind(that)
    var debounced = _.throttle(() => {
      var scrollTo = $("body").height() - 100
      that.loadedDoneTicketsCount(that.loadedDoneTicketsCount()+10)
      window.scrollTo(0, scrollTo)
    }, 1000, {
      'leading': true,
      'trailing': false
    })
    $(window).on('scroll', function() {
      if ($(this).scrollTop() + $(this).innerHeight() >= $("body").height() - 50) {
        debounced()
      }
    })
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
        icon: 'fa fa-stopwatch',
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
    that.lastJobBeforeJobDurationChange(null)
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
        item.lastUse = newDate.format('YYYY-MM-DD HH:mm:ss')
      } else {
        var date = new moment(item.lastUse)
        var diff = (new moment()).diff(date, 'days')
        if(diff > 5) {
          await that.db_projects.update({ _id:item._id }, { $set: { score: 0 }},{ })
        }
      }
    }.bind(this))
    docs = _.sortBy(docs, 'name')
    var observableDocs = ko.mapping.fromJS(docs)
    _.forEach(observableDocs(), function(item) {
      item['id'] = item._id()
    })
    this.projectList.removeAll()
    ko.utils.arrayPushAll(this.projectList, observableDocs())
  }

  async refreshTicketList(){
    var docs = await this.db_tickets.find()
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
        item.lastUse = newDate.format('YYYY-MM-DD HH:mm:ss')
      } else {
        var date = new moment(item.lastUse)
        var diff = (new moment()).diff(date, 'days')
        if(diff > 5) {
          await that.db_tickets.update({ _id:item._id }, { $set: { score: 0 }},{ })
        }
      }
    }.bind(this))
    
    docs = _.sortBy(docs, 'name')
    var observableDocs = ko.mapping.fromJS(docs)
    _.forEach(observableDocs(), function(item) {
      item['id'] = item._id()
      var projectId = item.projectId()
      var project = _.find(that.projectList(), (projectItem) => {
        return projectItem._id() == projectId
      })
      item.project = ko.observable(project)
      item.nameString = item.name()
      item.lastUseString = item.lastUse()
      item.disabled = !item.active()
    })

    this.ticketList.removeAll()
    ko.utils.arrayPushAll(this.ticketList, observableDocs())
    this.ticketList.sort(sortTickets)
  }

  async refreshDescriptionList() {
    var today = new moment()
    var past = moment().subtract(1, 'months');
    var regex =  new RegExp('('+past.format('YYYY-MM')+'|'+today.format('YYYY-MM') + ')' + '-(.*)');
    
    var jobDocs = await this.db.find({date: regex})
    var mappedDocs = _.map(jobDocs,(j) => { return j.description })
    var filteredDocs = _.filter(mappedDocs, (o) => { return o != null })
    this.descriptionList = _.uniq(filteredDocs)
  }

  applySelectize() {
    var that = this
    $('select.projectSelect').selectize(
        {
          options: that.projectList(),
          create: function(input, callback) {
            var newDate = new moment()
            var newProject = { name:input, active:true, score: 5, lastUse: newDate.format('YYYY-MM-DD HH:mm:ss') }
            that.db_projects.insert(newProject).then((dbEntry) => {
              var observableDbEntry = ko.mapping.fromJS(dbEntry)
              observableDbEntry['id'] = observableDbEntry._id()
              that.projectList.push(observableDbEntry)
              callback( observableDbEntry )
            })
          },
          labelField: "name()",
          sortField: [{field: "lastUse()", direction: "desc"},{field: "name()", direction: "asc"}],
          valueField: "id",
          searchField: ["name()"],
          placeholder: " ",
          delimiter: "|",
          closeAfterSelect: true,
        }
    )
    var renderItemFunc = function (item, escape) {
      var regex = /(([A-Z]|\d){2,}-\d+)(:|-)?(.*)?/
      var match = regex.exec(item.nameString)
      
      if(!match) {
        return '<div class="item">'+item.nameString+'</div>';
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
      var match = regex.exec(item.nameString)
      
      var ticketName = ''
      if(!match) {
        ticketName =  '<span>'+item.nameString+'</span>';
      } else {
        var issueNumber = match[1]
        var issueName = match[4]  
        ticketName = '<span class="issueNumber">'+issueNumber+'</span>'+
          '<span class="issueName">: '+issueName+'</span>'
      }
      
      if(!item.id)
        return
      var ticketStateIcon = item.done && item.done() ? '<i class="far fa-check-circle"></i>' : '<i class="far fa-circle"></i>'
      return ''+
      '<div class="option">'+
        '<div>'+
          ticketName +
        '</div>'+
        '<div>'+
          `<span class="ticket-select-secound-line">${ticketStateIcon}</span>`+
          '<span class="ticket-select-secound-line"> | </span>'+
          `<span class="ticket-select-secound-line">Letztes Update: ${that.getFormatedDateTime(item.lastUse())}</span>`+
        '</div>'+
      '</div>';
    }

    var currentActiveTicketList = this.activeTicketList()
    $('select.ticketSelect').each((index, element) => {
      var jobForElement = _.find(that.currentJobTimerList(), i => i._id() == $(element).attr("jobid"))

      var completeList = currentActiveTicketList
      if(jobForElement && jobForElement.ticket())
        _.concat(completeList, jobForElement.ticket())
        completeList = _.orderBy(completeList, ['lastUseString'], ['desc'])
      $(element).selectize(
        {
          options: completeList,
          create: function(input, callback) {
            that.addNewTicket(input).then((newTicket) => {
              callback( newTicket )
            })
          },
          render: {
            item: renderItemFunc,
            option: renderOptionFunc
          },
          labelField: "nameString",
          
          valueField: "id",
          searchField: ["nameString"],
          placeholder: "",
          delimiter: "|",
          closeAfterSelect: true,
          allowEmptyOption: true,
          
        }
      )
    })
    
    
  }

  async refreshJobLists(momentValue) {
    await this.refreshJobTimerListForRange(momentValue)
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
      var project = _.find(this.projectList(), (projectItem) => {
        return projectItem._id() == projectId
      })
      item.project = ko.observable(project)

      var ticketId = item.ticketId()
      var ticket = _.find(this.ticketList(), function(ticketItem) {
        return ticketItem._id() == ticketId
      })
      item.ticket = ko.observable(ticket)
      item.copied = ko.observable(false)
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

    await this.refreshOvertime(value.clone())
    footer.initChart(value)
    var absenceDocs = await this.db_absences.find({date: value.format('YYYY-MM-DD')})
    if (absenceDocs.length > 0) {
      this.absenceToday(true)
    } else {
      this.absenceToday(false)
    }

    this.loadedDoneTicketsCount(10)
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
    this.textCurrentDate.selectDate(this.currentDate().add(1,'days'))
  }
  
  getTimeString(seconds){
    if(!seconds)
      return "00:00:00/0.00"
  
    var formated = moment.duration(seconds, "seconds").format("HH:mm:ss",{trim: false})
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
  
    var formated = moment.duration(seconds, "seconds").format("HH:mm:ss",{trim: false})
  
    return formated
  }

  getFormatedDurationHHmm(seconds){
    if(!seconds)
      return "00:00"
  
    var formated = moment.duration(seconds, "seconds").format("hh:mm",{trim: false})
  
    return formated
  }

  getFormatedDateTime(dateTimeString) {
    return (new moment(dateTimeString)).format('DD.MM.YYYY HH:mm:ss')
  }
  
  previousDay(){
    this.textCurrentDate.selectDate(this.currentDate().subtract(1,'days'))
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

  async addNewJobTimer(description, ticketId, projetcId) {
    var newEntry = {jobNote:"", projectId: projetcId, ticketId: ticketId,elapsedSeconds:0, description:description, date:this.currentDate().format('YYYY-MM-DD'), lastSync: "", billable: false}
    var dbEntry = await this.db.insert(newEntry)
    dbEntry = ko.mapping.fromJS(dbEntry)
    dbEntry.isRunning = ko.observable()
    dbEntry.isRunning(false)

    var projectId = dbEntry.projectId()
    var project = null
    if(projectId) {
      project = _.find(this.projectList(), (item) => {
        return item._id() == projectId
      })
    }
    dbEntry.project = ko.observable(project)

    var ticketId = dbEntry.ticketId()
    var ticket = null
    if(ticketId) {
      ticket = _.find(this.ticketList(), (item) => {
        return item._id() == ticketId
      })
    }
    dbEntry.ticket = ko.observable(ticket)

    dbEntry.copied = ko.observable(false)

    this.jobTimerList.unshift(dbEntry)
    this.createAutoComplete(dbEntry._id())

    await this.saveAll()
    this.currentDateChanged(this.currentDate())

    return dbEntry
  }

  async addNewItemAndStart(jobDescription, issueKey, issueSummery){
    var newEntry = await this.addNewItem(jobDescription, issueKey, issueSummery)
    this.startTimer(this, newEntry)
  }

  async addNewItem(jobDescription, issueKey, issueSummery){

    var ticketId = ""
    if(issueKey) {
      var existingTicket = _.find(this.ticketList(), (t) => { return t.name && t.name().includes(issueKey) })
      if(existingTicket) {
        ticketId = existingTicket._id()
      } else {
        var newTicket = await addNewTicketInternal(this.ticketList, issueKey+": "+issueSummery)
        ticketId = newTicket._id()
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
    var project = null
    if(projectId) {
      project = _.find(this.projectList(), (item) => {
        return item._id() == projectId
      })
    }
    dbEntry.project = ko.observable(project)

    var ticketId = dbEntry.ticketId()
    var ticket = null
    if(ticketId) {
      ticket = _.find(this.ticketList(), (item) => {
        return item._id() == ticketId
      })
    }
    dbEntry.ticket = ko.observable(ticket)

    dbEntry.copied = ko.observable(false)

    this.jobTimerList.push(dbEntry)
    this.createAutoComplete(dbEntry._id())

    await this.saveAll()
    this.currentDateChanged(this.currentDate())

    return dbEntry
  }

  async addNewTicketWithKey(ticketKey, ticketSummary) {
    await addNewTicketWithKeyInternal(this.ticketList, ticketKey, ticketSummary)
  }

  async addNewTicket(ticketName) {
    return await addNewTicketInternal(this.ticketList, ticketName)
  }

  addNewAbsence() {
    this.currentAbsencePeriod(null)
    $('#textAbsencePeriod').val('')
    $('#modalAbsencePeriod').modal('show');
  }

  addNewTicketDialog() {
    $('#inputNewTicketName').val('')
    $('#modalAddNewTicket').modal('show');
    setTimeout(() => { $('#inputNewTicketName').trigger('focus') }, 500)
  }

  async saveNewTicketButton(data, that) {
    var newTicketName = $('#inputNewTicketName')[0].value
    var newTicket = await that.addNewTicket(newTicketName)
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
    var ticket = data.ticket()
    var project = data.project()

    var copyJobFormat = store.get('copyJobFormat')

    if(copyJobFormat == 'copyJobFormatPlaintext') {
      var result = ""
      result += `Ticket: ${ticket ? ticket.name() || "-" : "-"}\n`
      result += `Tätigkeit: ${data.description() || "-"}\n`
      result += `Projekt: ${project ? project.name() || "-" : "-"}\n`
      result += `Dauer: ${that.getTimeString(data.elapsedSeconds())}\n`
      clipboard.writeText(result)
    } else {
      var obj = {
        date: data.date(),
        description: formatTicketDescriptionAsList(data.description()),
        ticket: ticket ? ticket.name() || "-" : "-",
        project: project ? project.name() || "-" : "-",
        duration: that.getFormatedDurationHHmm(data.elapsedSeconds())
      }
      clipboard.writeText(JSON.stringify(obj))
    }
    data.copied(true)
    toastr["info"]("Eintrag in Zwischenablage kopiert.")
  }

  async pinJob(that, data) {
    const newEntry = await insertTimerTemplate(data.description(), data.projectId())
    if (newEntry)
      that.timerTemplates.unshift(newEntry)
  }

  async removeTimerTemplate(that, data) {
    await deleteTimerTemplate(data._id())
    that.timerTemplates.remove(data)
  }

  async addNewTimerFromTemplate(that, data) {
    var newItem = await that.addNewJobTimer(data.description(), null, data.projectId())

    that.startTimer(that, newItem)
  }

  pauseTimer(){
    this.jobtimer.stop()
    this.refreshTimeSum()
  }

  timerStop(currentData){
    this.currentJob().isRunning(false)
    this.currentEntryId = undefined
    footer.refreshStatusBarEntry()
    this.currentJob(undefined)
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
    
    that.jobtimer.start(data._id(), data.elapsedSeconds(), data.description(), data.ticket()?.nameString)
  }

  async startTicket(that,data){
    var newItem = await that.addNewJobTimer(null, data._id(), data.projectId())

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

  openDatePickerForJob(that,data) {
    if(!data.datePicker.visible)
      data.datePicker.show()
    else
      data.datePicker.hide()
  }

  openTicketForJob(that,data) {
    openTicket(that.ticketList(), data.ticketId())
  }

  copyTicketForJob(that,data) {
    copyTicket(that.ticketList(), data.ticketId())
  }

  copyTicketNumberForJob(that,data) {
    copyTicketNumber(that.ticketList(), data.ticketId())
  }

  openTicketForTicket(that,data) {
    openTicket(that.ticketList(), data._id())
  }

  copyTicketForTicket(that,data) {
    copyTicket(that.ticketList(), data._id())
  }

  copyTicketNumberForTicket(that,data) {
    copyTicketNumber(that.ticketList(), data._id())
  }

  reloadDoneTickets() {
    var count = 10
    _.forEach(this.ticketList(), (ticket) => {
      if(!ticket.done())
        return
      var doneTicket = _.find(this.currentDoneTicketList(), (doneTicket) => {
        return doneTicket._id() == ticket._id()
      })
      if(doneTicket)
        return
      if(count-- > 0)
        this.currentDoneTicketList.push(ticket)
      else
        return false
    })
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

TimerList.prototype.archiveTicket = archiveTicket

module.exports = TimerList

