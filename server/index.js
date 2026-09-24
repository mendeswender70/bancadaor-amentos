import { criarApp } from './app.js';
import { configuracaoBanco } from './db.js';

const porta = Number(process.env.PORT) || 3000;
const banco = configuracaoBanco();

const app = criarApp({ banco });
app.listen(porta, () => {
  console.log(`Sistema de orçamentos rodando em http://localhost:${porta}`);
  console.log(`Banco de dados: ${banco ? banco.url.replace(/\?.*$/, '') : 'arquivo local data/orcamentos.db'}`);
});
