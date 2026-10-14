# One Way — Finalização e ativação do Agendador de Posts

**Estado:** Código preparado na PR #10 (rascunho), **NÃO implantado em produção**.
**Local de instalação:** `onewaydemandas.vercel.app`, aba Social Media.
**Banco existente:** Supabase projeto `wreolbaiqfpoytfshmoz`, tabela `app_state.data.clients`.
**Proteção:** não usar senhas dos clientes, apenas OAuth oficial da Meta.

## Etapa A — Preparação de banco (sem publicação)
1. Confirmar backup do Supabase e revisar o projeto no SQL Editor.
2. Executar **uma única vez** `supabase/activation/INSTALL_SOCIAL_MEDIA_BASE.sql`.
   As instruções que o usuário já executou são idempotentes, não duplicam clientes.
3. Confirmar no Table Editor:
   - `social_post_schedules`
   - `social_post_events`
   - `social_instagram_accounts`
   - `social_oauth_states`
4. Confirmar bucket `social-posts-temp` em Storage → Buckets, **PRIVATE**.
5. Não habilitar políticas RLS públicas nas tabelas; `service_role` acessa somente no servidor.

## Etapa B — Configurar Meta / Vercel (somente dashboard, NUNCA neste chat)
Em Vercel → `onewaydemandas` → Settings → Environment Variables, configurar:
- `META_INSTAGRAM_APP_ID`: ID da seção Instagram Login do aplicativo One Way-IG.
- `META_INSTAGRAM_APP_SECRET`: segredo correspondente. Tipo **Sensitive**.
- `META_INSTAGRAM_REDIRECT_URI`: `https://onewaydemandas.vercel.app/api/social`.
- `META_TOKEN_ENCRYPTION_KEY`: string aleatória CRIPTOGRAFICAMENTE SEGURA com 64 caracteres hexadecimais (32 bytes), tipo **Sensitive**. Guardar em cofre; perdê-la inviabiliza descriptografar autorizações existentes.
- `SOCIAL_PUBLISHING_ENABLED`: `false` inicialmente.
O projeto já possui `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` em produção: **não duplicar, alterar nem expor** sem necessidade.

Na configuração Instagram Login no Meta for Developers, **substituir o URI anterior com ?action=callback** pelo URI EXATO `https://onewaydemandas.vercel.app/api/social` (sem parâmetros) entre os OAuth Redirect URIs válidos. O backend identifica automaticamente ?code=...&state=... no retorno. Não usar esta URL nos campos de webhook. Conferir Instagram Business Basic e Content Publish.

**Importante:** o token que foi compartilhado no chat antes deve ser REVOGADO e substituído.
Nenhum segredo deve entrar no `index.html`, em `*.js` públicos ou no GitHub.

## Etapa C — Teste com uma conta da agência
1. Depois da cota de deployments liberar, revisar a PR e criar deploy controlado com publicação **desativada**.
2. Entrar no One Way como administrador e abrir Social Media → Agendador de Posts.
3. Selecionar cliente One Way e clicar Conectar Instagram.
4. Conferir se o `@username` de retorno corresponde ao Instagram CORRETO do cliente.
5. Conferir status da rota protegida `GET /api/social?action=status` usando sessão do administrador.
6. Criar teste com imagem JPEG, legenda e aprovação manual, em horário futuro.
7. Conferir registro em `social_post_schedules` e objeto privado no Storage.
8. Testar que a conta errada, cancelamento depois do claim e mudança de conteúdo não publicam.
9. Realizar somente UM teste de publicação, em conta própria, com cron/worker habilitado temporariamente.
10. Confirmar `instagram_media_id`, `published_permalink`, `published_at` e status `published`.
11. Testar vídeo MP4/Reels separadamente; processamento de vídeos longos pode requerer fila mais robusta.
12. Executar limpeza manual segura e confirmar que o objeto desapareceu após o período previsto, mantendo histórico.

## Etapa D — Ligar execução sem depender de navegador
1. Criar secret `oneway_social_cron_bearer` no **Supabase Vault** com o MESMO valor de `CRON_SECRET` da Vercel. Fazer somente pelo dashboard, nunca colar no histórico SQL.
2. Executar `supabase/activation/activate_social_cron_AFTER_TESTS.sql` SOMENTE após teste real e verificações.
3. Conferir no Supabase Cron os dois Jobs (a cada minuto para publicar, diário para limpeza).
4. Confirmar as respostas no histórico `cron.job_run_details` / `net._http_response` e logs Vercel.
5. Habilitar `SOCIAL_PUBLISHING_ENABLED=true` quando estiver operacional.

## Bloqueios/limites atuais
- Vercel Hobby retornou `api-deployments-free-per-day` (100 deployments em 24h). Excluir versions não zera a cota.
- A branch inicialmente tinha funções demais; foram **consolidadas em `api/social.js`**, mas o resultado final ainda precisa de build.
- Meta em modo desenvolvimento só permite testes com contas autorizadas. Para contas de clientes, pode ser necessária revisão da Meta e permissões avançadas.
- Esta integração não cobre Facebook, Stories ou carrosséis no MVP; começamos por JPEG no feed e MP4/Reels.
- Um post com falha ambígua fica em `publishing` para revisão manual, sem repetição automática, evitando duplicação.

## Recuperação
- **Parar publicações:** `SOCIAL_PUBLISHING_ENABLED=false` na Vercel; desativar `oneway_social_publish_each_minute` no Supabase Cron. Acompanhar status dos jobs pendentes.
- **Recuperar interface anterior:** usar deploy de produção antigo ou reverter merge da PR. Supabase preserva as tabelas e os registros.
- **Revogar conexão:** remover o acesso do aplicativo nas configurações do Instagram ou realizar revogação controlada do token no servidor; agendamentos ainda pendentes ficam bloqueados.

## Testes de código
Rodar na raiz do repositório: `npm test`. Este teste é automatizado para validações criptográficas e conteúdo; **não substitui teste de integração real** na Meta.
