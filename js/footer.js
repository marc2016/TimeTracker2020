var moment = require('moment');
var _ = require('lodash');
var momentDurationFormatSetup = require("moment-duration-format");
var ko = require('knockout');
const { Subject, interval, combineLatest } = require('rxjs');
const { map } = require('rxjs/operators');


var self = module.exports = {
    leftJobDescription: ko.observable('keine laufende Aufgabe'),
    leftJobDuration: ko.observable(''),
    rightTimeSum: ko.observable('00:00:00/0.00'),
    selectedTimeSum: ko.observable(),
    overtime: ko.observable('00:00:00/0.00'),
    dayStarted: ko.observable('-'),
    dayStartetMoment: undefined,
    dayEnd: ko.observable('-'),
    dayEndPlus: ko.observable('-'),
    machineRunning: ko.observable('-'),
    monthChart: undefined,
    utils: undefined,
    leftFooterAction: undefined,
    db: undefined,
    jobtimer: undefined,
    timerSumSubject: new Subject(),
    selectedTimerSumSubject: new Subject(),
    overtimeSubject: new Subject(),

    isBound: function() {
        return !!ko.dataFor(document.getElementById('footerContainer'));
    },

    onLoad: function(currentDate, database, absenceDatabase, jobtimer){
        if(!self.isBound())
            ko.applyBindings(self, document.getElementById('footerContainer'))
        self.db = database
        self.absenceDb = absenceDatabase
        self.jobtimer = jobtimer
        utils = require('./utils.js');
        $('#footerContainer').mouseenter(function() {$('#sidebarButton').toggleClass('show')})
        $('#footerContainer').mouseleave(function() {$('#sidebarButton').toggleClass('show')})
        $('#sidebarButton').click(function() {$('#footerContainer').toggleClass('chart');
        $('#buttonSymbol').toggleClass('down');
        self.initChart(currentDate)})

        $('#footerRightContent').click(function() {$('#timeInfoContainer').toggleClass('show')});

        self.jobtimer.timeSignal.subscribe(self.refreshStatusBarEntry)
        self.jobtimer.stopSignal.subscribe(self.timerStop)
    },


    timerStop: function (){
        self.leftJobDescription('keine laufende Aufgabe')
        self.leftJobDuration('')
        var leftFooter = document.getElementById('footerLeftContent')
        leftFooter.removeEventListener('click', self.leftFooterAction)
    },

    refreshStatusBarEntry: function (updatevalue){
        if(!updatevalue)
            return;
        var duration = updatevalue.duration
        var description = []
        if(updatevalue.ticketDescription)
            description.push(updatevalue.ticketDescription)

        var leftFooter = document.getElementById('footerLeftContent')
        
        if(updatevalue.jobDescription) {
            description.push(updatevalue.jobDescription)
        } else {
            description.push('Unbenannte Aufgabe')
        }
        self.leftJobDescription(description.join(' - '))
        self.leftJobDuration(utils.getTimeString(duration))
        leftFooter.addEventListener('click', self.leftFooterAction)
    },

    refreshDayStarted: function (date) {
        this.dayStarted(date.format('HH:mm'))
        this.dayStartetMoment = date
    },

    getTimeString: function (seconds){
        if(!seconds)
            return "00:00:00/0.00"
        
        var formated = moment.duration(seconds, "seconds").format("HH:mm:ss",{trim: false})
        var decimal = moment.duration(seconds, "seconds").format("h", 2)
        
        return formated + "/" + decimal
    },
    getDecimalDuration(seconds){
        if(!seconds)
          return "0.00"
        var decimal = moment.duration(seconds, "seconds").format("h", 2)
      
        return decimal
    },

    initChart: async function(currentDate){
        var regex =  new RegExp(currentDate.format('YYYY-MM') + '-(.*)');
        var docs = await self.db.find({date: regex})
        var absenceDocs = await self.absenceDb.find({date: regex})
        var absenceData =_.transform(absenceDocs, function(result, value) {
            result[moment(value.date,'YYYY-MM-DD').format('D')-1] = 8;
            return true;
        }, []);
      
        var lastDayOfMonth = currentDate.clone().endOf('month').format('D')
        var data = []
        var groups = _.groupBy(docs,'date')
        var result = _.transform(groups, function(result, value, key) {
            var seconds = _.sumBy(value,'elapsedSeconds')
            var sum = moment.duration(seconds, "seconds").format("h", 2)
            result[moment(key,'YYYY-MM-DD').format('D')] = sum;
            return true;
        }, []);
        for (var i = 0; i < lastDayOfMonth; i++) {
            var value = result[i+1] ? result[i+1].replace(',','.') : 0;
            data[i] = _.toNumber(value)
        }
    
        var daysArray = _.range(1,parseInt(currentDate.clone().endOf('month').format('D'))+1)
        var ctx = document.getElementById("chart").getContext('2d');
        if(self.monthChart != undefined){
            self.monthChart.destroy()
        }
        self.monthChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: daysArray,
            datasets: [
                {
                    data: absenceData,
                    backgroundColor: 'rgb(161, 161, 161)'
                },
                {
                    data: data,
                    backgroundColor: 'rgb(230, 92, 0)'
                }
        ]
        },
        options: {
            legend : {
            display: false
            },
            tooltips:{
            mode: 'nearest',
            callbacks: {
                title: function(tooltipItem, data) {
                var day = tooltipItem[0].xLabel
                var momentObj = currentDate.clone()
                momentObj.date(day)
                momentObj.locale('de')
                return momentObj.format("dddd, DD.MM.YYYY");
                },
                label: function(tooltipItem, data) {
                    if (tooltipItem.datasetIndex == 0) {
                        return tooltipItem.yLabel + ' Stunden abwesend'
                    }
                    return tooltipItem.yLabel + ' Stunden'
                }
            }
            },
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                xAxes: [{
                    stacked: true
                }],
                yAxes: [{
                    stacked: true,
                    ticks: {
                        suggestedMax: 12,
                        min: 0
                    }
    
                }]
            },
            annotation: {
    
                drawTime: 'afterDatasetsDraw',
    
                annotations: [{
                    drawTime: 'afterDraw', // overrides annotation.drawTime if set
                    id: 'a-line-1', // optional
                    type: 'line',
                    mode: 'horizontal',
                    scaleID: 'y-axis-0',
                    value: '8',
                    borderColor: 'rgb(29, 173, 75)',
                    borderWidth: 1,
                borderDash: [2, 2]
                }]
            }
        }
        });
      
      }
}

