/**
 * ──────────────────────────────────────────────────────────────────────────────
 * ETAPA 4 — GERADOR DE CADERNO DE TESTES
 * ──────────────────────────────────────────────────────────────────────────────
 *
 * Uso  : node generateReport.js [--dir ./txts] [--out Caderno.docx]
 * Requer: npm install docx
 *
 * Diferenças da versão anterior:
 *   ✅ Orientado por dados — não exige nomes fixos de arquivos
 *   ✅ Detecta automaticamente todos os .txt na pasta
 *   ✅ Extrai metadados do cabeçalho do .txt (se disponível)
 *   ✅ Compatível com o formato gerado pela Etapa 2
 *   ✅ Também compatível com .txt criados manualmente
 *   ✅ Inclui seção de Histórico de Interações no detalhado
 *   ✅ Parâmetros via CLI e via config object
 * ──────────────────────────────────────────────────────────────────────────────
 */

const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  VerticalAlign, Header, Footer, TabStopType, TabStopPosition, SimpleField,
} = require('docx');
const fs   = require('fs');
const path = require('path');

// ─── CLI Args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argDir = args[args.indexOf('--dir') + 1];
const argOut = args[args.indexOf('--out') + 1];

// ─── Configuração ─────────────────────────────────────────────────────────────
const CONFIG = {
  txtDir:  argDir || './gerarCaderno/txts',
  outFile: argOut || 'Caderno_de_Testes_Final.docx',
  docInfo: {
    titulo:     'Caderno de Testes — Execuções Chatbot',
    subtitulo:  'Gerado automaticamente via Cypress  |  Atendimentos extraídos e reproduzidos',
    versao:     'V1',
    processo:   'Atendimento via Chatbot',
    ambiente:   'Homologação',
    plataforma: 'Chatbot / Widget Web',
  },
};

// ─── Constantes de estilo ─────────────────────────────────────────────────────
const FONT           = 'Arial';
const COLOR_GREEN    = '1A5C38';
const COLOR_GRAY     = '595959';
const COLOR_BLACK    = '000000';
const COLOR_WHITE    = 'FFFFFF';
const FILL_HEADER    = '1A5C38';
const FILL_KEY_DARK  = 'D7F0DC';
const FILL_KEY_LIGHT = 'E8F5E9';
const FILL_VAL_DARK  = 'F1F8F2';
const FILL_VAL_LIGHT = 'FFFFFF';
const FILL_EXCECAO_H = '3B5998';
const FILL_EXCECAO_L = 'DCE4F7';
const FILL_HISTORICO = 'F5F5F5';
const BORDER_GRAY    = { style: BorderStyle.SINGLE, size: 0, color: 'BFBFBF' };

// ─── Larguras DXA ─────────────────────────────────────────────────────────────
const TABLE_CT_WIDTH   = 10080;
const COL_ID_W         = 900;
const COL_CASO_W       = 1800;
const COL_ESPERADO_W   = 2200;
const COL_LINK_W       = 3070;
const COL_STATUS_W     = 1110;
const TABLE_ID_WIDTH   = 9360;
const COL_KEY_WIDTH    = 2600;
const COL_VAL_WIDTH    = 6760;
const TABLE_RESUMO_W   = 6000;
const COL_R_LABEL_W    = 3600;
const COL_R_VAL_W      = 2400;

// ─── Helpers de construção de células ─────────────────────────────────────────
const borders = () => ({
  top:    BORDER_GRAY,
  bottom: BORDER_GRAY,
  left:   BORDER_GRAY,
  right:  BORDER_GRAY,
});

