/* Arayüz durumu sunucudaki kayıttan ayrıdır; yalnızca onay düğmesi kesin kayıt oluşturur. */
'use strict';
// DOM erişimi ve uygulamanın ortak durumu.
const $ = (selector, root = document) => root.querySelector(selector);
const app = $('#app');
const state = {
  documents: [],
  summaries: {},
  route: '',
  current: null,
  form: null,
  dirty: false,
  uploading: false,
  splitPages: false,
  saving: false,
  page: 1,
  zoom: 100,
  list: { query: '', number: '', status: 'all', currency: 'all', from: '', to: '' },
  invoiceView: 'analysis',
  increaseData: null,
  increaseFilter: { query: '', type: 'all' },
  analyticsCurrency: 'TRY',
  period: 'year',
  errors: null,
  reviewed: false,
  poll: null,
};

// Eski Excel adları aynı grupta gösterilir; kaynak verisi değiştirilmez.
const SERVICE_TYPES = ['Düzenli (aylık)', 'Tek seferlik', 'Düzensiz', 'Bitti'];

function serviceTypeLabel(value) {
  return {
    'Aylık': 'Düzenli (aylık)',
    'Bir Kere': 'Tek seferlik',
    'Aylık (Düzensiz)': 'Düzensiz',
  }[value] || value || '';
}

function serviceTypeField(value = '') {
  return /* HTML */ `<label class="field">
    <span>Hizmet türü</span>
    <input name="service_type" maxlength="100" list="service-types"
      placeholder="Bir tür seçin veya kendiniz yazın" value="${esc(serviceTypeLabel(value))}" />
    <datalist id="service-types">
      ${SERVICE_TYPES.map((type) => `<option value="${esc(type)}"></option>`).join('')}
    </datalist>
  </label>`;
}
// Arayüzde kullanılan SVG simgeleri.
const paths = {
  dashboard:
    '<rect x="3" y="3" width="7" height="7" rx="1.7"/><rect x="14" y="3" width="7" height="7" rx="1.7"/><rect x="3" y="14" width="7" height="7" rx="1.7"/><rect x="14" y="14" width="7" height="7" rx="1.7"/>',
  scan: '<path d="M8 3H5a2 2 0 0 0-2 2v3m13-5h3a2 2 0 0 1 2 2v3M3 16v3a2 2 0 0 0 2 2h3m8 0h3a2 2 0 0 0 2-2v-3"/><path d="M7 10h10M7 14h10M7 6h5M7 18h5"/>',
  files:
    '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6M8 13h8M8 17h5"/>',
  chart: '<path d="M4 3v16a2 2 0 0 0 2 2h15M8 15v-4m5 4V6m5 9V9"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  left: '<path d="m15 5-7 7 7 7"/>',
  calendar:
    '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z"/><path d="m8 12 3 3 5-6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet:
    '<path d="M19 7V5a2 2 0 0 0-2-2H6a3 3 0 0 0 0 6h14v12H6a3 3 0 0 1-3-3V6"/><path d="M20 12h-5v5h5m-4-2.5h.01"/>',
  percent: '<path d="M5 19 19 5"/><circle cx="7" cy="7" r="3"/><circle cx="17" cy="17" r="3"/>',
  building: '<path d="M4 21V5l8-2 8 2v16M2 21h20M9 21v-5h6v5M8 7h1m6 0h1M8 11h1m6 0h1"/>',
  search: '<circle cx="10.5" cy="10.5" r="7"/><path d="m16 16 5 5"/>',
  warning:
    '<path d="m10.2 4-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.8-3l-8-14a2 2 0 0 0-3.6 0Z"/><path d="M12 9v5m0 3h.01"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  zoom: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
  external:
    '<path d="M14 3h7v7m0-7L10 14M10 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  refresh: '<path d="M20 7a9 9 0 1 0 1 8M20 3v5h-5"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 16l10 5 10-5"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12l4 4v12a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',
};
// Metin kaçışları, tarih, para ve ortak HTML yardımcıları.
const icon = (name) =>
  /* HTML */ `<svg viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.files}</svg>`;
const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
const money = (value, currency = 'TRY') =>
  value == null
    ? '—'
    : new Intl.NumberFormat('tr-TR', {
        style: 'currency',
        currency,
        minimumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
        maximumFractionDigits: 2,
      }).format(value);
// Sayısal metni Number'a çevirmeden biçimleriz; uzun miktarlar ve birim fiyatın
// dört haneli küsuratı görünüm sırasında hassasiyet kaybetmez.
const numeric = (value) => {
  if (value == null) return '';
  const text = String(value);
  const match = text.match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return text;
  const whole = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const fraction = match[3] && !/^0+$/.test(match[3]) ? `,${match[3]}` : '';
  return match[1] + whole + fraction;
};
// Kullanıcının Türkçe binlik ayıracını kayıt değerinden ayırırız. 140.000
// görünümü sunucuya 140000 olarak gider; 140 şeklinde kaydedilemez.
const decimalInput = (value) => {
  const text = value.trim();
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d*)?$/.test(text))
    return text.replaceAll('.', '').replace(',', '.');
  if (/^-?\d+(?:,\d*)?$/.test(text)) return text.replace(',', '.');
  return text;
};
const shortDate = (value) =>
  value
    ? new Intl.DateTimeFormat('tr-TR', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      }).format(new Date(value.length === 10 ? `${value}T12:00:00` : value))
    : 'Tarih bekleniyor';
const statusText = (status) =>
  ({
    approved: 'Onaylandı',
    review: 'İnceleme bekliyor',
    processing: 'Okunuyor',
    duplicate: 'Zaten kayıtlı',
  })[status] || 'İnceleme bekliyor';
const badge = (status) =>
  /* HTML */ `<span class="status ${status === 'approved' ? '' : status}"
    >${statusText(status)}</span
  >`;
const button = (label, name = 'plus', action = 'new', cls = 'btn-primary') =>
  /* HTML */ `<button class="btn ${cls}" data-action="${action}">
    ${icon(name)}<span>${label}</span>
  </button>`;

// Sunucu iletişimi ve belge listesini eşitleme.
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json();
  if (!response.ok) {
    const error = new Error(payload.error || 'İşlem tamamlanamadı.');
    error.payload = payload;
    throw error;
  }
  return payload;
}

async function loadDocuments() {
  const response = await api('/api/documents');
  state.documents = response.documents;
  state.summaries = response.summaries;
  const count = state.documents.filter((d) => d.status !== 'approved').length;
  const badgeEl = $('#pending-count');
  badgeEl.textContent = count;
  badgeEl.hidden = !count;
}
// Bildirimler ve kaydedilmemiş değişikliklerin onayı.
let toastTimer;
function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('visible'), 3500);
}

