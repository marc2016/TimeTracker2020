var Moment = require('moment-business-days');
const MomentRange = require('moment-range');
const moment = MomentRange.extendMoment(Moment);
var Holidays = require('date-holidays')

var dataAccess = require('./dataaccess.js')


var self = module.exports = {
  getDaysUntil: function(start, end) {
    if(!start)
      start = moment().startOf('month')
    if(!end)
      end = moment()
    var daysUntilToday = 0
    var rangeUntilToday = moment.range(start, end);
    for (let day of rangeUntilToday.by('day')) {
        if(day.isBusinessDay()) {
            daysUntilToday += 1
        }
    }
    return daysUntilToday
  },

  getAbsenceDays: async function(start, end) {
    var db_absences = dataAccess.getDb('absences')
    if(!start)
      start = moment().startOf('month')
    if(!end)
      end = moment()
    var range = moment.range(start, end);
    var absenceDays = 0
    var days = Array.from(range.by('day'));
    var dates = days.map(m => m.format('YYYY-MM-DD'))
    var absenceDocs = await db_absences.find({date: { $in: dates}})
    _.forEach(absenceDocs, (value) => {
        var dateFromDb = moment(value.date)
        if(dateFromDb.isBusinessDay()) {
            absenceDays += 1
        }
    })
    return absenceDays
  }
}