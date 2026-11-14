# Relatório de caça-bugs — Gamer Optimizer 3000 v1.2.0

Data: 14/11/2026 · Commit testado: `f0949f4`

## Status das correções (14/11/2026, ainda sem commit)

| # | Bug | Status | Correção |
|---|-----|--------|----------|
| 1 | Script do PowerShell adulterável (B2) | ✅ Corrigido | `ps()` usa `-EncodedCommand`; nenhum arquivo `.ps1` é gravado |
| 2 | Injeção por aspas tipográficas (B1) | ✅ Corrigido | `q()` duplica `' ‘ ’ ‚ ‛`; `stoppedServices` só aceita nomes de `SVC_LIST` |
| 3 | Fecha apps com janela aberta (B5) | ✅ Corrigido | processo `auto` com janela vira `suggest` (só fecha se marcado) |
| 4 | Intervalo vazio → 5 min (B4) | ✅ Corrigido | `settings.update` ignora intervalo vazio/inválido e mantém o atual |
| 5 | "Marcar sugeridos" marca escondidos (U1) | ✅ Corrigido | marcar, contar e encerrar respeitam a busca |
| 6 | Barra lateral cortada com zoom (U3) | ✅ Corrigido | barra compacta e rolável abaixo de 520px de altura; `minHeight` 540 |
| 7 | Texto da linha DNS executa a ação (U2) | ✅ Corrigido | linhas com botão viraram `<div>` |
| 8 | Nome longo empurra a coluna (U4) | ✅ Corrigido | nome cortado com reticências |
| — | Jogos da Store não adiam a automática | ✅ Corrigido | estado 7 (`QUNS_APP`) conta como ocupado (não testável aqui) |
| — | Relógio adiantado trava a automática | ✅ Corrigido | `lastAt` limitado a agora (não testável aqui) |
| — | Portátil limpando a si mesmo / bandeja e desligamento | ⏳ Aberto | não reproduzido |

Depois das correções: `backend.test.js` 7/7 e `ui-checks.js` 4/4 passando; app Electron abre sem erros no log.

---

Relatório original abaixo (estado antes das correções).

**Como rodar os testes**
- Núcleo: `node bug-hunt/backend.test.js` → cada `FAIL` é um bug reproduzido (os testes afirmam o comportamento correto e viram testes de regressão depois da correção).
- Interface: abrir o preview (`ui-preview` no `.claude/launch.json`) e colar `bug-hunt/ui-checks.js` no console.

Todos os bugs abaixo foram reproduzidos **duas vezes**. O app roda como **administrador** (o manifesto pede `highestAvailable`), o que torna os dois primeiros sérios.

---

## 1. Script do PowerShell pode ser trocado por outro programa antes de rodar
- **Gravidade:** Crítico (segurança — execução de código como administrador)
- **Onde:** `src/optimizer.js:38-46` (`ps()`)
- **Como reproduzir:** `node bug-hunt/backend.test.js` → teste **B2**. Um observador de pasta em `%TEMP%` acrescenta uma linha ao `g3k-*.ps1` assim que ele aparece; a linha é executada.
- **Esperado:** só o script do app executa. **Aconteceu:** o código de outro processo rodou junto.
- **Causa:** o script é gravado em `%TEMP%` (gravável por qualquer programa do usuário, sem admin) e o PowerShell lê o arquivo depois. Um malware comum, sem privilégios, ganha execução como administrador através do app.
- **Correção sugerida:** não usar arquivo — passar o script com `-EncodedCommand` (Base64 UTF-16LE). Os scripts do app têm no máximo ~3 KB, bem abaixo do limite de linha de comando.
- **Teste:** B2.