function makeCell(text, opts = {}) {
  const {
    width, fill = 'FFFFFF', bold = false, color = COLOR_BLACK,
    size = 18, center = false, marginTop = 80, marginBottom = 80,
    colSpan, italic = false,
  } = opts;
  return new TableCell({
    width:         width ? { size: width, type: WidthType.DXA } : undefined,
    borders:       borders(),
    shading:       { fill, type: ShadingType.CLEAR, color: 'auto' },
    margins:       { top: marginTop, bottom: marginBottom, left: 120, right: 120 },
    verticalAlign: VerticalAlign.CENTER,
    columnSpan:    colSpan,
    children: [new Paragraph({
      alignment: center ? AlignmentType.CENTER : AlignmentType.LEFT,
      children:  [new TextRun({ text: String(text ?? ''), font: FONT, size, bold, color, italics: italic })],
    })],
  });
}

function headerCell(text, width, fill = FILL_HEADER) {
  return makeCell(text, {
    width, fill, bold: true, color: COLOR_WHITE,
    size: 17, center: true, marginTop: 100, marginBottom: 100,
  });
}

const emptyPar = (after = 80) => new Paragraph({ spacing: { after } });

function fieldParagraph(label, value = '') {
  return new Paragraph({
    spacing: { before: 40, after: 40 },
    children: [
      new TextRun({ text: `${label}: `, font: FONT, size: 20, bold: true, color: COLOR_GREEN }),
      new TextRun({ text: String(value),  font: FONT, size: 20, color: COLOR_BLACK }),
    ],
  });
}

function caseHeading(text) {
  return new Paragraph({
    spacing: { before: 200, after: 120 },
    children: [new TextRun({ text, font: FONT, size: 24, bold: true, color: COLOR_GREEN })],
  });
}

function sectionLabel(text, fill, textColor) {
  return new Table({
    width: { size: TABLE_CT_WIDTH, type: WidthType.DXA },
    columnWidths: [TABLE_CT_WIDTH],
    rows: [new TableRow({ children: [
      makeCell(text, {
        width: TABLE_CT_WIDTH, fill, bold: true,
        color: textColor, size: 18, center: true,
        marginTop: 100, marginBottom: 100,
      }),
    ]})],
  });
}

// ─── Parser do .txt ───────────────────────────────────────────────────────────

/**
 * Lê um arquivo .txt e extrai:
 *   - tests: array de objetos de caso de teste
 *   - regra: regra global do arquivo (se houver)
 *   - meta:  metadados extraídos do cabeçalho (# ...)
 */
