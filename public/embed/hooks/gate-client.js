// Ortak gate iframe istemcisi (Desen B) — 3 hook iframe sayfası paylaşır.
// Beklenen DOM id'leri: #a (izin), #d (reddet), #c (vazgeç), #pid (refId), #busy (durum).
// Akış: getContext(refId) + getSessionToken → karar /api/gate-approval'a yazılır → resolve(); Vazgeç → close().
(function () {
  function bridgeCall(action, params) {
    return new Promise(function (res) {
      var requestId = Date.now() + '-' + Math.random().toString(36).slice(2);
      function onMsg(e) {
        var x = e.data;
        if (!x || x.type !== 'restomenum-bridge-response' || x.requestId !== requestId) return;
        window.removeEventListener('message', onMsg); res(x.result);
      }
      window.addEventListener('message', onMsg);
      window.parent.postMessage({ type: 'restomenum-bridge', requestId: requestId, action: action, params: params || {} }, '*');
      setTimeout(function () { window.removeEventListener('message', onMsg); res({ success: false, message: 'timeout' }); }, 15000);
    });
  }
  // bridgeCall sonucu düz veya {data:{}} zarfı olabilir → ikisini de aç.
  function unwrap(r, k) { return r && (r[k] !== undefined ? r[k] : (r.data && r.data[k])); }

  var a = document.getElementById('a'), d = document.getElementById('d'), c = document.getElementById('c'),
      busy = document.getElementById('busy'), pid = document.getElementById('pid');
  var REFID = '', TOKEN = '';
  function lock(t) { if (a) a.disabled = true; if (d) d.disabled = true; if (c) c.disabled = true; if (busy) busy.textContent = t || ''; }

  async function decide(decision) {
    lock(decision === 'allow' ? 'İşleniyor… (izin)' : 'İşleniyor… (reddet)');
    if (TOKEN && REFID) {
      try {
        await fetch('/api/gate-approval', {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TOKEN },
          body: JSON.stringify({ refId: REFID, decision: decision }),
        });
      } catch (e) { /* yazılamazsa webhook default allow'a düşer */ }
    }
    bridgeCall('resolve', {}); // sadece "kullanıcı etkileşimi bitti" sinyali — veri taşımıyor
  }
  if (a) a.onclick = function () { decide('allow'); };
  if (d) d.onclick = function () { decide('deny'); };
  if (c) c.onclick = function () { lock('İptal ediliyor…'); bridgeCall('close'); };

  (async function init() {
    var ctx = await bridgeCall('getContext');
    REFID = unwrap(ctx, 'refId') || '';
    if (pid) pid.textContent = REFID || '(bilinmiyor)';
    var t = await bridgeCall('getSessionToken');
    TOKEN = unwrap(t, 'token') || '';
    if (a) a.disabled = false; if (d) d.disabled = false; if (c) c.disabled = false;
  })();
})();
