const { clipboard } = require('electron')

var dataAccess = require('./dataaccess.js')
var BaseViewModel = require('./base.js')
var ko = require('knockout');
ko.mapping = require('knockout-mapping')

var utils = require('./utils.js')

var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);

class TicketList extends BaseViewModel {

  columns = [
    { title:"Name", data: 'name', filter: true},
    { title:"Tage an den gearbeitet wurde", data: 'daysSum',  filter: true},
    { title:"Summe Arbeitszeit (h)", data: 'sumSeconds', filter: true},
    { title:"Summe Arbeitszeit", data: 'sumSeconds', filter: true},
    { title:"Letzte Änderung", data: 'lastUse', filter: true},
    { title:"Erledigt", data: 'done', filter: true},
    { title:"Aktion", data: null, defaultContent:
        '<div class="btn-group" role="group">'+
            '<a class="btn btn-default btn-sm table-btn" data-bind="click: copyTicket"><i class="fa fa-copy" title="Kopieren"></i></a>'+
        '</div>'
    }
  ]

  constructor(views){
    super(views)

    this.db = dataAccess.getDb('jobs');
    this.db_tickets = dataAccess.getDb('tickets')

    this.inProgress = ko.observable(false)

    this.definedState = ko.observable("all")
    this.definedState.subscribe((value) => {
      this.refreshTable(value)
    })

    $('#ticketList').load('pages/ticketlist.html', function(){
      this.hide()
      this.initTable()
      this.loaded = true
    }.bind(this))
  }

  getMenu(){
    return []
  }

  show(){
    if(!this.loaded){
      this.callAfterLoad = this.show
      return
    }
    this.onLoad()
    $('#ticketList').removeClass('invisible')
  }

  hide(){
    $('#ticketList').addClass('invisible')
  }

  async initTable() {
    this.ticketTable = $('#tickets').DataTable({
      //data: data,
      scrollCollapse: true,
      paging: false,
      autoWidth: false,
      rowId: '_id',
      columns: this.columns,
      fixedHeader: true,
      scrollY: "58vh",
      lengthMenu: [ [15, 25, 50, -1], [15, 25, 50, "Alle"] ],
      orderCellsTop: true,
      order: [[ 2, 'desc' ]],
      "language": {
          "url": "resources/dataTables.german.lang"
      },
      responsive: true,
      columnDefs:[
        {
            "data": null,
            "defaultContent": "-",
            "targets": "_all"
        },
        {
            targets:0,
            width: "50%"
        },
        {
            targets: 1,
            width: "18%",
        },
        {
          targets: 2,
          width: "16%",
          render: function(data) {
            return utils.getTimeDecimal(data)
          }
        },
        {
            targets: 3,
            width: "16%",
            render: function(data) {
              return utils.getTimeFormated(data)
            }
        },
        {
            targets: 4,
            width: "90px",
            render: function(data){
                return moment(data, 'YYYY-MM-DD').format('DD.MM.YYYY')
            }
        },
        {
          targets: 5,
          width: "15px",
          className: 'dt-body-center',
          render: function(data){
              return data ? "✅" : "❌"
          }
        },
        {
          targets: 6,
          width: "15px",
          className: 'dt-body-center'
        }
      ],
    })
  }

  async onLoad() {
    super.onLoad()
    this.refreshTable()
  }

  async refreshTable(state) {
    this.inProgress(true)
    this.ticketTable.clear()
    var ticketDocs = await this.db_tickets.find({})
    var jobDocs = await this.db.find({})

    _.forEach(ticketDocs, (ticket) => {
      if(state == 'todoOnly' && ticket.done == true)
        return
      if(state == 'notArchived' && ticket.active == false)
        return

      var timerForTicket = _.filter(jobDocs, j => { return j.ticketId == ticket._id })
      if(timerForTicket.length <= 0)
        return
      var sumSeconds =  _.sumBy(timerForTicket, t => { return t.elapsedSeconds })
      var daysSum = _.uniqBy(timerForTicket, 'date').length
      var newData = {
        _id: ticket._id,
        name: ticket.name,
        daysSum: daysSum,
        sumSeconds: sumSeconds,
        lastUse: ticket.lastUse,
        done: ticket.done,
        active: ticket.active
      }
      this.ticketTable.row.add( newData )
    })
    this.ticketTable.draw()
    _.forEach(this.ticketTable.rows().nodes(),(node) => {
      ko.applyBindings(this,node)
    })
    this.inProgress(false)
  }

  async copyTicket(that,data){
    var id = $(data.currentTarget).closest('tr').attr('id')
    var ticketDocs = await this.db_tickets.find({ _id: id })
    var timerForTicket = await this.db.find({ ticketId: id })
    timerForTicket = _.sortBy(timerForTicket, 'date')
    var sumSeconds =  _.sumBy(timerForTicket, t => { return t.elapsedSeconds })
    var daysSum = _.uniqBy(timerForTicket, 'date').length
    
    var ticket = ticketDocs[0]

    var result = ""
    result += `Ticket: ${ticket ? ticket.name || "-" : "-"}\n`
    result += `Dauer: ${utils.getTimeString(sumSeconds)}\n`
    result += `Tätigkeiten:\n`
    _.forEach(timerForTicket, t => {
      var date = moment(t.date, 'YYYY-MM-DD').format('DD.MM.YYYY')
      result += `${date}: ${t.description}\n`
    })
    
    clipboard.writeText(result)
  }
}

module.exports = TicketList