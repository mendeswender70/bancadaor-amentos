// Roda todos os testes da API com o driver de produção (postgres.js).
process.env.TEST_BANCO = 'socket';
await import('./api.test.js');
