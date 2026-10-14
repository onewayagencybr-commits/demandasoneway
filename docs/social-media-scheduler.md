# One Way — Agendador Social Media (branch de implementação)

> **NÃO MERGEAR ANTES DOS TESTES**: a automação de publicação permanece desativada por padrão e este branch não altera o ambiente de produção.

## O que está implementado na branch
- Interface isolada na aba Social Media com seleção dos clientes existentes em `app_state.data.clients`, dados de mídia, legenda, data/hora `America/Cuiaba` e aprovação manual pelo WhatsApp.
- Login oficial do Instagram por cliente (Instagram API with Instagram Login), sem senhas no One Way.
- Tokens longos separados por cliente, criptografados AES-256-GCM no banco.
- Criação de rascunho e upload diretamente ao bucket PRIVADO `social-posts-temp` via URL assinada.
- Post agendado criado somente para conteúdo aprovado e conta profissional conectada.
- Worker de publicação que exige `SOCIAL_PUBLISHING_ENABLED=true`, `CRON_SECRET` e função de reivindicação atômica.
- Endpoint de limpeza de mídias confirmadas, com janela de segurança de 2 horas.

## Migrações (executar na ordem após backup e inspeção)
1. `supabase/migrations/20261014_social_post_schedules.sql` — o usuário já relatou ter executado.
2. `supabase/migrations/20261014_social_instagram_connections.sql` — PENDENTE.
3. `supabase/migrations/20261014_social_claim_due_posts.sql` — PENDENTE.

Bucket `social-posts-temp` criado manualmente pelo usuário, privado. Verificar limites por tamanho e MIME antes de ativar.

## Variáveis SEGURAS no servidor (nunca no GitHub)
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`: seguem helpers existentes; service secret deve estar no ambiente Preview para testar o branch.
- `META_INSTAGRAM_APP_ID`: ID específico da configuração Instagram Login (NÃO confundir com ID do app principal Meta).
- `META_INSTAGRAM_APP_SECRET`: Instagram App Secret da configuração de login.
- `META_INSTAGRAM_REDIRECT_URI`: exatamente `https://onewaydemandas.vercel.app/api/social`, cadastrado na Meta.
- `META_TOKEN_ENCRYPTION_KEY`: 32 bytes aleatórios em 64 caracteres hexadecimais; guardar somente em Vercel Secrets.
- `CRON_SECRET`: autenticação de cron que o projeto já possui na produção.
- `SOCIAL_PUBLISHING_ENABLED`: ausente ou `false` durante testes; habilitar somente após publicar com sucesso numa conta teste.
- `META_GRAPH_VERSION` opcional, padrão `v25.0`.

## Regras importantes
- O usuário NÃO digita senha no One Way; a Meta faz a autorização OAuth.
- O app Meta em modo desenvolvimento autoriza apenas membros/testadores. Para clientes terceiros, revisão do app e permissões avançadas podem ser necessárias.
- Só usar Instagram profissional (Business/Creator). O código suporta imagem JPEG ou vídeo MP4. PNG enviado é convertido para JPEG no navegador.
- Tokens podem expirar/revogar; quando necessário, reconectar a conta. O worker tenta renovação antes do vencimento.
- Uma eventual falha depois do comando de publicação é ambígua: a linha fica **publishing** aguardando revisão, nunca tem repetição automática para evitar posts duplicados.
- O worker deve ser disparado por agendador de alta frequência confiável (Supabase Cron + chamada segura, ou Vercel Cron com plano que suporte a cadência); o Vercel Hobby não serve para minutos.
- A limpeza diária é independente e só remove arquivos após confirmação de publicação. Ainda não está inscrita no cron de produção.

## Testes necessários antes de ativar
- Validar RLS/admin no preview; OAuth callback exigirá URL de produção da Meta, então testar somente após revisão e deploy controlado.
- Testar o retorno da Meta e storage com uma conta de testes. Confirmar credenciais sem nunca compartilhá-las no chat.
- Publicar uma arte JPEG de teste, conferir legenda e link de publicação e remoção do objeto 2 horas depois.
- Testar Reels MP4 separadamente (podem demandar processamento superior ao limite do worker; por enquanto não garantir vídeos grandes).
- Testar contas de dois clientes diferentes para garantir que não haja publicação cruzada.
- Verificar backup, custo e retenção de mídia.
