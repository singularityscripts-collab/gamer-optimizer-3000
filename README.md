# ⚡ Gamer Optimizer 3000

Otimizador de PC para Windows com interface moderna. Um clique para deixar o computador mais leve e rápido.

## O que ele faz

- **Otimizar tudo** – executa todo o pipeline abaixo de uma vez.
- **Fecha tarefas inúteis** – OneDrive, Teams, Skype, updaters (Adobe, Google, Java), Widgets, Game Bar e similares. Processos do Windows são protegidos e nunca são encerrados. Outros apps (Discord, Chrome, Steam…) só fecham se você marcar.
- **Limpa a RAM** – reduz o working set de todos os processos e, como administrador, esvazia a lista *standby*.
- **Limpeza de arquivos** – temporários, Prefetch, cache do Windows Update, miniaturas, dumps/relatórios de erro, cache de shaders, cache de Chrome/Edge/Firefox e Lixeira (não toca em documentos, senhas ou histórico).
- **Inicialização** – liga/desliga programas que abrem com o Windows.
- **Ajustes para jogos** – plano de energia de desempenho máximo, Modo de Jogo, Game DVR off, mouse sem aceleração, prioridade multimídia/rede, pausa de serviços (SysMain, DiagTrack, WSearch…), apps em segundo plano, flush de DNS e efeitos visuais. Todos reversíveis.
- **Auto update** – verifica o GitHub Releases ao abrir e a cada 4 h, baixa e instala sozinho.

> Dica: execute como administrador (o instalador já pede) para limpeza completa e ajustes avançados.

## Instalar

Baixe o `Gamer-Optimizer-3000-Setup-x.y.z.exe` na página de [Releases](../../releases/latest).

## Desenvolvimento

```bash
npm install
node node_modules/electron/install.js   # baixa o binário do Electron
npm start                               # roda o app
npm run dist                            # gera o instalador em dist/
```

## Como funciona o auto update

O app usa `electron-updater` apontando para os Releases deste repositório. Para publicar uma nova versão:

```bash
npm version patch          # ou minor / major — cria a tag vX.Y.Z
git push --follow-tags
```

O workflow [`release.yml`](.github/workflows/release.yml) compila o instalador no GitHub Actions e publica o Release com o `latest.yml`. Quem já tem o app instalado recebe a atualização automaticamente.

## Aviso

Use por sua conta e risco. O app só encerra processos de uma lista segura sem perguntar e nunca altera arquivos pessoais.
