# Agendador Social Media — One Way (preparação)

Esta branch não publica no Instagram e não muda produção.

## Migração
O arquivo `supabase/migrations/20261014_social_post_schedules.sql` é aditivo.
Nenhuma tabela existente é modificada, nenhum cliente é duplicado. `client_ref`
fica em texto até identificarmos o identificador canônico da tabela atual de clientes.

**Não execute** sem confirmar o esquema de clientes e a autenticação existentes.
RLS ativado e sem políticas públicas: o navegador não acessa estas tabelas
diretamente até configurarmos autenticação/autorização segura.

## Fluxo previsto
1. Equipe envia material pelo WhatsApp e registra a aprovação manualmente.
2. Equipe anexa mídia ao bucket PRIVADO `social-posts-temp`, cadastra legenda,
   data em America/Cuiaba e cliente já existente.
3. Em qualquer alteração de mídia/legenda, invalidar aprovação e voltar a rascunho.
4. Servidor valida aprovação + hash do conteúdo antes de agendar.
5. Worker confiável reivindica cada trabalho de modo atômico (sem duas publicações);
   no horário, disponibiliza mídia por URL assinada com validade suficiente para Meta,
   publica via API oficial e confirma o identificador remoto.
6. Em falhas ou resposta incerta, verificar estado remoto antes de tentar novamente.
7. Após confirmação e período de segurança, remover somente o objeto temporário.
   Preservar metadados, histórico de eventos, URL do post e erros para auditoria.

## Pendências para ativar
- Identificar a interface principal e a tabela de clientes corretas.
- Conectar acesso seguro ao Supabase existente.
- Guardar novo token Meta em segredo server-side, nunca no GitHub ou HTML.
- Validar conta profissional, permissões e renovação/expiração de token.
- Implementar worker e cron (não agendar pela aba do navegador).
- Testar publicação em conta da agência antes de ativar contas de clientes.
