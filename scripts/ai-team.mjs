#!/usr/bin/env node
/**
 * Esquadro AI Team: worktrees de agentes individuais.
 * Uso: node scripts/ai-team.mjs create frontend nome-da-tarefa
 *      node scripts/ai-team.mjs status
 *
 * Não inicia agentes automaticamente nem faz push/merge/deploy.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { basename, join, resolve, dirname } from 'node:path';

const ROLES = new Set(['frontend', 'backend', 'qa', 'integrador']);
const argv = process.argv.slice(2);

function git(args, cwd = process.cwd()) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}
function usage() {
  console.log('Esquadro AI Team\n');
  console.log('  node scripts/ai-team.mjs create <frontend|backend|qa|integrador> <slug>');
  console.log('  node scripts/ai-team.mjs status');
  console.log('\nCada agente trabalha numa branch ai/<papel>/<slug> e worktree própria.');
}
try {
  const cmd = argv[0];
  if (!cmd || cmd === 'help' || cmd === '--help') {
    usage();
    process.exit(0);
  }
  const root = git(['rev-parse', '--show-toplevel']);
  if (cmd === 'status') {
    console.log(git(['worktree', 'list', '--porcelain'], root));
    process.exit(0);
  }
  if (cmd !== 'create') {
    throw new Error('Comando desconhecido: ' + cmd);
  }

  const [, role, task] = argv;
  if (!ROLES.has(role)) throw new Error('Papel inválido. Use: ' + [...ROLES].join(', '));
  if (!task || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(task)) {
    throw new Error('Slug inválido. Use letras minúsculas, números e hífens (ex.: novo-dashboard).');
  }
  const branchName = 'ai/' + role + '/' + task;
  const worktreesRoot = resolve(root, '..', basename(root) + '-worktrees');
  const destination = join(worktreesRoot, role + '-' + task);
  if (existsSync(destination)) throw new Error('Pasta já existe: ' + destination);
  mkdirSync(dirname(destination), { recursive: true });
  const base = process.env.AI_TEAM_BASE_REF || 'HEAD';
  console.log('Base:', base);
  console.log('Branch:', branchName);
  git(['worktree', 'add', '-b', branchName, destination, base], root);
  console.log('\nWorktree criada em:', destination);
  console.log('\nAbra um terminal e execute:');
  console.log('  cd "' + destination + '"');
  console.log('  npm ci');
  console.log('  claude --permission-mode plan');
  console.log('\nPrimeiro prompt: Leia CLAUDE.md e docs/ai-team/roles/' + role + '.md. Não altere arquivos ainda. Aguarde minha tarefa e apresente um plano antes de implementar.');
  console.log('\nNenhum push, merge ou deploy foi realizado.');
} catch (error) {
  console.error('Erro:', (error.stderr && error.stderr.toString()) || error.message);
  process.exitCode = 1;
}
