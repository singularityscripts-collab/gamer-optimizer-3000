# ⚡ Gamer Optimizer 3000

Otimizador de PC para Windows com interface minimalista. Um clique — ou nenhum, com a otimização automática — para deixar o computador mais leve e rápido.

## Download

Baixe na página de [Releases](https://github.com/singularityscripts-collab/gamer-optimizer-3000/releases/latest):

- **`Gamer-Optimizer-3000-Setup-x.y.z.exe`** — instalador, com atualização automática.
- **`Gamer-Optimizer-3000-Portable-x.y.z.exe`** — roda sem instalar (não se atualiza sozinho).

> O executável não tem assinatura digital, então o Windows SmartScreen pode avisar na primeira execução: **Mais informações → Executar assim mesmo**.

## O que ele faz

- **Otimizar** – encerra processos inúteis, aplica ajustes, limpa arquivos e libera RAM, em etapas isoladas (uma falha não interrompe as outras).
- **Otimização automática** – roda a cada intervalo configurado (15 min a 24 h, ou personalizado), escolhendo quais etapas executar. Adia sozinha enquanto um jogo ou app está em tela cheia, notifica ao concluir e continua funcionando com a janela fechada (bandeja do sistema).
- **Processos** – fecha lixo de segundo plano (OneDrive, Teams, updaters, Widgets…). Processos do Windows são protegidos; apps com janela aberta pedem confirmação.
- **Memória** – compacta a memória dos processos (exceto o jogo em primeiro plano) e, como administrador, esvazia o cache standby.
- **Limpeza** – temporários, Prefetch, cache do Windows Update, miniaturas, relatórios de erro, shaders, caches de navegador e Lixeira. Documentos, senhas e histórico não são tocados.
- **Inicialização** – liga/desliga programas que abrem com o Windows (registro e pastas de Inicializar).
- **Ajustes para jogos** – plano de energia, Modo de Jogo, Game DVR, mouse sem aceleração, prioridade multimídia, pausa de serviços, DNS e efeitos visuais. Todos reversíveis.
- **Auto update** – verifica este repositório ao abrir e a cada 4 h, baixa em segundo plano e instala ao fechar (ou na hora, pela aba Atualização).

Logs de diagnóstico ficam em `%APPDATA%\Gamer Optimizer 3000\logs\app.log` (botão **Abrir logs** na aba Atualização).

## Desenvolvimento

```bash
npm install
node node_modules/electron/install.js   # baixa o binário do Electron
npm start                               # roda o app
npm run dist                            # gera instalador e versão portátil em dist/
```

## Publicar uma nova versão

```bash
npm version minor          # ou patch / major — cria a tag vX.Y.Z
git push --follow-tags
```

O workflow [`release.yml`](.github/workflows/release.yml) compila no GitHub Actions e publica o Release com `latest.yml`. Quem tem o app instalado recebe a atualização automaticamente.

## Aviso

Use por sua conta e risco. O app só encerra sozinho processos de uma lista segura e nunca altera arquivos pessoais.
