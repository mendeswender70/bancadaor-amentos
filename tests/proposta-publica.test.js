import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ICONES_INCLUSO } from '../public/shared/calc.js';

const ler = (caminho) => readFile(new URL(`../public/${caminho}`, import.meta.url), 'utf8');

// A CSP do esquadro (style-src 'self') bloqueia <style> e atributos style: a página pública
// perderia o layout sem nenhum erro nos testes de API.
test('a proposta pública não depende de estilos embutidos', async () => {
  const [html, js, biblioteca] = await Promise.all([ler('proposta.html'), ler('js/proposta.js'), ler('js/vendor/page-flip.module.js')]);
  for (const [nome, texto] of [['proposta.html', html], ['proposta.js', js]]) {
    assert.ok(!/\sstyle\s*=\s*["'`]/.test(texto), `${nome} não pode usar o atributo style`);
    assert.ok(!/<style[\s>]/i.test(texto), `${nome} não pode embutir <style>`);
  }
  assert.ok(!biblioteca.includes('createElement("style")'), 'a cópia da page-flip não pode injetar <style>');
});

test('todo ícone de item incluso existe na página pública', async () => {
  const html = await ler('proposta.html');
  for (const nome of ICONES_INCLUSO) assert.ok(html.includes(`<symbol id="i-${nome}"`), `falta o ícone ${nome}`);
});