## 2. Aspas tipográficas (’ ‘) furam o escape e permitem injetar comandos
- **Gravidade:** Crítico (segurança — execução de código como administrador)
- **Onde:** `src/optimizer.js:47` (`q()`), usado em `setStartup` (`:322`) e na reversão de serviços (`:403`)
- **Como reproduzir:** teste **B1**: `ps("Write-Output '" + q("x’; Write-Output PWNED; ’") + "'")` imprime `x` e **`PWNED`**.
- **Esperado:** o texto inteiro como uma string. **Aconteceu:** o comando embutido executou.
- **Causa:** o PowerShell aceita `’ ‘ ‚ ‛` como aspas simples, mas `q()` só duplica `'`. Vetores reais: (a) qualquer programa pode criar um item em `HKCU\...\Run` com nome malicioso — quando o usuário liga/desliga esse item na aba Inicialização, o comando roda como admin; (b) `stoppedServices` em `state.json` (pasta do usuário) é inserido na reversão de serviços.
- **Correção sugerida:** escapar também `‘’‚‛` (duplicando cada um), ou melhor, passar valores como parâmetros/variáveis de ambiente em vez de texto no script; validar `stoppedServices` contra `SVC_LIST`.
- **Teste:** B1.

## 3. "Otimizar" e a otimização automática fecham à força apps com janela aberta
- **Gravidade:** Alto (perde trabalho / derruba chamada; a automática repete a cada intervalo)
- **Onde:** `src/optimizer.js:111-121` (`classify`) e `killAuto()`
- **Como reproduzir:** teste **B5**: um app qualquer chamado `Teams.exe`, com a janela "Electron" aberta, é classificado como `auto` → seria encerrado com `taskkill /F` sem confirmação.
- **Esperado:** apps na lista automática só são fechados sozinhos quando estão em segundo plano (sem janela). **Aconteceu:** classificado `auto` mesmo com janela.
- **Causa:** a classificação olha só o nome do executável; `MainWindowTitle` é ignorado. Com a otimização automática ligada (padrão: etapa Processos ligada), o Teams/Skype é derrubado no meio de uma reunião a cada intervalo.
- **Correção sugerida:** processos da lista `AUTO` com janela visível viram `suggest` (exigem marcação manual).
- **Teste:** B5.

## 4. Apagar o campo "Personalizado" muda o intervalo para 5 minutos
- **Gravidade:** Médio (otimização completa — fechar processos, limpar arquivos — passa a rodar a cada 5 min)
- **Onde:** `src/settings.js:24-26` (`sanitize`)
- **Como reproduzir:** Configurações → Repetir a cada → Personalizado → apagar o número e sair do campo. Teste **B4**: `''` vira **5 min**; texto inválido (`'abc'`) vira **60 min** em vez de manter 240.
- **Esperado:** valor vazio/inválido mantém o intervalo anterior. **Aconteceu:** `Number('') = 0` → limitado ao mínimo (5).
- **Correção sugerida:** em `update()`, ignorar `intervalMin` que não seja número finito > 0; na interface, não salvar quando o campo estiver vazio.
- **Teste:** B4.

## 5. "Marcar sugeridos" com a busca ativa marca processos escondidos
- **Gravidade:** Médio (encerra processos que o usuário não está vendo)
- **Onde:** `renderer/renderer.js` — handler de `#pSelSuggest` e `updateKillBtn()`
- **Como reproduzir:** Processos → buscar "note" → **Marcar sugeridos**. Só "notepad" aparece, mas o botão diz **"Encerrar 4"** (chrome, OneDrive, Teams, Discord escondidos). Os pré-marcados como Dispensável também continuam marcados quando somem do filtro.
- **Esperado:** marcar/encerrar só o que está visível. **Aconteceu:** 4 processos marcados fora da tela.
- **Correção sugerida:** aplicar o filtro de busca em "Marcar sugeridos" e no encerramento (ou desmarcar itens filtrados).
- **Teste:** U1 em `ui-checks.js`.

