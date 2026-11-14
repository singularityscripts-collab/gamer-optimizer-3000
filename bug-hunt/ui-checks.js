// Checagens de interface (rodar no console do preview: node com o servidor "ui-preview" do .claude/launch.json,
// abrir http://localhost:5173 e colar este arquivo). Cada item imprime PASS/FAIL. FAIL = bug presente.
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const check = (id, ok, msg) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${msg}`);

  // U1 — "Marcar sugeridos" com busca ativa marca processos escondidos pelo filtro
  document.querySelector('.nav[data-tab=processes]').click(); await wait(800);
  const s = document.getElementById('pSearch'); s.value = 'note'; s.dispatchEvent(new Event('input')); await wait(200);
  document.getElementById('pSelSuggest').click(); await wait(200);
  const visible = document.querySelectorAll('#procList input:checked').length;
  const counted = Number((document.getElementById('pKill').textContent.match(/\d+/) || [0])[0]);
  check('U1', counted === visible, `botão diz "Encerrar ${counted}", mas só ${visible} marcado(s) visível(is)`);
  s.value = ''; s.dispatchEvent(new Event('input'));

  // U2 — clicar no texto da linha "Limpar cache DNS" executa a ação
  const calls = []; const orig = api.setTweak; api.setTweak = async (id) => { calls.push(id); return { ok: true }; };
  document.querySelector('.nav[data-tab=tweaks]').click(); await wait(800);
  [...document.querySelectorAll('#tweakList .row')].find((r) => r.textContent.includes('DNS')).querySelector('.t small').click();
  await wait(300); api.setTweak = orig;
  check('U2', calls.length === 0, `clicar só no texto chamou: ${JSON.stringify(calls)}`);

  // U3 — com zoom 200% / janela baixa, os botões de baixo da barra lateral ficam fora da tela
  // (acessível = cabe na tela ou a barra rola até ele)
  document.querySelector('.nav[data-tab=update]').scrollIntoView({ block: 'nearest' }); await wait(100);
  const b = document.querySelector('.nav[data-tab=update]').getBoundingClientRect();
  check('U3', b.bottom <= innerHeight, `botão Atualização termina em ${Math.round(b.bottom)}px, janela tem ${innerHeight}px (redimensione para 450x300 antes)`);

  // U4 — nome de processo enorme empurra a coluna de memória para fora
  api.processes = async () => [{ name: 'A'.repeat(3000), count: 1, mem: 1e6, path: 'C:\\x', title: 't', kind: 'normal' }];
  document.querySelector('.nav[data-tab=processes]').click(); await wait(800);
  const size = document.querySelector('#procList .size').getBoundingClientRect();
  check('U4', size.right <= document.getElementById('procList').getBoundingClientRect().right, 'coluna de memória visível com nome longo');
})();
