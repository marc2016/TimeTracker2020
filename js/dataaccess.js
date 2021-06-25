const { Observable, Subject, ReplaySubject, from, of, range, timer, interval, never } = require('rxjs');
var Datastore = require('nedb-promise')
const remote = require('electron').remote;
const app = remote.app;

class DataAccess {
    constructor() {
        if (!DataAccess.instance) {
            DataAccess.instance = this;
        }

        var userDataPath = app.getPath('userData')+'/userdata/'
        this.dbJobs = new Datastore({ filename: userDataPath+'/jobs.db', autoload: true });
        this.dbProjects = new Datastore({ filename: userDataPath+'/projects.db', autoload: true });
        this.dbTickets = new Datastore({ filename: userDataPath+'/tickets.db', autoload: true });

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
            default:
                return undefined
        }
    }
}

const instance = new DataAccess();

Object.freeze(instance);

module.exports = instance;