function dialog(title, message, confirmText = 'Devam et') {
  return new Promise((resolve) => {
    const root = $('#modal-root');
    const previous = document.activeElement;
    root.innerHTML = /* HTML */ `<div class="modal-backdrop">
      <section role="dialog" aria-modal="true" aria-labelledby="modal-title" class="modal">
        <h2 id="modal-title">${esc(title)}</h2>
        <p>${esc(message)}</p>
        <div class="modal-actions">
          <button class="btn btn-light" data-cancel>Vazgeç</button
          ><button class="btn btn-primary" data-confirm>${esc(confirmText)}</button>
        </div>
      </section>
    </div>`;
    const close = (result) => {
      document.removeEventListener('keydown', keys);
      root.innerHTML = '';
      previous?.focus();
      resolve(result);
    };
    const keys = (e) => {
      if (e.key === 'Escape') close(false);
      if (e.key === 'Tab') {
        const first = $('[data-cancel]', root),
          last = $('[data-confirm]', root);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    $('[data-cancel]', root).onclick = () => close(false);
    $('[data-confirm]', root).onclick = () => close(true);
    document.addEventListener('keydown', keys);
    $('[data-cancel]', root).focus();
  });
}

async function canLeave() {
  return (
    !state.dirty ||
    (await dialog(
      'Kaydedilmemiş değişiklikler',
      'Yaptığınız değişiklikler henüz kaydedilmedi. Bu sayfadan ayrılmak istiyor musunuz?',
      'Ayrıl',
    ))
  );
}
// Alt gezinme çubuğu ve sayfa yönlendirmesi.
function setDock(page) {
  const index = ['overview', 'upload', 'invoices', 'analytics'].indexOf(page);
  $('.dock-indicator').style.transform = `translateX(${Math.max(0, index) * 100}%)`;
  document.querySelectorAll('.dock a').forEach((a) => {
    const active = a.dataset.page === page;
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

async function navigate() {
  const route = location.hash.slice(1) || 'overview';
  if (state.route && route !== state.route && !(await canLeave())) {
    history.replaceState(null, '', `#${state.route}`);
    return;
  }
  clearTimeout(state.poll);
  state.errors = null;
  state.reviewed = false;
  if (state.route !== route) {
    state.dirty = false;
    state.showDuplicateForm = false;
    state.route = route;
  }
  try {
    await loadDocuments();
    if (route.startsWith('document/')) {
      const id = route.split('/')[1];
      state.current = await api(`/api/documents/${encodeURIComponent(id)}`);
      state.form = structuredClone(state.current.edited);
      state.page = 1;
      state.zoom = 100;
      setDock('invoices');
      renderReview();
      if (state.current.status === 'processing' || state.current.batch_documents?.some((doc) => doc.status === 'processing')) {
        pollDocument(id);
      }
    } else if (route.startsWith('service/')) {
      setDock('invoices');
      const service = await api(`/api/services/${encodeURIComponent(route.split('/')[1])}`);
      if (state.route === route) renderServiceAnalysis(service);
    } else {
      setDock(route);
      if (route === 'upload') renderUpload();
      else if (route === 'invoices') renderInvoices();
      else if (route === 'analytics') renderAnalytics();
      else renderOverview();
    }
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (e) {
    app.innerHTML = /* HTML */ `<div class="inline-error">
      ${esc(e.message)}<br /><button class="btn btn-light" data-action="reload">
        Yeniden dene
      </button>
    </div>`;
  }
}
// Sayfalar arasında paylaşılan görünüm parçaları.
const footer = () =>
  /* HTML */ `<div class="footer-note">
    <span>${icon('lock')} Belgeleriniz ve kayıtlarınız bu bilgisayarda saklanır.</span
    ><span>Türkiye Hastanesi · Fatura Yönetimi</span>
  </div>`;
function heading(eyebrow, title, subtitle, right = '') {
  return /* HTML */ `<div class="page-heading">
    <div>
      <div class="eyebrow">${eyebrow}</div>
      <h1>${title}</h1>
      <p>${subtitle}</p>
    </div>
    ${right ? /* HTML */ `<div class="heading-actions">${right}</div>` : ''}
  </div>`;
}
const empty = (title, subtitle, action = false, symbol = 'files') =>
  /* HTML */ `<div class="empty">
    <div class="empty-icon">${icon(symbol)}</div>
    <h3>${title}</h3>
    <p>${subtitle}</p>
    ${action ? button('İlk faturayı yükle', 'plus', 'new', 'btn-cyan') : ''}
  </div>`;
function stats(currency = 'TRY', documents = state.documents, period = 'all') {
  const approved = documents.filter((d) => d.status === 'approved' && d.currency === currency);
  const summary = state.summaries?.[currency]?.[period] || {
    gross: '0',
    net: '0',
    vat: '0',
    count: 0,
    pending: 0,
    suppliers: 0,
    average: '0',
    vat_share: '0',
    months: [],
    vendors: [],
  };
  return { ...summary, approved };
}

function statsCards(s, currency = 'TRY') {
  const cells = [
    [
      'Toplam fatura tutarı',
      money(s.gross, currency),
      'Onaylanan faturaların toplamı',
      'wallet',
      '',
    ],
    ['Onaylanan fatura', s.count, 'Kayıt altındaki belgeler', 'files', 'cyan'],
    ['İnceleme bekleyen', s.pending, 'Kontrolünüzü bekleyen belgeler', 'clock', 'orange'],
    ['Toplam KDV', money(s.vat, currency), 'Onaylanan KDV tutarı', 'percent', 'green'],
  ];
  return /* HTML */ `<div class="stats-grid">
    ${cells
      .map(
        ([label, value, caption, i, color]) =>
          /* HTML */ `<article class="card stat">
            <div class="stat-label">
              <span>${label}</span><span class="stat-icon ${color}">${icon(i)}</span>
            </div>
            <div class="stat-value">${value}</div>
            <div class="stat-caption"><span class="tiny-dot"></span>${caption}</div>
          </article>`,
      )
      .join('')}
  </div>`;
}

function workflow() {
  return /* HTML */ `<div class="workflow">
    <div class="workflow-step">
      <span class="step-icon">${icon('upload')}</span>
      <div class="step-content">
        <h3>Belgenizi yükleyin</h3>
        <p>PDF faturanızı ekleyin.</p>
      </div>
      <b>01</b>
    </div>
    <div class="workflow-step">
      <span class="step-icon">${icon('scan')}</span>
      <div class="step-content">
        <h3>Alanları kontrol edin</h3>
        <p>Okunan bilgileri inceleyip düzenleyin.</p>
      </div>
      <b>02</b>
    </div>
    <div class="workflow-step">
      <span class="step-icon">${icon('check')}</span>
      <div class="step-content">
        <h3>Onaylayın, kayıt tamamlansın</h3>
        <p>Faturanız listenize ve analizlere eklensin.</p>
      </div>
      <b>03</b>
    </div>
  </div>`;
}

function invoiceTable(docs, compact = false) {
  if (!docs.length)
    return empty(
      'Henüz fatura bulunmuyor',
      'İlk belgenizi yükleyerek faturalarınızı tek bir yerden yönetmeye başlayın.',
      true,
    );
  return /* HTML */ `<div class="table-wrap">
    <table class="invoice-table">
      <thead>
        <tr>
          <th>Fatura / Satıcı</th>
          <th class="hide-mobile">Tarih</th>
          <th>Tutar</th>
          <th class="${compact ? 'hide-mobile' : ''}">Durum</th>
          <th aria-label="İşlem"></th>
        </tr>
      </thead>
      <tbody>
        ${docs
          .map(
            (d) =>
              /* HTML */ `<tr
                data-open="${d.id}"
                tabindex="0"
                aria-label="${esc(d.seller || d.filename)} faturasını aç"
              >
                <td>
                  <div class="vendor-cell">
                    <span class="vendor-icon">${icon('files')}</span>
                    <div>
                      <div class="vendor-name">${esc(d.seller || d.filename)}</div>
                      <div class="vendor-sub">
                        ${esc(d.invoice_number || 'Numara bekleniyor')}${compact
                          ? ''
                          : ` · ${d.item_count} kalem`}
                      </div>
                    </div>
                  </div>
                </td>
                <td class="hide-mobile" style="color:#93a1b5;white-space:nowrap">
                  ${shortDate(d.invoice_date)}
                </td>
                <td class="amount-cell">
                  ${money(d.totals.gross, d.currency || 'TRY')}${!d.currency &&
                  d.totals.gross != null
                    ? '<small> · Birim eksik</small>'
                    : ''}
                </td>
                <td class="${compact ? 'hide-mobile' : ''}">${badge(d.status)}</td>
                <td>
                  <div class="row-actions">
                    ${!compact
                      ? /* HTML */ `<button
                          class="icon-button delete-invoice"
                          data-action="delete-invoice"
                          data-id="${d.id}"
                          aria-label="${esc(d.invoice_number || d.filename)} faturasını sil"
                          title="Faturayı sil"
                          ${d.status === 'processing' ? 'disabled' : ''}
                        >
                          ${icon('trash')}
                        </button>`
                      : ''}
                    <span class="row-arrow">${icon('chevron')}</span>
                  </div>
                </td>
              </tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

// Genel bakış ekranı.
function renderOverview() {
  const s = stats();
  const recent = state.documents.slice(0, 5);
  app.innerHTML = /* HTML */ `<div class="page">
    ${heading(
      'FİNANSAL ÇALIŞMA ALANINIZ',
      'Her fatura, kontrol altında.',
      'Faturalarınızı inceleyin, güvenle kaydedin ve harcamalarınızı takip edin.',
      /* HTML */ `<span class="date-chip"
          >${icon('calendar')}${shortDate(new Date().toISOString())}</span
        >${button('Yeni fatura')}`,
    )}
    <div class="hero">
      <section class="hero-main">
        <div class="eyebrow">DAHA DÜZENLİ BİR İŞ AKIŞI</div>
        <h2>Belgelerden verilere.<br />Kontrol sizde.</h2>
        <p>
          Faturanızı yükleyin, okunan alanları kontrol edin.<br />Doğruladığınız her kayıt, finansal
          görünümünüzü tamamlasın.
        </p>
        <div class="hero-links">
          ${button('Fatura yükle', 'plus', 'new')}<a href="#invoices" class="muted-link"
            >Faturaları görüntüle ${icon('arrow')}</a
          >
        </div>
        <div class="hero-art">${icon('files')}<b>${icon('check')}</b></div>
      </section>
      <section class="card quick-card">
        <div class="quick-top">
          <span class="soft-icon">${icon('scan')}</span>
          <div>
            <h3>Tek belge, düzenli kayıt.</h3>
            <p>Fatura okuma ve kontrol</p>
          </div>
        </div>
        <p>
          Satıcı, ürün kalemleri ve tutarlar tek bir formda.<br />Eksik alanları tamamlayın, son
          kararı siz verin.
        </p>
        <div class="quick-bottom">
          <span>Desteklenen belgeler</span>
          <div class="mini-tags"><span>PDF</span></div>
        </div>
      </section>
    </div>
    ${statsCards(s)}
    <div class="dashboard-bottom">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Son faturalar</h2>
            <p>Çalışma alanınıza eklenen son belgeler</p>
          </div>
          <a href="#invoices" class="btn btn-text">Tümünü gör ${icon('arrow')}</a>
        </div>
        ${invoiceTable(recent, true)}
        <div class="table-footer">
          <span>${state.documents.length} belge · ${s.count} onaylı TRY faturası</span
          ><span>Güncel kayıtlar</span>
        </div>
      </section>
      <section class="card workflow-panel">
        <div class="card-head">
          <div>
            <h2>Üç adımda tamamlayın</h2>
            <p>Kontrollü ve sade bir fatura akışı</p>
          </div>
        </div>
        ${workflow()}
        <div class="privacy-note">
          ${icon('shield')} Verileriniz cihazınızda, kontrol sizin elinizde.
        </div>
      </section>
    </div>
    ${footer()}
  </div>`;
}
// Belge yükleme ekranı ve dosyanın sunucuya aktarılması.
function renderUpload() {
  const pending = state.documents.filter((d) => d.status !== 'approved');
  app.innerHTML = /* HTML */ `<div class="page">
    ${heading(
      'BELGEDEN KAYDA',
      'Yeni bir fatura ekleyin.',
      'Belgenizi yükleyin. Bilgileri birlikte düzenli bir kayda dönüştürelim.',
      '',
    )}
    <div class="review-toolbar">
      <span class="section-kicker">${icon('files')} FATURA YÜKLEME</span>
      <div class="stepper">
        <span class="current"><b>01</b>Yükle</span><i></i><span><b>02</b>Kontrol et</span><i></i
        ><span><b>03</b>Kaydet</span>
      </div>
    </div>
    <div class="upload-grid">
      <section class="card upload-card">
        <div class="section-kicker">BELGENİZİ SEÇİN</div>
        <label class="pdf-split-option">
          <input type="checkbox" id="split-pdf-pages" ${state.splitPages ? 'checked' : ''} />
          <span><strong>Toplu fatura</strong>
            <small>Örneğin 4 sayfalık PDF → 4 ayrı fatura. Sayfalar sırayla okunur.</small>
          </span>
        </label>
        <div
          class="dropzone"
          id="dropzone"
          role="button"
          tabindex="0"
          aria-label="Fatura yüklemek için dosya seçin"
        >
          <div class="upload-symbol">${icon('upload')}</div>
          <h2>Faturanızı buraya bırakın</h2>
          <p>veya bilgisayarınızdan PDF seçin</p>
          ${button(state.uploading ? 'Yükleniyor…' : 'PDF seç', 'plus', 'choose')}
          <small>PDF · En fazla 25 MB</small>
        </div>
        <div class="upload-hint">
          <span>${icon('lock')} Belgeleriniz dışarıya gönderilmez.</span
          ><span>Tek veya çok sayfalı PDF’ler</span>
        </div>
      </section>
      <aside class="upload-aside">
        <section class="card">
          <div class="card-head">
            <div>
              <h2>Son onay her zaman sizde.</h2>
              <p>Yükledikten sonra ne olur?</p>
            </div>
          </div>
          ${workflow()}
        </section>
        <section class="aside-banner">
          <h3>${icon('info')} Daha iyi bir okuma için</h3>
          <p>
            Belgenin tamamının göründüğünden ve yazıların net olduğundan emin olun. Okunamayan
            alanları inceleme ekranında tamamlayabilirsiniz.
          </p>
        </section>
      </aside>
    </div>
    ${pending.length
      ? /* HTML */ `<div class="card resume-panel">
          <div>
            <h3>${pending.length} belgeniz inceleme bekliyor</h3>
            <p>Yarım kalan kayıtlarınıza kaldığınız yerden devam edin.</p>
          </div>
          <a class="btn btn-light" href="#invoices">Faturalara git ${icon('arrow')}</a>
        </div>`
      : ''}${footer()}
  </div>`;
  $('#split-pdf-pages')?.addEventListener('change', (event) => {
    state.splitPages = event.target.checked;
  });
  const drop = $('#dropzone');
  drop.addEventListener('dragover', (e) => {
    e.preventDefault();
    drop.classList.add('drag');
  });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (e) => {
    e.preventDefault();
    drop.classList.remove('drag');
    if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]);
  });
  drop.addEventListener('click', (e) => {
    if (!e.target.closest('button')) $('#file-input').click();
  });
  drop.addEventListener('keydown', (e) => {
    if (e.target === drop && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      $('#file-input').click();
    }
  });
}

// Çok sayfalı belgeler, kullanıcı düzeni seçmeden OCR kuyruğuna alınmaz.
function choosePdfLayout(pageCount) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'service-dialog';
    dialog.innerHTML = /* HTML */ `<h2>PDF ${pageCount} sayfa içeriyor</h2>
      <p>Bu sayfalar nasıl okunmalı?</p>
      <div class="pdf-layout-options">
        <button class="btn btn-primary" data-layout="pages">Toplu fatura</button>
        <button class="btn btn-light" data-layout="single">Tek fatura, birden fazla sayfa</button>
        <button class="btn btn-text" data-layout="cancel">Vazgeç</button>
      </div>`;
    let choice = null;
    dialog.querySelectorAll('[data-layout]').forEach((button) => {
      button.onclick = () => {
        choice = button.dataset.layout === 'cancel' ? null : button.dataset.layout;
        dialog.close();
      };
    });
    dialog.addEventListener('close', () => {
      dialog.remove();
      resolve(choice);
    }, {once: true});
    document.body.append(dialog);
    dialog.showModal();
  });
}

async function upload(file) {
  if (state.uploading) return;
  if (file.size > 25 * 1024 * 1024) {
    toast('En fazla 25 MB boyutunda bir dosya seçin.');
    return;
  }
  if ((await file.slice(0, 5).text()) !== '%PDF-') {
    toast('Lütfen PDF biçiminde bir fatura seçin.');
    $('#file-input').value = '';
    return;
  }
  if (state.dirty && !(await canLeave())) return;
  state.uploading = true;
  toast('Belgeniz yükleniyor…');
  try {
    const inspection = await api('/api/uploads/inspect', {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    const mode = inspection.page_count === 1
      ? 'single'
      : state.splitPages ? 'pages' : await choosePdfLayout(inspection.page_count);
    if (!mode) return;
    const doc = await api(`/api/uploads?name=${encodeURIComponent(file.name)}&split=${mode}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: file,
    });
    state.dirty = false;
    location.hash = `document/${doc.id}`;
    if (doc.documents) toast(`${doc.documents.length} fatura sayfa sırasıyla okuma kuyruğuna eklendi.`);
  } catch (e) {
    toast(e.message);
  } finally {
    state.uploading = false;
    $('#file-input').value = '';
  }
}
// Arka plandaki okuma tamamlanana kadar belge durumunu izleme.
async function pollDocument(id) {
  state.poll = setTimeout(async () => {
    if (state.route !== `document/${id}`) return;
    try {
      const doc = await api(`/api/documents/${id}`);
      if (state.route !== `document/${id}`) return;
      const wasProcessing = state.current.status === 'processing';
      if (wasProcessing) {
        state.current = doc;
        state.form = structuredClone(doc.edited);
        renderReview();
      } else {
        // Diğer sayfalar okunurken kullanıcının açık formdaki düzeltmeleri korunur.
        state.current.batch_documents = doc.batch_documents;
        const navigation = app.querySelector('.batch-navigation');
        if (navigation) navigation.outerHTML = renderBatchNavigation(doc);
      }
      if (doc.status === 'processing' || doc.batch_documents?.some((item) => item.status === 'processing')) {
        pollDocument(id);
      }
      if (wasProcessing && doc.status !== 'processing') {
        await loadDocuments();
        toast(
          doc.status === 'duplicate'
            ? 'Bu fatura zaten mevcut. İkinci kez eklenmedi.'
            : 'Okuma tamamlandı. Alanları kontrol edebilirsiniz.',
        );
      }
    } catch (e) {
      toast(e.message);
      pollDocument(id);
    }
  }, 1200);
}
// Düzenlenebilir alanlar ve fatura inceleme ekranı.
function field(label, path, options = {}) {
  const value = path.split('.').reduce((v, k) => v?.[k], state.form);
  const required = options.required ? '<em>*</em>' : '';
  const cls = options.full ? ' full' : '';
  let control;
  if (options.select)
    control = /* HTML */ `<select data-path="${path}">
      ${options.select
        .map(
          ([v, l]) =>
            /* HTML */ `<option value="${esc(v)}" ${value === v ? ' selected' : ''}>
              ${esc(l)}
            </option>`,
        )
        .join('')}
    </select>`;
  else if (options.area)
    control = `<textarea data-path="${path}" rows="2" placeholder="${esc(options.placeholder || 'İsteğe bağlı')}">${esc(value)}</textarea>`;
  else
    control = /* HTML */ `<input
      data-path="${path}"
      ${options.decimal ? ' inputmode="decimal" data-decimal="true"' : ''}
      type="${options.type || 'text'}"
      value="${esc(options.decimal ? numeric(value) : value)}"
      placeholder="${esc(
        options.placeholder || (options.required ? 'Kontrol edip tamamlayın' : 'İsteğe bağlı'),
      )}"
      class="${options.required && (value === null || value === '') ? 'missing' : ''}"
      ${options.required ? ' aria-required="true"' : ''}
    />`;
  return /* HTML */ `<label class="field${cls}"
    ><span>${label} ${required}</span>${control}
    ${path === 'invoice_number' &&
    state.form.issues?.some((issue) => issue.code === 'identifier_review')
      ? /* HTML */ `<small class="field-warning"
          >Numara aday olarak okundu; harf ve rakamları doğrulayın.</small
        >`
      : ''}</label
  >`;
}

function renderReview() {
  const d = state.current;
  if (!d) return;
  if (d.status === 'duplicate' && !state.showDuplicateForm) {
    renderDuplicateInvoice(d);
    return;
  }
  const approved = d.status === 'approved';
  const processing = d.status === 'processing';
  const r = state.form;
  if (r && r.service_id == null && d.service_match?.id) r.service_id = d.service_match.id;
  const count = r?.pages?.length || 1;
  app.innerHTML = /* HTML */ `<div class="page">
    ${heading(
      'FATURA İNCELEME',
      approved ? 'Kayıt tamamlandı.' : 'Bilgileri kontrol edin.',
      'Belgenizdeki alanları inceleyin, gerekli düzeltmeleri yapıp kaydedin.',
      button('Yeni fatura'),
    )}
    <div class="review-toolbar">
      <div class="review-file">
        <span class="vendor-icon">${icon('files')}</span>
        <div>
          <strong>${esc(d.filename)}</strong
          ><small>${statusText(d.status)} · ${shortDate(d.created_at)}</small>
        </div>
      </div>
      <div class="stepper">
        <span class="done"><b>${icon('check')}</b>Yükle</span><i></i
        ><span class="${approved ? 'done' : 'current'}"><b>02</b>Kontrol et</span><i></i
        ><span class="${approved ? 'current' : ''}"><b>03</b>Kaydet</span>
      </div>
      ${d.status === 'review'
        ? /* HTML */ `<button
            class="icon-button"
            data-action="retry"
            title="Belgeyi yeniden oku"
            aria-label="Belgeyi yeniden oku"
          >
            ${icon('refresh')}
          </button>`
        : ''}
      <a href="#invoices" class="btn btn-light">Listeye dön ${icon('arrow')}</a>
    </div>
    ${renderBatchNavigation(d)}
    ${d.mime === 'application/pdf' && !d.batch_id && !processing
      ? `<div class="pdf-split-toolbar"><button class="btn btn-light" data-action="split-invoice-pages">${icon('files')} Toplu fatura olarak oku</button></div>`
      : ''}
    <div class="review-grid">
      <aside class="card preview-panel">
        <div class="preview-head">
          <span>Belge önizlemesi</span>
          <div>
            <button
              class="icon-button"
              data-action="zoom"
              title="Yakınlaştır"
              aria-label="Yakınlaştır"
            >
              ${icon('zoom')}</button
            ><a
              class="icon-button"
              href="/api/documents/${d.id}/source"
              target="_blank"
              rel="noopener"
              title="Orijinal belgeyi aç"
              aria-label="Orijinal belgeyi aç"
              >${icon('external')}</a
            >
          </div>
        </div>
        <div class="preview-viewport">
          <img
            id="document-preview"
            src="/api/documents/${d.id}/preview?page=${state.page}"
            alt="Yüklediğiniz faturanın ${state.page}. sayfası"
            style="width:${state.zoom}%"
          />
        </div>
        <div class="preview-foot">
          <span
            >${d.mime === 'application/pdf' ? 'PDF BELGESİ' : 'FATURA GÖRSELİ'} ·
            ${state.zoom}%</span
          ><span style="display:flex;align-items:center;gap:7px"
            ><button
              class="icon-button"
              data-action="prev-page"
              aria-label="Önceki sayfa"
              ${state.page <= 1 ? 'disabled' : ''}
            >
              ${icon('left')}</button
            >${state.page} / ${count}<button
              class="icon-button"
              data-action="next-page"
              aria-label="Sonraki sayfa"
              ${state.page >= count ? 'disabled' : ''}
            >
              ${icon('chevron')}
            </button></span
          >
        </div>
      </aside>
      <div class="review-form">
        ${processing
          ? /* HTML */ `<section class="card processing-panel">
              <div class="scanner">${icon('scan')}</div>
              <div class="eyebrow" style="justify-content:center">BELGENİZ OKUNUYOR</div>
              <h2>Alanlar birazdan hazır.</h2>
              <p>
                Fatura bilgileri ve ürün kalemleri okunuyor.<br />İşlem tamamlanınca düzenleme formu
                açılacak.
              </p>
              <div class="progress-track"><span></span></div>
              <p>Bu sırada başka sayfalarda çalışabilirsiniz.</p>
            </section>`
          : renderForm(approved, r)}
      </div>
    </div>
    ${footer()}
  </div>`;
  const preview = $('#document-preview');
  preview.addEventListener('error', () => {
    preview.parentElement.innerHTML = /* HTML */ `<div class="preview-error">
      Önizleme henüz hazır değil.<br />Orijinal belgeyi üstteki düğmeyle açabilirsiniz.<br /><button
        class="btn btn-light"
        data-action="preview-retry"
      >
        Önizlemeyi yenile
      </button>
    </div>`;
  });
}

// Tek oran varsayılmaz; farklı KDV oranları ayrı ayrı gösterilir.
function renderBatchNavigation(doc) {
  if (!doc.batch_documents?.length) return '';
  const completed = doc.batch_documents.filter((item) => item.status !== 'processing').length;
  const reading = doc.batch_documents.find((item) => item.status === 'processing');
  return /* HTML */ `<nav class="card batch-navigation" aria-label="PDF içindeki faturalar">
    <div>
      <strong>PDF içindeki ${doc.batch_count} fatura</strong>
      <p>Okunan: ${completed}/${doc.batch_documents.length} · Şu an ${doc.batch_page}. faturadasınız. Her fatura ayrı onaylanır.</p>
    </div>
    <div class="batch-links">
      ${doc.batch_documents.map((item) => /* HTML */ `
        <a class="btn ${item.id === doc.id ? 'btn-primary' : 'btn-light'}"
          href="#document/${encodeURIComponent(item.id)}"
          ${item.id === doc.id ? 'aria-current="page"' : ''}
          title="${esc(item.filename)} · ${item.status === 'processing' && reading?.id !== item.id ? 'Sırada' : esc(statusText(item.status))}">
          Fatura ${item.batch_page}
        </a>`).join('')}
    </div>
  </nav>`;
}

function vatRatesSummary(record) {
  const rates = [
    ...new Set(
      record.items
        .map((item) => item.vat_rate)
        .filter((value) => value !== null && value !== undefined && value !== '')
        .map((value) => Number(String(value).replace(',', '.')))
        .filter(Number.isFinite),
    ),
  ].sort((a, b) => a - b);
  return rates.length
    ? rates
        .map((rate) => `%${rate.toLocaleString('tr-TR', { maximumFractionDigits: 4 })}`)
        .join(' · ')
    : 'KDV oranı henüz okunmadı';
}

function renderForm(approved, r) {
  if (!r) return /* HTML */ `<div class="inline-error">Belge bilgileri alınamadı.</div>`;
  const issues = r.issues || [];
  const err = state.errors;
  const issueLabels = {
    missing_field: 'Eksik fatura alanı',
    missing_items: 'Ürün satırları bulunamadı',
    missing_item_field: 'Eksik kalem bilgisi',
    ambiguous_tax_basis: 'KDV dahil/hariç bilgisi belirsiz',
    ocr_numeric_separator: 'Sayı biçimi kontrol edilmeli',
    ocr_review: 'Okunan değerleri belgeyle karşılaştırın',
    unknown_layout: 'Belge alanlarını elle tamamlayın',
    unknown_table: 'Tablo başlıklarını ve kalemleri kontrol edin',
    layout_review: 'Başlıklardan eşleştirilen alanları kontrol edin',
    preprocessing_review: 'Çizgileri temizlenen alanları belgeyle karşılaştırın',
    document_review: 'Alan eşleşmelerini doğrulayın',
    invoice_note_review: 'Not alanındaki metni kontrol edin',
    profile_review: 'Alan eşleşmelerini kontrol edin',
    amount_mismatch: 'Tutarlar arasında fark var',
    invalid_identifier: 'Fatura numarasını tamamlayın',
    identifier_review: 'Fatura numarasındaki harf ve rakamları doğrulayın',
    row_sequence: 'Ürün satırlarının tamamını kontrol edin',
    conflicting_values: 'Sayfalarda farklı değerler bulundu',
  };
  const notes = [
    ...new Set(issues.map((i) => issueLabels[i.code] || 'Belge alanlarını kontrol edin')),
  ];
  return /* HTML */ `${approved
      ? /* HTML */ `<div class="saved-banner">
          ${icon('check')} Onaylandı · ${shortDate(state.current.approved_at)}. Değiştirip yeniden
          onaylayabilirsiniz.
        </div>`
      : ''}${state.current.error
      ? /* HTML */ `<div class="note-panel">
          <strong
            >${icon('warning')}
            ${state.current.status === 'duplicate'
              ? 'Fatura numarasını kontrol edin'
              : 'Otomatik okuma tamamlanamadı'}</strong
          >
          <p>${esc(state.current.error)}</p>
          ${state.current.status === 'duplicate'
            ? `<p>Numarayı belgeden doğrulayın. Aynı numarayla kayıt yapılamaz.</p>`
            : `<button class="btn btn-text" data-action="retry">${icon('refresh')} Yeniden analiz et</button>`}
        </div>`
      : ''}${err
      ? /* HTML */ `<div id="form-error" role="alert" class="form-error">
          ${esc(err.error)}${err.duplicate_of
            ? `<p><a class="service-link" href="#document/${encodeURIComponent(err.duplicate_of)}">Mevcut faturayı aç</a></p>`
            : ''}${err.fields
            ? `<ul>${err.fields.map((f) => /* HTML */ `<li>${esc(f)}</li>`).join('')}</ul>`
            : ''}
        </div>`
      : ''}
    <div class="note-panel ${notes.length ? '' : 'check-ok'}">
      <strong
        >${icon(notes.length ? 'eye' : 'check')}${notes.length
          ? 'Son kontrol sizde.'
          : 'Alanlar arasında hesap farkı bulunmadı.'}</strong
      >
      <p>
        ${notes.length
          ? 'Okunan değerleri belgenizle karşılaştırın. Eksik veya hatalı alanları değiştirebilirsiniz.'
          : 'Kaydetmeden önce satıcı ve fatura bilgilerini de doğrulayın.'}
      </p>
      ${notes.length
        ? /* HTML */ `<details>
            <summary>${notes.length} kontrol başlığını görüntüle</summary>
            <ul>
              ${notes.map((n) => /* HTML */ `<li>${n}</li>`).join('')}
            </ul>
          </details>`
        : ''}
    </div>
    ${renderServiceField()}
    <section class="card form-card">
      <div class="form-section-title">
        <h2>${icon('building')} Satıcı bilgileri</h2>
        <span class="section-number">01</span>
      </div>
      <div class="form-grid">
        ${field('Firma / Satıcı unvanı', 'seller.name', {
          required: true,
          full: true,
        })}
      </div>
    </section>
    <section class="card form-card">
      <div class="form-section-title">
        <h2>${icon('files')} Fatura bilgileri</h2>
        <span class="section-number">02</span>
      </div>
      <div class="form-grid three">
        ${field('Fatura numarası', 'invoice_number', {
          required: true,
        })}${field('Fatura tarihi', 'invoice_date', {
          type: 'date',
          required: true,
        })}${field('Para birimi', 'currency', {
          required: true,
          select: [
            ['', 'Seçin'],
            ['TRY', 'TRY · Türk lirası'],
            ['USD', 'USD · ABD doları'],
            ['EUR', 'EUR · Euro'],
            ['GBP', 'GBP · İngiliz sterlini'],
          ],
        })}
      </div>
    </section>
    <section class="card form-card">
      <div class="form-section-title">
        <h2>${icon('layers')} Ürün / Hizmet kalemleri</h2>
        <span class="required-hint">${r.items.length} kalem</span>
      </div>
      ${r.items.length
        ? r.items
            .map(
              (item, i) =>
                /* HTML */ `<div class="item-editor">
                  <div class="item-title">
                    <b><span>${String(i + 1).padStart(2, '0')}</span> ÜRÜN / HİZMET</b
                    ><button
                      class="icon-button"
                      data-action="remove-item"
                      data-index="${i}"
                      aria-label="${i + 1}. kalemi kaldır"
                    >
                      ${icon('trash')}
                    </button>
                  </div>
                  <div class="form-grid">
                    ${field('Ürün / Hizmet adı', `items.${i}.name`, {
                      required: true,
                    })}${field('Açıklama', `items.${i}.description`)}
                  </div>
                  <div class="item-numbers">
                    ${field('Miktar', `items.${i}.quantity`, {
                      decimal: true,
                      required: true,
                    })}${field('Birim', `items.${i}.unit`)}${field(
                      'Birim fiyat',
                      `items.${i}.unit_price`,
                      { decimal: true, required: true },
                    )}${field('KDV %', `items.${i}.vat_rate`, {
                      decimal: true,
                      required: true,
                    })}${field('Satır toplamı', `items.${i}.line_total`, {
                      decimal: true,
                      required: true,
                    })}
                  </div>
                  <div class="item-extra">
                    ${field('Birim fiyatın KDV esası', `items.${i}.price_basis`, {
                      select: [
                        ['unknown', 'Belirsiz · kontrol edin'],
                        ['net', 'KDV hariç'],
                        ['gross', 'KDV dahil'],
                      ],
                    })}${field('Satır toplamının KDV esası', `items.${i}.total_basis`, {
                      select: [
                        ['unknown', 'Belirsiz · kontrol edin'],
                        ['net', 'KDV hariç'],
                        ['gross', 'KDV dahil'],
                      ],
                    })}${field('Satır indirimi', `items.${i}.discount`, {
                      decimal: true,
                    })}
                  </div>
                </div>`,
            )
            .join('')
        : /* HTML */ `<div class="items-empty">
            Ürün kalemleri otomatik okunamadı.<br />Belgenizden yeni bir kalem ekleyebilirsiniz.
          </div>`}
      <button class="add-item" data-action="add-item">${icon('plus')} Yeni kalem ekle</button>
    </section>
    <section class="card form-card">
      <div class="form-section-title">
        <h2>${icon('wallet')} Fatura toplamları</h2>
        <span class="section-number">04</span>
      </div>
      <div class="form-grid">
        ${field('KDV hariç toplam', 'totals.net', {
          decimal: true,
          required: true,
        })}${field('KDV toplamı', 'totals.vat', {
          decimal: true,
          required: true,
        })}${field('Genel indirim', 'totals.discount', {
          decimal: true,
        })}${field('Tevkifat', 'totals.withholding', { decimal: true })}
      </div>
      <div class="vat-summary">
        <span>Belgedeki KDV oranları</span>
        <output id="vat-rates-summary">${esc(vatRatesSummary(r))}</output>
        <small>Kalemlerdeki oranlara göre gösterilir.</small>
      </div>
      <div class="totals-emphasis">
        <div class="form-grid">
          ${field('KDV dahil toplam', 'totals.gross', {
            decimal: true,
            required: true,
          })}${field('Ödenecek tutar', 'totals.payable', { decimal: true })}
        </div>
      </div>
    </section>
    <section class="card form-card">
      <div class="form-section-title">
        <h2>${icon('files')} Fatura notu</h2>
        <span class="section-number">05</span>
      </div>
      <div class="form-grid">
        ${field('Belgedeki not', 'invoice_note', {
          area: true,
          full: true,
          placeholder: 'Varsa fatura notunu ekleyebilirsiniz.',
        })}
      </div>
    </section>
    <details class="card form-card">
      <summary style="font-size:11px;color:#8194ae;cursor:pointer">
        İlk okunan değerler ve hesap kontrolleri
      </summary>
      <p style="font-size:10px;color:#9ba7b8;line-height:1.8">
        İlk okuma korunur. Yaptığınız düzeltmeler onaylanan kayıtta ayrı saklanır.
      </p>
      <div class="source-raw">${esc(originalSummary(state.current.original))}</div>
    </details>
    <section class="card approval-bar">
      <label
        ><input id="reviewed" type="checkbox" ${state.reviewed ? 'checked' : ''} /> Fatura
        alanlarını ve tutarları belgeyle karşılaştırdım. Varsa kontrol uyarılarını inceledim.</label
      >
      <div class="approval-actions">
        ${button('Taslak kaydet', 'save', 'save-draft', 'btn-light')}${button(
          approved ? 'Değişiklikleri onayla' : 'Onayla ve kaydet',
          'check',
          'approve',
        )}
      </div>
      <p id="save-hint" style="font-size:9px;color:#a3afc0;text-align:right;margin:12px 0 0">
        ${state.dirty
          ? 'Kaydedilmemiş değişiklikler var.'
          : 'Onaylanan kayıtlar fatura listenize ve analizlere yansır.'}
      </p>
    </section>`;
}

function originalSummary(r) {
  if (!r) return 'İlk okuma henüz oluşmadı.';
  return [
    `Satıcı: ${r.seller.name || 'Okunamadı'}`,
    `Fatura no: ${r.invoice_number || 'Okunamadı'}`,
    `Tarih: ${r.invoice_date || 'Okunamadı'}`,
    '',
    ...r.items.flatMap((item, i) => [
      `${i + 1}. ${item.name || 'Ürün / Hizmet'}`,
      `Miktar: ${item.quantity ?? 'Okunamadı'} ${item.unit || ''} · Birim fiyat: ${item.unit_price ?? 'Okunamadı'}`,
      `KDV: %${item.vat_rate ?? '—'} · Satır toplamı: ${item.line_total ?? 'Okunamadı'}`,
      '',
    ]),
    `KDV hariç: ${money(r.totals.net, r.currency || 'TRY')}`,
    `KDV: ${money(r.totals.vat, r.currency || 'TRY')}`,
    `KDV dahil: ${money(r.totals.gross, r.currency || 'TRY')}`,
    `Fatura notu: ${r.invoice_note || 'Yok / okunamadı'}`,
    ...(r.checks || []).map(
      (c) => `${c.ok ? '✓' : '!'} Okunan: ${c.observed} · Hesaplanan: ${c.calculated}`,
    ),
  ].join('\n');
}
// Taslak kaydı ve kullanıcı onayının sunucuya gönderilmesi.
async function save(approve) {
  if (state.saving) return;
  if (approve && !state.reviewed) {
    toast('Önce bilgileri kontrol ettiğinizi işaretleyin.');
    $('#reviewed')?.focus();
    return;
  }
  state.saving = true;
  document
    .querySelectorAll('[data-action="approve"],[data-action="save-draft"]')
    .forEach((b) => (b.disabled = true));
  try {
    const doc = await api(`/api/documents/${state.current.id}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        record: state.form,
        revision: state.current.revision,
        approve,
        reviewed: state.reviewed,
      }),
    });
    state.current = await api(`/api/documents/${doc.id}`);
    state.form = structuredClone(doc.edited);
    state.dirty = false;
    state.errors = null;
    await loadDocuments();
    renderReview();
    toast(approve ? 'Fatura onaylandı ve kaydedildi.' : 'Taslak kaydedildi.');
  } catch (e) {
    state.errors = e.payload || { error: e.message };
    if (e.payload?.record) {
      state.form = e.payload.record;
    }
    renderReview();
    $('#form-error')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } finally {
    state.saving = false;
    document
      .querySelectorAll('[data-action="approve"],[data-action="save-draft"]')
      .forEach((b) => (b.disabled = false));
  }
}
// Fatura listesi, arama ve filtreler.
function currencies() {
  return [...new Set(['TRY', ...state.documents.map((d) => d.currency).filter(Boolean)])];
}

