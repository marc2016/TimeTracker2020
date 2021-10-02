const { Observable, Subject, ReplaySubject, from, of, range, timer, interval, never } = require('rxjs');
var Datastore = require('nedb-promises')
const { ipcRenderer } = require('electron')
var log = require('electron-log')

ipcRenderer.on('get-app-path-reply', (event, arg) => {
    
    var userDataPath = arg
    instance.dbJobs = new Datastore({ filename: userDataPath+'/jobs.db', autoload: true });
    instance.dbProjects = new Datastore({ filename: userDataPath+'/projects.db', autoload: true });
    instance.dbTickets = new Datastore({ filename: userDataPath+'/tickets.db', autoload: true });
    instance.dbAbsences = new Datastore({ filename: userDataPath+'/absences.db', autoload: true });
    log.info('BLA'+instance.dbJobs)
})

ipcRenderer.sendSync('get-app-path')

class DataAccess {
    constructor() {
        if (!DataAccess.instance) {
            DataAccess.instance = this;
        }

        this.projectsChanged = new Subject()

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
            default:
                return undefined
        }
    }
}

const instance = new DataAccess();

module.exports = instance;