/// <reference types="cypress" />
/**
 * ──────────────────────────────────────────────────────────────────────────────
 * ETAPA 1 — EXTRAÇÃO DE ATENDIMENTO
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * O que faz:
 *   1. Recebe uma lista de URLs de atendimentos (ou uma única via variável de env)
 *   2. Autentica no portal de atendimentos
 *   3. Navega pela conversa e captura todas as mensagens
 *   4. Transforma as mensagens em passos estruturados (JSON)
 *   5. Salva o JSON em cypress/fixtures/atendimento_extraido.json
 *
 * Como configurar:
 *   a) Edite a lista `atendimentosParaExtrair` abaixo, OU
 *   b) Passe via variável de ambiente:
 *        CYPRESS_ATENDIMENTO_URL=https://...
 *        CYPRESS_ATENDIMENTO_CENARIO="Nome do cenário"
 *
 * Compatível com a filosofia do extrairTeste.cy.js original.
 * ──────────────────────────────────────────────────────────────────────────────
 */

// ─── Atendimentos ─────────────────────────────────────────────────────────────
import { atendimentos } from "../fixtures/atendimentos.cy.js";

const atendimentosParaExtrair = atendimentos

// ─── Arquivo de saída ─────────────────────────────────────────────────────────
const ARQUIVO_SAIDA = 'cypress/fixtures/atendimento_extraido.json';

// ─── Seletores (ajuste conforme o portal) ─────────────────────────────────────
const SELETORES = {
  mensagens:     'li.message:not(.divider)',
  campoEmail:    '[name="email"]',
  campoSenha:    '[name="password"]',
  botaoLogin:    'button[type="submit"]',
  conteudoMsg:   '.message-content',
  statusMsg:     '#status_msg, .collapse, .timestamp, .message-time',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Extrai mensagens do DOM já carregado.
 * Retorna array de { autor, texto, tipo }.
 */
function extrairMensagensDom($body, botName) {
  const mensagens = [];

  $body.find(SELETORES.mensagens).each((_, el) => {
    const $el = Cypress.$(el);

    const isUsuario = $el.hasClass('right') || $el.hasClass('outgoing');
    const autor = isUsuario ? 'Usuário' : botName;

    const $conteudo = $el.find(SELETORES.conteudoMsg).clone();
    $conteudo.find(SELETORES.statusMsg).remove();
    $conteudo.find('br').replaceWith('\n');

    const texto = $conteudo.text()
      .replace(/\u00A0/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .trim();

    if (!texto) return;

    const isOpcao = $el.find('button, .quick-reply, .option-btn').length > 0;

    mensagens.push({ autor, texto, tipo: isOpcao ? 'opcao' : 'texto' });
  });

  return mensagens;
}

/**
 * Converte array de mensagens em passos de teste.
 */
function construirSteps(mensagens) {
  const steps = [];

  for (let i = 0; i < mensagens.length; i++) {
    const msg = mensagens[i];
    if (msg.autor === 'Usuário') continue;

    const proxima    = mensagens[i + 1];
    const temResposta = proxima?.autor === 'Usuário';

    const chave = msg.texto
      .replace(/\s*\d{5,}.*$/s, '')
      .replace(/[\r\n]+/g, ' ')
      .split(' ')
      .filter(Boolean)
      .slice(0, 4)
      .join(' ')
      .trim();

    steps.push({
      chave,
      textoCompleto: msg.texto,
      input:         temResposta ? proxima.texto : null,
      resposta:      temResposta ? proxima.texto : null,
      tipo:          msg.tipo,
      ignore:        false,
    });
  }

  return steps;
}

/**
 * Monta o objeto JSON final de um atendimento extraído.
 */
function montarObjetoAtendimento({ item, index, steps, mensagens }) {
  const id = `${item.prefixo || 'CT'}-F${String(index + 1).padStart(2, '0')}`;

  return {
    id,
    cenario:           item.cenario,
    caso:              'PREENCHER',
    tipo:              item.tipo    || 'feliz',
    resultadoEsperado: item.resultadoEsperado || '-',
    observacoes:       '[sem observação]',
    defeito:           'N/A',
    urlOrigem:         item.url,
    botName:           item.botName || 'Bot',
    totalMensagens:    mensagens.length,
    totalSteps:        steps.length,
    steps,
    _geradoEm:         new Date().toISOString(),
  };
}

// ─── Suite de testes ──────────────────────────────────────────────────────────

describe('Etapa 1 — Extrator de Atendimentos', () => {

  const atendimentosExtraidos = [];

  atendimentosParaExtrair.forEach((item, index) => {

    it(`Extraindo: ${item.cenario}`, () => {
      cy.on('uncaught:exception', () => false);

      cy.visit(item.url);

      cy.get('body').then(($body) => {
        if ($body.find(SELETORES.campoEmail).length > 0) {
          cy.task('getCredentials').then(({ email, password }) => {
            cy.get(SELETORES.campoEmail).should('be.visible').type(email);
            cy.get(SELETORES.campoSenha).should('be.visible').type(password);
            cy.get(SELETORES.botaoLogin).click();
          });
        }
      });

      cy.get(SELETORES.mensagens, { timeout: 20_000 }).should('exist');

      cy.wait(2000);

      cy.scrollTo('bottom');
      cy.wait(1000);

      cy.get('body').then(($body) => {
        const mensagens = extrairMensagensDom($body, item.botName || 'Bot');
        const steps     = construirSteps(mensagens);
        const obj       = montarObjetoAtendimento({ item, index, steps, mensagens });

        atendimentosExtraidos.push(obj);

        cy.log(`✅ ${obj.id} — ${mensagens.length} mensagens → ${steps.length} steps`);
        cy.log(`📋 Prévia: ${JSON.stringify(obj.steps.slice(0, 3), null, 2)}`);
      });
    });
  });

  after(() => {
    cy.then(() => {
      if (atendimentosExtraidos.length === 0) {
        cy.log('⚠️ Nenhum atendimento extraído. Verifique os seletores e as URLs.');
        return;
      }

      const payload = {
        _metadata: {
          geradoEm:   new Date().toISOString(),
          totalItens: atendimentosExtraidos.length,
          instrucoes: [
            'Preencha o campo "caso" de cada item antes de executar a reprodução.',
            'Ajuste "tipo" para "feliz" ou "excecao" conforme o fluxo.',
            'Marque steps com ignore:true para pular interações específicas.',
          ],
        },
        atendimentos: atendimentosExtraidos,
      };

      cy.writeFile(ARQUIVO_SAIDA, JSON.stringify(payload, null, 2));
      cy.log(`💾 Fixture salva em: ${ARQUIVO_SAIDA}`);
      cy.log(`📊 Total de atendimentos: ${atendimentosExtraidos.length}`);
    });
  });
});