function filteredDocuments() {
  const f = state.list;
  return state.documents.filter((d) => {
    const haystack = [d.seller, d.invoice_number, d.filename]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('tr');
    return (
      (!f.query || haystack.includes(f.query.toLocaleLowerCase('tr'))) &&
      (!f.number || invoiceNumberKey(d.invoice_number).includes(invoiceNumberKey(f.number))) &&
      (f.status === 'all' ||
        (f.status === 'pending' ? d.status !== 'approved' : d.status === f.status)) &&
      (f.currency === 'all' || d.currency === f.currency) &&
      (!f.from || d.invoice_date >= f.from) &&
      (!f.to || (d.invoice_date && d.invoice_date <= f.to))
    );
  });
}

function renderInvoices() {
  if (state.invoiceView === 'records') renderInvoiceRecords();
  else renderIncreaseAnalysis();
}

// Excel başlangıç verileri ve açıklamadan eşleştirilen yeni faturalar birlikte gösterilir.
async function renderIncreaseAnalysis() {
  {
    app.innerHTML = '<div class="initial-loader">Zam analizi hazırlanıyor…</div>';
    try {
      state.increaseData = await api('/api/increase-analysis');
    } catch (error) {
      if (state.route === 'invoices' && state.invoiceView === 'analysis')
        app.innerHTML = `<div class="inline-error">${esc(error.message)}<button class="btn btn-light" data-action="reload">Yeniden dene</button></div>`;
      return;
    }
  }
  if (state.route !== 'invoices' || state.invoiceView !== 'analysis') return;
  const data = state.increaseData;
  const types = [
    ...new Set([
      ...SERVICE_TYPES,
      ...data.rows.map((row) => serviceTypeLabel(row.service_type)).filter(Boolean),
    ]),
  ].sort((a, b) => a.localeCompare(b, 'tr'));
  app.innerHTML = /* HTML */ `<div class="page">
    ${heading(
      'HİZMET BEDELLERİNİZ',
      'Faturalar',
      'Yıllara göre hizmet bedelleri ve zam analizi.',
      button('Yüklenen faturalar', 'files', 'view-records', 'btn-light') + button('Yeni fatura'),
    )}
    <div class="list-stats increase-stats">
      <span><strong>${data.rows.length}</strong> hizmet</span
      ><span><strong>${esc(data.years.join('–'))}</strong> dönemi</span
      ><span>Excel başlangıcı + yeni faturalar</span>
    </div>
    ${data.unmatched_document_ids?.length
      ? `<div class="note-panel"><strong>${data.unmatched_document_ids.length} fatura hizmet eşleştirmesi bekliyor</strong><p>Açıklaması tek bir hizmetle eşleşmeyen faturayı açıp bağlı hizmeti seçin.</p>${button('Faturaları kontrol et', 'files', 'view-records', 'btn-light')}</div>`
      : ''}
    <section class="card form-card">
      <h2>Fatura numarasıyla ara</h2>
      <label class="search-field"
        >${icon('search')}<input
          id="invoice-number-search"
          aria-label="Fatura numarasıyla ara"
          placeholder="Fatura numarasının tamamını veya bir bölümünü yazın…"
          value="${esc(state.list.number)}"
      /></label>
      <div id="invoice-number-results" aria-live="polite"></div>
    </section>
    <section class="card increase-card">
      <div class="card-head increase-card-head">
        <div>
          <h2>Zam Analizi</h2>
          <p>Analizi açmak için hizmet adına tıklayın.</p>
        </div>
        <span class="increase-source"
          >${icon('files')}${esc(data.source_name || 'Excel verisi bulunamadı')}</span
        >
      </div>
      <div class="filter-bar">
        <label class="search-field"
          >${icon('search')}<input
            id="increase-query"
            aria-label="Hizmetlerde ara"
            placeholder="Kurum, açıklama veya notlarda ara…"
            value="${esc(state.increaseFilter.query)}"
        /></label>
        <select class="filter-select" id="increase-type" aria-label="Hizmet türü filtresi">
          <option value="all">Tüm hizmet türleri</option>
          ${types
            .map(
              (type) =>
                `<option value="${esc(type)}" ${state.increaseFilter.type === type ? 'selected' : ''}>${esc(type)}</option>`,
            )
            .join('')}
        </select>
        <span id="increase-count" class="result-count"></span
        ><button class="btn btn-text reset-filters" data-action="reset-increase">
          Filtreleri temizle
        </button>
      </div>
      <div id="increase-results"></div>
      <div class="table-footer">
        <span>Tabloyu yatay kaydırarak tüm sütunları görebilirsiniz.</span
        ><span>Kaynak: ${esc(data.sheet || 'Zam Analizi')}</span>
      </div>
    </section>
    <p class="increase-source-note">
      Excel başlangıç değerleri korunur. Yeni faturalar ödenmiş sayılır; onaylanan tutarlar yılın
      son hizmet bedelini ve zam oranını günceller. Eşleşmeyen faturalar hizmet seçilene kadar bu
      tabloya eklenmez.
    </p>
    ${footer()}
  </div>`;
  updateIncreaseResults();
  updateInvoiceNumberResults();
}

