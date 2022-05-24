var ko = require('knockout');
ko.mapping = require('knockout-mapping')

var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);

function getJobTimerForTicket(currentJobTimerList, ticket) {
  const currentJobForTicket = _.find(currentJobTimerList, function(job) {
    return job.ticketId() == ticket._id()
  })

  return currentJobForTicket
}

function sortTickets(left, right) {
  var leftDate = moment(left.lastUse())
  var rightDate = moment(right.lastUse())
  if(leftDate.isSame(rightDate))
    return 0
  if(leftDate.isBefore(rightDate))
    return 1
  return -1
}

module.exports = { getJobTimerForTicket, sortTickets }