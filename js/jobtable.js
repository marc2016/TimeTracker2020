var log = require('electron-log');

var BaseViewModel = require('./base.js')
var ko = require('knockout');
const { clipboard } = require('electron')

var _ = require('lodash');
var toastr = require('toastr');

var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);
var Holidays = require('date-holidays')

const AirDatepicker = require('air-datepicker');
const localDe = require('air-datepicker/locale/de.js')

var utils = require('./utils')

const Store = require('electron-store');

var dataAccess = require('./dataaccess.js')

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

jQuery.fn.dataTable.Api.register( 'sum()', function ( ) {
    return this.flatten().reduce( function ( a, b ) {
        if ( typeof a === 'string' ) {
            a = a.replace(/[^\d.-]/g, '') * 1;
        }
        if ( typeof b === 'string' ) {
            b = b.replace(/[^\d.-]/g, '') * 1;
        }
 
        return a + b;
    }, 0 );
} );

class JobTable extends BaseViewModel {

    constructor(views){
        super(views)

        this.columns = [
            { title:"Datum", data: 'date()', filter: true},
            { title:"Aufgabe", data: 'description()',  filter: true},
            { title:"Ticket", data: 'ticketId()', filter: true},
            { title:"Projekt", data: 'projectId()', filter: true},
            { title:"Dauer", data: 'elapsedSeconds()'},
            { title:"Dauer (dez.)", data: 'formattedTimeDeciaml()', name:'durationDecimal'},
            { title:"Aktion", data: null, defaultContent:
                '<div class="btn-group" role="group">'+
                    '<a class="btn btn-default btn-sm table-btn" data-bind="click: copyJob"><i class="fa fa-copy" title="Kopieren"></i></a>'+
                    '<a class="btn btn-default btn-sm table-btn" data-bind="click: removeItemModal" ><i class="fas fa-trash" title="Löschen"></i></a>'+
                '</div>'
            }
        ]

        

        this.jobList = ko.observableArray()
        this.currentRange = ko.observable(moment().startOf('month').range('month'))
        this.itemToDelete = ko.observable()
        this.inProgress = ko.observable(false)
        this.definedRange = ko.observable()
        this.actualDuration = ko.observable()
        this.targetDuration = ko.observable()
        this.targetDurationUntilToday = ko.observable()
        this.diffUntilToday = ko.observable()

        $('#jobtable').load('pages/jobtable.html', function(){
            this.hide()

            this.db = dataAccess.getDb('jobs');
            this.db_projects = dataAccess.getDb('projects')
            this.db_tickets = dataAccess.getDb('tickets')
            this.db_absences = dataAccess.getDb('absences')

            this.store = new Store();
            var country = this.store.get('selectedCountry','DE')
            var state = this.store.get('selectedState','NW')
            var hd = new Holidays(country,state, {types: ['public']})
            var holidays = _.map(hd.getHolidays(), function(value){ return value.date.split(" ")[0] })
            moment.updateLocale('de', {
                holidays: holidays,
                holidayFormat: 'YYYY-MM-DD'
             });

            if(this.koWatcher){
                this.koWatcher.dispose()
            }
            this.koWatcher = ko.watch(this.jobList, { depth: -1 }, function(parents, child, item) {
                if(!item){
                    this.save(parents[0])
                }
            }.bind(this));
            
            this.currentRange.subscribe(this.refreshTable.bind(this));
            
            this.currentRange.subscribe((value)=>{
                $.find('#textCurrentMonth')[0].value = value.start.format('DD.MM.YY') + "-" + value.end.format('DD.MM.YY')
            });
            this.definedRange.subscribe((value) => {
                if(value == 'week') {
                    this.currentRange(moment.range(
                        moment().startOf('week'),
                        moment().endOf('week')
                        )
                    )
                } else if(value == 'month') {
                    this.currentRange(moment.range(
                        moment().startOf('month'),
                        moment().endOf('month')
                        )
                    )
                } else if(value == 'quarter') {
                    this.currentRange(moment.range(
                        moment().startOf('quarter'),
                        moment().endOf('quarter')
                        )
                    )
                }
                
            })

            this.jobTable = undefined

            // var that = this
            // $('#table').on( 'click', 'tr', function () {
            //     var rowData = that.jobTable.row( this ).data()
            //     var dataObj = {
            //         "date":rowData[0],
            //         "description":rowData[1],
            //         "project":rowData[2],
            //         "duration":rowData[4]
            //     }
            //     navigator.clipboard.writeText(JSON.stringify(dataObj))
            //     .then(() => {
            //         toastr.info('In Zwischenablage kopiert...')
            //     })
            //     .catch(err => {
            //         // This can happen if the user denies clipboard permissions:
            //         console.error('Could not copy text: ', err);
            //     });
            // } );
            
            this.initTable()

            this.loaded = true
        }.bind(this))
    }

