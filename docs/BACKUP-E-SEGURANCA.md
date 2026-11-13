# Backup e segurança dos dados

## 1. Ativar no Supabase (uma vez)

1. Abra o Supabase → **SQL Editor** → **New query**.
2. Cole todo o conteúdo de `supabase/migrations/20261113_app_state_backup_and_security.sql`.
3. Clique em **Run**. A mensagem esperada é `Success. No rows returned`.

O script pode ser executado de novo sem problema e não altera clientes, demandas, financeiro nem contratos.
Se aparecer o erro `A função public.is_app_admin() não existe`, nada foi alterado no banco. Nesse caso, peça ajuda antes de continuar.

## 2. O que passa a funcionar

| Recurso | Como funciona |
|---|---|
| **Histórico automático** | O banco guarda uma versão a cada 30 min de uso. Mantém todas as versões dos últimos 2 dias e uma por dia até 45 dias. |
| **Trava anti-apagão** | Bloqueia qualquer gravação que apagaria todos os clientes e demandas de uma vez. |
| **Botão "Backup"** (só administrador) | Baixa um arquivo `.json` com tudo. Financeiro e contratos continuam criptografados no arquivo. |
| **Restaurar** | Em Backup → "Versões salvas automaticamente" → **Restaurar**. A versão atual é guardada antes, então dá para desfazer. |
| **Financeiro e Contratos** | Passam a ser lidos e gravados apenas por administradores logados. Antes, qualquer pessoa com a chave pública conseguia sobrescrever esses dados. |

## 3. Boas práticas

- Baixe um backup **1 vez por semana** e guarde no Google Drive.
- Deixe o repositório do GitHub como **privado**.
- Para conferir o espaço ocupado pelo histórico, rode no SQL Editor:
  `select pg_size_pretty(pg_total_relation_size('public.app_state_history'));`

## 4. Limite conhecido

Os acessos **Visitante**, **Design** e **Vídeos** entram sem senha. Por isso, quem abrir o site do sistema ainda consegue ver e editar o painel de clientes e demandas.
O histórico e a trava protegem contra perda de dados. Para fechar esse acesso por completo, a equipe precisaria ter login próprio.
