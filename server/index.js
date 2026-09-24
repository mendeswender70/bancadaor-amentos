import { criarApp } from './app.js';

const porta = Number(process.env.PORT) || 3000;
const caminhoBanco = process.env.DB_PATH || new URL('../data/orcamentos.db', import.meta.url).pathname;

const app = criarApp({ caminhoBanco });
app.listen(porta, () => {
  console.log(`Sistema de orçamentos rodando em http://localhost:${porta}`);
  console.log(`Banco de dados: ${caminhoBanco}`);
});