function increasePercent(value) {
  if (value == null || value === '') return '—';
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/);
  if (!match) return '—';
  // Oranı yüzdeye çevirirken kayan nokta yuvarlaması oluşturmayız.
  const fraction = match[3] || '';
  const whole = (match[2] + fraction.padEnd(2, '0').slice(0, 2)).replace(/^0+(?=\d)/, '');
  const decimal = fraction.slice(2).replace(/0+$/, '');
  return `%${numeric(match[1] + whole + (decimal ? '.' + decimal : ''))}`;
}

function updateIncreaseResults() {
  const target = $('#increase-results');
  if (!target || !state.increaseData) return;
  const { rows, years } = state.increaseData;
  const { query, type } = state.increaseFilter;
  const selected = rows.filter(
    (row) =>
      (type === 'all' || serviceTypeLabel(row.service_type) === type) &&
      (!query ||
        [row.institution, row.description, row.note, row.service_type, serviceTypeLabel(row.service_type)]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase('tr')
          .includes(query.toLocaleLowerCase('tr'))),
  );
  $('#increase-count').textContent = `${selected.length} hizmet`;
  if (!selected.length) {
    target.innerHTML = empty(
      rows.length ? 'Eşleşen hizmet bulunamadı' : 'Excel analizi bulunamadı',
      rows.length
        ? 'Arama metnini veya hizmet türünü değiştirin.'
        : 'Zam Analizi verileri henüz aktarılmamış.',
    );
    return;
  }
  const value = (number) => (number == null || number === '' ? '—' : esc(numeric(number)));
  const rate = (number) =>
    `<span class="increase-rate ${number == null || Number(number) === 0 ? '' : Number(number) < 0 ? 'decrease' : 'rise'}">${esc(increasePercent(number))}</span>`;
  const date = (text) => {
    const m = text?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : esc(text || '—');
  };
  target.innerHTML = /* HTML */ `<div
    class="increase-table-wrap"
    tabindex="0"
    role="region"
    aria-label="Excel zam analizi tablosu, yatay kaydırılabilir"
  >
    <table class="increase-table" style="width:${1495 + years.length * 250}px">
      <colgroup>
        <col class="increase-institution-col" />
        <col class="increase-description-col" />
        ${years.map(() => '<col class="increase-year-col" />').join('')}${years
          .map(() => '<col class="increase-year-col" />')
          .join('')}
        <col class="increase-total-col" />
        <col class="increase-count-col" />
        <col class="increase-unit-col" />
        <col class="increase-type-col" />
        <col class="increase-date-col" />
        <col class="increase-note-col" />
      </colgroup>
      <thead>
        <tr>
          <th scope="col" class="increase-institution">Kurum</th>
          <th scope="col" class="increase-description">Açıklama</th>
          ${years
            .map((year) => `<th scope="col" class="increase-value">${esc(year)}</th>`)
            .join('')}${years
            .map(
              (year) =>
                `<th scope="col" class="increase-value increase-rate-head">${esc(year)} Zam</th>`,
            )
            .join('')}
          <th scope="col" class="increase-value increase-total">Toplam Artış</th>
          <th scope="col" class="increase-value">Fatura Adeti</th>
          <th scope="col" class="increase-value">Ürün Adet Fiyatı</th>
          <th scope="col">Hizmet Türü</th>
          <th scope="col">Tek Adet Tarihi</th>
          <th scope="col">NOT</th>
        </tr>
      </thead>
      <tbody>
        ${selected
          .map(
            (row) =>
              `<tr data-increase-id="${esc(row.id)}"><td class="increase-institution">${esc(row.institution || '—')}</td><th scope="row" class="increase-description"><a class="service-link" href="#service/${encodeURIComponent(row.id)}">${esc(row.description)}</a></th>${years.map((year) => `<td class="increase-value">${value(row.amounts[year])}</td>`).join('')}${years.map((year) => `<td class="increase-value">${rate(row.rates[year])}</td>`).join('')}<td class="increase-value increase-total">${rate(row.total_increase)}</td><td class="increase-value">${value(row.invoice_count)}</td><td class="increase-value">${value(row.unit_price)}</td><td><span class="service-type ${row.service_type === 'Bitti' ? 'ended' : ''}">${esc(serviceTypeLabel(row.service_type) || '—')}</span></td><td class="increase-date">${date(row.single_date)}</td><td class="increase-note">${esc(row.note || '—')}</td></tr>`,
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
}

function renderInvoiceRecords() {
  const f = state.list;
  app.innerHTML = /* HTML */ `<div class="page">
    ${heading(
      'BELGE ARŞİVİNİZ',
      'Faturalar',
      'Tüm belgeleriniz, inceleme durumları ve onaylanan kayıtlarınız bir arada.',
      button('Zam analizine dön', 'chart', 'view-analysis', 'btn-light') +
        button('Yeni fatura'),
    )}
    <div class="list-stats">
      <span><strong>${state.documents.length}</strong> toplam belge</span
      ><span
        ><strong>${state.documents.filter((d) => d.status === 'approved').length}</strong> onaylı
        kayıt</span
      ><span
        ><strong>${state.documents.filter((d) => d.status !== 'approved').length}</strong> inceleme
        bekliyor</span
      >
    </div>
    <section class="card">
      <div class="filter-bar">
        <label class="search-field"
          >${icon('search')}<input
            id="invoice-search"
            aria-label="Faturalarda ara"
            placeholder="Satıcı, fatura no veya dosya adı ara…"
            value="${esc(f.query)}"
        /></label>
        <label class="search-field"
          >${icon('search')}<input
            id="invoice-number-search"
            aria-label="Fatura numarasıyla ara"
            placeholder="Yalnızca fatura numarası…"
            value="${esc(f.number)}"
        /></label>
        <div class="filter-tabs" role="group" aria-label="Durum filtresi">
          ${[
            ['all', 'Tümü'],
            ['approved', 'Onaylı'],
            ['pending', 'Bekleyen'],
          ]
            .map(
              ([v, l]) =>
                /* HTML */ `<button
                  data-action="filter-status"
                  data-value="${v}"
                  class="${f.status === v ? 'active' : ''}"
                >
                  ${l}
                </button>`,
            )
            .join('')}
        </div>
        <select class="filter-select" id="filter-currency" aria-label="Para birimi filtresi">
          <option value="all">Tüm para birimleri</option>
          ${currencies()
            .map((c) => /* HTML */ `<option${f.currency === c ? ' selected' : ''}>${c}</option>`)
            .join('')}</select
        ><input
          class="date-input"
          id="filter-from"
          type="date"
          value="${f.from}"
          aria-label="Başlangıç tarihi"
        /><input
          class="date-input"
          id="filter-to"
          type="date"
          value="${f.to}"
          aria-label="Bitiş tarihi"
        /><span class="result-count" id="result-count"></span>
        <button class="btn btn-text reset-filters" data-action="reset-filters">
          Filtreleri temizle
        </button>
      </div>
      <div id="invoice-results"></div>
      <div class="table-footer">
        <span>Kayıtları açmak için bir faturaya tıklayın.</span>
      </div>
    </section>
    <p style="font-size:10px;color:#98a6ba;margin:17px 2px">
      ${icon('info').replace(
        '<svg',
        '<svg style="display:inline-block;width:12px;height:12px;vertical-align:middle;margin-right:5px"',
      )}
      Tutarlar belgenin kendi para birimindedir. Farklı para birimleri birleştirilmez.
    </p>
    ${footer()}
  </div>`;
  updateInvoiceResults();
}

function updateInvoiceResults() {
  if (!$('#invoice-results')) return;
  const docs = filteredDocuments();
  $('#invoice-results').innerHTML = docs.length
    ? invoiceTable(docs)
    : empty(
        state.documents.length ? 'Eşleşen fatura bulunamadı' : 'Henüz fatura bulunmuyor',
        state.documents.length
          ? 'Arama metnini veya filtrelerinizi değiştirebilirsiniz.'
          : 'İlk faturayı yükleyin, kontrol edip kayıtlarınızı oluşturmaya başlayın.',
        !state.documents.length,
      );
  $('#result-count').textContent = `${docs.length} sonuç`;
}
// Dönemsel analizler ve grafiklerin çizilmesi.
function periodDocuments() {
  const today = new Date(),
    start = new Date(today.getFullYear(), state.period === 'month' ? today.getMonth() : 0, 1);
  const iso = new Intl.DateTimeFormat('sv-SE').format(start);
  return state.documents.filter(
    (d) =>
      state.period === 'all' ||
      (d.invoice_date &&
        d.invoice_date >= iso &&
        d.invoice_date <= new Intl.DateTimeFormat('sv-SE').format(today)),
  );
}

function renderAnalytics() {
  const currency = state.analyticsCurrency;
  const docs = periodDocuments();
  const s = stats(currency, docs, state.period);
  const other = docs.filter((d) => d.status === 'approved' && d.currency !== currency).length;
  app.innerHTML = /* HTML */ `<div class="page">
    ${heading(
      'KAYITLARDAN İÇGÖRÜLERE',
      'Finansal görünüm',
      'Onayladığınız faturalar üzerinden tutarları, satıcıları ve KDV dağılımını izleyin.',
      /* HTML */ `<select id="analysis-period" class="currency-select" aria-label="Analiz dönemi">
        ${[
          ['month', 'Bu ay'],
          ['year', 'Bu yıl'],
          ['all', 'Tüm zamanlar'],
        ]
          .map(
            ([v, l]) =>
              /* HTML */ `<option value="${v}" ${state.period === v ? 'selected' : ''}>
                ${l}
              </option>`,
          )
          .join('')}
      </select>`,
    )}
    <div class="analytics-top">
      <span class="currency-notice"
        >${icon('info')} Yalnızca onaylı kayıtlar ·
        ${other
          ? `${other} farklı para birimli kayıt bu toplama dahil değil.`
          : 'Seçili para birimine göre hesaplanır.'}</span
      ><select id="analysis-currency" class="currency-select" aria-label="Analiz para birimi">
        ${currencies()
          .map((c) => /* HTML */ `<option ${currency === c ? 'selected' : ''}>${c}</option>`)
          .join('')}
      </select>
    </div>
    ${statsCards(s, currency)}
    <div class="chart-grid">
      <section class="card chart-card">
        <div class="card-head">
          <div>
            <h2>Aylık fatura görünümü</h2>
            <p>Son 6 ay · ${currency} · onaylanan tutarlar</p>
          </div>
          <div class="chart-legend">
            <span><i></i>Net tutar</span><span><i class="cyan"></i>KDV</span>
          </div>
        </div>
        <div class="chart-wrap" id="monthly-chart">
          ${monthlyChart(s, currency)}
          <div class="chart-tooltip"></div>
        </div>
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Tutar dağılımı</h2>
            <p>KDV hariç tutar ve vergi payı</p>
          </div>
        </div>
        ${donut(s, currency)}
      </section>
    </div>
    <div class="analysis-second">
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Öne çıkan satıcılar</h2>
            <p>Onaylı fatura tutarına göre</p>
          </div>
          ${icon('building')}
        </div>
        ${supplierList(s, currency)}
      </section>
      <section class="card">
        <div class="card-head">
          <div>
            <h2>Dönemin özeti</h2>
            <p>Seçili dönem ve para birimi</p>
          </div>
          ${icon('chart')}
        </div>
        <div class="info-line"><span>Onaylı fatura</span><strong>${s.count} belge</strong></div>
        <div class="info-line">
          <span>Farklı satıcı</span><strong>${s.suppliers} satıcı</strong>
        </div>
        <div class="info-line">
          <span>Ortalama fatura tutarı</span><strong>${money(s.average, currency)}</strong>
        </div>
        <div class="info-line">
          <span>KDV hariç toplam</span><strong>${money(s.net, currency)}</strong>
        </div>
        <div class="info-line">
          <span>KDV dahil toplam</span><strong>${money(s.gross, currency)}</strong>
        </div>
      </section>
    </div>
    ${footer()}
  </div>`;
  const chart = $('#monthly-chart');
  chart.addEventListener('pointermove', (e) => {
    const col = e.target.closest('[data-chart-value]');
    const tip = $('.chart-tooltip', chart);
    if (!col) {
      tip.classList.remove('visible');
      return;
    }
    tip.textContent = col.dataset.chartValue;
    tip.style.left = `${Math.min(e.clientX - chart.getBoundingClientRect().left + 10, chart.clientWidth - 180)}px`;
    tip.style.top = `${e.clientY - chart.getBoundingClientRect().top - 40}px`;
    tip.classList.add('visible');
  });
  chart.addEventListener('pointerleave', () =>
    $('.chart-tooltip', chart).classList.remove('visible'),
  );
}

function monthlyChart(summary, currency) {
  const docs = summary.approved;
  const months = summary.months.map((m) => ({
    ...m,
    label: new Date(`${m.key}-01T12:00:00`).toLocaleDateString('tr-TR', {
      month: 'short',
    }),
    net: Number(m.net),
    vat: Number(m.vat),
  }));
  const max = Math.max(1, ...months.map((m) => m.net + m.vat));
  const upper = max * 1.15;
  const labels = Array.from({ length: 5 }, (_, i) => {
    const y = 20 + i * 48;
    const n = upper * (1 - i / 4);
    return /* HTML */ `<line
        x1="50"
        y1="${y}"
        x2="635"
        y2="${y}"
        stroke="#ecf0f6"
        stroke-dasharray="3 5"
      /><text x="40" y="${y + 3}" text-anchor="end" font-size="9" fill="#9eacc0" stroke="none"
        >${n >= 1000
          ? `${(n / 1000).toLocaleString('tr-TR', { maximumFractionDigits: 0 })}b`
          : Math.round(n)}</text
      >`;
  }).join('');
  return /* HTML */ `<svg viewBox="0 0 650 245" role="img" aria-label="Aylık net ve KDV tutarları">
      ${labels}${months
        .map((m, i) => {
          const x = 82 + i * 96;
          const h = (m.net / upper) * 192;
          const v = (m.vat / upper) * 192;
          return /* HTML */ `<g data-chart-value="${esc(`${m.label}: ${money(m.gross, currency)}`)}"
            ><rect
              x="${x - 15}"
              y="${212 - h}"
              width="30"
              height="${h}"
              rx="3"
              fill="#21468b"
              stroke="none"
            /><rect
              x="${x - 15}"
              y="${212 - h - v}"
              width="30"
              height="${v}"
              rx="3"
              fill="#08a2bc"
              stroke="none"
            /><rect
              x="${x - 35}"
              y="15"
              width="70"
              height="200"
              fill="transparent"
              stroke="none"
            /><text
              x="${x}"
              y="237"
              text-anchor="middle"
              font-size="10"
              fill="#9ba9bc"
              stroke="none"
              >${m.label}</text
            ><title>${esc(m.label)}: ${esc(money(m.gross, currency))}</title></g
          >`;
        })
        .join('')}</svg
    >${docs.length
      ? ''
      : '<span class="chart-empty">İlk onaylı faturanızla grafik oluşacak.</span>'}`;
}

function donut(s, currency) {
  const total = Number(s.net) + Number(s.vat);
  const percentage = Number(s.vat_share);
  const circumference = 2 * Math.PI * 58;
  const segment = total > 0 ? (s.vat / total) * circumference : 0;
  return /* HTML */ `<div class="donut-wrap">
    <svg
      viewBox="0 0 150 150"
      role="img"
      aria-label="Net tutar ${esc(money(s.net, currency))}, KDV ${esc(money(s.vat, currency))}"
    >
      <circle
        cx="75"
        cy="75"
        r="58"
        fill="none"
        stroke="${total ? '#21468b' : '#edf2f8'}"
        stroke-width="14"
      />
      <circle
        cx="75"
        cy="75"
        r="58"
        fill="none"
        stroke="#08a2bc"
        stroke-width="14"
        stroke-dasharray="${segment} ${circumference}"
        transform="rotate(-90 75 75)"
      />
      <text
        x="75"
        y="73"
        text-anchor="middle"
        fill="#294b79"
        stroke="none"
        font-size="22"
        font-weight="600"
      >
        %${percentage.toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
      </text>
      <text x="75" y="91" text-anchor="middle" fill="#9cacc0" stroke="none" font-size="9">
        KDV payı
      </text>
    </svg>
    <div class="donut-legend">
      <div style="display:block">
        <span><i style="display:inline-block"></i> KDV hariç tutar</span
        ><strong>${money(s.net, currency)}</strong>
      </div>
      <div style="display:block">
        <span><i style="display:inline-block;background:#08a2bc"></i> KDV toplamı</span
        ><strong>${money(s.vat, currency)}</strong>
      </div>
    </div>
  </div>`;
}

function supplierList(summary, currency) {
  const sorted = summary.vendors;
  const max = Number(sorted[0]?.total) || 1;
  return sorted.length
    ? sorted
        .map(
          (v, i) =>
            /* HTML */ `<div class="supplier-row">
              <span>${String(i + 1).padStart(2, '0')}</span>
              <div class="supplier-info">
                <strong>${esc(v.name)}</strong><small>${v.count} onaylı fatura</small>
                <div class="supplier-progress">
                  <i style="width:${Math.max(2, (Number(v.total) / max) * 100)}%"></i>
                </div>
              </div>
              <b>${money(v.total, currency)}</b>
            </div>`,
        )
        .join('')
    : empty(
        'Satıcı dağılımı henüz oluşmadı',
        'Onayladığınız faturaların satıcıları burada listelenecek.',
        false,
        'building',
      );
}
// Tek olay katmanı yeniden çizilen formlarda da çalışır.
app.addEventListener('input', (e) => {
  if (e.target.id === 'invoice-number-search') {
    state.list.number = e.target.value;
    updateInvoiceNumberResults();
    updateInvoiceResults();
  }
  if (e.target.id === 'increase-query') {
    state.increaseFilter.query = e.target.value;
    updateIncreaseResults();
  }
  const path = e.target.dataset.path;
  if (path && state.form) {
    const keys = path.split('.');
    let obj = state.form;
    keys.slice(0, -1).forEach((k) => (obj = obj[k]));
    obj[keys.at(-1)] =
      (e.target.dataset.decimal ? decimalInput(e.target.value) : e.target.value) || null;
    state.dirty = true;
    state.reviewed = false;
    const check = $('#reviewed');
    if (check) check.checked = false;
    e.target.classList.toggle(
      'missing',
      !e.target.value && e.target.getAttribute('aria-required') === 'true',
    );
    const ratesOutput = $('#vat-rates-summary');
    if (ratesOutput) ratesOutput.textContent = vatRatesSummary(state.form);
    const hint = $('#save-hint');
    if (hint) hint.textContent = 'Kaydedilmemiş değişiklikler var.';
  }
  if (e.target.id === 'invoice-search') {
    state.list.query = e.target.value;
    updateInvoiceResults();
  }
});
app.addEventListener('focusout', (e) => {
  if (!e.target.dataset.decimal || !state.form) return;
  const value = e.target.dataset.path.split('.').reduce((obj, key) => obj?.[key], state.form);
  e.target.value = numeric(value);
});
app.addEventListener('change', (e) => {
  if (e.target.id === 'increase-type') {
    state.increaseFilter.type = e.target.value;
    updateIncreaseResults();
  }
  if (e.target.id === 'reviewed') state.reviewed = e.target.checked;
  if (e.target.id === 'filter-currency') {
    state.list.currency = e.target.value;
    updateInvoiceResults();
  }
  if (e.target.id === 'filter-from') {
    state.list.from = e.target.value;
    updateInvoiceResults();
  }
  if (e.target.id === 'filter-to') {
    state.list.to = e.target.value;
    updateInvoiceResults();
  }
  if (e.target.id === 'analysis-currency') {
    state.analyticsCurrency = e.target.value;
    renderAnalytics();
  }
  if (e.target.id === 'analysis-period') {
    state.period = e.target.value;
    renderAnalytics();
  }
});
app.addEventListener('keydown', (e) => {
  const row = e.target.closest('[data-open]');
  if (row && !e.target.closest('button, a') && (e.key === 'Enter' || e.key === ' ')) {
    e.preventDefault();
    location.hash = `document/${row.dataset.open}`;
  }
});
document.addEventListener('click', async (e) => {
  const row = e.target.closest('[data-open]');
  if (row && !e.target.closest('[data-action]')) {
    location.hash = `document/${row.dataset.open}`;
    return;
  }
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  if (action === 'split-invoice-pages') {
    if (state.dirty && !(await canLeave())) return;
    const confirmed = await dialog(
      'PDF içindeki faturaları ayır',
      'Her sayfa ayrı bir faturaysa devam edin. Bu birleşik kayıt listeden ve analizlerden kaldırılır; sayfalar ayrı kayıtlar olarak sırayla okunur. Her faturayı ayrıca kontrol edip onaylayacaksınız.',
      'Sayfaları ayrı oku',
    );
    if (!confirmed) return;
    target.disabled = true;
    try {
      const result = await api(`/api/documents/${state.current.id}/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: state.current.revision }),
      });
      state.dirty = false;
      location.hash = `document/${result.id}`;
      toast(`${result.documents.length} fatura sırayla okunacak.`);
    } catch (error) {
      toast(error.message);
      target.disabled = false;
    }
    return;
  }
  if (action === 'correct-duplicate') {
    state.showDuplicateForm = true;
    renderReview();
    app.querySelector('[data-path="invoice_number"]')?.focus();
  }
  if (action === 'clear-number-search') {
    state.list.number = '';
    $('#invoice-number-search').value = '';
    updateInvoiceNumberResults();
    updateInvoiceResults();
  }
  if (action === 'new-service') showNewService();
  if (action === 'view-records' || action === 'view-analysis') {
    state.invoiceView = action === 'view-records' ? 'records' : 'analysis';
    renderInvoices();
    return;
  }
  if (action === 'reset-increase') {
    state.increaseFilter = { query: '', type: 'all' };
    renderIncreaseAnalysis();
    return;
  }
  if (action === 'delete-invoice') {
    const invoice = state.documents.find((doc) => doc.id === target.dataset.id);
    if (!invoice) return;
    const confirmed = await dialog(
      'Faturayı sil',
      `${invoice.invoice_number || invoice.filename}${invoice.seller ? ' · ' + invoice.seller : ''} kaydı listeden ve analizlerden kaldırılacak. Devam etmek istiyor musunuz?`,
      'Sil',
    );
    if (!confirmed) return;
    target.disabled = true;
    try {
      await api(`/api/documents/${invoice.id}/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: invoice.revision }),
      });
      await loadDocuments();
      renderInvoices();
      toast('Fatura listeden ve analizlerden kaldırıldı.');
    } catch (error) {
      target.disabled = false;
      toast(error.message);
    }
    return;
  }
  if (action === 'new') {
    if (!(await canLeave())) return;
    state.dirty = false;
    state.current = null;
    state.form = null;
    if (location.hash === '#upload') renderUpload();
    else location.hash = 'upload';
  }
  if (action === 'choose') $('#file-input').click();
  if (action === 'reload') navigate();
  if (action === 'save-draft') save(false);
  if (action === 'approve') save(true);
  if (action === 'add-item') {
    state.form.items.push({
      name: null,
      description: null,
      quantity: null,
      unit: null,
      unit_price: null,
      vat_rate: null,
      line_total: null,
      discount: null,
      price_basis: 'unknown',
      total_basis: 'unknown',
    });
    state.dirty = true;
    state.reviewed = false;
    const y = window.scrollY;
    renderReview();
    window.scrollTo(0, y);
  }
  if (action === 'remove-item') {
    if (
      !(await dialog(
        'Kalemi kaldır',
        'Bu ürün/hizmet satırı düzenlenen kayıttan kaldırılacak. İlk okunan değerler korunur.',
        'Kaldır',
      ))
    )
      return;
    state.form.items.splice(Number(target.dataset.index), 1);
    state.dirty = true;
    state.reviewed = false;
    const y = window.scrollY;
    renderReview();
    window.scrollTo(0, y);
  }
  if (action === 'zoom') {
    state.zoom = state.zoom >= 160 ? 100 : state.zoom + 30;
    const y = window.scrollY;
    renderReview();
    window.scrollTo(0, y);
  }
  if (action === 'prev-page' || action === 'next-page') {
    state.page += action === 'next-page' ? 1 : -1;
    const y = window.scrollY;
    renderReview();
    window.scrollTo(0, y);
  }
  if (action === 'preview-retry') renderReview();
  if (action === 'retry') {
    if (
      !(await dialog(
        'Belgeyi yeniden analiz et',
        'Formdaki düzeltmeler yeni okuma sonuçlarıyla değiştirilecek. İlk okuma korunur. Devam etmek istiyor musunuz?',
        'Yeniden analiz et',
      ))
    )
      return;
    try {
      await api(`/api/documents/${state.current.id}/retry`, { method: 'POST' });
      state.dirty = false;
      navigate();
    } catch (err) {
      toast(err.message);
    }
  }
  if (action === 'filter-status') {
    state.list.status = target.dataset.value;
    document
      .querySelectorAll('[data-action="filter-status"]')
      .forEach((b) => b.classList.toggle('active', b.dataset.value === state.list.status));
    updateInvoiceResults();
  }
  if (action === 'reset-filters') {
    state.list = {
      query: '',
      number: '',
      status: 'all',
      currency: 'all',
      from: '',
      to: '',
    };
    renderInvoices();
  }
});
// İlk açılış ve tarayıcı yaşam döngüsü olayları.
$('#file-input').addEventListener('change', (e) => {
  if (e.target.files[0]) upload(e.target.files[0]);
});
window.addEventListener('hashchange', navigate);
window.addEventListener('beforeunload', (e) => {
  if (state.dirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
document.querySelectorAll('[data-icon]').forEach((el) => (el.innerHTML = icon(el.dataset.icon)));
navigate();

// Başka sayfadayken tamamlanan okumalar listede de güncellenir; forma müdahale edilmez.
setInterval(async () => {
  if (
    !state.documents.some((d) => d.status === 'processing') ||
    state.route.startsWith('document/')
  )
    return;
  try {
    await loadDocuments();
    if (state.route === 'invoices' && state.invoiceView === 'analysis') {
      state.increaseData = await api('/api/increase-analysis');
      updateIncreaseResults();
      updateInvoiceNumberResults();
    }
    if (state.route === 'overview') renderOverview();
    else if (state.route === 'invoices' && state.invoiceView === 'records') {
      updateInvoiceResults();
      const stats = $('.list-stats');
      if (stats)
        stats.innerHTML = /* HTML */ `<span
            ><strong>${state.documents.length}</strong> toplam belge</span
          ><span
            ><strong>${state.documents.filter((d) => d.status === 'approved').length}</strong>
            onaylı kayıt</span
          ><span
            ><strong>${state.documents.filter((d) => d.status !== 'approved').length}</strong>
            inceleme bekliyor</span
          >`;
    }
  } catch (error) {
    console.warn('Liste güncellenemedi:', error.message);
  }
}, 2500);

// Belirsiz eşleşmeler kullanıcı tarafından düzeltilir; tutardan hizmet tahmin edilmez.
function renderServiceField() {
  const d = state.current;
  const options = (d.services || []).filter(
    (row) => (row.currency || 'TRY') === state.form.currency,
  );
  const matched = !!state.form.service_id;
  return /* HTML */ `<section class="card form-card">
    <div class="form-section-title"><h2>${icon('chart')} Hizmet eşleştirmesi</h2></div>
    ${field('Bağlı hizmet', 'service_id', {
      full: true,
      select: [
        ['', 'Hizmet seçin'],
        ...options.map((row) => [row.id, `${row.institution} · ${row.description}`]),
      ],
    })}
    <p class="service-hint">
      ${matched
        ? 'Açıklamadan eşleşen hizmeti kontrol edin.'
        : 'Açıklama tek bir hizmetle eşleşmedi. Listeden seçin veya yeni hizmet oluşturun.'}
      Yüklenen fatura ödenmiş kabul edilir.
    </p>
    <button type="button" class="btn btn-light" data-action="new-service">
      Yeni hizmet oluştur
    </button>
  </section>`;
}

function showNewService() {
  const dialog = document.createElement('dialog');
  dialog.className = 'service-dialog';
  dialog.innerHTML = /* HTML */ `<form method="dialog">
    <h2>Yeni hizmet</h2>
    <label class="field"
      ><span>Kurum</span
      ><input
        name="institution"
        maxlength="300"
        required
        value="${esc(state.form.seller.name || '')}"
    /></label>
    <label class="field"
      ><span>Hizmet adı / açıklaması</span
      ><input
        name="description"
        maxlength="300"
        required
        value="${esc(
          state.form.items.find((item) => item.description)?.description ||
            state.form.items[0]?.name ||
            '',
        )}"
    /></label>
    ${serviceTypeField()}
    <p>
      Para birimi: ${esc(state.form.currency || 'TRY')}. Sonraki faturalar aynı açıklamadan
      eşleştirilir.
    </p>
    <p class="service-dialog-error" role="alert"></p>
    <div class="approval-actions">
      <button type="button" class="btn btn-light" data-cancel>Vazgeç</button
      ><button class="btn btn-primary" type="submit">Oluştur</button>
    </div>
  </form>`;
  document.body.append(dialog);
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const submit = dialog.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const values = Object.fromEntries(new FormData(event.target));
      const row = await api('/api/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          currency: state.form.currency || 'TRY',
        }),
      });
      state.current.services = await api('/api/services');
      state.form.service_id = row.id;
      state.dirty = true;
      dialog.close();
      renderReview();
    } catch (error) {
      dialog.querySelector('[role="alert"]').textContent = error.message;
      submit.disabled = false;
    }
  };
  dialog.showModal();
}

function servicePeriod(period) {
  return period
    ? new Intl.DateTimeFormat('tr-TR', {
        month: 'long',
        year: 'numeric',
      }).format(new Date(`${period}-01T12:00:00`))
    : 'Belirtilmedi';
}

// Koordinatlar görselleştirme içindir; mali değerler sunucuda Decimal ile hesaplanır.
function servicePriceChart(service) {
  const series = service.series || [];
  if (!series.length)
    return '<p class="service-hint">Grafik için onaylanmış hizmet bedeli bekleniyor.</p>';
  const maximum = Math.max(...series.map((p) => Number(p.amount)), 1);
  const points = series.map((p, index) => ({
    ...p,
    x: series.length === 1 ? 400 : 100 + (index * 600) / (series.length - 1),
    y: 190 - (Number(p.amount) / maximum) * 140,
  }));
  return /* HTML */ `<svg
      class="service-chart"
      viewBox="0 0 800 260"
      role="img"
      aria-label="Yıllara göre son hizmet bedeli grafiği"
    >
      <line x1="70" y1="210" x2="740" y2="210" stroke="#dce5ef" />
      <polyline
        points="${points.map((p) => `${p.x},${p.y}`).join(' ')}"
        fill="none"
        stroke="#12a4ba"
        stroke-width="4"
      />
      ${points
        .map(
          (p) =>
            `<g><circle cx="${p.x}" cy="${p.y}" r="6" fill="#214b90"/><text x="${p.x}" y="${p.y - 18}" text-anchor="middle">${esc(money(p.amount, service.currency))}</text><text x="${p.x}" y="239" text-anchor="middle">${p.year}</text></g>`,
        )
        .join('')}
    </svg>
    <div class="service-year-values">
      ${series
        .map(
          (p) => `<span>${p.year}<strong>${esc(money(p.amount, service.currency))}</strong></span>`,
        )
        .join('')}
    </div>`;
}

function renderServiceAnalysis(service) {
  const history = service.history || [];
  const last = service.series.at(-1);
  app.innerHTML = /* HTML */ `<div class="page service-page">
    ${heading(
      esc(service.institution),
      esc(service.description),
      'Hizmetin ödeme sayısı, dönem bilgileri ve fiyat geçmişi.',
      `<div class="approval-actions"><button type="button" class="btn btn-primary" id="edit-service">${icon('save')} Hizmeti düzenle</button><a href="#invoices" class="btn btn-light">${icon('left')} Hizmetlere dön</a></div>`,
    )}
    <div class="service-metrics">
      <section class="card">
        <small>Ödenmiş fatura</small><strong>${service.invoice_count}</strong>
        <p>Excel: ${service.reference_invoice_count || 0} · Yeni: ${service.new_invoice_count}</p>
      </section>
      <section class="card">
        <small>Son yıllık hizmet bedeli</small
        ><strong>${last ? esc(money(last.amount, service.currency)) : '—'}</strong>
        <p>${last ? last.year : 'Onaylanmış bedel bekleniyor'}</p>
      </section>
      <section class="card">
        <small>Hizmet başlangıcı</small>
        <strong>${service.start_date ? esc(shortDate(service.start_date)) : servicePeriod(service.start_period)}</strong>
        <p>
          ${service.start_date
            ? 'Kaynak: Elle girilen başlangıç tarihi'
            : service.start_period ? 'Kaynak: Excel hizmet notu' : 'Başlangıç tarihi belirtilmedi'}
        </p>
      </section>
      <section class="card">
        <small>Hizmet türü</small><strong>${esc(serviceTypeLabel(service.service_type) || 'Belirtilmedi')}</strong>
        <p>
          ${service.lifecycle === 'ended'
            ? `Bitiş: ${service.end_date ? esc(shortDate(service.end_date)) : servicePeriod(service.end_period)}`
            : 'Hizmeti düzenle seçeneğinden değiştirebilirsiniz.'}
        </p>
      </section>
    </div>
    ${renderAnnualPayments(service)}
    <section class="card form-card">
      <h2>Fiyat artış grafiği</h2>
      <p class="service-hint">
        Her yılın son hizmet bedeli · İlk ve son bedel değişimi:
        ${increasePercent(service.price_change)}
      </p>
      ${servicePriceChart(service)}
    </section>
    <section class="card form-card">
      <h2>Hizmet bilgileri</h2>
      <p>${esc(service.note || 'Ek hizmet notu bulunmuyor.')}</p>
      <p class="service-hint">
        Yüklenen faturalar ödenmiş kabul edilir; ödeme tarihi ayrıca bilinmiyor.
        ${service.pending_count} fatura tutarı kontrol bekliyor. Tutarlar onaylanınca fiyat
        analizine yansır.
      </p>
      ${service.lifecycle === 'ended' &&
      history.some(
        (h) =>
          h.invoice_date && (service.end_date
            ? h.invoice_date > service.end_date
            : service.end_period && h.invoice_date.slice(0, 7) > service.end_period),
      )
        ? '<p class="field-warning">Kaynak bitiş döneminden sonra fatura var. Hizmetin devam durumunu teyit edin.</p>'
        : ''}
    </section>
    <section class="card form-card">
      <h2>Fatura geçmişi</h2>
      <p class="service-hint">
        Excel başlangıcında ${service.reference_invoice_count || 0} fatura bulunuyor. Geçmiş
        faturaların tek tek tarih ve ödeme ayrıntıları yeni Excel ile tamamlanacak.
      </p>
      ${history.length
        ? renderServiceInvoices(history)
        : '<p>Bu hizmete bağlı yeni fatura henüz yok.</p>'}
    </section>
    ${footer()}
  </div>`;
  $('#edit-service').onclick = () => showServiceEditor(service);
}

// Yıllık toplam harcama, grafikteki yılın son hizmet bedelinden ayrı tutulur.
function annualPaymentsChart(service) {
  const rows = [...(service.annual_payments || [])].sort((a, b) => a.year - b.year);
  if (!rows.length) return '';
  // Number yalnızca sütun boyunu belirler; gösterilen tutar sunucudaki toplamdır.
  const values = rows.map((row) => Number(row.total));
  const maximum = Math.max(0, ...values);
  const minimum = Math.min(0, ...values);
  const range = maximum - minimum || 1;
  const baseline = (-minimum / range) * 180;
  return /* HTML */ `<figure class="annual-payments-chart">
    <figcaption>Yıllara göre toplam ödeme · ${esc(service.currency)}</figcaption>
    <div class="annual-payments-scroll" tabindex="0" aria-label="Yıllık ödeme grafiği; tüm yılları görmek için yatay kaydırabilirsiniz">
      <ul class="annual-payments-columns">
        ${rows.map((row, index) => {
          const value = values[index];
          const height = Math.abs(value) / range * 180;
          const position = value < 0 ? `top:${180 - baseline}px` : `bottom:${baseline}px`;
          const label = `${row.year}: ${money(row.total, service.currency)}, ${row.invoice_count} fatura${row.pending_count ? `; ${row.pending_count} faturanın tutarı kontrol bekliyor` : ''}`;
          return /* HTML */ `<li class="annual-payments-column" title="${esc(label)}">
            <strong>${esc(money(row.total, service.currency))}${row.pending_count ? ' *' : ''}</strong>
            <div class="annual-payments-plot" aria-hidden="true">
              <span class="annual-payments-baseline" style="bottom:${baseline}px"></span>
              <span class="annual-payments-bar ${row.pending_count ? 'pending' : ''}"
                style="height:${height}px;${position}"></span>
            </div>
            <b>${row.year}</b>
            <small>${row.invoice_count} fatura</small>
            ${row.pending_count ? `<small class="field-warning">${row.pending_count} tutar bekliyor</small>` : ''}
          </li>`;
        }).join('')}
      </ul>
    </div>
    ${rows.some((row) => row.pending_count)
      ? '<p class="service-hint">* Kontrol bekleyen fatura tutarları henüz toplama dahil değil.</p>'
      : ''}
  </figure>`;
}

function renderAnnualPayments(service) {
  const rows = service.annual_payments || [];
  return /* HTML */ `<section class="card form-card">
    <h2>Yıllık ödemeler</h2>
    <p class="service-hint">
      Fatura tarihine göre yıllık harcama ve ödenmiş fatura sayısı.
      Eski yılları “Hizmeti düzenle” bölümünden girebilirsiniz.
      Yeni faturaların tutarları onaylandığında otomatik eklenir.
    </p>
    ${annualPaymentsChart(service)}
    ${rows.length ? /* HTML */ `<div class="table-wrap">
      <table class="invoice-table service-history">
        <thead><tr><th>Yıl</th><th>Fatura sayısı</th><th>Ödenen toplam</th><th>Elle girilen</th><th>Otomatik eklenen</th></tr></thead>
        <tbody>${rows.map((row) => /* HTML */ `<tr>
          <td>${row.year}</td>
          <td>${row.invoice_count}</td>
          <td>${esc(money(row.total, service.currency))}
            ${row.pending_count ? `<small class="field-warning">${row.pending_count} faturanın tutarı kontrol bekliyor; toplam eksik.</small>` : ''}
          </td>
          <td>${row.manual_count} fatura · ${esc(money(row.manual_total, service.currency))}
            ${row.through_date ? `<small>${esc(shortDate(row.through_date))} dahil</small>` : ''}
          </td>
          <td>${row.automatic_count} fatura · ${esc(money(row.automatic_total, service.currency))}
            ${row.covered_count ? `<small>${row.covered_count} eski PDF elle girilen döneme dahil; tekrar sayılmadı.</small>` : ''}
          </td>
        </tr>`).join('')}</tbody>
      </table>
    </div>` : '<p>Henüz yıllık ödeme bilgisi yok. Excel’deki son hizmet bedeli yıllık toplam harcama olarak alınmaz.</p>'}
    ${service.undated_payment_count
      ? `<p class="field-warning">${service.undated_payment_count} faturanın tarihi eksik; yıllık dağılıma eklenemedi.</p>`
      : ''}
  </section>`;
}

// Ondalık bedeli tam sayı adediyle hassasiyet kaybı olmadan çarpar.
function annualPaymentTotal(amount, count) {
  if (!/^\d{1,18}(?:\.\d{1,6})?$/.test(amount) || !/^\d{1,7}$/.test(count)) return null;
  if (Number(count) > 1000000) return null;
  const [whole, fraction = ''] = amount.split('.');
  const product = (BigInt(whole + fraction) * BigInt(count)).toString();
  if (!fraction.length) return product;
  const digits = product.padStart(fraction.length + 1, '0');
  const decimals = digits.slice(-fraction.length).replace(/0+$/, '');
  return digits.slice(0, -fraction.length) + (decimals ? `.${decimals}` : '');
}

function appendAnnualPaymentRow(container, year, entry = {}, getAmount) {
  const row = document.createElement('div');
  row.className = 'annual-payment-row';
  row.innerHTML = /* HTML */ `
    <label class="field">
      <span>Yıl</span>
      <input
        data-annual="year" type="number" min="1000" max="2999" step="1"
        value="${esc(year)}" required
      />
    </label>
    <label class="field">
      <span>Fatura sayısı</span>
      <input
        data-annual="invoice_count" type="number" min="0" max="1000000" step="1"
        value="${esc(entry.invoice_count ?? '')}" required
      />
    </label>
    <label class="field">
      <span>Ödenen toplam</span>
      <input
        data-annual="total" inputmode="decimal" placeholder="140.000"
        value="${esc(numeric(entry.total))}" required
      />
    </label>
    <label class="field">
      <span>Kapsadığı son tarih (dahil)</span>
      <input
        data-annual="through_date" type="date"
        value="${esc(entry.through_date || '')}" required
      />
    </label>
    <p class="service-hint" data-payment-calculation aria-live="polite"></p>
    <button type="button" class="btn btn-light" data-remove-year>Yılı kaldır</button>`;
  const field = (key) => row.querySelector(`[data-annual="${key}"]`);
  const hint = row.querySelector('[data-payment-calculation]');
  row.recalculate = () => {
    const year = field('year').value;
    const amount = getAmount(year);
    const count = field('invoice_count').value;
    const total = annualPaymentTotal(amount, count);
    field('total').value = total === null ? '' : numeric(total);
    row.dataset.calculated = 'true';
    hint.textContent = total !== null
      ? `${year} hizmet bedeli ${numeric(amount)} × ${count} fatura. Yıl içinde bedel değiştiyse toplamı düzeltin.`
      : /^\d{4}$/.test(year) && !amount
        ? `${year} hizmet bedelini yukarıdaki başlangıç verilerine girin veya toplamı elle yazın.`
        : 'Hesaplamak için yıl ve fatura sayısını girin.';
    if (/^[12]\d{3}$/.test(year) && !field('through_date').value) {
      const today = new Date();
      field('through_date').value = Number(year) === today.getFullYear()
        ? `${year}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
        : `${year}-12-31`;
    }
  };
  field('year').oninput = () => {
    field('through_date').value = '';
    row.recalculate();
  };
  field('invoice_count').oninput = row.recalculate;
  field('total').oninput = () => {
    delete row.dataset.calculated;
    hint.textContent = 'Toplam elle düzenlendi.';
  };
  row.querySelector('[data-remove-year]').onclick = () => row.remove();
  container.append(row);
}