function parseScenarioFile(content) {
  const tests = [];
  let current = null;
  let globalRegra = '';
  let meta = {};
  let historicoMode = false;
  let historicoBuffer = [];

  const flush = () => {
    if (current) {
      if (historicoBuffer.length > 0) {
        current.Historico = historicoBuffer.join('\n');
        historicoBuffer = [];
        historicoMode = false;
      }
      tests.push(current);
      current = null;
    }
  };

  for (const raw of content.split('\n')) {
    const line = raw.replace(/\r$/, '');

    // Comentários de cabeçalho — extrai metadados
    if (line.startsWith('#')) {
      const metaMatch = line.match(/^#\s*([\w\s]+)\s*:\s*(.+)$/);
      if (metaMatch) {
        meta[metaMatch[1].trim()] = metaMatch[2].trim();
      }
      continue;
    }

    // Separador de blocos
    if (line.trim() === '---') { flush(); continue; }
    if (!line.trim()) {
      if (historicoMode && current) {
        historicoBuffer.push('');
      }
      continue;
    }

    // Modo histórico de interações
    if (historicoMode && current) {
      if (line.trim().startsWith('ID ') || line.trim().match(/^ID\s*:/)) {
        flush();
        historicoMode = false;
      } else {
        historicoBuffer.push(line.trimEnd());
        continue;
      }
    }

    // Detecta início da seção histórico
    if (line.trim() === '# Histórico de interações' || line.trim() === '# Historico de interacoes') {
      historicoMode = true;
      continue;
    }

    const colon = line.indexOf(':');
    if (colon === -1) continue;

    const key   = line.slice(0, colon).trim().toLowerCase().replace(/\s+/g, ' ');
    const value = line.slice(colon + 1).trim();

    if (key === 'regra' && !current) { globalRegra = value; continue; }

    if (key === 'id') {
      flush();
      current = {
        ID: value, Caso: '', Tipo: 'feliz',
        ResultadoEsperado: '-',
        Status: '', Data: '', Link: '',
        Obs: '[sem observação]', Defeito: 'N/A',
        Regra: globalRegra, Historico: '',
      };
    } else if (!current) {
      continue;
    } else {
      switch (key) {
        case 'caso de teste':         current.Caso              = value; break;
        case 'tipo':                  current.Tipo              = value.toLowerCase(); break;
        case 'resultado esperado':    current.ResultadoEsperado = value || '-'; break;
        case 'status':                current.Status            = value; break;
        case 'data':                  current.Data              = value; break;
        case 'link':                  current.Link              = value; break;
        case 'observações':
        case 'observacoes':           current.Obs               = value || '[sem observação]'; break;
        case 'defeito (id)':
        case 'defeito':               current.Defeito           = value || 'N/A'; break;
        case 'regra':                 current.Regra             = value; break;
      }
    }
  }

  flush();
  return { tests, regra: globalRegra, meta };
}

// ─── Tabelas do documento ─────────────────────────────────────────────────────

function createIdentificacaoTable(info = {}) {
  const rows = [
    { key: 'Campo',                val: 'Descrição',        dark: false },
    { key: 'ID da Demanda/Versão', val: info.versao    || '', dark: true  },
    { key: 'Processo Testado',     val: info.processo  || '', dark: false },
    { key: 'Ambiente de Teste',    val: info.ambiente  || '', dark: true  },
    { key: 'Plataforma',           val: info.plataforma|| '', dark: false },
  ];
  return new Table({
    width: { size: TABLE_ID_WIDTH, type: WidthType.DXA },
    columnWidths: [COL_KEY_WIDTH, COL_VAL_WIDTH],
    rows: rows.map(({ key, val, dark }, i) => new TableRow({ children: [
      makeCell(key, { width: COL_KEY_WIDTH, fill: i === 0 ? FILL_KEY_LIGHT : dark ? FILL_KEY_DARK : FILL_KEY_LIGHT, bold: true, color: COLOR_GREEN, size: 18 }),
      makeCell(val, { width: COL_VAL_WIDTH, fill: i === 0 ? COLOR_WHITE    : dark ? FILL_VAL_DARK : FILL_VAL_LIGHT, size: 18 }),
    ]})),
  });
}

function createResumoTable(allScenarios) {
  let total = 0, passed = 0, failed = 0;
  for (const { tests } of allScenarios) {
    for (const t of tests) {
      total++;
      if (/^pass/i.test(t.Status))       passed++;
      else if (t.Status && t.Status !== '') failed++;
    }
  }
  const pendentes = total - passed - failed;
  const pct = total > 0 ? ((passed / total) * 100).toFixed(1) + '%' : '0.0%';

  const rows = [
    { label: 'Campo',                      val: 'Valor',              isHeader: true, dark: false },
    { label: 'Total de Casos de Teste',    val: String(total),         dark: true  },
    { label: 'Aprovados (Passed)',         val: String(passed),        dark: false },
    { label: 'Reprovados (Failed)',        val: String(failed),        dark: true  },
    { label: 'Pendentes / Não executados', val: String(pendentes),     dark: false },
    { label: 'Taxa de Aprovação',          val: pct,                   dark: true  },
    { label: 'Total de grupos (arquivos)', val: String(allScenarios.length), dark: false },
  ];

  return new Table({
    width: { size: TABLE_RESUMO_W, type: WidthType.DXA },
    columnWidths: [COL_R_LABEL_W, COL_R_VAL_W],
    rows: rows.map(({ label, val, dark, isHeader }) => new TableRow({ children: [
      makeCell(label, {
        width: COL_R_LABEL_W,
        fill:  isHeader ? FILL_KEY_LIGHT : dark ? FILL_KEY_DARK : FILL_KEY_LIGHT,
        bold: true, color: COLOR_GREEN, size: 18,
      }),
      makeCell(val, {
        width: COL_R_VAL_W,
        fill:  isHeader ? COLOR_WHITE : dark ? FILL_VAL_DARK : FILL_VAL_LIGHT,
        size:  18, center: !isHeader,
        bold:  label === 'Taxa de Aprovação',
      }),
    ]})),
  });
}

function createOverviewTable(tests, isExcecao = false) {
  const fillH = isExcecao ? FILL_EXCECAO_H : FILL_HEADER;

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell('ID',                 COL_ID_W,       fillH),
      headerCell('Cenário / Caminho',  COL_CASO_W,     fillH),
      headerCell('Resultado Esperado', COL_ESPERADO_W, fillH),
      headerCell('Link de Evidência',  COL_LINK_W,     fillH),
      headerCell('Status',             COL_STATUS_W,   fillH),
    ],
  });

  const dataRows = tests.map((t, idx) => {
    const isPassed   = /^pass/i.test(t.Status ?? '');
    const isFailed   = t.Status && !isPassed;
    const statusText = isPassed ? 'OK' : (isFailed ? 'FALHA' : '');
    const statusFill = isPassed ? 'C6EFCE' : (isFailed ? 'FFC7CE' : 'FFFFFF');
    const rowFill    = isExcecao
      ? (idx % 2 === 0 ? FILL_EXCECAO_L : 'FFFFFF')
      : (idx % 2 === 0 ? FILL_VAL_DARK  : FILL_VAL_LIGHT);

    return new TableRow({ children: [
      makeCell(t.ID,                { width: COL_ID_W,       size: 15, bold: true, fill: rowFill }),
      makeCell(t.Caso,              { width: COL_CASO_W,     size: 15,             fill: rowFill }),
      makeCell(t.ResultadoEsperado, { width: COL_ESPERADO_W, size: 14,             fill: rowFill }),
      makeCell(t.Link,              { width: COL_LINK_W,     size: 13,             fill: rowFill }),
      makeCell(statusText,          { width: COL_STATUS_W,   size: 15, bold: true, center: true, fill: statusFill }),
    ]});
  });

  return new Table({
    width: { size: TABLE_CT_WIDTH, type: WidthType.DXA },
    columnWidths: [COL_ID_W, COL_CASO_W, COL_ESPERADO_W, COL_LINK_W, COL_STATUS_W],
    rows: [headerRow, ...dataRows],
  });
}

