const { clipboard, shell } = require('electron')

const Store = require('electron-store');
const store = new Store();

var ko = require('knockout');
ko.mapping = require('knockout-mapping')

var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);

const toastr = require('toastr');
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

const dataAccess = require('../dataaccess.js')

function getTicketNumber(ticketList, ticketId) {
  var ticket = _.find(ticketList, (item) =>{ return item._id() == ticketId})
  var regex = /(([A-Z]|\d){2,}-\d+)(:|-)?(.*)?/
  var match = regex.exec(ticket.name())
  
  if(!match) {
    toastr["error"]("Keine Ticket Nummer gefunden.")
    return
  }
  var issueNumber = match[1]
  return issueNumber
}

function openTicket(ticketList, ticketId) {
  var issueNumber = getTicketNumber(ticketList, ticketId)
  if(!issueNumber)
    return
  var ticketSystemBaseUrl = store.get('ticketSystemBaseUrl')
  shell.openExternal(ticketSystemBaseUrl+'/'+issueNumber)
  toastr["info"]("Ticket wurde geöffnet.")
}

function copyTicket(ticketList, ticketId) {
  var ticket = _.find(ticketList, (item) => { return item._id() == ticketId})
  clipboard.writeText(ticket.name())
  toastr["info"]("Ticket wurde kopiert.")
}

function copyTicketNumber(ticketList, ticketId) {
  var issueNumber = getTicketNumber(ticketList, ticketId)
  if(!issueNumber)
    return
  clipboard.writeText(issueNumber)
  toastr["info"]("Ticket wurde kopiert.")
}

function formatTicketDescriptionAsHtml(descriptions, description, title) {
  var formatedString = ''
  if(title)
    formatedString = `<b>${title}:</b><br>`
  formatedString += '<ul>'
  descriptions.forEach((d) => {
    formatedString += `<li>${d.name()}</li>`
  })
  var lines = description.split(';')
  lines.forEach((line) => {
    formatedString += `<li>${line}</li>`
  })

  formatedString += '</ul>'
  return formatedString
}

function formatTicketDescriptionAsList(descriptions, description, title) {
  var formatedString = ''
  if(title)
    formatedString = `${title}\n`
  descriptions.forEach((d) => {
    formatedString += `- ${d.name()}\n`
  })
  var lines = description.split(';')
  lines.forEach((line) => {
    formatedString += `- ${line}\n`
  })
  return formatedString
}

async function addNewTicketWithKeyInternal(ticketList, ticketKey, ticketSummary) {
  if(ticketKey) {
    var existingTicket = _.find(ticketList(), (t) => { return t.name && t.name().includes(ticketKey) })
    if(existingTicket) {
      existingTicket.done(false)
    } else {
      var newTicket = await addNewTicketInternal(ticketList, ticketKey+": "+ticketSummary)
    }
  }
}

async function addNewTicketInternal(ticketList, ticketName) {
  const db_tickets = dataAccess.getDb('tickets')

  var newDate = new moment()
  var newTicket = { name:ticketName, active: true, score: 5, lastUse: newDate.format('YYYY-MM-DD HH:mm:ss'), done: false, projectId: '' }
  var dbEntry = await db_tickets.insert(newTicket)
  var observableDbEntry = ko.mapping.fromJS(dbEntry)
  observableDbEntry.project = ko.observable()
  observableDbEntry['id'] = observableDbEntry._id()
  observableDbEntry.nameString = observableDbEntry.name()

  ticketList.unshift(observableDbEntry)
  return observableDbEntry
}

function archiveTicket(that,data) {
  data.active(false)
  //ticketList.unshift(data)
}

module.exports = { openTicket, copyTicket, copyTicketNumber, addNewTicketWithKeyInternal, addNewTicketInternal, archiveTicket, formatTicketDescriptionAsHtml, formatTicketDescriptionAsList }