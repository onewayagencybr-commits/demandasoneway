/* One Way - pré-visualização e cópia do JPEG HD do calendário.
   Apenas exibe o canvas que o exportador atual já produz. */
(function () {
  'use strict';

  var previewDialog = null;
  var imageUrl = '';
  var imageForClipboard = null;
  var pendingPreview = 0;

  var css = [
    '.ow-jpeg-preview{width:min(980px,calc(100vw - 24px));max-width:none;max-height:calc(100dvh - 24px);padding:0;overflow:hidden;border:1px solid rgba(205,224,255,.24);border-radius:20px;background:linear-gradient(145deg,#071733,#112c61);color:#f6f9ff;box-shadow:0 28px 90px rgba(1,7,25,.62);font-family:Montserrat,Arial,sans-serif}',
    '.ow-jpeg-preview::backdrop{background:rgba(1,8,24,.82);backdrop-filter:blur(6px)}',
    '.ow-jpeg-preview *{box-sizing:border-box}',
    '.ow-jpeg-preview-layout{height:min(91dvh,900px);display:flex;flex-direction:column;min-height:0}',
    '.ow-jpeg-preview-head{display:flex;justify-content:space-between;align-items:flex-start;gap:18px;padding:24px 26px 20px;border-bottom:1px solid rgba(222,236,255,.13)}',
    '.ow-jpeg-preview-kicker{display:block;font-size:10px;letter-spacing:.14em;font-weight:700;color:#a8c8ff;margin-bottom:9px}',
    '.ow-jpeg-preview-head h2{margin:0;font-size:23px;font-weight:700;line-height:1.2;letter-spacing:-.03em;color:#fff}',
    '.ow-jpeg-preview-head p{margin:7px 0 0;color:#c5d7f5;font-size:12px;line-height:1.5}',
    '.ow-jpeg-preview-close{flex:none;display:grid;place-items:center;border:1px solid rgba(255,255,255,.18);border-radius:11px;width:38px;height:38px;background:rgba(255,255,255,.08);color:#fff;font:500 25px Arial;cursor:pointer}',
    '.ow-jpeg-preview-close:hover{background:rgba(255,255,255,.16)}',
    '.ow-jpeg-preview-scroller{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;background:#051127;padding:22px;display:block;text-align:center}',
    '.ow-jpeg-preview-img{display:block;width:100%;max-width:820px;height:auto;margin:0 auto;border:1px solid rgba(220,234,255,.17);border-radius:12px;box-shadow:0 14px 42px rgba(0,0,0,.22);cursor:zoom-in}',
    '.ow-jpeg-preview-img.is-zoomed{width:2000px;max-width:none;margin:0;cursor:zoom-out}',
    '.ow-jpeg-preview-footer{padding:17px 26px 20px;border-top:1px solid rgba(222,236,255,.13);display:flex;align-items:center;justify-content:space-between;gap:18px}',
    '.ow-jpeg-preview-info{color:#bdcfee;font-size:11px;line-height:1.5;max-width:420px}',
    '.ow-jpeg-preview-actions{display:flex;align-items:center;gap:10px;flex-wrap:wrap;justify-content:flex-end}',
    '.ow-jpeg-preview-action{display:inline-flex;align-items:center;justify-content:center;border:1px solid rgba(225,238,255,.23);border-radius:10px;min-height:42px;padding:11px 17px;color:#fff;background:rgba(255,255,255,.08);font:700 12px Montserrat,Arial,sans-serif;white-space:nowrap;text-decoration:none;cursor:pointer}',
    '.ow-jpeg-preview-action:hover{background:rgba(255,255,255,.17)}',
    '.ow-jpeg-preview-action.primary{background:#ecf3ff;color:#173b79;border-color:#fff}',
    '.ow-jpeg-preview-action.primary:hover{background:#fff}',
    '.ow-jpeg-preview-action:disabled{opacity:.5;cursor:default}',
    '@media(max-width:640px){.ow-jpeg-preview{width:calc(100vw - 16px);max-height:calc(100dvh - 12px);border-radius:15px}.ow-jpeg-preview-layout{height:calc(100dvh - 24px)}.ow-jpeg-preview-head{padding:19px 16px 14px}.ow-jpeg-preview-head h2{font-size:19px}.ow-jpeg-preview-scroller{padding:10px}.ow-jpeg-preview-footer{padding:13px 15px 16px;align-items:stretch;flex-direction:column;gap:12px}.ow-jpeg-preview-actions{width:100%;justify-content:stretch}.ow-jpeg-preview-actions>*{flex:1}.ow-jpeg-preview-info{max-width:none}}'
  ].join('\n');

  function ensureDialog() {
    if (previewDialog && document.body.contains(previewDialog)) return previewDialog;
    if (!document.getElementById('owJpegPreviewCss')) {
      var style = document.createElement('style');
      style.id = 'owJpegPreviewCss';
      style.textContent = css;
      document.head.appendChild(style);
    }
    previewDialog = document.createElement('dialog');
    previewDialog.id = 'owJpegPreviewDialog';
    previewDialog.className = 'ow-jpeg-preview';
    previewDialog.setAttribute('aria-labelledby', 'owJpegPreviewTitle');
    previewDialog.innerHTML = [
      '<div class="ow-jpeg-preview-layout">',
        '<div class="ow-jpeg-preview-head">',
          '<div><span class="ow-jpeg-preview-kicker">ONE WAY / CALENDÁRIO SEMANAL</span>',
            '<h2 id="owJpegPreviewTitle">Visualizar JPEG HD</h2>',
            '<p id="owJpegPreviewSubtitle"></p></div>',
          '<button class="ow-jpeg-preview-close" id="owJpegPreviewClose" type="button" aria-label="Fechar visualização">×</button>',
        '</div>',
        '<div class="ow-jpeg-preview-scroller">',
          '<img class="ow-jpeg-preview-img" id="owJpegPreviewImage" alt="Imagem em alta qualidade do calendário semanal" title="Clique para ampliar ou reduzir">',
        '</div>',
        '<div class="ow-jpeg-preview-footer">',
          '<div class="ow-jpeg-preview-info" id="owJpegPreviewInfo" role="status" aria-live="polite">Clique na imagem para ampliar. Copie e cole direto no WhatsApp com Ctrl+V.</div>',
          '<div class="ow-jpeg-preview-actions">',
            '<a class="ow-jpeg-preview-action" id="owJpegPreviewDownload">Baixar JPEG</a>',
            '<button class="ow-jpeg-preview-action primary" id="owJpegPreviewCopy" type="button">Copiar imagem</button>',
          '</div>',
        '</div>',
      '</div>'
    ].join('');
    document.body.appendChild(previewDialog);
    previewDialog.querySelector('#owJpegPreviewClose').addEventListener('click', function () {
      previewDialog.close();
    });
    previewDialog.addEventListener('click', function (event) {
      if (event.target === previewDialog) previewDialog.close();
    });
    previewDialog.addEventListener('close', function () {
      if (imageUrl) URL.revokeObjectURL(imageUrl);
      imageUrl = '';
      imageForClipboard = null;
      previewDialog.querySelector('#owJpegPreviewImage').removeAttribute('src');
      previewDialog.querySelector('#owJpegPreviewImage').classList.remove('is-zoomed');
    });
    previewDialog.querySelector('#owJpegPreviewImage').addEventListener('click', function () {
      this.classList.toggle('is-zoomed');
    });
    previewDialog.querySelector('#owJpegPreviewCopy').addEventListener('click', async function () {
      var message = previewDialog.querySelector('#owJpegPreviewInfo');
      if (!imageForClipboard || !navigator.clipboard || typeof navigator.clipboard.write !== 'function' || typeof window.ClipboardItem !== 'function') {
        message.textContent = 'Este navegador não permite copiar imagens automaticamente. Clique com o botão direito na prévia e escolha "Copiar imagem" ou use Baixar JPEG.';
        return;
      }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': imageForClipboard })]);
        message.textContent = 'Imagem em alta qualidade copiada! Abra o WhatsApp e pressione Ctrl+V para colar.';
        this.textContent = 'Imagem copiada ✓';
      } catch (error) {
        message.textContent = 'O navegador bloqueou a cópia. Clique com o botão direito na imagem e selecione "Copiar imagem", ou baixe o JPEG.';
      }
    });
    return previewDialog;
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise(function (resolve, reject) {
      try {
        canvas.toBlob(function (blob) {
          if (blob) resolve(blob);
          else reject(new Error('Não foi possível preparar a imagem.'));
        }, type, quality);
      } catch (error) { reject(error); }
    });
  }

  async function open(canvas, details) {
    if (!canvas || !canvas.width || !canvas.height) throw new Error('Imagem do calendário indisponível.');
    var request = ++pendingPreview;
    var jpeg = await canvasToBlob(canvas, 'image/jpeg', .98);
    var png = null;
    try { png = await canvasToBlob(canvas, 'image/png'); } catch (error) { /* Prévia JPEG continua disponível. */ }
    if (request !== pendingPreview) return;

    var modal = ensureDialog();
    if (modal.open) modal.close();
    imageUrl = URL.createObjectURL(jpeg);
    imageForClipboard = png;
    modal.querySelector('#owJpegPreviewSubtitle').textContent =
      (details && details.week ? details.week + ' · ' : '') + canvas.width.toLocaleString('pt-BR') + ' × ' + canvas.height.toLocaleString('pt-BR') + ' px';
    modal.querySelector('#owJpegPreviewImage').src = imageUrl;
    modal.querySelector('#owJpegPreviewDownload').href = imageUrl;
    modal.querySelector('#owJpegPreviewDownload').download =
      (details && details.fileName) || 'oneway-calendario-semana-HD.jpg';
    var copy = modal.querySelector('#owJpegPreviewCopy');
    copy.textContent = 'Copiar imagem';
    copy.disabled = !png;
    modal.querySelector('#owJpegPreviewInfo').textContent = png
      ? 'Prévia em resolução original. Clique para ampliar. Use "Copiar imagem" e cole no WhatsApp com Ctrl+V.'
      : 'Prévia HD pronta. A cópia não está disponível neste dispositivo; você ainda pode baixar ou copiar a imagem pelo navegador.';
    modal.showModal();
  }

  window.OneWayJpegPreview = { open: open };
})();

/* One Way ambient motion bootstrap */
(function () {
  if (window.__owAmbientScriptRequested || !document.head) return;
  window.__owAmbientScriptRequested = true;
  var script = document.createElement('script');
  script.src = '/modules/oneway-mouse-ambient.js?v=20261031-ambient1';
  script.async = true;
  document.head.appendChild(script);
})();
