var ko = require('knockout');
ko.mapping = require('knockout-mapping')
var BaseViewModel = require('./base.js')
var _ = require('lodash');
var Holidays = require('date-holidays')

class AppSettings extends BaseViewModel {

    onLoad() {
        super.onLoad()
    }

    show(){
        this.onLoad()
        $('#appSettings').removeClass('invisible')
    }
    
    hide(){
        $('#appSettings').addClass('invisible')
    }

    backgroundChanged(that,data){
        _.forEach(that.backgrounds(), function(value) {value.selected(false)})
        data.selected(true)
        that.store.set('backgroundSrc', data.src)
        that.store.set('backgroundId', data.id)
    }

    loadBackgrounds(){
        this.backgrounds = ko.observableArray()
        this.backgrounds.push({ src: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNU0muuBwACoQFU1w38PAAAAABJRU5ErkJggg==', id:0, selected: ko.observable(false)})
        this.backgrounds.push({ src: './backgrounds/01.jpg', id:1, selected: ko.observable(false)})
        this.backgrounds.push({ src: './backgrounds/02.jpg', id:2, selected: ko.observable(false)})
        this.backgrounds.push({ src: './backgrounds/03.jpg', id:3, selected: ko.observable(false)})
        this.backgrounds.push({ src: './backgrounds/04.jpg', id:4, selected: ko.observable(false)})
        this.backgrounds.push({ src: './backgrounds/05.jpg', id:5, selected: ko.observable(false)})
        this.backgrounds.push({ src: './backgrounds/wood.png', id:6, selected: ko.observable(false)})
        if(this.store.get('backgroundId')){
            var that = this
            var element = ko.utils.arrayFirst(this.backgrounds(), function(item){ return item.id ==  that.store.get('backgroundId')})
            element.selected(true)
        }
    }

    constructor(views, store){
        super(views)
        
        $('#appSettings').load('pages/appsettings.html', function(){
            this.hide()
            this.store = store
            this.self = this

            this.hd = new Holidays()

            $("#selectImage").imagepicker({
                hide_select: true
            });

            this.loadBackgrounds()

            this.countries = ko.computed(function() {
                var tmpContries = new Array()
                _.forIn(this.hd.getCountries(), function(value, key) {
                    var newObj = new Object()
                    newObj["id"] = key
                    newObj["name"] = value
                    tmpContries.push(newObj)
                });
                return tmpContries
            }, this);

            this.selectedCountry = ko.computed({
                read: function () {
                    return this.store.get('selectedCountry', 'DE');
                },
                write: function (value) {
                    this.store.set('selectedCountry', value)
                    this.states(this.getStates(value))
                },
                owner: this
            }).extend({ notify: 'always' });

            this.states = ko.observable()
            this.states(this.getStates(this.selectedCountry()))

            this.selectedState = ko.pureComputed({
                read: function () {
                    return this.store.get('selectedState', 'NW');
                },
                write: function (value) {
                    if(value){
                        this.store.set('selectedState', value)
                    } else {
                        this.store.delete('selectedState')
                    }
                },
                owner: this
            });

            this.roundDuration = ko.pureComputed({
                read: function () {
                    return this.store.get('roundDuration', 'round');
                },
                write: function (value) {
                    this.store.set('roundDuration', value)
                },
                owner: this
            });

            this.copyJobFormat = ko.pureComputed({
                read: function () {
                    return this.store.get('copyJobFormat', 'copyJobFormatPlaintext');
                },
                write: function (value) {
                    this.store.set('copyJobFormat', value)
                },
                owner: this
            });
            
            this.timerNotificationsEnabled = ko.pureComputed({
                read: function () {
                    return this.store.get('timerNotificationsEnabled', false);
                },
                write: function (value) {
                    this.store.set('timerNotificationsEnabled', value)
                },
                owner: this
            });

            this.timerNotificationsInterval = ko.pureComputed({
                read: function () {
                    return this.store.get('timerNotificationsInterval', 600000)/60000;
                },
                write: function (value) {
                    this.store.set('timerNotificationsInterval', value*60000)
                },
                owner: this
            });

        }.bind(this))
        
    }

    getStates(country) {   
        if(!country)
            return undefined
        var tmpStates = new Array()
        _.forIn(this.hd.getStates(country), function(value, key) {
            var newObj = new Object()
            newObj["id"] = key
            newObj["name"] = value
            tmpStates.push(newObj)
        });
        return tmpStates
    }

    roundDurationClick(value, data){
        this.roundDuration(value)
    }

    copyJobFormatClick(value, data){
        this.copyJobFormat(value)
    }
}

module.exports = AppSettings;