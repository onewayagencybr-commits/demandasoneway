# Ativar o WhatsApp da agência no One Way Demandas

O que já está pronto no sistema:

- **Botão "WhatsApp"** no topo, para **todos os logins** do sistema. O Administrador entra direto; os outros logins confirmam a senha da equipe uma vez (vale 12h).
- **Conversas:** o WhatsApp da agência dentro do sistema, com a lista de conversas à esquerda e a conversa aberta à direita. A conversa fica **vermelha** enquanto o cliente estiver sem resposta de alguém da equipe, e o botão do topo fica vermelho com o número de conversas esperando. Áudios chegam com a transcrição. Pela regra do WhatsApp, só dá para escrever até 24h depois da última mensagem do cliente.
- **Pedidos.** Cada mensagem de cliente é lida pela IA e separada em **Solicitação**, **Agendamento** ou **Dúvida**, com resumo, prazo citado e horário pedido. O robô responde na hora, sem prometer preço, prazo ou horário: diz que a equipe confirma. Um botão **Virar demanda** cria a demanda no cliente e na área certa.
- **Reuniões.** Alguém da equipe encaminha o áudio da reunião para o WhatsApp da agência. O sistema transcreve e monta o resumo, as decisões, o **plano de ação** (com um botão "→ demanda" em cada tarefa) e as pendências do cliente. O botão **Copiar plano para o grupo** copia tudo já formatado para colar no grupo do cliente.
- **Contatos.** Aqui você liga cada número a um cliente e marca quem é da equipe.

O robô **não entra nos grupos** de clientes. A API oficial não permite isso para números como o de vocês. Nos grupos, a equipe encaminha para o robô o que for importante.

---

## Passo 1 — Banco (uma vez)

No Supabase, abra **SQL Editor › New query**, cole o arquivo `supabase/migrations/20261123_whatsapp_assistant.sql` e clique em **Run**.
Resultado esperado: `Success. No rows returned`.

## Passo 2 — Escolher o caminho

| | Caminho A — grátis | Caminho B — coexistência |
|---|---|---|
| Número | **segundo chip**, só para o robô | o mesmo número do iPhone |
| App no celular | o número do robô **sai** do app | continua no app |
| Custo fixo | nenhum | mensalidade do provedor (ex.: 360dialog) |
| `WHATSAPP_PROVIDER` | `meta` | `360dialog` |

Nos dois caminhos, as respostas para quem escreveu primeiro são grátis na Meta. A IA cobra por uso (centavos por mensagem).

### Caminho A — direto na Meta

1. Em https://developers.facebook.com/apps, crie um app do tipo **Business** e adicione o produto **WhatsApp**.
2. Em **WhatsApp › API Setup**, adicione o número do segundo chip e copie o **Phone number ID**.
3. No https://business.facebook.com, abra **Configurações › Usuários do sistema** e crie um usuário Administrador. Gere um **token permanente** para o app, com as permissões `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Em **WhatsApp › Configuration › Webhook**:
   - **Callback URL:** `https://onewaydemandas.vercel.app/api/whatsapp?key=SEU_SEGREDO`
   - **Verify token:** o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
   - Depois, em **Webhook fields**, assine o campo **messages**.

### Caminho B — 360dialog (coexistência)

1. Crie a conta em https://www.360dialog.com e conecte o número **escolhendo a opção de manter o WhatsApp Business app** (coexistência). Isso inclui escanear um QR code no iPhone.
2. No painel do 360dialog, gere a **API key** do número.
3. Configure o webhook do número para `https://onewaydemandas.vercel.app/api/whatsapp?key=SEU_SEGREDO`.

## Passo 3 — Variáveis na Vercel

Na Vercel, abra **Project › Settings › Environment Variables**. Cadastre as variáveis em *Production*, depois clique em **Redeploy**.

| Nome | Valor |
|---|---|
| `WHATSAPP_WEBHOOK_SECRET` | uma senha longa inventada por você (só letras e números). É o `SEU_SEGREDO` dos links acima |
| `WHATSAPP_PROVIDER` | `meta` (Caminho A) ou `360dialog` (Caminho B) |
| `WHATSAPP_TOKEN` | só Caminho A: o token permanente |
| `WHATSAPP_PHONE_NUMBER_ID` | só Caminho A: o Phone number ID |
| `WHATSAPP_VERIFY_TOKEN` | só Caminho A: outra palavra inventada, igual à do webhook |
| `D360_API_KEY` | só Caminho B: a API key do 360dialog |
| `ANTHROPIC_API_KEY` | chave do Claude: https://platform.claude.com/settings/keys |
| `OPENAI_API_KEY` | chave para transcrever áudio: https://platform.openai.com/api-keys |
| `WHATSAPP_AGENCY_INFO` | *(opcional)* texto sobre a agência que o robô pode usar nas respostas: serviços, horário etc. |
| `WHATSAPP_AUTO_REPLY` | *(opcional)* `off` para o robô só registrar, sem responder |

⚠️ **Nunca coloque essas chaves no código nem no chat. O repositório é público.**

## Passo 4 — Conferir e cadastrar números

1. No sistema, abra **WhatsApp › Configuração**. Tudo deve aparecer com ✓.
2. Em **WhatsApp › Contatos**, cadastre:
   - o número de cada pessoa da equipe, marcando **É da equipe One Way**. Áudios enviados por esses números viram reunião transcrita;
   - o número de quem fala por cada cliente. Números novos que escreverem aparecem na mesma tela para vincular com um clique.
3. Mande um "Preciso de uma arte para sexta" de um número de cliente e veja o pedido aparecer na Caixa de entrada.
