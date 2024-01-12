var ko = require('knockout');
ko.mapping = require('knockout-mapping')

function applyLabelBinding() {
  ko.bindingHandlers.labelState = {
    init: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      var value = valueAccessor();
      var valueUnwrapped = ko.unwrap(value)
      if(valueUnwrapped)
        $(element).addClass('active')
      else
        $(element).remove('active')

      let control = $(`#${element.htmlFor}`)[0]
      const selectizeInstance = control.selectize
      if(selectizeInstance)
        control = selectizeInstance.$control_input
      $(control).on('focusin', function() {
        $(element).addClass('active');
      })
      
      $(control).on('focusout', function() {
        var value = valueAccessor();
        var valueUnwrapped = ko.unwrap(value)
        if(!valueUnwrapped)
          $(element).removeClass('active');
      })

      ko.utils.domNodeDisposal.addDisposeCallback(element, function() {
        $(control).off('focusin')
        $(control).off('focusout')
      })
    },
    update: function(element, valueAccessor, allBindings, viewModel, bindingContext) {
      var value = valueAccessor();
      var valueUnwrapped = ko.unwrap(value)
      if(valueUnwrapped)
        $(element).addClass('active')
      else
        $(element).remove('active')
    }
  }
}

module.exports = { applyLabelBinding }