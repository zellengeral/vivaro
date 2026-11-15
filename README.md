# Vivaro

Aplicação web de gerenciamento, controle e finalização de tarefas pessoais e profissionais, com Kanban e priorização por matriz de Eisenhower.

## Publicar no Netlify (arrastar e soltar o zip)

1. Extraia o conteúdo deste .zip em uma pasta no seu computador.
2. Acesse https://app.netlify.com e faça login.
3. **Não** arraste a pasta extraída direto — o Netlify precisa primeiro rodar o build. Duas formas simples:

### Opção A — Netlify puxa de um repositório Git (recomendado)
1. Suba a pasta extraída para um repositório no GitHub/GitLab.
2. No Netlify: **Add new site → Import an existing project**, conecte o repositório.
3. O Netlify detecta automaticamente `npm run build` e a pasta `dist` (já configurado em `netlify.toml`).
4. Clique em Deploy.

### Opção B — Build local e arrastar a pasta `dist`
1. No terminal, dentro da pasta do projeto:
   ```
   npm install
   npm run build
   ```
2. Isso gera uma pasta `dist/`.
3. No Netlify, vá em **Add new site → Deploy manually** e arraste a pasta `dist` (não a raiz do projeto).

## Rodar localmente

```
npm install
npm run dev
```

## Funcionalidades

- Categorias Pessoal / Profissional, matriz de Eisenhower, 5 estados de tarefa
- 5 visões: Dashboard, Kanban, Lista, Calendário e Timeline
- Recorrência inteligente: todo dia, todo dia útil, semanalmente (dias específicos), a cada X dias, mensal (mesmo dia), último dia útil do mês, primeiro dia do mês, e "a cada X dias após concluir"
- Subtarefas com barra de progresso (`3/5 concluídas · 60%`)
- Anexos clicáveis: fotos, imagens, PDF/documentos, links, notas e localização
- Responsável, observadores e comentários por tarefa (colaboração local, pronta para evoluir para multiusuário)
- Criação de tarefa por voz (botão de microfone) com interpretação de data/hora em português
- Exportação para Google Agenda e backup local (.json)

## Observações

- Os dados (incluindo anexos) ficam salvos no `localStorage` do navegador — locais a cada dispositivo/navegador. Use a tela **Backup** para exportar/importar um `.json` e migrar entre dispositivos.
- O botão "Exportar para Google Agenda" abre uma nova aba com o evento pré-preenchido — a confirmação final é manual (sem integração OAuth automática).
- A criação por voz usa a Web Speech API do navegador (funciona melhor no Google Chrome, requer permissão de microfone e HTTPS). A transcrição é interpretada por um analisador de datas/horas em português (ex.: "amanhã às 10", "segunda-feira", "daqui a 3 dias") — sempre revise os campos antes de salvar.
- Responsável/observadores/comentários funcionam localmente (sem contas de usuário reais); a estrutura de dados já está pronta para, no futuro, virar colaboração multiusuário de verdade com um backend.
- Recorrência gera a próxima ocorrência automaticamente quando a tarefa atual é marcada como "Concluído".

## Assistente de IA (perguntar sobre tarefas)

O botão "IA" no topo abre um chat onde você pode perguntar coisas como "o que tenho pra fazer essa semana?", pedir ajuda de verdade para resolver uma tarefa (ex.: "como resolvo a tarefa X", usando conhecimento geral, não só os dados salvos), ou pedir para ele **agir por você**: "cria uma tarefa pra amanhã às 10 sobre X", "marca a tarefa Y como concluída", "muda o prazo da tarefa Z pra sexta", "exclui a tarefa W". A IA executa a ação de verdade (cria/edita/conclui/exclui a tarefa) e confirma no chat o que fez. Usa a API gratuita do Google Gemini, chamada diretamente do navegador (sem servidor/backend).

