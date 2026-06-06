# Testes-Chatbot

Framework de testes automatizados para chatbots via widget web, construído com Cypress. Automatiza três etapas do ciclo de QA: extração de conversas reais do portal de atendimentos, reprodução dos fluxos no ambiente de homologação e geração de caderno de testes em `.docx`.

---

## Fluxo de trabalho

```
Etapa 1                  Etapa 2                    Etapa 3
extrairAtendimento  ──►  reproduzirAtendimento  ──►  generateReport
     .cy.js                    .cy.js                    .js
        │                         │                        │
   Acessa o portal          Acessa o bot            Lê os .txt gerados
   de atendimentos,         em homologação,         e produz o caderno
   captura mensagens        reproduz o fluxo        de testes em .docx
   e salva em JSON          e gera logs .txt
```

---

## Pré-requisitos

- Node.js 18+
- npm

---

## Instalação

```bash
# Dependências do Cypress
npm install

# Dependências do gerador de relatório
cd gerarCaderno
npm install
cd ..
```

---

## Configuração

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
CYPRESS_EMAIL=seu_email@empresa.com
CYPRESS_PASSWORD=sua_senha

BOT_URL=https://url-do-bot/
BOT_SAUDACAO=Texto de saudação do bot
BOT_CODIGO_AG=codigo_do_agente
```

> O `.env` está no `.gitignore` e **nunca deve ser commitado**.

---

## Estrutura do projeto

```
Testes-Chatbot/
├── cypress/
│   ├── e2e/
│   │   ├── extrairAtendimento.cy.js     # Etapa 1 — extração
│   │   └── reproduzirAtendimento.cy.js  # Etapa 2 — reprodução
│   ├── fixtures/
│   │   ├── atendimentos.cy.js           # Lista de URLs para extrair
│   │   └── atendimento_extraido.json    # JSON gerado pela Etapa 1
│   └── support/
│       ├── commands.js                  # Comandos customizados do Cypress
│       └── e2e.js                       # Configuração global
├── gerarCaderno/
│   ├── generateReport.js               # Etapa 3 — gerador de .docx
│   ├── txts/                            # Logs gerados pela Etapa 2
│   └── package.json
├── cypress.config.js
├── .env                                 # Credenciais (não commitado)
├── .env.example                         # Modelo de variáveis de ambiente
└── .gitignore
```

---

## Uso

### Etapa 1 — Extrair atendimento do portal

Edite `cypress/fixtures/atendimentos.cy.js` com a URL da conversa que deseja extrair:

```js
export const atendimentos = [
  {
    cenario: 'nome do cenário',
    url: 'https://portal/conversation/view/...',
    prefixo: 'CT-',
    botName: 'Bot',
    tipo: 'feliz', // ou 'excecao'
  },
];
```

Execute:

```bash
npx cypress run --spec "cypress/e2e/extrairAtendimento.cy.js"
```

O resultado é salvo em `cypress/fixtures/atendimento_extraido.json`.

### Etapa 2 — Reproduzir no ambiente de homologação

```bash
npx cypress run --spec "cypress/e2e/reproduzirAtendimento.cy.js"
```

Os logs de execução são salvos em `gerarCaderno/txts/`.

### Etapa 3 — Gerar caderno de testes

```bash
cd gerarCaderno
node generateReport.js
```

Por padrão gera `Caderno_de_Testes_Final.docx`. Parâmetros opcionais:

```bash
node generateReport.js --dir ./txts --out MeuCaderno.docx
```

---

## Comandos Cypress disponíveis

| Comando | Descrição |
|---|---|
| `cy.iniciarBot(opcoes)` | Inicia o bot com as configurações do `.env` |
| `cy.InputForMessage(pergunta, resposta)` | Aguarda mensagem do bot e digita resposta |
| `cy.verifyChatMessage(texto)` | Verifica que uma mensagem está visível |
| `cy.selecionarOpcaoChat(texto)` | Clica em botão ou quick-reply |
| `cy.autenticarPortal(email, senha)` | Autentica no portal de atendimentos |
| `cy.captureChatValidationData()` | Captura o link da conversa gerada |
| `cy.resetColetaDados()` | Reinicia o estado entre testes |

---

## Segurança

- Credenciais ficam exclusivamente no `.env` (ignorado pelo Git)
- Fixtures com dados de conversas ficam em `cypress/fixtures/` (ignorado pelo Git)
- Logs de execução ficam em `gerarCaderno/txts/` (ignorado pelo Git)
- Nenhum dado sensível é hardcoded nos arquivos de código

---

## Licença

Consulte o arquivo `LICENSE`.