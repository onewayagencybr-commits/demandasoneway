# One Way · Acompanhamento de Demandas

Painel interno da One Way Agency, feito em HTML, CSS e JS puros (`index.html` + `modules/`), com funções na Vercel (`api/`, `lib/`) e banco no Supabase.

## Como trabalhar neste repositório

- **Idioma:** converse com o dono do projeto em português (pt-BR), em linguagem simples e não técnica.
- **Publicação:** o dono autorizou enviar as alterações **direto para a `main`**, sem Pull Request. A Vercel publica sozinha em cerca de 1 minuto.
  - Antes de cada push: rode `npm test` (todos devem passar) e confira a tela no navegador (Playwright).
  - Depois do push: confira se o deploy da Vercel ficou com status `success` no commit e avise o que mudou.
  - Se algo quebrar, desfaça na hora com `git revert` + push.
- **Banco (Supabase):** não há acesso direto. Scripts SQL ficam em `supabase/migrations/`, e o dono roda pelo SQL Editor. Entregue o SQL pronto para copiar e explique o resultado esperado.
- **Dados:** quase tudo (clientes, demandas, colaboradores, agenda) fica em uma única linha JSON: `app_state` com id `main`. Ao adicionar um campo novo ao estado, inclua-o em `normalizeState()` e `seed()` no `index.html`, senão ele é descartado ao salvar.
- **Logins:** o Administrador usa Supabase Auth + senha. Visitante, Design e Vídeos usam a senha padrão da equipe, verificada por hash PBKDF2 (`TEAM_VERIFIER_HEX`). Nunca coloque senhas em texto no código: o repositório é público.
- **Colaboradores:** não existe aba de edição; o dono pediu para removê-la. A lista fica em `state.collaborators` (padrão em `DEFAULT_COLLABORATORS`, no `index.html`) e alimenta `DEMAND_ASSIGNEES`. Os logins Design e Vídeos mostram as demandas do colaborador vinculado (`login: 'design' | 'video'`). Para mudar a equipe, altere pelo código.
- **CSS:** cuidado com nomes de classe genéricos. Já existem classes globais como `.login`, `.tab`, `.client` e `.ghost`, que podem afetar o layout. Use prefixo `ow-`.