// Hizmete bağlı faturalar mevcut inceleme ve onay akışında düzenlenir.
function renderServiceInvoices(history) {
  return /* HTML */ `<div class="table-wrap">
    <table class="invoice-table service-history">
      <thead>
        <tr>
          <th>Fatura no</th><th>Fatura tarihi</th><th>Genel tutar</th>
          <th>Ödeme</th><th>Kontrol</th><th>İşlem</th>
        </tr>
      </thead>
      <tbody>
        ${history.map((invoice) => {
          const href = `#document/${encodeURIComponent(invoice.id)}`;
          return /* HTML */ `<tr>
            <td>
              <a class="service-link" href="${href}">${esc(invoice.invoice_number || 'Numara okunmadı')}</a>
              ${invoice.in_reference ? '<small> · Excel toplamına dahil</small>' : ''}
            </td>
            <td>${esc(invoice.invoice_date || '—')}</td>
            <td>${esc(money(invoice.gross, invoice.currency))}</td>
            <td>Ödendi</td>
            <td>${invoice.status === 'approved' ? 'Onaylandı' : 'Kontrol bekliyor'}</td>
            <td><a class="btn btn-light" href="${href}">Faturayı düzenle</a></td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  </div>`;
}

function showServiceEditor(service) {
  const record = service.editable;
  const dialog = document.createElement('dialog');
  dialog.className = 'service-dialog service-edit-dialog';
  const input = (label, name, value, attributes = '') => /* HTML */ `
    <label class="field">
      <span>${esc(label)}</span>
      <input name="${esc(name)}" value="${esc(value ?? '')}" ${attributes} />
    </label>`;
  dialog.innerHTML = /* HTML */ `<form>
    <h2>Hizmeti düzenle</h2>
    <div class="form-grid">
      ${input('Kurum', 'institution', record.institution, 'required maxlength="300"')}
      ${input('Hizmet adı / açıklaması', 'description', record.description, 'required maxlength="300"')}
      ${serviceTypeField(record.service_type)}
      ${input('Hizmet başlangıç tarihi', 'start_date', record.start_date, 'type="date"')}
      <div data-end-date>
        ${input('Hizmet bitiş tarihi', 'end_date', record.end_date, 'type="date"')}
        ${!Object.hasOwn(record, 'end_date') && service.end_period
          ? `<p class="service-hint">Nottaki bitiş: ${servicePeriod(service.end_period)}. Kesin günü biliyorsanız girin.</p>`
          : ''}
      </div>
      ${input('Tek seferlik hizmet tarihi', 'single_date', record.single_date, 'type="date"')}
    </div>
    ${!Object.hasOwn(record, 'start_date') && service.start_period
      ? `<p class="service-hint">Nottaki başlangıç: ${servicePeriod(service.start_period)}. Gün bilgisi yok; kesin tarihi biliyorsanız yukarıya girin.</p>`
      : ''}
    <label class="field">
      <span>Hizmet notu</span>
      <textarea name="note" rows="4" maxlength="10000">${esc(record.note || '')}</textarea>
    </label>
    <h3>Başlangıç verileri</h3>
    <p class="service-hint">
      Bu alanlar Excel başlangıcını düzeltir. Yeni yüklenen faturalar ayrıca eklenir.
      Bağlı faturanın tarihini veya tutarını değiştirmek için fatura geçmişindeki
      “Faturayı düzenle” seçeneğini kullanın. Para birimi: ${esc(service.currency)}.
    </p>
    <div class="form-grid">
      ${Object.entries(record.amounts).map(([year, value]) =>
        input(`${year} hizmet bedeli`, `amount-${year}`, value, 'type="number" min="0" step="0.000001"'),
      ).join('')}
      ${input('Başlangıç fatura sayısı', 'invoice_count', record.invoice_count || 0, 'type="number" min="0" max="1000000" step="1" required')}
      ${input('Birim fiyat', 'unit_price', record.unit_price, 'type="number" min="0" step="0.000001"')}
    </div>
    <h3>Geçmiş yıllık ödemeler</h3>
    <p class="service-hint">
      Yıl ve fatura sayısını girin; yılın hizmet bedeliyle çarpılarak toplam hesaplanır.
      Yıl içinde bedel değiştiyse toplamı elle düzeltin.
      Geçmiş yıllar için yıl sonu otomatik seçilir; kapsanan son tarihi değiştirebilirsiniz.
      O tarih ve öncesindeki faturalar bu toplama dahil kabul edilir; yalnızca sonraki
      faturalar otomatik eklenir. Böylece eski PDF'ler tekrar sayılmaz.
    </p>
    <div id="annual-payment-inputs"></div>
    <button type="button" class="btn btn-light" id="add-payment-year">${icon('plus')} Yıllık ödeme ekle</button>
    <p class="service-dialog-error" role="alert"></p>
    <div class="approval-actions">
      <button type="button" class="btn btn-light" data-cancel>Vazgeç</button>
      <button type="submit" class="btn btn-primary">Değişiklikleri kaydet</button>
    </div>
  </form>`;
  document.body.append(dialog);
  const annualInputs = dialog.querySelector('#annual-payment-inputs');
  const endDateField = dialog.querySelector('[data-end-date]');
  const updateEndDateVisibility = () => {
    const ended = dialog.querySelector('[name="service_type"]').value.trim() === 'Bitti';
    endDateField.hidden = !ended;
    endDateField.querySelector('input').disabled = !ended;
  };
  dialog.querySelector('[name="service_type"]').addEventListener('input', updateEndDateVisibility);
  updateEndDateVisibility();
  const getAmount = (year) => dialog.querySelector(`[name="amount-${year}"]`)?.value || '';
  Object.entries(record.yearly_payments || {}).sort().forEach(([year, entry]) => {
    appendAnnualPaymentRow(annualInputs, year, entry, getAmount);
  });
  dialog.querySelector('#add-payment-year').onclick = () => {
    appendAnnualPaymentRow(annualInputs, '', {}, getAmount);
    annualInputs.lastElementChild.querySelector('input').focus();
  };
  dialog.querySelectorAll('[name^="amount-"]').forEach((input) => {
    input.addEventListener('input', () => {
      annualInputs.querySelectorAll('.annual-payment-row').forEach((row) => {
        if (row.dataset.calculated && row.querySelector('[data-annual="year"]').value === input.name.slice(7)) {
          row.recalculate();
        }
      });
    });
  });
  dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('form').onsubmit = async (event) => {
    event.preventDefault();
    const submit = dialog.querySelector('[type="submit"]');
    submit.disabled = true;
    const values = Object.fromEntries(new FormData(event.target));
    // Başka bir alan kaydedilirken nottan gelen başlangıç bilgisi silinmez.
    if (!Object.hasOwn(record, 'start_date') && !values.start_date) {
      delete values.start_date;
    }
    if (!Object.hasOwn(record, 'end_date') && !values.end_date) {
      delete values.end_date;
    }
    try {
      const yearlyPayments = {};
      for (const row of annualInputs.querySelectorAll('.annual-payment-row')) {
        const value = (key) => row.querySelector(`[data-annual="${key}"]`).value;
        const year = value('year');
        if (Object.hasOwn(yearlyPayments, year)) {
          throw new Error('Aynı yıl için tek bir ödeme toplamı girin.');
        }
        yearlyPayments[year] = {
          invoice_count: Number(value('invoice_count')),
          total: decimalInput(value('total')),
          through_date: value('through_date'),
        };
      }
      await api(`/api/services/${encodeURIComponent(service.id)}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: service.edit_revision,
          record: {
            ...values,
            yearly_payments: yearlyPayments,
            invoice_count: Number(values.invoice_count),
            amounts: Object.fromEntries(Object.keys(record.amounts).map((year) =>
              [year, values[`amount-${year}`] || null],
            )),
          },
        }),
      });
      dialog.close();
      // Detay ve ana tablo aynı sunucu hesabını kullanır; eski sonuç önbellekte kalmaz.
      state.increaseData = null;
      await navigate();
      toast('Hizmet güncellendi. Analizler yeniden hesaplandı.');
    } catch (error) {
      dialog.querySelector('[role="alert"]').textContent = error.message;
      submit.disabled = false;
    }
  };
  dialog.showModal();
}

// Sunucuyla aynı şekilde yalnızca yazım farkları giderilir; A/4 gibi OCR düzeltmesi yapılmaz.
function invoiceNumberKey(value) {
  return String(value || '')
    .normalize('NFKC')
    .toUpperCase()
    .replace(/\s+/g, '');
}

function updateInvoiceNumberResults() {
  const target = $('#invoice-number-results');
  if (!target) return;
  const key = invoiceNumberKey(state.list.number);
  if (!key) {
    target.innerHTML =
      '<p class="service-hint">Yüklenen faturaları numarasından bulup açabilirsiniz.</p>';
    return;
  }
  const rows = state.documents.filter((doc) => invoiceNumberKey(doc.invoice_number).includes(key));
  target.innerHTML =
    `<p class="service-hint">${rows.length} fatura bulundu. <button class="btn btn-text" data-action="clear-number-search">Aramayı temizle</button></p>` +
    (rows.length ? invoiceTable(rows) : '<p>Eşleşen yüklenmiş fatura bulunamadı.</p>');
}

function renderDuplicateInvoice(doc) {
  app.innerHTML = /* HTML */ `<div class="page">
    ${heading(
      'MÜKERRER FATURA',
      'Bu fatura zaten mevcut.',
      'Aynı fatura numarası ikinci kez listeye ve analizlere eklenmedi.',
    )}
    ${renderBatchNavigation(doc)}
    <section class="card form-card">
      <h2>${esc(doc.edited?.invoice_number || '')}</h2>
      <p>${esc(doc.filename)}</p>
      <p>Numara okunduktan sonra sistemdeki faturalarla karşılaştırıldı.</p>
      <div class="approval-actions">
        ${doc.mime === 'application/pdf' && !doc.batch_id
          ? '<button class="btn btn-light" data-action="split-invoice-pages">Toplu fatura olarak oku</button>'
          : ''}
        <a class="btn btn-primary" href="#document/${encodeURIComponent(doc.duplicate_of)}"
          >Mevcut faturayı aç</a
        >
        <a class="btn btn-light" href="#invoices">Listeye dön</a>
        <button class="btn btn-light" data-action="correct-duplicate">
          Numara yanlış okunduysa düzelt
        </button>
      </div>
    </section>
    ${footer()}
  </div>`;
}
