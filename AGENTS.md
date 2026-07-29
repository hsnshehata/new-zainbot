# Interface language contract

Every user-visible interface addition in this project must ship in Arabic and
English in the same change.

- Put markup text behind `data-i18n` keys.
- Put translated placeholders and accessible labels behind
  `data-i18n-placeholder` and `data-i18n-aria` keys.
- Add each key to both `en` and `ar` in `public/js/dashboard_new.js`.
- Do not add hard-coded user-visible English or Arabic text to a page, modal,
  menu, button, validation message, or dynamic UI renderer.
- Run `tests/dashboardTranslations.test.js` before committing dashboard work.
