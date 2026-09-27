// ==UserScript==
// @name         喰ポイント取得ボタン（サイトセブン / 台データオンライン）
// @namespace    wootanland.shoku-point-tool
// @version      1.5
// @description  ページ右下に喰ポイント取得ボタンを表示し、タップで現在の喰ポイントを計算してツールに送信します
// @match        https://*.site777.jp/f/D3100.do*
// @match        https://daidata.goraggio.com/*/detail*
// @match        https://*.pt.teramoba2.com/*/standgraph*
// @grant        none
// @run-at       document-idle
// @updateURL    https://wootanland.github.io/shoku-point-tool/shoku_point_floating_button.user.js
// @downloadURL  https://wootanland.github.io/shoku-point-tool/shoku_point_floating_button.user.js
// ==/UserScript==

(function () {
  'use strict';

  const API_URL = 'https://script.google.com/macros/s/AKfycbyLPgRPkHY932M2JleXKsKJ5TZKdOMBUJuOh6AwyvXTd4AssaA--zBxvr4sc_QjBNd1/exec';

  // ---- 共通ユーティリティ ----------------------------------------------

  function toInt(s) {
    if (s == null) return 0;
    const t = String(s).replace(/,/g, '').trim();
    const m = t.match(/-?\d+/);
    return m ? parseInt(m[0], 10) : 0;
  }

  function showToast(msg, ok) {
    const t = document.createElement('div');
    t.textContent = msg;
    t.style.position = 'fixed';
    t.style.bottom = '100px';
    t.style.left = '50%';
    t.style.transform = 'translateX(-50%)';
    t.style.background = ok ? '#2e7d32' : '#c62828';
    t.style.color = '#fff';
    t.style.padding = '12px 20px';
    t.style.borderRadius = '10px';
    t.style.fontSize = '15px';
    t.style.fontWeight = 'bold';
    t.style.zIndex = 999999;
    t.style.maxWidth = '85vw';
    t.style.textAlign = 'center';
    t.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4000);
  }

  function jsonp(url, params, cb) {
    const cbName = 'jsonp_cb_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let done = false;
    window[cbName] = function () {
      if (done) return;
      done = true;
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      cb(true);
    };
    script.onerror = function () {
      if (done) return;
      done = true;
      delete window[cbName];
      if (script.parentNode) script.parentNode.removeChild(script);
      cb(false);
    };
    const qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]); }).join('&');
    script.src = url + '?' + qs + '&callback=' + cbName;
    document.body.appendChild(script);
    setTimeout(function () {
      if (!done) {
        done = true;
        delete window[cbName];
        if (script.parentNode) script.parentNode.removeChild(script);
        cb(false);
      }
    }, 8000);
  }

  function sendToApi(action, payload, cb) {
    const qs = 'action=' + action + '&data=' + encodeURIComponent(JSON.stringify(payload));
    fetch(API_URL + '?' + qs, { method: 'GET' })
      .then(function (r) { cb(r.ok); })
      .catch(function () { jsonp(API_URL, { action: action, data: JSON.stringify(payload) }, cb); });
  }

  // ---- 喰ポイント・差枚 判定ロジック（両サイト共通） ----------------------

  function computeAll(rows, currentElapsed) {
    const n = rows.length;
    const G = Array(n).fill(0), H = Array(n).fill(0), I = Array(n).fill(0), J = Array(n).fill(0),
          K = Array(n).fill(0), E = Array(n).fill(0), F = Array(n).fill(0), ZD = Array(n).fill(0);
    const Araw = rows.map(r => r.kind), Braw = rows.map(r => r.game | 0), Craw = rows.map(r => r.get | 0);
    const rawGet = rows.map(r => r.getRaw);

    function Aat(i) { if (i >= 0 && i < n) return Araw[i]; if (i === -1) return currentElapsed >= 1 ? '' : undefined; return ''; }
    function Bat(i) { return (i >= 0 && i < n) ? Braw[i] : 0; }
    function Cat(i) { return (i >= 0 && i < n) ? Craw[i] : 0; }

    for (let i = 0; i < n; i++) {
      G[i] = (Aat(i) === 'RB' && (Aat(i - 1) === 'RB' || Aat(i - 1) === '' || (Aat(i - 1) === 'ART' && Bat(i - 1) >= 3))) ? 1 : 0;
      H[i] = ((Aat(i + 1) === 'RB' || Aat(i + 1) === '') && Aat(i) === 'ART' && Bat(i) <= 1 &&
              (Aat(i - 1) === 'RB' || Aat(i - 1) === '' || (Aat(i - 1) === 'ART' && Bat(i - 1) >= 3))) ? 1 : 0;
      I[i] = (Aat(i) === 'ART' && Bat(i) >= 3 &&
              (Aat(i - 1) === 'RB' || Aat(i - 1) === '' || (Aat(i - 1) === 'ART' && Bat(i - 1) >= 3))) ? 1 : 0;
    }

    // 通常の解放（70枚以下）：該当行自体が「初当り」であること（older側の種類そのものではなく、
    // 該当行が0〜2Gの継続でなければ初当りとみなす）
    const releaseK = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const olderIsArt = Aat(i + 1) === 'ART';
      const olderIsEP = olderIsArt && Bat(i + 1) >= 3 && Cat(i + 1) >= 90 && Cat(i + 1) <= 110;
      const isInitialHit = (!olderIsArt) || Bat(i) > 2 || olderIsEP;
      releaseK[i] = (Aat(i) === 'ART' && Cat(i) <= 70 && Aat(i - 1) === 'ART' && isInitialHit) ? 1 : 0;
    }

    // EP抜け（EP告知の手前は本当にRBか空＝有利区間の切れ目である場合のみ。
    // AT継続中の一撃（ART・3G以上）まで含めると、まだ継続中のAT内の一撃を
    // 誤って「EP告知」と誤認してしまうため対象外にする）
    for (let i = 0; i < n; i++) {
      if (Aat(i) === 'ART' && Bat(i) >= 3 && Cat(i) <= 120 && Aat(i - 1) === 'ART' && Bat(i - 1) === 1 &&
          (Aat(i - 2) === 'RB' || Aat(i - 2) === '')) J[i - 1] = 1;
    }

    // 強制リセット（有馬ジャッジメント成功）：ART・3G以上・獲得0枚以下
    const forcedK = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      if (rows[i].kind === 'ART' && rows[i].game >= 3 && rows[i].get <= 0) {
        G[i] = 0; H[i] = 0; I[i] = 0; J[i] = 0; forcedK[i] = 1;
      }
    }

    // 差枚(ZD)の累積と、差枚方式の有利区間切れ判定
    const ZONE_LIMIT = 2400, COIN_PER_GAME = 50 / 31;
    const overLimitK = Array(n).fill(0);
    let cumDiff = 0;
    for (let idx = n - 1; idx >= 0; idx--) {
      if (forcedK[idx] === 1 && cumDiff > 0) { cumDiff = 0; }
      const diff = Craw[idx] - Bat(idx) * COIN_PER_GAME;
      cumDiff += diff;
      ZD[idx] = Math.round(cumDiff);
      let terminate = false;
      if (cumDiff >= ZONE_LIMIT) terminate = true;
      if (terminate) { overLimitK[idx] = 1; cumDiff = 0; }
    }

    for (let i = 0; i < n; i++) {
      K[i] = (releaseK[i] === 1 || forcedK[i] === 1 || overLimitK[i] === 1) ? 1 : 0;
    }
    for (let i = 0; i < n; i++) { E[i] = G[i] + H[i] + I[i] + J[i]; }

    let nextF = 0;
    for (let i = n - 1; i >= 0; i--) {
      F[i] = K[i] === 1 ? 0 : (nextF + E[i]);
      nextF = F[i];
    }

    return { E, F, G, H, I, J, K, ZD };
  }

  // ---- サイトセブン ------------------------------------------------------

  function runSite7() {
    function getMeta() {
      const meta = { hallName: '', modelName: '', prefecture: '', city: '' };
      if (window.dataLayer) {
        for (const e of dataLayer) {
          if (e && e.hall_name) {
            meta.hallName = e.hall_name;
            meta.modelName = e.model_name;
            meta.prefecture = e.prefecture;
            meta.city = e.city;
            break;
          }
        }
      }
      return meta;
    }

    function findVisibleContainer() {
      const cs = document.querySelectorAll('#box, .item');
      let best = null, bestDist = Infinity;
      cs.forEach(function (c) {
        if (c.offsetWidth === 0) return;
        const rect = c.getBoundingClientRect();
        const dist = Math.abs(rect.left);
        if (dist < bestDist) { bestDist = dist; best = c; }
      });
      return best;
    }

    function extractRows(c) {
      const trs = c.querySelectorAll('table#dedama_data_list tbody#data_body tr');
      const rows = [];
      let currentElapsed = 0;
      trs.forEach(function (tr, idx) {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;
        const kEl = tds[1].querySelector('span.tag');
        const kind = kEl ? kEl.textContent.trim() : tds[1].textContent.trim();
        if (kind === '--' || kind === '') {
          if (idx === 0) { currentElapsed = parseInt(tds[3].textContent.trim(), 10) || 0; }
          return;
        }
        const cnt = tds[0].textContent.trim();
        const game = parseInt(tds[3].textContent.trim(), 10) || 0;
        const getRaw = tds[4].textContent.trim();
        rows.push({ cnt, kind, game, get: toInt(getRaw), getRaw });
      });
      return { rows, currentElapsed };
    }

    const container = findVisibleContainer();
    if (!container) { showToast('データが見つかりません', false); return; }

    const extracted = extractRows(container);
    const rows = extracted.rows;
    const currentElapsed = extracted.currentElapsed;
    if (rows.length === 0) { showToast('大当り履歴が0件です', false); return; }

    const calc = computeAll(rows, currentElapsed);
    const currentPT = calc.F[0];
    const meta = getMeta();
    const daiban = ((container.querySelector('#daiNoHeader') || {}).textContent || '').trim();
    const daibanMatch = daiban.match(/(\d+)/);
    const daibanNum = daibanMatch ? daibanMatch[1] : daiban;
    const modelName = meta.modelName || ((container.querySelector('#modelName') || {}).textContent || '').trim();
    const dayEl = document.querySelector('#select_days a.on');
    const day = dayEl ? dayEl.textContent.trim() : '';
    const detailsP = container.querySelector('#details p');
    const siteUpdateTime = detailsP ? detailsP.textContent.replace('データ更新日時：', '').trim() : '';

    const toolPayload = {
      daiban: daibanNum, modelName, hallName: meta.hallName, prefecture: meta.prefecture, city: meta.city,
      day, currentElapsed, currentPT,
      updatedAt: siteUpdateTime || new Date().toISOString(),
      rows: rows.map(function (r, i) { return { cnt: r.cnt, kind: r.kind, game: r.game, getRaw: r.getRaw, E: calc.E[i], F: calc.F[i], ZD: calc.ZD[i] }; })
    };

    showToast('現在の喰ポイント：' + currentPT + 'pt', true);
    sendToApi('upsert', toolPayload, function (ok) {
      if (!ok) showToast('⚠️ツールへの送信に失敗しました', false);
    });
  }

  // ---- 台データオンライン -------------------------------------------------

  function runDaidata() {
    function extractRowsRaw() {
      const historyTable = document.querySelector('.swiper-slide-active table.numericValueTable');
      if (!historyTable) return [];
      const trs = historyTable.querySelectorAll('tbody tr');
      const out = [];
      trs.forEach(function (tr) {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;
        const kind = tds[3].textContent.trim();
        if (kind !== 'ART' && kind !== 'RB') return;
        const game = parseInt(tds[1].textContent.trim(), 10) || 0;
        const getRaw = tds[2].textContent.trim();
        out.push({ kind, game, getRaw, get: toInt(getRaw) });
      });
      return out;
    }

    function numberRows(rawRows) {
      let artTotal = 0;
      rawRows.forEach(function (r) { if (r.kind === 'ART') artTotal++; });
      let counter = artTotal;
      return rawRows.map(function (r) {
        if (r.kind === 'ART') {
          const c = counter; counter--;
          return { cnt: String(c), kind: r.kind, game: r.game, getRaw: r.getRaw, get: r.get };
        }
        return { cnt: '-', kind: r.kind, game: r.game, getRaw: r.getRaw, get: r.get };
      });
    }

    function getCurrentElapsed() {
      const overviewTable = document.querySelector('.swiper-slide-active table.overviewTable');
      if (!overviewTable) return 0;
      const tds = overviewTable.querySelectorAll('tbody tr:nth-child(2) td');
      if (tds.length < 4) return 0;
      return parseInt(tds[3].textContent.trim(), 10) || 0;
    }

    function getMeta() {
      const hallEl = document.querySelector('dt span');
      const hallName = hallEl ? hallEl.textContent.trim() : '';
      const modelEl = document.querySelector('#contentsHeader h2');
      const modelName = modelEl ? modelEl.textContent.trim() : '';
      const radiusDiv = document.querySelector('#contentsHeader .Radius-Basic2');
      let daiban = '';
      if (radiusDiv) {
        const clone = radiusDiv.cloneNode(true);
        const h2 = clone.querySelector('h2');
        if (h2) h2.remove();
        const text = clone.textContent;
        const m = text.match(/(\d+)\s*番台/);
        if (m) daiban = m[1];
      }
      const timeEl = document.querySelector('#contentsHeader .suppleMeta time');
      const updateTimeText = timeEl ? timeEl.textContent.trim() : '';
      const dayEl = document.querySelector('.swiper-slide-active h4.Text-Left-01');
      const day = dayEl ? dayEl.textContent.trim() : '';
      return { hallName, modelName, daiban, updateTimeText, day };
    }

    function runMain() {
      const rawRows = extractRowsRaw();
      if (rawRows.length === 0) { showToast('大当り履歴が見つかりません', false); return; }
      const rows = numberRows(rawRows);
      const currentElapsed = getCurrentElapsed();
      const calc = computeAll(rows, currentElapsed);
      const currentPT = calc.F[0];
      const meta = getMeta();

      showToast('現在の喰ポイント：' + currentPT + 'pt', true);

      const toolPayload = {
        daiban: meta.daiban, modelName: meta.modelName, hallName: meta.hallName, prefecture: '', city: '',
        day: meta.day, currentElapsed, currentPT,
        updatedAt: meta.updateTimeText || new Date().toISOString(),
        rows: rows.map(function (r, i) { return { cnt: r.cnt, kind: r.kind, game: r.game, getRaw: r.getRaw, E: calc.E[i], F: calc.F[i], ZD: calc.ZD[i] }; })
      };

      sendToApi('upsert', toolPayload, function (ok) {
        if (!ok) showToast('⚠️ツールへの送信に失敗しました', false);
      });
    }

    function ensureListView(cb) {
      const btn = document.querySelector('button[data-target="list"]');
      if (btn && !btn.classList.contains('active')) {
        if (window.jQuery) { window.jQuery(btn).trigger('click'); }
        btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
        btn.click();
        setTimeout(cb, 400);
      } else {
        cb();
      }
    }

    ensureListView(runMain);
  }

  // ---- アウトバーンブリッツ（テラモバ）----------------------------------

  function runAutobahn() {
    function getMeta() {
      const modelEl = document.querySelector('.wrap-machine-name a');
      const modelName = modelEl ? modelEl.textContent.trim() : '';
      const daibanEl = document.querySelector('.navigate p.current');
      let daiban = '';
      if (daibanEl) {
        const m = daibanEl.textContent.match(/(\d+)/);
        if (m) daiban = m[1];
      }
      const hallEl = document.querySelector('#header h1.headerlogo a');
      const hallName = hallEl ? hallEl.textContent.trim() : '';
      const updEl = document.querySelector('.machine_info_header .modified_date');
      const updateTimeText = updEl ? updEl.textContent.replace('更新日時：', '').trim() : '';
      const params = new URLSearchParams(window.location.search);
      const day = params.get('target_date') || '';
      return { modelName, daiban, hallName, updateTimeText, day };
    }

    function getCurrentElapsed() {
      const el = document.querySelector('.box-base.machine-info .left.start .green');
      return el ? (parseInt(el.textContent.trim(), 10) || 0) : 0;
    }

    function extractRows() {
      // このサイトは履歴が「古い→新しい」の順に並んでいるので、あとで反転して新しい→古い順にする
      const trs = document.querySelectorAll('.bonus_history_area.table tr.winlist');
      const rawRows = [];
      trs.forEach(function (tr) {
        const tds = tr.querySelectorAll('td');
        if (tds.length < 5) return;
        const cnt = tds[0].textContent.trim();
        const game = parseInt(tds[2].textContent.trim(), 10) || 0;
        const getRaw = tds[3].textContent.trim();
        const statusEl = tds[4].querySelector('.bonus_status');
        const raw = statusEl ? statusEl.textContent.trim() : tds[4].textContent.trim();
        // BBはARTと同じ扱い、RBはそのままRB
        const kind = raw === 'RB' ? 'RB' : 'ART';
        rawRows.push({ cnt, kind, game, getRaw, get: toInt(getRaw) });
      });
      rawRows.reverse();
      return rawRows;
    }

    function runMain() {
      const rows = extractRows();
      if (rows.length === 0) { showToast('大当り履歴が見つかりません', false); return; }
      const currentElapsed = getCurrentElapsed();
      const calc = computeAll(rows, currentElapsed);
      const currentPT = calc.F[0];
      const meta = getMeta();

      showToast('現在の喰ポイント：' + currentPT + 'pt', true);

      const toolPayload = {
        daiban: meta.daiban, modelName: meta.modelName, hallName: meta.hallName, prefecture: '', city: '',
        day: meta.day, currentElapsed, currentPT,
        updatedAt: meta.updateTimeText || new Date().toISOString(),
        rows: rows.map(function (r, i) { return { cnt: r.cnt, kind: r.kind, game: r.game, getRaw: r.getRaw, E: calc.E[i], F: calc.F[i], ZD: calc.ZD[i] }; })
      };

      sendToApi('upsert', toolPayload, function (ok) {
        if (!ok) showToast('⚠️ツールへの送信に失敗しました', false);
      });
    }

    function ensureListMode(cb) {
      const btn = document.querySelector('.control-button-group .btn.mode.table');
      if (btn && !btn.classList.contains('active')) {
        btn.click();
        setTimeout(cb, 300);
      } else {
        cb();
      }
    }

    // 「続きを見る」を、表示されなくなる（＝全件読み込み済み）まで押し続ける
    function loadAllHistory(cb, attemptsLeft) {
      if (attemptsLeft === undefined) attemptsLeft = 20;
      const btn = document.querySelector('.bonus_history_area.table a.btn.next_page');
      const visible = btn && btn.style.display !== 'none';
      if (visible && attemptsLeft > 0) {
        btn.click();
        setTimeout(function () { loadAllHistory(cb, attemptsLeft - 1); }, 500);
      } else {
        cb();
      }
    }

    ensureListMode(function () { loadAllHistory(runMain); });
  }

  // ---- 実行振り分け --------------------------------------------------------

  function runAll() {
    const host = window.location.hostname;
    if (host.indexOf('site777') !== -1) {
      runSite7();
    } else if (host.indexOf('daidata.goraggio.com') !== -1) {
      runDaidata();
    } else if (host.indexOf('teramoba2.com') !== -1) {
      runAutobahn();
    } else {
      showToast('このページでは動作しません', false);
    }
  }

  // ---- フローティングボタンの設置 -------------------------------------------

  function injectButton() {
    if (document.getElementById('shoku-point-float-btn')) return; // 二重設置防止
    const btn = document.createElement('button');
    btn.id = 'shoku-point-float-btn';
    btn.style.background = '#2563eb';
    btn.style.color = '#fff';
    btn.style.border = 'none';
    btn.style.fontWeight = 'bold';
    btn.style.boxShadow = '0 2px 10px rgba(0,0,0,0.4)';
    btn.style.cursor = 'pointer';
    btn.addEventListener('click', runAll);

    // テラモバ系のページは、固定位置だとサイト側のボタン類と被るため、
    // 「当り履歴」の見出しバー（クリック不要な余白部分）に埋め込む
    const teramobaAnchor = window.location.hostname.indexOf('teramoba2.com') !== -1
      ? document.querySelector('.box-bonus_history h1.title-base')
      : null;

    if (teramobaAnchor) {
      btn.textContent = '喰pt取得';
      teramobaAnchor.style.position = 'relative';
      btn.style.position = 'absolute';
      btn.style.right = '8px';
      btn.style.top = '50%';
      btn.style.transform = 'translateY(-50%)';
      btn.style.width = 'auto';
      btn.style.height = '32px';
      btn.style.padding = '0 10px';
      btn.style.borderRadius = '16px';
      btn.style.fontSize = '11px';
      btn.style.zIndex = 10;
      teramobaAnchor.appendChild(btn);
    } else {
      btn.textContent = '喰pt\n取得';
      btn.style.position = 'fixed';
      btn.style.right = '16px';
      btn.style.bottom = '16px';
      btn.style.width = '58px';
      btn.style.height = '58px';
      btn.style.borderRadius = '50%';
      btn.style.fontSize = '12px';
      btn.style.lineHeight = '1.2';
      btn.style.whiteSpace = 'pre';
      btn.style.zIndex = 999997;
      document.body.appendChild(btn);
    }
  }

  // テラモバ系はSPA（JSで後から中身を描画するサイト）なので、
  // スクリプト実行時点では「当り履歴」の見出しがまだDOMに無いことがある。
  // 見出しが現れるまで少し待ってから埋め込む（最大約6秒）
  function injectButtonWithRetry(attemptsLeft) {
    const isTeramoba = window.location.hostname.indexOf('teramoba2.com') !== -1;
    if (attemptsLeft === undefined) attemptsLeft = 20;
    if (isTeramoba && !document.querySelector('.box-bonus_history h1.title-base') && attemptsLeft > 0) {
      setTimeout(function () { injectButtonWithRetry(attemptsLeft - 1); }, 300);
      return;
    }
    injectButton();
  }

  injectButtonWithRetry();
})();