/** Tabela do histórico de interações (quando disponível no .txt) */
function createHistoricoTable(historico) {
  if (!historico || !historico.trim()) return null;

  const linhas = historico.trim().split('\n').filter(l => l.trim());
  if (linhas.length === 0) return null;

  const rows = linhas.map((linha) => {
    const isBotLine     = linha.includes('🤖 BOT') || linha.includes('BOT   :');
    const isUsuarioLine = linha.includes('👤 USUÁRIO') || linha.includes('USUÁRIO:');
    const fill = isBotLine ? FILL_KEY_LIGHT : isUsuarioLine ? 'FFF9E6' : FILL_HISTORICO;
    const bold = isBotLine || isUsuarioLine;

    return new TableRow({ children: [
      makeCell(linha.trim(), {
        width: TABLE_CT_WIDTH, fill, bold, size: 15,
        marginTop: 40, marginBottom: 40,
      }),
    ]});
  });

  return new Table({
    width: { size: TABLE_CT_WIDTH, type: WidthType.DXA },
    columnWidths: [TABLE_CT_WIDTH],
    rows: [
      new TableRow({ children: [
        headerCell('Histórico de Interações', TABLE_CT_WIDTH, '2E7D32'),
      ]}),
      ...rows,
    ],
  });
}

// ─── Header e Footer ──────────────────────────────────────────────────────────
function makeHeader(title) {
  return new Header({ children: [new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COLOR_GREEN, space: 4 } },
    children: [new TextRun({ text: title, font: FONT, size: 18, bold: true, color: COLOR_GREEN })],
  })] });
}

