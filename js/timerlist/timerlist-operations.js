var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);

const { formatTicketDescriptionAsHtml } = require('./ticket-operations.js')

function watchTimerList(parents, child, item) {
  var that = this
  if(child._fieldName == 'projectId') {
    var project = _.find(this.projectList(), (item) => item._id() == child())
    parents[0].project(project)
  }
  
  if(child._fieldName == 'ticketId') {
    var ticket = _.find(this.ticketList(), (item) => item._id() == child())
    if(ticket) {
      var newDate = new moment()
      ticket.lastUse(newDate.format('YYYY-MM-DD HH:mm:ss'))
    }
    parents[0].ticket(ticket)
    //$(`ticket-job_${parents[0]._id()}-selectized`).trigger('blur')

    var docs = async () => await this.db.find({ticketId: child()}).sort({date: -1})
    docs().then((jobs) => {
      var job = _.find(jobs, function(o) { return o.projectId != undefined })
      if (!job) return
      
      var element = $('#project-job_'+parents[0]._id())[0].selectize
      element.addItem(job.projectId)
      that.jobTimerList()[0].projectId(job.projectId)
    })
  }

  if(child._fieldName == 'description') {
    const id = parents[0]._id()
    const tippyInstance = $('#text-input-job_'+id)[0]._tippy
    if(tippyInstance)
      tippyInstance.setContent(formatTicketDescriptionAsHtml(child(), 'Tätigkeit'))
  }

  if(parents != null && parents.length > 0){
    this.saveItem(parents[0])
  } 
}

module.exports = { watchTimerList }