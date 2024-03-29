var moment = require('moment');
var ko = require('knockout');

var self = module.exports = {
    getTimeString: function(seconds){
        if(!seconds)
          return "00:00:00/0.00"
      
        var formated = this.getTimeFormated(seconds)
        var decimal = this.getTimeDecimal(seconds)
      
        return formated + "/" + decimal
    },

    getTimeFormated: function(seconds){
        if(!seconds)
          return "00:00:00"
        var formated = moment.duration(seconds, "seconds").format("HH:mm:ss",{trim: false})
        return formated
    },

    getTimeDecimal: function(seconds){
        if(!seconds)
          return "0.00"
        var decimal = moment.duration(seconds, "seconds").format("h", 2)
        return decimal
    },

    getFormatedDateTime(dateTimeString) {
        return (new moment(dateTimeString)).format('DD.MM.YYYY HH:mm:ss')
    },

    roundDuration(type,value){
        switch (type) {
            case 'round':
                return self.roundNormalDuration(value)
            case 'roundUp':
                return self.roundUpDuration(value)
            case 'roundDown':
                return self.roundDownDuration(value)
            default:
                return undefined
        }
    },

    roundNormalDuration: function(value){
        return (Math.round(value * 4) / 4).toFixed(2)
    },

    roundUpDuration: function(value){
        return (Math.ceil(value * 4) / 4).toFixed(2)
    },

    roundDownDuration: function(value){
        return (Math.floor(value * 4) / 4).toFixed(2)
    },

    jobProperties: ['projectId', 'jobNote', 'lastSync', 'billable'],

    addMissingProperties: function(job) {
        _.defaults(job, { 'ticketId' : ko.observable(), 'projectId' : ko.observable(), 'jobNote': ko.observable(), 'lastSync': ko.observable() });
    },

    durationConvertBack: function(value){
        
        var time = duration.parse(value, "HH:mm:ss")/1000
        if(!time){
            time = duration.parse(value, "HH:mm")/1000
        }
        if(!time){
            time = duration.parse(value, "H:mm")/1000
        }
        if(!time && ((value.match(/,/) && value.match(/,/).length == 1) || parseFloat(value))){
            time = parseFloat(value.replace(',', '.'))*60*60
        }

        if(!time && value <= 0){
            time = 0
        }

        return time
    },

    getRndInteger: function(min, max) {
        return Math.floor(Math.random() * (max - min)) + min;
    }
}