function makeFooter() {
  return new Footer({ children: [new Paragraph({
    border: { top: { style: BorderStyle.SINGLE, size: 6, color: COLOR_GREEN, space: 4 } },
    tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
    children: [
      new TextRun({ text: 'Confidencial — Uso Interno', font: FONT, size: 16, color: COLOR_GRAY }),
      new TextRun({ text: '\tPágina ', font: FONT, size: 16, color: COLOR_GRAY }),
      new SimpleField('PAGE', { font: FONT, size: 16, color: COLOR_GRAY }),
    ],
  })] });
}

// ─── Gerador principal ────────────────────────────────────────────────────────
async function generateReport() {
  const { txtDir, outFile, docInfo } = CONFIG;

  if (!fs.existsSync(txtDir)) {
    console.error(`❌ Pasta "${txtDir}" não encontrada.`);
    console.error(`   Execute a Etapa 2 (reproduzirAtendimento.cy.js) primeiro.`);
    process.exit(1);
  }

  // ── Detecção automática de todos os .txt na pasta ─────────────────────────
  const arquivos = fs.readdirSync(txtDir)
    .filter(f => f.toLowerCase().endsWith('.txt'))
    .sort();

  if (arquivos.length === 0) {
    console.error(`❌ Nenhum arquivo .txt encontrado em "${txtDir}".`);
    process.exit(1);
  }

  console.log(`\n📂 Encontrados ${arquivos.length} arquivo(s) em "${txtDir}":`);

  // ── Leitura e parsing dos arquivos ────────────────────────────────────────
  const allScenarios = [];

  for (const fileName of arquivos) {
    const raw = fs.readFileSync(path.join(txtDir, fileName), 'utf-8');
    const { tests, regra, meta } = parseScenarioFile(raw);

    if (tests.length === 0) {
      console.warn(`  ⚠️  ${fileName} — nenhum caso encontrado, pulando`);
      continue;
    }

    const scCode = path.basename(fileName, '.txt');
    allScenarios.push({ scCode, fileName, tests, regra, meta });
    console.log(`  ✅ ${fileName} → ${tests.length} caso(s) (${tests.filter(t => t.Tipo === 'excecao').length} exceção)`);
  }

  if (allScenarios.length === 0) {
    console.error('❌ Nenhum cenário carregado. Verifique os arquivos .txt.');
    process.exit(1);
  }

  // ── Atualiza docInfo com metadados extraídos (se houver) ──────────────────
  const firstMeta = allScenarios[0]?.meta || {};
  if (firstMeta['Atendimento']) docInfo.processo   = firstMeta['Atendimento'];
  if (firstMeta['URL origem'])  docInfo.urlOrigem  = firstMeta['URL origem'];

  // ── Constrói o documento ──────────────────────────────────────────────────
  const children = [];

  // Capa
  children.push(
    new Paragraph({
      spacing: { after: 160 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: docInfo.titulo, font: FONT, size: 48, bold: true, color: COLOR_GREEN })],
    }),
    new Paragraph({
      spacing: { after: 480 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: docInfo.subtitulo, font: FONT, size: 22, italics: true, color: COLOR_GRAY })],
    }),
    new Paragraph({
      spacing: { after: 160 }, alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Gerado em: ${new Date().toLocaleString('pt-BR')}`, font: FONT, size: 18, color: COLOR_GRAY })],
    }),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '2E7D32', space: 1 } } }),
    emptyPar(160),
  );

  // Seção 1 — Identificação
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 160 },
      children: [new TextRun({ text: '1. Identificação do Projeto', font: FONT })],
    }),
    createIdentificacaoTable(docInfo),
    emptyPar(240),
  );

  // Seção 2 — Resumo Executivo
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 160 },
      children: [new TextRun({ text: '2. Resumo Executivo', font: FONT })],
    }),
    createResumoTable(allScenarios),
    emptyPar(240),
  );

  // Seção 3 — Visão Geral
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 160 },
      children: [new TextRun({ text: '3. Execução dos Cenários de Teste (Visão Geral)', font: FONT })],
    }),
  );

  for (const { scCode, tests, regra, meta } of allScenarios) {
    const titulo = meta['Atendimento'] ? `${scCode} — ${meta['Atendimento']}` : scCode;
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 },
        children: [new TextRun({ text: titulo, font: FONT })],
      }),
    );

    if (regra) {
      children.push(new Paragraph({
        spacing: { before: 0, after: 100 },
        children: [new TextRun({ text: `Regra estabelecida: ${regra}`, font: FONT, size: 20 })],
      }));
    }

    const feliz   = tests.filter(t => t.Tipo !== 'excecao');
    const excecao = tests.filter(t => t.Tipo === 'excecao');

    if (feliz.length > 0) {
      children.push(
        sectionLabel('Caminho Feliz', 'EEF4EE', COLOR_GREEN),
        createOverviewTable(feliz, false),
        emptyPar(80),
      );
    }
    if (excecao.length > 0) {
      children.push(
        sectionLabel('Casos de Exceção', 'E8EDF8', FILL_EXCECAO_H),
        createOverviewTable(excecao, true),
        emptyPar(80),
      );
    }

    children.push(emptyPar(120));
  }

  // Seção 4 — Histórico Detalhado
  children.push(
    emptyPar(80),
    new Paragraph({
      heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 160 },
      children: [new TextRun({ text: '4. Histórico de Execução dos Casos de Teste (Detalhado)', font: FONT })],
    }),
  );

  for (const { tests } of allScenarios) {
    for (const t of tests) {
      children.push(
        caseHeading(t.ID),
        fieldParagraph('Data da Execução',    t.Data),
        fieldParagraph('Status',               t.Status),
        fieldParagraph('Resultado Esperado',   t.ResultadoEsperado),
        fieldParagraph('Defeito (ID)',          t.Defeito),
        fieldParagraph('Link de Evidência',     t.Link),
        fieldParagraph('Observações',           t.Obs),
      );

      if (t.Historico && t.Historico.trim()) {
        children.push(emptyPar(60));
        const tabelaHistorico = createHistoricoTable(t.Historico);
        if (tabelaHistorico) children.push(tabelaHistorico);
      }

      children.push(emptyPar(120));
    }
  }

  // ── Monta o documento Word ────────────────────────────────────────────────
  const doc = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: 20 } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 48, bold: true, font: FONT, color: COLOR_GREEN },
          paragraph: { spacing: { before: 240, after: 160 }, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 28, bold: true, font: FONT, color: COLOR_GREEN },
          paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 1 } },
        { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { size: 22, bold: true, font: FONT, color: COLOR_GREEN },
          paragraph: { spacing: { before: 160, after: 80 }, outlineLevel: 2 } },
      ],
    },
    sections: [{
      properties: {
        page: {
          size: { width: 12240, height: 15840 },
          margin: { top: 1080, right: 720, bottom: 1080, left: 720, header: 708, footer: 708 },
        },
      },
      headers: { default: makeHeader(`${docInfo.titulo} — ${docInfo.versao}`) },
      footers: { default: makeFooter() },
      children,
    }],
  });

  const buffer = await Packer.toBuffer(doc);
  fs.writeFileSync(outFile, buffer);

  console.log(`\n✅ Documento gerado: ${outFile}`);
  console.log(`   Cenários: ${allScenarios.length}`);
  console.log(`   Total casos: ${allScenarios.reduce((s, { tests }) => s + tests.length, 0)}`);
}

generateReport().catch(err => {
  console.error('❌ Erro ao gerar relatório:', err);
  process.exit(1);
});