**Configuração (uma vez só):**
1. Acesse `aistudio.google.com`, entre com uma conta Google e gere uma chave de API gratuita (não pede cartão de crédito).
2. **Restrinja a chave por domínio** (importante, para ninguém mais conseguir usá-la): acesse `console.cloud.google.com` → APIs & Services → Credentials → edite a chave → em "Restrições de aplicativo" escolha "Referenciadores HTTP (sites)" e adicione o domínio do seu site publicado no Netlify (ex.: `https://seu-site.netlify.app/*`).
3. No Netlify: **Site settings → Environment variables → Add a variable** → nome `VITE_GEMINI_API_KEY`, valor a chave gerada.
4. Dispare um novo deploy (Netlify → Deploys → Trigger deploy) para a chave ser incluída no build.

Para testar localmente, copie `.env.example` para `.env.local` e preencha com sua chave — esse arquivo não é enviado ao Git.

**Sobre a segurança:** como o Vivaro é um site estático, a chave fica embutida no JavaScript compilado do site (não no código-fonte enviado ao GitHub). A restrição por domínio é a proteção recomendada pelo próprio Google para esse cenário — impede que a chave seja usada em outro site, mesmo que alguém a encontre no navegador. Como é conta gratuita sem cobrança, o pior cenário é sua cota diária gratuita ser consumida por terceiros, sem risco financeiro.

**Limite gratuito:** até 1.500 perguntas por dia no modelo usado (`gemini-2.5-flash`) — mais que suficiente para uso pessoal.

## Notificações de lembrete

- Ao abrir o app, ele pede permissão para enviar notificações do navegador. É preciso clicar em "Ativar" no aviso que aparece no topo (ou permitir quando o navegador perguntar).
- **Instale o Vivaro no celular para receber os lembretes em formato de notificação de verdade:** o app agora é um PWA (Progressive Web App) instalável. Um banner aparece no topo oferecendo a instalação:
  - **Android/Chrome:** toque em "Instalar" no banner (ou no menu do navegador, em "Instalar app"/"Adicionar à tela inicial").
  - **iPhone/Safari:** toque no ícone de Compartilhar e depois em "Adicionar à Tela de Início".
  - Depois de instalado, o Vivaro ganha um ícone próprio na tela do celular e as notificações passam a se comportar como as de um app normal.
- **Importante:** como o Vivaro não tem servidor por trás (é um site estático), os lembretes só disparam **enquanto o app estiver aberto ou tiver sido usado recentemente em segundo plano**. Se o sistema encerrar o app por completo (ex.: depois de muito tempo sem uso, ou reinício do celular), a checagem para até você abrir o app de novo. Não é um push notification real de servidor — para isso, seria necessário adicionar um backend (ver observação abaixo).
- Mesmo sem a permissão do navegador concedida, os lembretes também aparecem como um aviso dentro do próprio app (canto inferior direito), enquanto o app estiver aberto.
- Se as notificações não aparecerem: (1) confira se a permissão foi concedida; (2) confira se as notificações do site/app não estão bloqueadas nas configurações do celular; (3) confira se a tarefa tem prazo (data/hora) definido — sem prazo, o lembrete não tem uma hora de referência para disparar.

---

## APK Android (notificações nativas, alarmes e despertador)

O mesmo código gera duas versões: o site (ptisp, `npm run build`) e o APK (GitHub Actions).

### Gerar o APK
1. No GitHub, em **Settings → Secrets and variables → Actions → New repository secret**, crie `GEMINI_API_KEY` com a sua chave do Gemini (uma só vez).
2. Envie as alterações para o GitHub (`git push`).
3. Separador **Actions → Gerar APK do Vivaro → Run workflow**.
4. Quando terminar (±6–10 min), abra a execução e descarregue **vivaro-apk** (zip com `vivaro.apk`).
5. Instale o `vivaro.apk` no telemóvel (permita "instalar de fontes desconhecidas"). As versões seguintes instalam por cima, sem desinstalar, porque a assinatura é fixa (`native/vivaro-debug.keystore`).

