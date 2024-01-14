var ko = require('knockout');
ko.mapping = require('knockout-mapping')

var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);

function renderItemFunc(that) {
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
  return renderItemFunc
}

function renderOptionFunc(that) {
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
  return renderOptionFunc
}

function applyTicketSelectize() {
  

  ko.bindingHandlers.selectizeTicket = {
    init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      var that = bindingContext.$parent

      var jobForElement = _.find(that.currentJobTimerList(), i => i._id() == $(element).attr("jobid"))

      var currentActiveTicketList = that.activeTicketList()
      var completeList = currentActiveTicketList
      if(jobForElement && jobForElement.ticket())
        _.concat(completeList, jobForElement.ticket())
        completeList = _.orderBy(completeList, ['lastUseString'], ['desc'])
      const selectizeElement = $(element).selectize(
        {
          options: completeList,
          create: function(input, callback) {
            that.addNewTicket(input).then((newTicket) => {
              callback( newTicket )
            })
          },
          render: {
            item: renderItemFunc(that),
            option: renderOptionFunc(that)
          },
          labelField: "nameString",
          valueField: "id",
          searchField: ["nameString"],
          placeholder: "",
          delimiter: "|",
          closeAfterSelect: true,
          allowEmptyOption: true,
          onChange: function onChange(value) {
            valueAccessor()(value)
          },
        }
      )

      const selectizeInstance = selectizeElement[0].selectize
      const ticketListSubscribtion = that.ticketList.subscribe(function(newValue) {
        selectizeInstance.addOption(newValue)
        selectizeInstance.refreshOptions(false)
      })

      ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
        ticketListSubscribtion.dispose()
      })
    },
    update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      var $el = $(element)
      var selectizeInstance = $el[0].selectize
      var value = valueAccessor();
      var valueUnwrapped = ko.unwrap(value)
      selectizeInstance.setValue(valueUnwrapped)
    }
  }
}

function applyProjectSelectize() {
  ko.bindingHandlers.selectizeProject = {
    init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      var that = bindingContext.$parent
      const selectizeElement = $(element).selectize(
        {
          options: that.projectList(),
          create: function(input, callback) {
            var newDate = new moment()
            var newProject = { name:input, active:true, score: 5, lastUse: newDate.format('YYYY-MM-DD HH:mm:ss') }
            that.db_projects.insert(newProject).then((dbEntry) => {
              var observableDbEntry = ko.mapping.fromJS(dbEntry)
              observableDbEntry['id'] = observableDbEntry._id()
              observableDbEntry.nameString = observableDbEntry.name()
              that.projectList.push(observableDbEntry)
              callback( observableDbEntry )
            })
          },
          labelField: "nameString",
          valueField: "id",
          searchField: ["nameString"],
          placeholder: "",
          delimiter: "|",
          closeAfterSelect: true,
          allowEmptyOption: true,
          onChange: function onChange(value) {
            valueAccessor()(value)
          },
        }
      )
      const selectizeInstance = selectizeElement[0].selectize
      const projectListSubscribtion = that.projectList.subscribe(function(newValue) {
        selectizeInstance.addOption(newValue)
        selectizeInstance.refreshOptions(false)
      })

      ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
        projectListSubscribtion.dispose()
      })
    },
    update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      var $el = $(element)
      var selectizeInstance = $el[0].selectize
      var value = valueAccessor();
      var valueUnwrapped = ko.unwrap(value)
      selectizeInstance.setValue(valueUnwrapped)
    }
  }
}

function applyJobDescriptionSelectize() {
  ko.bindingHandlers.selectizeJobDescription = {
    init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      var that = bindingContext.$parent
      const selectizeElement = $(element).selectize(
        {
          options: that.jobDescriptionList(),
          create: function(input, callback) {
            var newDate = new moment()
            var newJobDescription = { name:input, active:true, lastUse: newDate.format('YYYY-MM-DD HH:mm:ss') }
            that.db_jobDescriptions.insert(newJobDescription).then((dbEntry) => {
              var observableDbEntry = ko.mapping.fromJS(dbEntry)
              observableDbEntry['id'] = observableDbEntry._id()
              observableDbEntry.nameString = observableDbEntry.name()
              that.jobDescriptionList.push(observableDbEntry)
              callback( observableDbEntry )
            })
          },
          labelField: "nameString",
          valueField: "id",
          searchField: ["nameString"],
          placeholder: "",
          delimiter: ";",
          maxItems: null,
          allowEmptyOption: true,
          onChange: function onChange(valuesFromSelectize) {
            _.each(valueAccessor()(), (valueFromAccessor) => {
              const jobDescriptionId = _.find(valuesFromSelectize, (valueFromSelectize) => {
                return valueFromSelectize == valueFromAccessor.id
              })
              if(!jobDescriptionId)
                valueAccessor().remove(valueFromAccessor)
            })
            _.each(valuesFromSelectize, (valueFromSelectize) => {
              const jobDescription = _.find(that.jobDescriptionList(), (i) => {
                return i.id == valueFromSelectize
              })
              if(valueAccessor().indexOf(jobDescription) < 0)
                valueAccessor().push(jobDescription)
            })
            
          },
        }
      )
      const selectizeInstance = selectizeElement[0].selectize
      const jobDescriptionListSubscribtion = that.jobDescriptionList.subscribe(function(newValue) {
        selectizeInstance.addOption(newValue)
        selectizeInstance.refreshOptions(false)
      })

      ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
        jobDescriptionListSubscribtion.dispose()
      })
    },
    update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      const $el = $(element)
      const selectizeInstance = $el[0].selectize
      const value = valueAccessor();
      const valueUnwrapped = ko.unwrap(value)
      const ids = _.map(valueUnwrapped, 'id')
      selectizeInstance.setValue(ids)
    }
  }
}

function applySelectize() {
  applyProjectSelectize()
  applyTicketSelectize()
  applyJobDescriptionSelectize()
}

module.exports = { applySelectize }