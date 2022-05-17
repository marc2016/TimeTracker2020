var Datastore = require('nedb-promises')
const { ipcRenderer } = require('electron')
var log = require('electron-log')
class DataAccess {
    constructor() {
        if (!DataAccess.instance) {
            DataAccess.instance = this;
        }
        return DataAccess.instance;
    }

    getDb(name) {
        switch(name){
            case 'jobs':
                return this.dbJobs
            case 'projects':
                return this.dbProjects
            case 'tickets':
                return this.dbTickets
            case 'absences':
                return this.dbAbsences
            case 'timertemplates':
                return this.dbTimerTemplates
            default:
                return undefined
        }
    }
}

const instance = new DataAccess();
module.exports = instance;

ipcRenderer.on('get-app-path-reply', (event, arg) => {
    var userDataPath = arg
    instance.dbJobs = new Datastore({ filename: userDataPath+'/jobs.db', autoload: true });
    instance.dbProjects = new Datastore({ filename: userDataPath+'/projects.db', autoload: true });
    instance.dbTickets = new Datastore({ filename: userDataPath+'/tickets.db', autoload: true });
    instance.dbAbsences = new Datastore({ filename: userDataPath+'/absences.db', autoload: true });
    instance.dbTimerTemplates = new Datastore({ filename: userDataPath+'/timertemplates.db', autoload: true });

    instance.dbJobs.ensureIndex({ fieldName: 'date' }, function (err) {});
})

ipcRenderer.send('get-app-path')

