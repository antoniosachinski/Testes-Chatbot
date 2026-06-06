// cypress/support/e2e.js
import './commands';

// Suprime erros não capturados do site alvo (chatbots frequentemente lançam erros de terceiros)
Cypress.on('uncaught:exception', (err) => {
  console.warn('[uncaught:exception] Ignorado:', err.message);
  return false;
});