    copyJob(that,data){
        var id = $(data.currentTarget).closest('tr').attr('id')
        var job = _.find(this.jobList(), element => element._id() == id)

        var ticket = _.find(that.ticketDocs, {_id: job.ticketId()})
        var project = _.find(that.projectDocs, {_id: job.projectId()})
        var result = ""
        result += `Ticket: ${ticket ? ticket.name || "-" : "-"}\n`
        result += `Tätigkeit: ${job.description() || "-"}\n`
        result += `Projekt: ${project ? project.name || "-" : "-"}\n`
        result += `Dauer: ${that.getTimeString(job.elapsedSeconds())}\n`
        clipboard.writeText(result)
    }
    getTimeString(seconds){
        if(!seconds)
          return "00:00:00/0.00"
      
        var formated = moment.duration(seconds, "seconds").format("HH:mm:ss",{trim: false})
        var decimal = moment.duration(seconds, "seconds").format("h", 2)
      
        return formated + "/" + decimal
      }

    removeItemModal(that,data){
        $('#modalDelete').modal('show');
        var id = $(data.currentTarget).closest('tr').attr('id')
        // var item = _.find(this.jobList(), element => element._id() == id)
        // if(!item) {
            
        // }
        that.itemToDelete({ id: id })
      }
    
      async removeItem(that,data){
        await that.db.remove({ _id: data.id }, {})
        that.jobList.remove(function (item) { return item._id() == data.id; })
        await that.db_absences.remove({ _id: data.id }, {})
        $('#modalDelete').modal('hide');
      }

    tableCellChanged (updatedCell, updatedRow, oldValue) {
        console.log("The new value for the cell is: " + updatedCell.data());
        console.log("The values for each cell in that row are: " + updatedRow.data());
    }

    async save(job){
        await this.db.update({ _id:job._id() }, { $set: { date: job.date(), lastSync: job.lastSync(), jobNote: job.jobNote(), description: job.description(), elapsedSeconds: job.elapsedSeconds(), projectId: job.projectId(), ticketId: job.ticketId() } },{ multi: false })
        this.db.__original.persistence.compactDatafile()
    }

    show(){
        if(!this.loaded){
          this.callAfterLoad = this.show
          return
        }
        this.onLoad()
        $('#jobtable').removeClass('invisible')
    }
    
    hide(){
        $('#jobtable').addClass('invisible')
    }
    
    getMenu(){
        return [
            
          ]
    }

    syncAllFilteredJobs(){
        console.log('Sync all')
    }

    async refreshTable(currentRange){
        this.inProgress(true)
        this.projectDocs = await this.db_projects.find({})
        this.ticketDocs = await this.db_tickets.find({})

        var days = Array.from(currentRange.by('day'));
        var dates = days.map(m => m.format('YYYY-MM-DD'))
        var jobDocs = await this.db.find({date: { $in: dates}})
            
        _.forEach(jobDocs, function(value){
            // var formatted = moment.duration(value.elapsedSeconds, "seconds").format("HH:mm:ss",{trim: false})
            // value.formattedTime = formatted
            
            var decimal = moment.duration(value.elapsedSeconds, "seconds").format("h", 2)
            // decimal = utils.roundDuration(this.store.get('roundDuration','round'),parseFloat(decimal.replace(",",".")))
            value.formattedTimeDeciaml = decimal.replace('.',',')
        }.bind(this))
        
        this.jobList.removeAll()
        var tmpJobList = ko.mapping.fromJS(jobDocs)
        _.forEach(tmpJobList(), function(value) {
            utils.addMissingProperties(value)
        });
        ko.utils.arrayPushAll(this.jobList, tmpJobList())

        var absenceDocs = await this.db_absences.find({date: { $in: dates}})
        _.forEach(absenceDocs, function(value){
            value.description = "Abwesend"
            value.formattedTimeDeciaml = "8,00"
            value.elapsedSeconds = 28800
            value.jobNote = ""
            value.lastSync = ""
            value.ticketId = ""
            value.projectId = ""
            value.readOnly = true
        }.bind(this))
        var tmpAbsenceList = ko.mapping.fromJS(absenceDocs)
        ko.utils.arrayPushAll(this.jobList, tmpAbsenceList())

        this.inProgress(false)
    }

