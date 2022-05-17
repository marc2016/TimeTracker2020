const dataAccess = require('../dataaccess.js')
var ko = require('knockout');
ko.mapping = require('knockout-mapping')

async function createTimerTemplateList() {
  const db_timertemplates = dataAccess.getDb('timertemplates')
  var docs = await db_timertemplates.find({})
  docs = _.sortBy(docs, 'description')
  var observableDocs = ko.mapping.fromJS(docs)

  return observableDocs
}

async function insertTimerTemplate(description, projectId) {
  if(!description)
    return null
  const db_timertemplates = dataAccess.getDb('timertemplates')
  const newEntry = { description: description, projectId: projectId ? projectId : null }
  const newDbEntry = await db_timertemplates.insert(newEntry)
  var observableDoc = ko.mapping.fromJS(newDbEntry)
  return observableDoc
}

async function deleteTimerTemplate(id) {
  if(!id)
    return
  const db_timertemplates = dataAccess.getDb('timertemplates')
  await db_timertemplates.remove({ _id: id }, {})
}

module.exports = { createTimerTemplateList, insertTimerTemplate, deleteTimerTemplate }