var nowObservable = interval(1000).pipe(map((x, idx, obs) => moment()))

var nowSubscription = nowObservable.subscribe(
    function (x) {
        var now = x.clone()
        var duration = moment.duration(now.diff(self.dayStartetMoment))
        var timeString = self.getTimeString(duration.asSeconds())
        self.machineRunning(timeString)
    }
);

var dayEndSubscription = combineLatest([
    nowObservable,
    self.timerSumSubject]
).pipe(map(x => ({
    currentTime: x[0],
    timeSumSeconds: x[1]
})))

dayEndSubscription.subscribe(
    function (x) {
        var targetSeconds = 8*60*60
        var diffSeconds = Math.ceil(targetSeconds-x.timeSumSeconds)
        var now = x.currentTime.clone()
        now.add(diffSeconds, 's')
        self.dayEnd(now.format('HH:mm'))
    }
)

var dayEndPlusSubscription = combineLatest([
    nowObservable,
    self.timerSumSubject,
    self.overtimeSubject]
).pipe(map(x => ({
    currentTime: x[0],
    timeSumSeconds: x[1],
    overtimeSeconds: x[2]
})))

dayEndPlusSubscription.subscribe(
    function (x) {
        if(x.overtimeSeconds > 0) {
            self.dayEndPlus('Jetzt')
        } else {
            var now = x.currentTime.clone()
            now.add(Math.abs(x.overtimeSeconds), 's')
            self.dayEndPlus(now.format('HH:mm')+ 'Uhr')
        }
        // var targetSeconds = 8*60*60
        // var diffSeconds = Math.ceil(targetSeconds-(x.timeSumSeconds+x.overtimeSeconds))
        
        // if(diffSeconds > 0)
        //     now.add(diffSeconds, 's')
        // self.dayEndPlus(now.format('HH:mm'))
    }
)

self.timerSumSubject.subscribe(
    function (x) {
        self.rightTimeSum(self.getTimeString(x))
    }
)

self.selectedTimerSumSubject.subscribe(
    function (x) {
        if(x)
            var timeString = self.getTimeString(x)
        self.selectedTimeSum(timeString)
    }
)

self.overtimeSubject.subscribe(
    function (x) {
        if(x)
            var timeString = self.getTimeString(x)
        self.overtime(timeString)
    }
)
