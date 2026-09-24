import { criarApp } from './app.js';
import { configuracaoBanco } from './db.js';

const porta = Number(process.env.PORT) || 3000;
const banco = configuracaoBanco();

const app = criarApp({ banco });
app.listen(porta, () => {
  console.log(`esquadro rodando em http://localhost:${porta}`);
  if (banco) {
    const { hostname, pathname } = new URL(banco.url);
    console.log(`Banco de dados: Postgres em ${hostname}${pathname}`);
  } else {
    console.log('Banco de dados: Postgres embutido na pasta data/pglite');
  }
});
