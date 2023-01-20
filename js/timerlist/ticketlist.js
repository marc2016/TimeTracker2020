var ko = require('knockout');
ko.mapping = require('knockout-mapping')

var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);

const dataAccess = require('../dataaccess.js')

function getJobTimerForTicket(currentJobTimerList, ticket) {
  const currentJobForTicket = _.find(currentJobTimerList, function(job) {
    return job.ticketId() == ticket._id()
  })

  return currentJobForTicket
}

function sortTickets(left, right) {
  if(!left.lastUse() && !right.lastUse())
    return 0
  if(!left.lastUse())
    return -1
  if(!right.lastUse())
    return 1

  var leftDate = moment(left.lastUse())
  var rightDate = moment(right.lastUse())
  if(leftDate.isSame(rightDate))
    return 0
  if(leftDate.isBefore(rightDate))
    return 1
  return -1
}

function watchTicketList(parents, child, item) {
  if(child && child.watchable === false)
    return
  if(child._fieldName == 'lastUse')
    return
  if(child._fieldName == 'projectId' && child() === undefined && child.oldValues.length > 0 && child.oldValues[0] === '')
    return
  if(item?.status == 'added') {
    item.value.nameString = item.value.name()
    this.refreshJobLists(this.currentDate())
  }

  var ticket = parents[0]
  if(!ticket)
    return
  if(child._fieldName == 'active')
    ticket.disabled = !ticket.active()
  var newDate = new moment()
  ticket.lastUse(newDate.format('YYYY-MM-DD hh:mm:ss'))
  var saveObj = {}
  saveObj[child._fieldName] = child()
  const db_tickets = dataAccess.getDb('tickets')
  db_tickets.update({ _id:ticket._id() }, { $set: saveObj },{ multi: false })

  if(child._fieldName == 'projectId') {
    var project = _.find(this.projectList(), (item) => item._id() == child())
    parents[0].project(project)
  }
}

module.exports = { getJobTimerForTicket, sortTickets, watchTicketList }