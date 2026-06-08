import { defineConfig } from 'cypress';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

dotenv.config();

export default defineConfig({
  e2e: {
    // Desabilita restrição de mesmo origin para portais multi-domínio
    chromeWebSecurity: false,

    // Timeout padrão generoso — chatbots podem demorar para responder
    defaultCommandTimeout: 60_000,
    pageLoadTimeout: 60_000,

    setupNodeEvents(on, config) {
      on('task', {

        // ── Credenciais de acesso ao portal ────────────────────────────────
        getCredentials() {
          return {
            email:    process.env.CYPRESS_EMAIL,
            password: process.env.CYPRESS_PASSWORD,
          };
        },

        // ── Variáveis de ambiente do bot ────────────────────────────────────
        getBotEnv() {
          return {
            url:          process.env.BOT_URL,
            saudacao:     process.env.BOT_SAUDACAO,
            codigoAg:     process.env.BOT_CODIGO_AG,
            seletorAg:    process.env.BOT_SELETOR_AG,
            codigoAg5050: process.env.BOT_CODIGO_AG_5050,
          };
        },

        // ── Leitura de fixture JSON pelo Node (evita CORS no browser) ───────
        lerFixture({ caminhoRelativo }) {
          const fullPath = path.resolve(__dirname, caminhoRelativo);
          if (!fs.existsSync(fullPath)) {
            console.warn(`[task:lerFixture] Arquivo não encontrado: ${fullPath}`);
            return null;
          }
          const raw = fs.readFileSync(fullPath, 'utf-8');
          // Suporta tanto JSON puro quanto "export const testes = [...];"
          const jsonMatch =
            raw.match(/export\s+const\s+\w+\s*=\s*(\[[\s\S]*\]);/) ||
            raw.match(/module\.exports\s*=\s*(\{[\s\S]*\})/);
          if (jsonMatch) return JSON.parse(jsonMatch[1]);
          return JSON.parse(raw);
        },

        // ── Gravação de arquivo de log TXT ──────────────────────────────────
        appendLog({ filePath, content }) {
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.appendFileSync(filePath, content, 'utf-8');
          return null;
        },

        // ── Garantir que arquivo existe (para leitura vazia) ────────────────
        ensureFile({ filePath, defaultContent = '' }) {
          if (!fs.existsSync(filePath)) {
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(filePath, defaultContent, 'utf-8');
          }
          return null;
        },
      });

      return config;
    },
  },
});