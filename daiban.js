(async () => {
  const GAS = window.DAIBAN_GAS;
  if (!GAS) { alert('GASのURLが設定されていません'); return; }
  const post = async b => {
    const r = await fetch(GAS, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(b),
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j;
  };
  const BOX_CSS = 'position:fixed;top:20px;left:10px;right:10px;' +
    'z-index:99999;background:rgb(34,34,34);color:white;' +
    'padding:12px;font-size:15px;border-radius:8px;' +
    'text-align:center;opacity:.95;';
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
    if (!hallId || !/D0300\.do$/.test(location.pathname)) {
      alert('ホールの機種一覧ページで実行してください');
      return;
    }
    const titleEl = document.querySelector('h2.page-title');
    const hallName = (titleEl ? titleEl.textContent : hallId).trim();
    const KEY = 'bulk2_' + hallId;
    const today = new Date().toDateString();
    let st = {};
    try { st = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
    if (st.date !== today) {
      st = { date: today, pages: {}, list: {}, done: {} };
    }
    const save = () => localStorage.setItem(KEY, JSON.stringify(st));

    const links = [...document.querySelectorAll('div.model a[href*="mdc="]')];
    if (!links.length) { alert('機種が見つかりません'); return; }
    const urt = new URL(links[0].href).searchParams.get('urt');
    links.forEach(a => {
      const p = new URL(a.href).searchParams;
      const raw = a.querySelector('strong').textContent;
      const nm = raw.replace(/\s*\[\d+\]\s*$/, '').trim();
      st.list[p.get('mdc')] = { name: nm, urt: p.get('urt') };
    });
    const nums = [...document.querySelectorAll('ul.pager-style a')]
      .map(a => parseInt(a.textContent, 10))
      .filter(n => n > 0);
    const total = nums.length ? Math.max(...nums) : 1;
    const act = document.querySelector('ul.pager-style a.active');
    const cur = parseInt(act ? act.textContent : '', 10) || 1;
    st.pages[urt + ':' + cur] = 1;
    save();
    let got = 0;
    for (let i = 1; i <= total; i++) {
      if (st.pages[urt + ':' + i]) got++;
    }
    if (got < total) {
      alert('全' + total + 'ページ中' + got + 'ページ収集しました。\n' +
        '別のページを開いて、もう一度実行してください');
      return;
    }

    let plan;
    try {
      const names = Object.values(st.list).map(m => m.name);
      const models = [...new Set(names)];
      plan = await post({
        action: 'plan', site: 'サイトセブン', hallId, hallName, models,
      });
    } catch (e) {
      alert('GASに接続できませんでした。\n' +
        'URLとデプロイ設定(アクセス:全員)を確認してください\n' +
        e.message);
      return;
    }

    const ex = new Set(plan.excluded);
    const all = Object.keys(st.list);
    const isEx = m => ex.has(st.list[m].name);
    const skipEx = all.filter(isEx);
    let todo = all.filter(m => !isEx(m) && !st.done[m]);
    const doneN = all.filter(m => st.done[m]).length;
    if (!todo.length && doneN) {
      if (!confirm('本日分は取得済みです。全機種を取り直しますか?')) return;
      st.done = {};
      save();
      todo = all.filter(m => !isEx(m));
    }
    if (!todo.length) { alert('取得対象の機種がありません'); return; }
    const mins = Math.ceil(todo.length * 6 / 60);
    const msg = hallName + '\n' +
      '全' + all.length + '機種中、' + todo.length + '機種を取得します\n' +
      '(除外' + skipEx.length + '機種 / 取得済み' + doneN + '機種)\n' +
      '所要時間: 約' + mins + '分\n\n' +
      '実行しますか?\n' +
      '※除外したい機種がある場合はキャンセルし、\n' +
      '「略称リスト」の「除外」にチェックを入れてから\n' +
      '再実行してください';
    if (!confirm(msg)) return;

    let stop = false, ok = 0;
    const warn = [];
    const box = document.createElement('div');
    box.style.cssText = BOX_CSS;
    box.onclick = () => { stop = true; box.textContent = '中断します…'; };
    document.body.appendChild(box);

    for (let i = 0; i < todo.length && !stop; i++) {
      const mdc = todo[i];
      const m = st.list[mdc];
      box.textContent = '(' + (i + 1) + '/' + todo.length + ') ' +
        m.name + '  ※クリックで中断';
      try {
        const url = 'D3300.do?pmc=' + hallId +
          '&mdc=' + mdc +
          '&bn=1&soc=1&sw=1&pan=1' +
          '&urt=' + m.urt +
          '&dtdd=0';
        const res = await fetch(url, { credentials: 'same-origin' });
        if (!res.ok) {
          alert('HTTP ' + res.status + ' のため中断します(' + m.name + ')');
          break;
        }
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const tbl = doc.getElementById('dedama_data_list');
        if (!tbl) {
          alert('想定外のページが返ったため中断します(' + m.name + ')\n' +
            'アクセス制限の可能性があります。時間を置いてください。');
          break;
        }
        const cells = tbl.querySelectorAll('tbody.cnt td.daiData a');
        const nos = [...new Set([...cells]
          .map(a => parseInt(a.textContent, 10))
          .filter(n => n > 0))];
        const headEl = doc.querySelector('p.hd-style-radius');
        const head = headEl ? headEl.textContent : '';
        const hm = head.match(/(\d+)台/);
        const exp = hm ? Number(hm[1]) : 0;
        if (!nos.length) {
          warn.push(m.name + ': 台番0件');
        } else {
          if (exp && exp !== nos.length) {
            warn.push(m.name + ': 表示' + exp + '台/取得' + nos.length + '台');
          }
          await post({ action: 'save', hallId, hallName, name: m.name, nos });
          st.done[mdc] = Date.now();
          save();
          ok++;
        }
      } catch (e) {
        alert('エラーのため中断します: ' + e.message);
        break;
      }
      await sleep(MIN + Math.random() * (MAX - MIN));
    }

    box.remove();
    if (!stop) {
      try { await post({ action: 'finish', hallId }); } catch (e) {}
    }
    alert((stop ? '中断' : '完了') + ': ' + ok + '機種を送信' +
      (warn.length ? '\n\n要確認:\n' + warn.join('\n') : ''));
  }

  // ================= テラモバ =================
  // 表示中のページを読むだけ。ページ移動は自分でボタンを押したときだけ
  async function teramoba() {
    const seg = location.pathname.split('/').filter(Boolean)[0] || '';
    const hallId = host + (seg ? '/' + seg : '');
    const HK = 'tm_hall_' + hallId;
    const MK = 'tm_models_' + hallId;
    const QK = 'tm_q_' + hallId;

    let hallName = localStorage.getItem(HK);
    if (!hallName) {
      const ans = prompt('このホールの名前を入力してください(初回のみ)');
      hallName = (ans || '').trim();
      if (!hallName) return;
      localStorage.setItem(HK, hallName);
    }
    let counts = {};
    try { counts = JSON.parse(localStorage.getItem(MK) || '{}'); } catch (e) {}

    // 今日の巡回リスト
    const today = new Date().toDateString();
    let q = {};
    try { q = JSON.parse(localStorage.getItem(QK) || '{}'); } catch (e) {}
    if (q.date !== today) {
      q = { date: today, list: [], done: {}, listUrl: '' };
    }
    const saveQ = () => localStorage.setItem(QK, JSON.stringify(q));

    const toast = (msg, ms) => new Promise(res => {
      const d = document.createElement('div');
      d.textContent = msg;
      d.style.cssText = BOX_CSS;
      document.body.appendChild(d);
      setTimeout(() => { d.remove(); res(); }, ms);
    });

    const listTbl = document.querySelector('table.machinelist');
    const standTbl = document.querySelector('#standlist table.standlist');

    // ---------- 機種一覧ページ ----------
    if (listTbl) {
      const rows = [...listTbl.querySelectorAll('tbody tr')].map(tr => {
        const a = tr.querySelector('td.wrap-machine-name a');
        const c = tr.querySelector('td.space-right');
        if (!a) return null;
        const cnt = parseInt(c ? c.textContent : '', 10) || 0;
        return { tr, name: a.textContent.trim(), cnt };
      }).filter(Boolean);
      if (!rows.length) { alert('機種が見つかりません'); return; }

      const openRow = async (name, pos, total) => {
        const r = rows.find(x => x.name === name);
        if (!r) {
          alert(name + '\nが一覧に見つからないため、スキップします');
          q.done[name] = 'skip';
          saveQ();
          return;
        }
        q.listUrl = location.href;
        saveQ();
        await toast('(' + pos + '/' + total + ') ' + name + ' を開きます', 600);
        r.tr.click();
      };

            // 巡回中なら次の機種へ(リセット用ブックマークレットのときは再チェック)
      const reset = window.DAIBAN_MODE === 'reset';
      window.DAIBAN_MODE = '';
      const pending = q.list.filter(n => !q.done[n]);
      if (!reset && q.list.length && pending.length) {
        // 取得済みを薄く、次の機種を枠で囲んでスクロール
        rows.forEach(r => { if (q.done[r.name]) r.tr.style.opacity = '0.4'; });
        const nextRow = rows.find(x => x.name === pending[0]);
        if (nextRow) {
          nextRow.tr.style.outline = '3px solid orange';
          nextRow.tr.scrollIntoView({ block: 'center' });
        }
        const pos = q.list.length - pending.length + 1;
        await openRow(pending[0], pos, q.list.length);
        return;
      }
      if (!reset && q.list.length) {
        alert('本日の' + q.list.length + '機種はすべて完了しています。\n' +
          '「メモを再生成」でメモを作ってください。\n' +
          '(やり直す場合はリセット用ブックマークレットを押してください)');
        return;
      }

      // 機種の登録・チェック
      rows.forEach(r => { counts[r.name] = r.cnt; });
      localStorage.setItem(MK, JSON.stringify(counts));
      const names = rows.map(r => r.name);
      const plan = await post({
        action: 'plan', site: 'テラモバ', hallId, hallName, models: names,
      });
      const chk = await post({ action: 'listcheck', hallId, models: names });
      const todo = chk.items
        .filter(i => i.abbr && !i.ex && i.saved === 0)
        .map(i => i.name);
      const diff = chk.items
        .filter(i => i.saved > 0 && i.saved !== counts[i.name])
        .map(i => i.name + ': 表示' + counts[i.name] + '台/保存' + i.saved + '台');
      const list = chk.items.filter(i => !i.ex).map(i => i.name);
      const exN = chk.items.length - list.length;

            // 今日取得済みの機種は進み具合を残す
      q = { date: today, list, done: q.done || {}, listUrl: location.href };
      saveQ();
      const rest = list.filter(n => !q.done[n]);

      let msg = hallName + '\n' +
        names.length + '機種を確認しました\n' +
        '(新規登録' + plan.added + '件 / ' +
        'うち略称を自動補完' + plan.filled + '件)';
      if (todo.length) msg += '\n\n▼台番未取得(略称あり)\n' + todo.join('\n');
      if (diff.length) msg += '\n\n▼台数不一致\n' + diff.join('\n');
      msg += '\n\n' + list.length + '機種を順番に回ります' +
        '(除外' + exN + '機種 / 残り' + rest.length + '機種)。\n' +
        '次の機種を開きますか?';
      if (confirm(msg) && rest.length) {
        await openRow(rest[0], list.length - rest.length + 1, list.length);
      }
      return;
    }

    // ---------- 台番一覧ページ ----------
    if (standTbl) {
      const links = standTbl.querySelectorAll('tbody td.sticky-column a');
      const nos = [...new Set([...links]
        .map(a => parseInt(a.textContent, 10))
        .filter(n => n > 0))];
      if (!nos.length) { alert('台番が見つかりません'); return; }

      const text = document.body.innerText;
      const found = Object.keys(counts)
        .filter(n => text.includes(n))
        .sort((a, b) => b.length - a.length);
      let name = found[0] || '';
      let manual = false;
      if (found.length !== 1) {
        const ask = found.length
          ? '機種名を確認してください'
          : '機種名を自動取得できませんでした。機種名を入力してください\n' +
            '(先に機種一覧ページで実行しておくと自動取得できます)';
        name = (prompt(ask, name) || '').trim();
        if (!name) return;
        manual = !(name in counts);
      }

      // 保存中の表示
      const box = document.createElement('div');
      box.textContent = name + '  保存中…';
      box.style.cssText = BOX_CSS;
      document.body.appendChild(box);

      try {
        // 手入力した機種名のときだけ登録する
        if (manual) {
          await post({
            action: 'plan', site: 'テラモバ', hallId, hallName, models: [name],
          });
        }
        await post({ action: 'save', hallId, hallName, name, nos });
      } catch (e) {
        box.remove();
        alert('保存に失敗しました: ' + e.message);
        return;
      }

      if (q.list.includes(name)) q.done[name] = 1;
      saveQ();
      const doneN = q.list.filter(n => q.done[n]).length;

      const exp = counts[name];
      if (exp && exp !== nos.length) {
        box.remove();
        alert(name + '\n' + nos.length + '台を保存しました\n\n' +
          '※機種一覧の表示は' + exp + '台です。確認してください');
      } else {
        box.textContent = name + '  ' + nos.length + '台を保存' +
          (q.list.length ? ' (' + doneN + '/' + q.list.length + ')' : '');
      }

      // 一覧から来ていれば「戻る」でスクロール位置を保つ
      const ref = (document.referrer || '').split('#')[0];
      if (q.listUrl && ref !== q.listUrl.split('#')[0]) {
        location.href = q.listUrl;
        return;
      }
      history.back();
      // 「戻る」が効かないときは一覧のURLを開く
      setTimeout(() => {
        if (q.listUrl) location.href = q.listUrl;
      }, 800);
      return;
    }

    alert('機種一覧ページか、台番一覧ページで実行してください');
  }
})();
