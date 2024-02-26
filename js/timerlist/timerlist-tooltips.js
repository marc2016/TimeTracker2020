var tippy = require('tippy.js')

function setTooltipsForJobTimer() {
  const tippySettings = {
    theme: 'light-border',
    placement: 'bottom',
  }

  // Buttons for timer
  tippy.default('.job-duration-button', {
    content: 'Zeit des Timers anpassen',
    ...tippySettings
  })
  tippy.default('.job-datepicker-grid', {
    content: 'Timer auf einen anderen Tag ändern.',
    ...tippySettings
  })

  // Buttons for descriptions
  tippy.default('.job-note-button', {
    content: 'Notiz zu Timer hinzufügen.',
    ...tippySettings
  })
  tippy.default('.job-descriptions-to-ticket-button', {
    content: 'Tätigkeit vom Timer auf das Ticket des Timers übertragen.',
    ...tippySettings
  })
  tippy.default('.job-descriptions-to-ticket-button', {
    content: 'Tätigkeit vom Timer auf das Ticket des Timers übertragen.',
    ...tippySettings
  })

  // Buttons for tickets
  tippy.default('.ticket-link-button', {
    content: 'Öffne das Ticket im Ticket-System.',
    ...tippySettings
  })
  tippy.default('.ticket-copy-name-button', {
    content: 'Kopiere den Namen des Tickets.',
    ...tippySettings
  })
  tippy.default('.ticket-copy-id-button', {
    content: 'Kopiere nur die ID des Tickets.',
    ...tippySettings
  })

  // Control buttons right
  tippy.default('.timer-play-btn', {
    content: 'Zeitmessung mit diesem Timer starten.',
    ...tippySettings
  })
  tippy.default('.timer-pause-btn', {
    content: 'Zeitmessung mit diesem Timer pausieren.',
    ...tippySettings
  })
  tippy.default('.timer-delete-button', {
    content: 'Timer löschen.',
    ...tippySettings
  })
  tippy.default('.timer-copy-button', {
    content: 'Timer Informationen in Zwischenablage kopieren.',
    ...tippySettings
  })
  tippy.default('.timer-pin-button', {
    content: 'Tätigkeiten des Timers als Vorlage speichern.',
    ...tippySettings
  })
}

module.exports = { setTooltipsForJobTimer }