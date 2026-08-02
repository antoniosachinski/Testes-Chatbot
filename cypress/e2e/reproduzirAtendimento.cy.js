/// <reference types="cypress" />
/**
 * ──────────────────────────────────────────────────────────────────────────────
 * ETAPA 2 — REPRODUÇÃO DO ATENDIMENTO + GERAÇÃO DO LOG
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * O que faz:
 *   1. Lê o JSON gerado pela Etapa 1 (atendimento_extraido.json)
 *   2. Para cada atendimento: acessa o ambiente do bot, reproduz o fluxo
 *   3. Ao final de cada teste: gera/atualiza um .txt de log estruturado
 *      (compatível com o formato esperado pelo generateReport.js da Etapa 4)
 *
 * Arquivo de saída:
 *   gerarCaderno/txts/<ID>.txt
 *
 * Cada bloco do .txt segue o formato:
 *   ID               : CT-F01
 *   Caso de teste    : Descrição
 *   Tipo             : feliz | excecao
 *   Resultado Esperado: ...
 *   Status           : Passed | Failed
 *   Data             : ...
 *   Link             : ...
 *   Observações      : ...
 *   Defeito (ID)     : N/A
 *   # Histórico de interações
 *   ...
 *   ---
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { runtimeState } from '../support/commands';

// ─── Configuração ─────────────────────────────────────────────────────────────

const FIXTURE_PATH = 'cypress/fixtures/atendimento_extraido.json';
const LOG_DIR = 'gerarCaderno/txts';

/**
 * Configuração do ambiente do bot.
 * Pode ser sobrescrita por variáveis de ambiente CYPRESS_*.
 */
const BOT_CONFIG = {
  url: Cypress.env('BOT_URL'),
  saudacaoBot: Cypress.env('BOT_SAUDACAO'),
  seletorAgente: Cypress.env('BOT_SELETOR_AG') || '#agent2',
  codigoAgente: Cypress.env('BOT_CODIGO_AG'),
};

// ─── Helpers de log ───────────────────────────────────────────────────────────

/**
 * Formata o bloco .txt de um caso de teste.
 * O formato é consumido diretamente pelo generateReport.js (Etapa 4).
 */
function formatarBlocoLog({ atendimento, status, link, historico }) {
  const data = new Date().toLocaleString('pt-BR');
  const id = atendimento.id || 'SEM-ID';

  const linhas = [
    `ID               : ${id}`,
    `Caso de teste    : ${atendimento.cenario || '—'}`,
    `Tipo             : ${atendimento.tipo || 'feliz'}`,
    `Resultado Esperado: ${atendimento.resultadoEsperado || (status === 'passed' ? 'Fluxo reproduzido com sucesso' : 'Verificar falha no log do Cypress')}`,
    `Status           : ${status === 'passed' ? 'Passed' : 'Failed'}`,
    `Data             : ${data}`,
    `Link             : ${link || 'Link não capturado'}`,
    `Observações      : ${atendimento.observacoes || '[sem observação]'}`,
    `Defeito (ID)     : ${atendimento.defeito || 'N/A'}`,
    '',
    '# Histórico de interações',
    historico || '(nenhuma interação registrada)',
    '',
    '---',
    '',
  ];

  return linhas.join('\n');
}

/**
 * Formata o cabeçalho do arquivo .txt (gerado uma vez por arquivo).
 */
function formatarCabecalhoTxt(atendimento) {
  return [
    `# ─────────────────────────────────────────────────────────────`,
    `# Atendimento: ${atendimento.cenario}`,
    `# URL origem : ${atendimento.urlOrigem || '-'}`,
    `# Gerado em  : ${new Date().toISOString()}`,
    `# Formato    : compatível com generateReport.js (Etapa 4)`,
    `# ─────────────────────────────────────────────────────────────`,
    '',
    `Regra: Fluxo reproduzido automaticamente via Cypress`,
    '',
    '---',
    '',
  ].join('\n');
}

// ─── Suite dinâmica — gerada a partir do JSON ─────────────────────────────────

let atendimentosFixture = [];

try {
  atendimentosFixture = require('../fixtures/atendimento_extraido.json')?.atendimentos || [];
} catch (e) {
  // Silencia: o arquivo será lido via cy.readFile no before()
}

if (atendimentosFixture.length === 0) {

  describe('Etapa 2 — Reprodução de Atendimentos', () => {

    let atendimentos = [];

    before(() => {
      cy.readFile(FIXTURE_PATH).then((payload) => {
        atendimentos = payload.atendimentos || [];
        cy.log(`📂 ${atendimentos.length} atendimento(s) carregados da fixture.`);
      });
    });

    it('Aguardando carregamento da fixture...', () => {
      cy.log('Este teste garante que a fixture foi lida antes da suíte dinâmica.');
      cy.log('Execute novamente após a Etapa 1 gerar o arquivo.');
    });
  });

} else {

  // ── Suite dinâmica principal ─────────────────────────────────────────────

  for (const atendimento of atendimentosFixture) {

    describe(`Atendimento — ${atendimento.cenario}`, () => {

      const logPath = `${LOG_DIR}/${atendimento.id}.txt`;
      let cabecalhoEscrito = false;

      beforeEach(() => {
        cy.resetColetaDados();
        cy.captureChatValidationData();
      });

      afterEach(function () {
        const status = this.currentTest.state;
        const link = runtimeState.chatConversationLink || 'Link não capturado';

        const historico = runtimeState.logEntries
          .map(entry => {
            const icone = entry.tipo === 'bot' ? '🤖 BOT   ' :
              entry.tipo === 'usuario' ? '👤 USUÁRIO' : '🔘 OPÇÃO  ';
            return `  [${entry.timestamp}] ${icone}: ${entry.conteudo}`;
          })
          .join('\n');

        const bloco = formatarBlocoLog({ atendimento, status, link, historico });

        cy.task('ensureFile', { filePath: logPath, defaultContent: '' }).then(() => {
          if (!cabecalhoEscrito) {
            cabecalhoEscrito = true;
            const cabecalho = formatarCabecalhoTxt(atendimento);
            cy.task('appendLog', { filePath: logPath, content: cabecalho });
          }
          cy.task('appendLog', { filePath: logPath, content: bloco });
        });

        cy.log(`📄 Log atualizado: ${logPath} | Status: ${status} | Link: ${link}`);
      });

      it(`${atendimento.id}: ${atendimento.caso || 'Reprodução automática'}`, function () {
        cy.iniciarBot();

        for (const step of atendimento.steps) {
          if (step.ignore) {
            cy.log(`⏭️ Step ignorado: "${step.chave}"`);
            continue;
          }
          if (step.input !== null) {
            cy.InputForMessage(step.chave, step.input);
          } else {
            cy.verifyChatMessage(step.chave);
          }
        }

        cy.wait(10000);
      });
    });
  }
}