### O que o APK faz a mais que o site
- Lembretes nativos com alarme exato (funcionam com a app fechada e ecrã bloqueado) e reagendados após reiniciar o telemóvel.
- Botões na notificação: **Adiar 10 min**, **Adiar 1 h**, **Concluir**.
- Por tarefa: **Despertador** (som de alarme que repete até dispensar) e opção de criar também um alarme na app Relógio.
- Serviço discreto em segundo plano, ecrã ⚙ "Lembretes e alarmes" (permissões, bateria, testes).
- Voz nativa (microfone) e exportação de backup pela folha de partilha.

### Notas
- Os dados do APK são independentes dos do site: use **Backup** para os passar de um para o outro.
- O Android pode exigir que desative a otimização de bateria do Vivaro (o ecrã ⚙ leva-o lá).

### Menu de módulos, Saúde e idiomas (v1.2)
- Menu fixo no rodapé com scroll horizontal (Tarefas, Saúde). Para acrescentar um módulo, adicione uma linha em `MODULES` no `App.jsx`.
- Saúde → Hidratação: botão ligar/desligar, dias da semana, início e fim dos alertas, frequência, meta diária e 3 quantidades rápidas (200/300/400 ml). No APK o próprio Android repete os lembretes (sem limite de dias) e cada notificação traz uma curiosidade diferente sobre hidratação, com botões de quantidade.
- Definições (⚙): idioma (EN, PT, ES, DE, FR, JA, ZH, SV, NL, PL, RU). Textos em `src/i18n.js`.

## v1.4.0 — Finanças
- Novo módulo **Finanças** (menu inferior): contas, cartões (limite, fecho, vencimento), receitas/despesas/transferências, parcelamentos, recorrências, categorias e subcategorias, tetos mensais, metas (cofrinhos) e fluxo de caixa futuro. Valores em centavos.
- Backup unificado v4 (`tasks` + `health` + `finance`), restauro por junção de ids.
- Botão "Adicionar" da hidratação alinhado; assistente de IA mais rápido (raciocínio mínimo, modelo em cache, contexto reduzido).
- Documentação: `FINANCAS-SQLITE.md` (+ `docs/financas-schema.sql`).

## v1.5.0 — Novos submódulos de Saúde
Medicamentos (alertas diários com alarme, histórico de tomas, stock com aviso e despesa em Finanças), Consultas e exames (validade, renovação, anexos), Biometria (gráficos e IMC), Sono (cruza com tarefas concluídas), Humor, Pausas e respiração, Atividade física, Refeições e jejum. Tudo entra no backup (campo `health`).

## v1.6.0 — Objetivos (Goal-Backward Planning)
Módulo **Objetivos**: objetivo final → processos → ações, "Estruturar com IA" (Gemini com saída JSON estruturada), pré-visualização editável, acordeão com progresso e criação de tarefas a partir das ações. Backup v5 (`goals`). Ver `OBJETIVOS-IA.md`.

## v1.7.0 — Ecossistema (Cross-Module Bridge)
Ações dos Objetivos podem trazer ligações propostas pela IA (hidratação, cardápio de 30 dias, despesas/orçamento/cofrinho, tarefas repetidas), validadas por lista branca e aplicadas em cadeia ao guardar. "Estruturar tarefa com IA" no editor de tarefas. Ver `ECOSSISTEMA.md`.

## v1.7.1
Objetivos: layout móvel reorganizado (ações, chips e botões empilhados). "Estruturar tarefa com IA" em streaming (subtarefas aparecem à medida que chegam). Cardápio com quantidades por ingrediente, gerado em blocos paralelos; planos antigos podem ser regenerados.

## v1.7.2
Correções: botão Salvar do editor de tarefas (ficava por baixo do menu inferior), campo de comentários responsivo, e sincronização idempotente das tarefas de medicamentos/consultas (guardar de novo não duplica lembretes; remove duplicados antigos).
