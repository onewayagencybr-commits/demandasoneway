# One Way — Solicitação de acesso avançado ao Instagram para todos os clientes

**Finalidade:** permitir que clientes da agência autorizem seus perfis profissionais Instagram diretamente no Agendador Social Media, sem serem adicionados individualmente como testadores do aplicativo Meta.

**Aplicativo Meta:** One Way (Meta App ID 1501121561839178), produto One Way-IG (Instagram App ID 2620460388480885).

**Importante:** este documento prepara o processo. A Meta é quem concede o acesso; nenhum arquivo ou implantação no One Way contorna essa exigência.

## 1. Permissões estritamente necessárias (Instagram Login)
- `instagram_business_basic`: ler ID e nome de usuário da conta profissional para exibir o perfil correto associado a cada empresa.
- `instagram_business_content_publish`: criar e publicar conteúdo orgânico aprovado (imagem ou vídeo) na conta profissional que concedeu acesso.
- Não solicitar mensagens, comentários, anúncios ou Facebook Login. Não são necessários ao MVP de publicação.
- Para essas permissões, procurar **Solicitar acesso avançado** no painel Meta > Caso de uso Instagram Login > Permissões e recursos (nomes de menus podem mudar).

## 2. Pré-requisitos para submissão
- Confirmar o aplicativo e a empresa correta no Meta Business Manager e seguir eventual fluxo de **Verificação da empresa**.
- Confirmar nome do aplicativo, ícone, categoria, domínio, e-mail para contato, política de privacidade e termos de serviço públicos.
- A Meta pode exigir **URL para desautorização** e **instruções ou callback de exclusão de dados**. As URLs precisam funcionar; jamais registrar uma URL fictícia ou reaproveitar a URL OAuth como callback.
- URL OAuth atual: `https://onewaydemandas.vercel.app/api/social`.
- Garantir que o avaliador consegue acessar um ambiente de demonstração seguro, com credenciais temporárias e contas de teste, sem acesso a dados reais de outros clientes.
- Verificar que os fluxos solicitados estão efetivamente funcionais; um botão de agendamento com publicação desativada não constitui demonstração de postagem automatizada concluída.

## 3. Descrição para o campo da permissão instagram_business_basic
"O One Way é o sistema privado de gestão de produção e Social Media da One Way Agency. Cada empresa cliente seleciona seu cadastro e autoriza sua própria conta profissional do Instagram pelo fluxo oficial de Instagram Login. O aplicativo utiliza o ID e o nome de usuário exclusivamente para confirmar e exibir o perfil conectado, impedir publicação na conta de outra empresa e manter o vínculo da autorização. Não utiliza essa permissão para acessar contas pessoais, anúncios ou informações de seguidores."

## 4. Descrição para o campo da permissão instagram_business_content_publish
"A One Way Agency presta serviços de produção e gestão de conteúdo orgânico para empresas clientes. Após autorização pelo Instagram Login, um administrador do One Way seleciona a empresa, envia foto ou vídeo, escreve a legenda, escolhe data e horário e registra que a peça foi aprovada pelo cliente. No momento da publicação, o sistema usa o token autorizado da conta profissional para criar e publicar a mídia por meio da API oficial. Cada empresa tem conexão individual; o sistema valida a correspondência entre o cliente selecionado e a conta Instagram de destino. Tokens são guardados criptografados no servidor; a empresa não fornece sua senha ao One Way."

## 5. Demonstração exigida na análise (screencast)
1. Entrar como usuário autorizado no One Way e abrir Social Media > Agendador de Posts.
2. Selecionar um cadastro de empresa de demonstração.
3. Clicar "Conectar Instagram deste cliente" e mostrar a tela oficial do Instagram solicitando apenas `instagram_business_basic` e `instagram_business_content_publish`; concluir o login.
4. Mostrar o `@usuario` autorizado no One Way (uso real de `instagram_business_basic`).
5. Enviar uma imagem de demonstração, escrever legenda e marcar aprovação do conteúdo.
6. Programar a postagem em horário próximo ou exibir o mecanismo de envio manual autorizado para demonstração (o vídeo deve mostrar a publicação ocorrendo de verdade).
7. Confirmar na interface o status Publicado e abrir a postagem na conta demonstrativa correta.
8. Mostrar separação entre duas empresas caso o avaliador peça evidência de isolamento de clientes.

Não expor senhas, tokens, segredos ou dados pessoais de outros clientes no vídeo. Preferir vídeo curto, sem cortes que escondam o consentimento e o envio.

## 6. Segurança, privacidade e exclusão
- As credenciais Meta permanecem nas variáveis privadas da Vercel.
- Cada `social_instagram_accounts.client_ref` identifica uma empresa, não um operador nem um computador.
- A empresa autoriza a conta no Instagram. Não coletar sua senha.
- É necessária uma maneira autenticada de desconectar a conta e revogar/eliminar o token correspondente, mais política pública de privacidade e exclusão, **antes** de solicitar revisão final.
- Não inventar informações legais, e-mail oficial, prazo de retenção ou consentimentos. Confirmar com o responsável da agência.
- Conferir domínio/endereço da política de privacidade e termos no aplicativo Meta.

## 7. O que ainda depende de ação humana
- Aprovação do aplicativo e das permissões pela Meta, além de eventual verificação empresarial.
- Dados oficiais da empresa e endereço de contato para pedidos de privacidade.
- Capturas de tela do painel de submissão e vídeo demonstrativo.
- Acesso temporário e limitado do avaliador, caso exigido.

## Referências oficiais e técnicas
- https://developers.facebook.com/apps/1501121561839178/
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login

**Situação:** preparação documental. Não afirmar "Meta aprovada" até o painel indicar aprovação de acesso avançado.
