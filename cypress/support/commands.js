// ***********************************************
// cypress/support/commands.js
//
// Camadas:
//   [AUTH]        — autenticação no portal de conversas
//   [EXTRATOR]    — captura de mensagens do portal
//   [REPRODUTOR]  — interação com o widget do bot
//   [LOG]         — coleta e persistência de dados de teste
// ***********************************************

// ─── Estado em memória (compartilhado via import) ─────────────────────────────
export const runtimeState = {
  chatConversationLink: null,
  dadosExtracao: null,
  logEntries: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// [AUTH] Autenticação no portal de atendimentos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Autentica no portal utilizando as credenciais configuradas.
 * Aguarda o redirecionamento pós-login antes de prosseguir.
 */
Cypress.Commands.add('autenticarPortal', (email, password) => {
  cy.get('[name="email"]').should('be.visible').type(email);
  cy.get('[name="password"]').should('be.visible').type(password);
  cy.get('button[type="submit"]').click();
  // Aguarda algum elemento pós-login aparecer
  cy.get('body', { timeout: 20_000 }).should('not.contain', 'Entrar');
});

// ─────────────────────────────────────────────────────────────────────────────
// [EXTRATOR] Captura de mensagens do portal de atendimentos
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aguarda as mensagens carregarem e as captura do DOM.
 * Retorna um array de objetos { autor, texto, tipo }.
 *
 * @param {string} seletorMensagens  — seletor CSS dos itens de mensagem
 * @param {string} botName           — nome/alias do bot para identificar autor
 */
Cypress.Commands.add(
  'capturarMensagensDom',
  (seletorMensagens = 'li.message:not(.divider)', botName = 'Bot') => {
    cy.get(seletorMensagens, { timeout: 20_000 }).should('exist');

    return cy.get('body').then(($body) => {
      const mensagens = [];

      $body.find(seletorMensagens).each((_, el) => {
        const $el = Cypress.$(el);

        // Detecta direção: mensagens à direita geralmente são do usuário
        const isUsuario = $el.hasClass('right') || $el.hasClass('outgoing');
        const autor = isUsuario ? 'Usuário' : botName;

        // Clona e limpa elementos de status/collapse antes de ler o texto
        const $clone = $el.find('.message-content, .message-body, .chat-bubble').first().clone();
        $clone.find('[id^="status"], .collapse, .timestamp, .message-time').remove();
        $clone.find('br').replaceWith('\n');

        const texto = $clone.text().replace(/\u00A0/g, ' ').replace(/\s+/g, ' ').trim();
        if (!texto) return; // ignora mensagens vazias

        // Detecta se é uma opção de seleção (botão/quick-reply)
        const isOpcao = $el.find('button, .quick-reply, .option-btn').length > 0;

        mensagens.push({ autor, texto, tipo: isOpcao ? 'opcao' : 'texto' });
      });

      return mensagens;
    });
  }
);

/**
 * Transforma o array de mensagens brutas em passos estruturados para reprodução.
 * Cada passo contém:
 *   - chave:        primeiras palavras do bot para match parcial no cy.contains()
 *   - input:        resposta do usuário (null = apenas verificar exibição)
 *   - textoCompleto: mensagem do bot na íntegra
 *   - resposta:      resposta do usuário na íntegra
 */
Cypress.Commands.add('buildSteps', (mensagens, botName = 'Bot') => {
  return cy.wrap(null).then(() => {
    const steps = [];

    for (let i = 0; i < mensagens.length; i++) {
      const msg = mensagens[i];
      if (msg.autor === 'Usuário') continue; // processa apenas perguntas do bot

      const proxima = mensagens[i + 1];
      const temResposta = proxima?.autor === 'Usuário';

      // Usa as primeiras 4 palavras para match parcial no cy.contains()
      const chave = msg.texto
        .replace(/\s*[\d]{4,}.*$/s, '') // remove sequências numéricas longas (protocolos)
        .split(' ')
        .slice(0, 4)
        .join(' ')
        .trim();

      steps.push({
        chave,
        textoCompleto: msg.texto,
        input: temResposta ? proxima.texto : null,
        resposta: temResposta ? proxima.texto : null,
        tipo: msg.tipo,
        ignore: false,
      });
    }

    return steps;
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [REPRODUTOR] Interação com widget do bot
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reinicia o estado de coleta entre testes.
 */
Cypress.Commands.add('resetColetaDados', () => {
  runtimeState.chatConversationLink = null;
  runtimeState.dadosExtracao = null;
  runtimeState.logEntries = [];
});

/**
 * Intercepta o console.log do bot para capturar o link da conversa gerada.
 */
Cypress.Commands.add('captureChatValidationData', () => {
  cy.on('window:before:load', (win) => {
    const originalLog = win.console.log;
    win.console.log = (...args) => {
      args.forEach((arg) => {
        // Captura link de conversa em objetos estruturados
        if (typeof arg === 'object' && arg !== null && arg.linkConversation) {
          runtimeState.chatConversationLink = arg.linkConversation;
          Cypress.log({ name: 'ConversationLink', message: arg.linkConversation });
        }
        // Captura link de conversa em strings
        if (typeof arg === 'string') {
          const match = arg.match(/https?:\/\/.*conversation\/view\/[^\s"]+/);
          if (match) {
            runtimeState.chatConversationLink = match[0];
            Cypress.log({ name: 'ConversationLink', message: match[0] });
          }
        }
      });
      originalLog.apply(win.console, args);
    };
  });
});

/**
 * Verifica que uma mensagem do bot está visível.
 * Usa match parcial para robustez.
 */
Cypress.Commands.add('verifyChatMessage', (texto, opts = {}) => {
  const { timeout = 60_000 } = opts;
  cy.contains(texto, { timeout }).should('be.visible').then(() => {
    cy.log(`✅ Mensagem visível: "${texto}"`);
    runtimeState.logEntries.push({ tipo: 'bot', conteudo: texto, timestamp: new Date().toISOString() });
  });
});

/**
 * Aguarda uma mensagem do bot, digita uma resposta e envia.
 */
Cypress.Commands.add('InputForMessage', (pergunta, resposta, opts = {}) => {
  const { timeout = 60_000 } = opts;

  cy.contains(pergunta, { timeout }).should('be.visible').then(() => {
    cy.log(`🤖 Bot: "${pergunta}"`);
    runtimeState.logEntries.push({ tipo: 'bot', conteudo: pergunta, timestamp: new Date().toISOString() });
  });

  cy.wait(500);

  cy.get('.input-group input, [data-testid="chat-input"], input[type="text"]', { timeout })
    .should('not.be.disabled')
    .clear()
    .type(resposta);

  cy.wait(300);

  cy.get('#widgetSendButton, [data-testid="send-button"], button[type="submit"]', { timeout })
    .first()
    .click();

  cy.log(`👤 Usuário: "${resposta}"`);
  runtimeState.logEntries.push({ tipo: 'usuario', conteudo: resposta, timestamp: new Date().toISOString() });
});

/**
 * Seleciona uma opção de menu/botão no chat.
 */
Cypress.Commands.add('selecionarOpcaoChat', (textoOpcao, opts = {}) => {
  const { timeout = 60_000 } = opts;
  cy.contains('button, .quick-reply, .option-btn', textoOpcao, { timeout })
    .should('be.visible')
    .click();
  cy.log(`🔘 Opção selecionada: "${textoOpcao}"`);
  runtimeState.logEntries.push({ tipo: 'opcao', conteudo: textoOpcao, timestamp: new Date().toISOString() });
});

/**
 * Acessa o ambiente do bot com seleção de agente.
 * Lê variáveis de ambiente via cy.task('getBotEnv') — roda no Node, acesso garantido ao .env.
 * Aceita overrides pontuais via parâmetro `opcoes`.
 */
Cypress.Commands.add('iniciarBot', () => {
  cy.task('getBotEnv').then((env) => {
    if (!env.url) throw new Error('BOT_URL não definida. Verifique o .env e a task getBotEnv no cypress.config.js');

    cy.visit(env.url);
    cy.contains(env.saudacao, { timeout: 30_000 }).should('be.visible');
    cy.get(env.seletorAg).click();
    cy.wait(500);
    cy.get('.input-group input, [data-testid="chat-input"]').type(env.codigoAg);
    cy.wait(500);
    cy.get('#widgetSendButton, [data-testid="send-button"]').first().click();
    cy.log(`🚀 Bot iniciado com agente: ${env.codigoAg}`);

    if (env.menu5050Opcao != null) {
      cy.InputForMessage(env.menu5050Pergunta, env.menu5050Opcao);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [LOG] Coleta e geração do arquivo de log estruturado
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Gera o bloco de log estruturado de um caso de teste.
 * O formato é compatível com o parser do generateReport.js.
 */
Cypress.Commands.add('gerarBlocoLog', (dadosTeste, status, link) => {
  return cy.wrap(null).then(() => {
    const data = new Date().toLocaleString('pt-BR');
    const id = dadosTeste.id || dadosTeste.cenario?.replace(/\s+/g, '-').toUpperCase() || 'SEM-ID';

    const resultadoEsperado =
      dadosTeste.resultadoEsperado ||
      (status === 'passed' ? 'Fluxo reproduzido com sucesso' : 'Verificar falha no log do Cypress');

    // Constrói histórico de mensagens
    const historico = (dadosTeste.steps || [])
      .filter((s) => !s.ignore)
      .map((s) => {
        const linhas = [`  🤖 BOT   : ${s.textoCompleto || s.chave}`];
        if (s.resposta) linhas.push(`  👤 USUÁRIO: ${s.resposta}`);
        return linhas.join('\n');
      })
      .join('\n');

    const bloco = [
      `ID               : ${id}`,
      `Caso de teste    : ${dadosTeste.cenario || '—'}`,
      `Tipo             : ${dadosTeste.tipo || 'feliz'}`,
      `Resultado Esperado: ${resultadoEsperado}`,
      `Status           : ${status === 'passed' ? 'Passed' : 'Failed'}`,
      `Data             : ${data}`,
      `Link             : ${link || 'Link não capturado'}`,
      `Observações      : ${dadosTeste.observacoes || '[sem observação]'}`,
      `Defeito (ID)     : ${dadosTeste.defeito || 'N/A'}`,
      '',
      '# Histórico de interações',
      historico,
      '',
      '---',
      '',
    ].join('\n');

    return bloco;
  });
});

Cypress.Commands.add('iniciarAgente5050', () => {
  cy.task('getBotEnv').then((env) => {
    cy.iniciarBot({ codigoAgente: env.codigoAg5050 });
    cy.InputForMessage(env.menu5050Pergunta, env.menu5050Opcao);
  });
});