    async initTable(){

        this.projectDocs = await this.db_projects.find({})
        this.ticketDocs = await this.db_tickets.find({})

        var that = this
        this.jobTable = $('#jobs').DataTable({
            scrollCollapse: true,
            paging: false,
            autoWidth: false,
            rowId: '_id()',
            columns: this.columns,
            fixedHeader: true,
            scrollY: "58vh",
            lengthMenu: [ [15, 25, 50, -1], [15, 25, 50, "Alle"] ],
            columnDefs:[
                {
                    "data": null,
                    "defaultContent": "-",
                    "targets": "_all"
                },
                {
                    targets:0,
                    width: "90px",
                    render: function(data){
                        return moment(data, 'YYYY-MM-DD').format('DD.MM.YYYY');
                    }
                },
                {
                    targets: 1,
                    width: "35%",
                },
                {
                    targets: 2,
                    width: "25%",
                    render: function(data){
                        var ticket = _.find(that.ticketDocs, {'_id':data})
                        if(ticket){
                            return ticket.name.length > 45 ? ticket.name.substr( 0, 45 ).trim() +'…' : ticket.name;
                        }
                    }
                },
                {
                    targets: 3,
                    width: "10%",
                    render: function(data){
                        var project = _.find(that.projectDocs, {'_id':data})
                        if(project){
                            return project.name
                        }
                    }
                },
                {
                    targets: 4,
                    render: function(data){
                        var formatted = moment.duration(data, "seconds").format("HH:mm:ss",{trim: false})
                        return formatted
                    }
                },
                {
                    targets: 5,
                    className: 'dt-body-right'
                },
                {
                    targets: 6,
                    className: 'dt-body-center'
                }
                
            ],
            orderCellsTop: true,
            "language": {
                "url": "resources/dataTables.german.lang"
            },
            responsive: true,
            drawCallback: async function () {
                var api = this.api();
                var columns = api.columns( [1,5],  {"filter": "applied"} ).data()
                var zippedColumns = _.zipWith(columns[0], columns[1], (a,b) => {return {description: a, duration: b}})
                var sumTableHours = _.sumBy(zippedColumns, function(element){
                    if (element.description == "Abwesend") {
                        return 0;
                    }
                    var duration = element.duration
                    return parseFloat(duration.replace(",","."))
                })

                var range = that.currentRange()

                var daysUntilToday = 0
                var rangeUntilToday = moment.range(range.start, moment());
                for (let day of rangeUntilToday.by('day')) {
                    if(day.isBusinessDay()) {
                        daysUntilToday += 1
                    }
                }
                
                var absenceDays = 0
                var days = Array.from(range.by('day'));
                var dates = days.map(m => m.format('YYYY-MM-DD'))
                var absenceDocs = await that.db_absences.find({date: { $in: dates}})
                _.forEach(absenceDocs, (value) => {
                    var dateFromDb = moment(value.date)
                    if(dateFromDb.isBusinessDay()) {
                        absenceDays += 1
                    }
                    if(dateFromDb.isBetween(rangeUntilToday.start, rangeUntilToday.end, undefined, '[]')) {
                        daysUntilToday -= 1
                    }
                })
                
                var targetDays = range.start.businessDiff(range.end)-absenceDays
                var targetHours = targetDays*8

                var hoursUntilToday = daysUntilToday*8

                var diffUntilTodayHours = sumTableHours-(daysUntilToday*8)

                var sumTableHoursString = sumTableHours.toLocaleString(undefined,{ minimumFractionDigits: 2 })
                var targetHoursString = targetHours.toLocaleString(undefined,{ minimumFractionDigits: 2 })
                var hoursUntilTodayString = hoursUntilToday.toLocaleString(undefined,{ minimumFractionDigits: 2 })
                var diffUntilTodayHoursString = diffUntilTodayHours.toLocaleString(undefined,{ minimumFractionDigits: 2 })

                that.actualDuration(sumTableHoursString)
                that.targetDuration(targetHoursString)
                that.targetDurationUntilToday(hoursUntilTodayString)
                that.diffUntilToday(diffUntilTodayHoursString)
            }
        });
        
        this.jobList.subscribe(function(changes) {
            _.forEach(changes, function(element){
                switch(element.status) {
                    case "added":
                        var node = this.jobTable.row.add( element.value ).draw().node()
                        ko.applyBindings(this,node)
                        break
                    case "deleted":
                        var row = this.jobTable.row('#'+element.value._id())
                        var node = row.node()
                        ko.cleanNode(node)
                        row.remove().draw();
                        break
                }
            }.bind(this))
            

        }.bind(this), null, "arrayChange")

        var emptyElement = {
            "value": "",
            "display": "-"
        }
        var projectValues = _.map(this.projectDocs, function(value){
            return {
                "value": value._id,
                "display": value.name
            }
        })
        projectValues = _.sortBy(projectValues, ['display'])
        projectValues = [emptyElement].concat(projectValues)

        // var ticketValues = _.map(this.ticketDocs, function(value){
        //     return {
        //         "value": value._id,
        //         "display": value.name
        //     }
        // })
        // ticketValues = _.sortBy(ticketValues, ['display'])
        // ticketValues = [emptyElement].concat(ticketValues)

        var observableTickets = ko.mapping.fromJS(this.ticketDocs)
        _.forEach(observableTickets(), function(item) {
            item['id'] = item._id()
            item.nameString = item.name()
            item.lastUseString = item.lastUse()
            item.disabled = !item.active()
          })

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
            
            var ticketStateIcon = item.done && item.done() ? '<i class="far fa-check-circle"></i>' : '<i class="far fa-circle"></i>'
            return ''+
            '<div class="option">'+
              '<div>'+
                ticketName +
              '</div>'+
              '<div>'+
                `<span class="ticket-select-secound-line">${ticketStateIcon}</span>`+
                '<span class="ticket-select-secound-line"> | </span>'+
                `<span class="ticket-select-secound-line">Letztes Update: ${utils.getFormatedDateTime(item.lastUse())}</span>`+
              '</div>'+
            '</div>';
          }
      

            
        var ticketSelectizeSettings = {
            options: observableTickets(),
            render: {
                item: renderItemFunc,
                option: renderOptionFunc
            },
            labelField: "nameString",
            sortField: [{field: "lastUseString", direction: "desc"},{field: "nameString", direction: "asc"}],
            valueField: "id",
            searchField: ["nameString"],
            placeholder: "",
            delimiter: "|",
            closeAfterSelect: true,
            allowEmptyOption: true,
            create: false,
            showEmptyOptionInDropdown: true,
        }
        this.jobTable.MakeCellsEditable({
            "columns": [0,1,2,3,4,5],
            "inputCss": "form-control table-input",
            "selectCss": "form-control selectpicker table-select",
            "onUpdate": this.tableCellChanged,
            "inputTypes": [
                {
                    "column": 0,
                    "type": "datepicker",
                    "convert": function(oldValue) { return moment(oldValue, 'YYYY-MM-DD').format('DD.MM.YYYY') },
                    "convertback": function(oldValue) { return moment(oldValue, 'DD.MM.YYYY').format('YYYY-MM-DD') },
                },
                {
                    "column":1, 
                    "type": "",
                },
                {
                    "column":2, 
                    "type": "selectize",
                    "settings":ticketSelectizeSettings
                },
                {
                    "column":3, 
                    "type": "list",
                    "options":projectValues
                },
                {
                    "column": 4,
                    "type": "duration",
                    "convert": function(oldValue) { return moment.duration(oldValue, "seconds").format("HH:mm:ss",{trim: false})},
                    "convertback": utils.durationConvertBack
                }
            ]
        });
    }

    onLoad() {
        super.onLoad()

        $.find('#textCurrentMonth')[0].value = this.currentRange().start.format('DD.MM.YY') + "-" + this.currentRange().end.format('DD.MM.YY')
        new AirDatepicker('#textCurrentMonth', {
            range: true,
            locale: localDe.default,
            autoClose: true,
            position: 'left top',
            buttons: [],
            onSelect:function onSelect(obj) {
                if(obj.date && obj.date.length == 2){
                    this.currentRange(moment.range(obj.date[0],obj.date[1]))
                    this.definedRange("")
                }
            }.bind(this)
        })

        var that = this
        if(!this.onlyOnce){
            $('#table thead tr').first().clone(true).appendTo( '#table thead' );
            $('#table thead tr:eq(1) th').each( function (i) {
                var title = $(this).text();
                var column = _.find(that.columns, value => value.title == title)
                $(this).off()
                $(this).removeClass()
                if(column.filter){
                    $(this).html( '<input type="text" class="form-control" placeholder="Filtern nach '+title+'" />' );
        
                    $( 'input', this ).on( 'keyup change', function () {
                        if ( that.jobTable.column(i).search() !== this.value ) {
                            that.jobTable
                                .column(i)
                                .search( this.value )
                                .draw();
                        }
                    } );    
                } else {
                    $(this).html( '' );
                }
                
            } );
            this.onlyOnce = true
        }
        
        this.refreshTable(this.currentRange())
    }
}

module.exports = JobTable
