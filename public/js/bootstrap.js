// Loaded synchronously in the head, before any form can be submitted.
document.addEventListener('submit', function preventSubmission(event) {
  event.preventDefault();
}, true);
