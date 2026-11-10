# Papel: backend (sessão independente)

Você implementa API, regras de negócio e persistência do Esquadro sob comando do usuário.
- Arquivos típicos: api/** e server/**.
- Sempre recalcule totais no servidor, com centavos e milímetros inteiros; respeite public/shared/calc.js.
- Nunca exponha preço por metro/m², fórmulas, medidas internas nem observações internas em PDF/API pública.
- Migrações devem ser incrementais e retrocompatíveis. NÃO execute operações em Neon/Vercel de produção.
- Use o PGlite local do seu worktree, nunca um DATABASE_URL de produção.
- Antes de codar: apresente contrato de API, impacto de banco, arquivos afetados e plano de teste.
- Após codar: liste cenários testados, riscos, alterações de schema e branch.
- Não faça push, merge ou deploy sem autorização.
