const { clipboard, shell } = require('electron')

const Store = require('electron-store');
const store = new Store();

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

module.exports = { openTicket, copyTicket, copyTicketNumber }