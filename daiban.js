(async () => {
  const GAS = window.DAIBAN_GAS;
  if (!GAS) { alert('GASのURLが設定されていません'); return; }
  const post = async b => {
    const r = await fetch(GAS, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify(b) });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  };
  const host = location.hostname;
  try {
    if (/site777\.jp$/.test(host)) await site7();
    else if (/teramoba2\.com$/.test(host)) await teramoba();
    else alert('対応していないサイトです');
  } catch (e) {
    alert('エラー: ' + e.message);
  }

  // ================= サイトセブン =================
  async function site7() {
    const MIN = 4000, MAX = 8000;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const q = new URLSearchParams(location.search);
    const hallId = q.get('pmc');
    if (!hallId || !/D0300\.do$/.test(location.pathname)) { alert('ホールの機種一覧ページで実行してください'); return; }
    const hallName = (document.querySelector('h2.page-title')?.textContent || hallId).trim();
    const KEY = 'bulk2_' + hallId, today = new Date().toDateString();
    let st = {};
    try { st = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    if (st.date !== today) st = { date: today, pages: {}, list: {}, done: {} };
    const save = () => localStorage.setItem(KEY, JSON.stringify(st));

    const links = [...document.querySelectorAll('div.model a[href*="mdc="]')];
    if (!links.length) { alert('機種が見つかりません'); return; }
    const urt = new URL(links[0].href).searchParams.get('urt');
    links.forEach(a => {
      const p = new URL(a.href).searchParams;
      st.list[p.get('mdc')] = { name: a.querySelector('strong').textContent.replace(/\s*\[\d+\]\s*$/, '').trim(), urt: p.get('urt') };
    });
    const nums = [...document.querySelectorAll('ul.pager-style a')].map(a => parseInt(a.textContent, 10)).filter(n => n > 0);
    const total = nums.length ? Math.max(...nums) : 1;
    const cur = parseInt(document.querySelector('ul.pager-style a.active')?.textContent, 10) || 1;
    st.pages[urt + ':' + cur] = 1;
    save();
    const got = [...Array(total).keys()].filter(i => st.pages[urt + ':' + (i + 1)]).length;
    if (got < total) { alert('全' + total + 'ページ中' + got + 'ページ収集しました。\n別のページを開いて、もう一度実行してください'); return; }

    let plan;
    try {
      plan = await post({ action: 'plan', site: 'サイトセブン', hallId, hallName, models: [...new Set(Object.values(st.list).map(m => m.name))] });
    } catch (e) { alert('GASに接続できませんでした。\nURLとデプロイ設定(アクセス:全員)を確認してください\n' + e.message); return; }

    const ex = new Set(plan.excluded);
    const all = Object.keys(st.list);
    const skipEx = all.filter(m => ex.has(st.list[m].name));
    let todo = all.filter(m => !ex.has(st.list[m].name) && !st.done[m]);
    const doneN = all.filter(m => st.done[m]).length;
    if (!todo.length && doneN) {
      if (!confirm('本日分は取得済みです。全機種を取り直しますか?')) return;
      st.done = {}; save();
      todo = all.filter(m => !ex.has(st.list[m].name));
    }
    if (!todo.length) { alert('取得対象の機種がありません'); return; }
    if (!confirm(hallName + '\n全' + all.length + '機種中、' + todo.length + '機種を取得します\n(除外' + skipEx.length + '機種 / 取得済み' + doneN + '機種)\n所要時間: 約' + Math.ceil(todo.length * 6 / 60) + '分\n\n実行しますか?\n※除外したい機種がある場合はキャンセルし、「略称リスト」の「除外」にチェックを入れてから再実行してください')) return;

    let stop = false, ok = 0;
    const warn = [];
    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:99999;background:rgb(34,34,34);color:white;padding:10px;font-size:13px;border-radius:6px;opacity:.92;';
    box.onclick = () => { stop = true; box.textContent = '中断します…'; };
    document.body.appendChild(box);

    for (let i = 0; i < todo.length && !stop; i++) {
      const mdc = todo[i], m = st.list[mdc];
      box.textContent = '(' + (i + 1) + '/' + todo.length + ') ' + m.name + '  ※クリックで中断';
      try {
        const res = await fetch('D3300.do?pmc=' + hallId + '&mdc=' + mdc + '&bn=1&soc=1&sw=1&pan=1&urt=' + m.urt + '&dtdd=0', { credentials: 'same-origin' });
        if (!res.ok) { alert('HTTP ' + res.status + ' のため中断します(' + m.name + ')'); break; }
        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
        const tbl = doc.getElementById('dedama_data_list');
        if (!tbl) { alert('想定外のページが返ったため中断します(' + m.name + ')\nアクセス制限の可能性があります。時間を置いてください。'); break; }
        const nos = [...new Set([...tbl.querySelectorAll('tbody.cnt td.daiData a')].map(a => parseInt(a.textContent, 10)).filter(n => n > 0))];
        const exp = +((doc.querySelector('p.hd-style-radius')?.textContent || '').match(/(\d+)台/) || [])[1] || 0;
        if (!nos.length) warn.push(m.name + ': 台番0件');
        else {
          if (exp && exp !== nos.length) warn.push(m.name + ': 表示' + exp + '台/取得' + nos.length + '台');
          await post({ action: 'save', hallId, hallName, name: m.name, nos });
          st.done[mdc] = Date.now(); save(); ok++;
        }
      } catch (e) { alert('エラーのため中断します: ' + e.message); break; }
      await sleep(MIN + Math.random() * (MAX - MIN));
    }

    box.remove();
    if (!stop) { try { await post({ action: 'finish', hallId }); } catch (e) {} }
    alert((stop ? '中断' : '完了') + ': ' + ok + '機種を送信' + (warn.length ? '\n\n要確認:\n' + warn.join('\n') : ''));
  }

  // ================= テラモバ =================
  // 表示中のページを読むだけで、サイトへの追加アクセスはしない
  async function teramoba() {
    const seg = location.pathname.split('/').filter(Boolean)[0] || '';
    const hallId = host + (seg ? '/' + seg : '');
    const HK = 'tm_hall_' + hallId, MK = 'tm_models_' + hallId;

    let hallName = localStorage.getItem(HK);
    if (!hallName) {
      hallName = (prompt('このホールの名前を入力してください(初回のみ)') || '').trim();
      if (!hallName) return;
      localStorage.setItem(HK, hallName);
    }
    let counts = {};
    try { counts = JSON.parse(localStorage.getItem(MK) || '{}'); } catch (e) {}

    const listTbl = document.querySelector('table.machinelist');
    const standTbl = document.querySelector('#standlist table.standlist');

    // ---- 機種一覧ページ ----
    if (listTbl) {
      const rows = [...listTbl.querySelectorAll('tbody tr')].map(tr => {
        const a = tr.querySelector('td.wrap-machine-name a');
        const c = tr.querySelector('td.space-right');
        return a ? { name: a.textContent.trim(), cnt: parseInt(c ? c.textContent : '', 10) || 0 } : null;
      }).filter(Boolean);
      if (!rows.length) { alert('機種が見つかりません'); return; }
      rows.forEach(r => { counts[r.name] = r.cnt; });
      localStorage.setItem(MK, JSON.stringify(counts));
      const names = rows.map(r => r.name);

      const plan = await post({ action: 'plan', site: 'テラモバ', hallId, hallName, models: names });
      const chk = await post({ action: 'listcheck', hallId, models: names });
      const todo = chk.items.filter(i => i.abbr && !i.ex && i.saved === 0).map(i => i.name);
      const diff = chk.items.filter(i => i.saved > 0 && i.saved !== counts[i.name])
        .map(i => i.name + ': 表示' + counts[i.name] + '台/保存' + i.saved + '台');

      alert(hallName + '\n' + names.length + '機種を確認しました\n(新規登録' + plan.added + '件 / うち略称を自動補完' + plan.filled + '件)' +
        (todo.length ? '\n\n▼台番未取得(略称あり)\n' + todo.join('\n') : '\n\n台番未取得の機種はありません') +
        (diff.length ? '\n\n▼台数不一致\n' + diff.join('\n') : ''));
      return;
    }

    // ---- 台番一覧ページ ----
    if (standTbl) {
      const nos = [...new Set([...standTbl.querySelectorAll('tbody td.sticky-column a')]
        .map(a => parseInt(a.textContent, 10)).filter(n => n > 0))];
      if (!nos.length) { alert('台番が見つかりません'); return; }

      const text = document.body.innerText;
      const found = Object.keys(counts).filter(n => text.includes(n)).sort((a, b) => b.length - a.length);
      let name = found[0] || '';
      if (found.length !== 1) {
        name = (prompt(found.length ? '機種名を確認してください' : '機種名を自動取得できませんでした。機種名を入力してください\n(先に機種一覧ページで実行しておくと自動取得できます)', name) || '').trim();
        if (!name) return;
      }

      const plan = await post({ action: 'plan', site: 'テラモバ', hallId, hallName, models: [name] });
      if (plan.excluded.includes(name) && !confirm(name + ' は除外機種です。保存しますか?')) return;
      await post({ action: 'save', hallId, hallName, name, nos });
      await post({ action: 'finish', hallId });

      const exp = counts[name];
      alert(name + '\n' + nos.length + '台を保存しました(' + nos[0] + '〜' + nos[nos.length - 1] + ')' +
        (exp && exp !== nos.length ? '\n\n※機種一覧の表示は' + exp + '台です' : ''));
      return;
    }

    alert('機種一覧ページか、台番一覧ページで実行してください');
  }
})();