## 6. Com zoom 150–200% ou tela baixa, Configurações e Atualização somem
- **Gravidade:** Médio (funções inacessíveis em notebooks com escala alta)
- **Onde:** `renderer/styles.css` — `body { overflow: hidden }` + `.rail` sem rolagem
- **Como reproduzir:** viewport 450×300 (equivale à janela mínima 900×600 com zoom 200%): botões Ajustes (até 320px), Configurações (372px) e Atualização (418px) ficam abaixo da janela de 300px, sem rolagem. Em um 1366×768 com escala 175% a janela mínima (600) nem cabe na tela.
- **Correção sugerida:** `overflow-y: auto` na `.rail` (ou reduzir o espaçamento abaixo de certa altura) e `minHeight` menor na janela.
- **Teste:** U3 em `ui-checks.js`.

## 7. Clicar no texto "Limpar cache DNS" executa a ação
- **Gravidade:** Baixo
- **Onde:** `renderer/renderer.js` — `loadTweaks()` (linha é `<label>` contendo o botão)
- **Como reproduzir:** Ajustes → clicar na descrição da linha "Limpar cache DNS" → a ação roda (o `<label>` ativa o botão dentro dele).
- **Correção sugerida:** usar `<div>` para linhas com botão.
- **Teste:** U2 em `ui-checks.js`.

## 8. Nome de processo/item muito longo empurra a coluna de memória para fora
- **Gravidade:** Baixo (visual)
- **Onde:** `renderer/styles.css` — `.row .t b` sem `overflow: hidden; text-overflow: ellipsis`
- **Como reproduzir:** nome com 3000 caracteres → linha com 27.340px dentro de uma lista de 896px; tamanho em MB some.
- **Correção sugerida:** truncar `.t b` com reticências (o `small` já faz isso).
- **Teste:** U4 em `ui-checks.js`.

---

## Suspeitas fortes (lidas no código, não reproduzidas)
Não contam como bugs confirmados — não consegui criar o cenário real aqui.

- **Jogos da Microsoft Store/Game Pass não adiam a automática.** `isUserBusy()` só considera os estados 2, 3 e 4 de `SHQueryUserNotificationState`; o estado 7 (`QUNS_APP`, app da Store em tela cheia) é tratado como "livre". Jogos em janela sem borda também podem não ser detectados.
- **Relógio adiantado congela a automática.** Se `schedule.json` tiver `lastAt` no futuro (relógio errado e depois corrigido), `nextAt = lastAt + intervalo` fica no futuro até o relógio alcançar. Sugestão: limitar `lastAt` a `Date.now()`.
- **Versão portátil pode apagar os próprios arquivos.** O portátil se extrai em `%TEMP%`; com mais de 2 h aberto, a limpeza de temporários pode remover arquivos dele que não estão em uso.
- **"Continuar na bandeja" pode atrasar o desligamento do Windows**, porque o evento `close` é cancelado sem tratar `session-end`.

## O que foi testado e NÃO quebrou
- Limpeza **não segue junctions** para fora da pasta (B3) — nem na análise nem na exclusão.
- Saída inválida do PowerShell (vazia, BOM, lixo, JSON cortado) não derruba as listas (B6).
- Falha ao gravar configurações (pasta inexistente) não derruba o app e mantém o valor em memória (B7); `settings.json` corrompido é corrigido para os padrões.
- **XSS:** nomes e títulos de processo com `<img onerror>`, emoji e texto RTL são exibidos como texto.
- **Electron:** `contextIsolation`, `sandbox`, `nodeIntegration: false`, CSP sem scripts inline, navegação e janelas novas bloqueadas, `openExternal` só com a URL fixa do repositório, IPC só por funções específicas.
- Dois cliques em "Otimizar" (ou manual + automática juntas) reaproveitam a mesma execução.
- Navegação por teclado (Tab) com foco visível; nenhum erro no console durante todos os testes.
- Sem rolagem horizontal da página em telas estreitas.

**Não testado:** rodar o app por horas (vazamento de memória), sem internet/GitHub fora do ar no auto update, disco cheio real, criação da tarefa agendada de inicialização (altera o sistema) e o `.exe` compilado.
