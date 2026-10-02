'use strict';

// Thème radiofrance.fr présent sur quasiment toutes les émissions : inutile comme filtre.
const IGNORED_THEMES = new Set(['Arts et Divertissement']);

const $ = (sel) => document.querySelector(sel);
const els = {
  q: $('#q'), series: $('#series'), year: $('#year'), theme: $('#theme'), reruns: $('#reruns'),
  reset: $('#reset'), rows: $('#rows'), count: $('#count'), thead: $('#table thead'),
};

let episodes = [];
let byId = new Map();
let search = null;
// key: champ de tri, ou 'score' (pertinence, seulement avec une recherche).
let sort = { key: 'firstBroadcast', dir: 1 };
let userSorted = false;
const open = new Set();

// ---------- utilitaires ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const extLink = (url, text) => `<a href="${esc(url)}" target="_blank" rel="noopener">${esc(text)}</a>`;

// Rend cliquables les liens markdown [texte](url), les URL brutes et les DOI ; échappe le reste.
const LINK_RE = /\[([^\]]+)\]\(([^)]+)\)|https?:\/\/[^\s<>"]+|\bdoi\s*:?\s*(10\.\d{4,}\/[^\s,;]+)/gi;
function linkify(s) {
  s = String(s ?? '');
  let out = '';
  let last = 0;
  for (const m of s.matchAll(LINK_RE)) {
    const [, mdText, mdUrl, doi] = m;
    let html;
    if (mdText) {
      html = extLink(mdUrl.replace(/\s+/g, ''), mdText);
    } else {
      // La ponctuation finale appartient à la phrase, sauf une « ) » qui ferme une « ( » de l'URL.
      let str = m[0];
      let trail = str.match(/[.,;:!?)\]]+$/)?.[0] ?? '';
      if (trail.startsWith(')') && str.includes('(')) trail = trail.slice(1);
      str = str.slice(0, str.length - trail.length);
      const url = doi ? `https://doi.org/${str.replace(/^doi\s*:?\s*/i, '')}` : str;
      html = extLink(url, str) + esc(trail);
    }
    out += esc(s.slice(last, m.index)) + html;
    last = m.index + m[0].length;
  }
  return out + esc(s.slice(last));
}

const fold = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

const dateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
const longDateFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const fmtDate = (iso, fmt = dateFmt) => (iso ? fmt.format(new Date(iso + 'T12:00:00')) : '');
const fmtDuration = (s) => (s ? `${Math.round(s / 60)} min` : '');

const collator = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

// ---------- chargement ----------

async function init() {
  const res = await fetch('./data/episodes.json');
  const data = await res.json();
  episodes = data.episodes;
  byId = new Map(episodes.map((e) => [e.id, e]));
  $('#total').textContent = `${episodes.length} émissions`;
  $('#generated').textContent = fmtDate(data.generatedAt, longDateFmt);

  fillFilters();
  buildIndex();
  readHash();
  bindEvents();
  render();
}

function fillFilters() {
  const addOptions = (select, values) => {
    for (const [value, label] of values) select.add(new Option(label, value));
  };

  const series = [...new Set(episodes.filter((e) => e.series).map((e) => e.series.name))]
    .sort(collator.compare);
  addOptions(els.series, series.map((s) => [s, s]));

  const years = [...new Set(episodes.map((e) => e.firstBroadcast.slice(0, 4)))].sort();
  addOptions(els.year, years.map((y) => [y, y]));

  const themes = new Map();
  for (const e of episodes) for (const t of e.themes) {
    if (!IGNORED_THEMES.has(t)) themes.set(t, (themes.get(t) || 0) + 1);
  }
  addOptions(els.theme, [...themes].filter(([, n]) => n >= 2)
    .sort((a, b) => collator.compare(a[0], b[0]))
    .map(([t, n]) => [t, `${t} (${n})`]));
}

function buildIndex() {
  const refText = (list) => list.map((x) => (typeof x === 'string' ? x : x.text)).join('\n');
  search = new MiniSearch({
    fields: ['title', 'series', 'topics', 'teaser', 'intro', 'refs'],
    storeFields: [],
    extractField: (e, field) => {
      switch (field) {
        case 'series': return e.series?.name ?? '';
        case 'topics': return e.topics.join(' · ');
        case 'teaser': return [e.teaser, e.standfirst].filter(Boolean).join('\n');
        case 'refs': return [e.articles, e.books, e.songs, e.films, e.links].map(refText).join('\n');
        default: return e[field];
      }
    },
    processTerm: (term) => (term.length < 2 ? null : fold(term)),
    searchOptions: {
      boost: { title: 4, topics: 3, series: 2, teaser: 1.5 },
      prefix: true,
      fuzzy: (term) => (term.length > 4 ? 0.2 : false),
      combineWith: 'AND',
    },
  });
  search.addAll(episodes);
}

// ---------- état <-> URL ----------

function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  els.q.value = p.get('q') ?? '';
  for (const k of ['series', 'year', 'theme', 'reruns']) {
    const v = p.get(k) ?? '';
    if ([...els[k].options].some((o) => o.value === v)) els[k].value = v;
  }
  if (p.has('sort')) {
    const [key, dir] = p.get('sort').split(':');
    sort = { key, dir: dir === 'desc' ? -1 : 1 };
    userSorted = true;
  }
  open.clear();
  for (const id of (p.get('open') ?? '').split(',').filter(Boolean)) open.add(Number(id));
}

function writeHash() {
  const p = new URLSearchParams();
  if (els.q.value.trim()) p.set('q', els.q.value.trim());
  for (const k of ['series', 'year', 'theme', 'reruns']) if (els[k].value) p.set(k, els[k].value);
  if (userSorted) p.set('sort', `${sort.key}:${sort.dir < 0 ? 'desc' : 'asc'}`);
  if (open.size) p.set('open', [...open].join(','));
  const hash = p.toString();
  history.replaceState(null, '', hash ? `#${hash}` : location.pathname + location.search);
}

// ---------- filtrage et tri ----------

function currentList() {
  const q = els.q.value.trim();
  let list;
  const scores = new Map();
  if (q) {
    for (const r of search.search(q)) scores.set(r.id, r.score);
    list = [...scores.keys()].map((id) => byId.get(id));
  } else {
    list = episodes.slice();
  }

  const series = els.series.value;
  const year = els.year.value;
  const theme = els.theme.value;
  const minReruns = Number(els.reruns.value || 0);
  list = list.filter((e) => (
    (!series || (series === '*' ? e.series : series === '-' ? !e.series : e.series?.name === series))
    && (!year || e.firstBroadcast.startsWith(year))
    && (!theme || e.themes.includes(theme))
    && e.rerunCount >= minReruns
  ));

  const key = q && !userSorted ? 'score' : (sort.key === 'score' && !q ? 'firstBroadcast' : sort.key);
  const dir = key === 'score' && !userSorted ? -1 : sort.dir;
  const val = (e) => {
    switch (key) {
      case 'score': return scores.get(e.id);
      case 'series': return e.series ? `${e.series.name}\u0000${String(e.series.part).padStart(3, '0')}` : null;
      default: return e[key];
    }
  };
  list.sort((a, b) => {
    const va = val(a), vb = val(b);
    // Valeurs manquantes toujours en fin de liste.
    if (va == null || vb == null) return (va == null) - (vb == null) || a.firstBroadcast.localeCompare(b.firstBroadcast);
    const c = typeof va === 'string' ? collator.compare(va, vb) : va - vb;
    return c * dir || a.firstBroadcast.localeCompare(b.firstBroadcast);
  });
  return { list, activeKey: key, activeDir: dir };
}

// ---------- rendu ----------

function render() {
  const { list, activeKey, activeDir } = currentList();

  for (const th of els.thead.querySelectorAll('th[data-sort]')) {
    const active = th.dataset.sort === activeKey;
    th.setAttribute('aria-sort', active ? (activeDir > 0 ? 'ascending' : 'descending') : 'none');
  }

  const n = list.length;
  const extra = activeKey === 'score' ? ' · triées par pertinence' : '';
  els.count.textContent = `${n} émission${n > 1 ? 's' : ''}${extra}`;

  els.rows.innerHTML = n
    ? list.map((e) => rowHtml(e) + (open.has(e.id) ? detailHtml(e) : '')).join('')
    : '<tr><td colspan="7" class="empty">Aucune émission ne correspond.</td></tr>';
  writeHash();
}

function rowHtml(e) {
  const reruns = e.rerunCount
    ? `<span class="reruns r${Math.min(e.rerunCount, 3)}">${e.rerunCount}</span>` : '<span class="muted">0</span>';
  return `<tr class="ep${open.has(e.id) ? ' open' : ''}" data-id="${e.id}" tabindex="0" aria-expanded="${open.has(e.id)}">
    <td class="num muted">${e.id}</td>
    <td class="title">${esc(e.title)}</td>
    <td class="series">${e.series ? `<button type="button" class="link" data-series="${esc(e.series.name)}">${esc(e.series.name)}</button> <span class="muted">${e.series.part}</span>` : ''}</td>
    <td class="date">${fmtDate(e.firstBroadcast)}</td>
    <td class="num">${fmtDuration(e.durationSeconds)}</td>
    <td class="num center">${reruns}</td>
    <td class="topics">${e.topics.map((t) => `<button type="button" class="chip" data-topic="${esc(t)}">${esc(t)}</button>`).join('')}</td>
  </tr>`;
}

function listSection(label, items, fmt = esc) {
  if (!items?.length) return '';
  return `<section><h3>${label}</h3><ul>${items.map((x) => `<li>${fmt(x)}</li>`).join('')}</ul></section>`;
}

function detailHtml(e) {
  const linkFmt = (l) => (l.url ? extLink(l.url, l.text || l.url) : esc(l.text));
  const broadcasts = e.broadcasts.map((b) => `${fmtDate(b.date, longDateFmt)}${b.rerun ? ` <span class="muted">(rediffusion ${b.rerun})</span>` : ''}`);
  const themes = e.themes.filter((t) => !IGNORED_THEMES.has(t));
  return `<tr class="detail" data-for="${e.id}"><td colspan="7"><div class="detail-body">
    <div class="player">
      ${e.audioUrl ? `<audio controls preload="none" src="${esc(e.audioUrl)}"></audio>` : '<p class="muted">Pas de fichier audio disponible.</p>'}
      <p class="actions">
        ${e.pageUrl ? `<a href="${esc(e.pageUrl)}" target="_blank" rel="noopener">Page radiofrance.fr ↗</a>` : ''}
        ${e.audioUrl ? `<a href="${esc(e.audioUrl)}" download>Télécharger le MP3</a>` : ''}
      </p>
    </div>
    ${e.teaser ? `<p class="teaser">${esc(e.teaser)}</p>` : ''}
    ${e.standfirst && e.standfirst !== e.title ? `<p class="standfirst">${esc(e.standfirst)}</p>` : ''}
    ${e.intro ? `<div class="intro">${linkify(e.intro)}</div>` : ''}
    <div class="refs">
      ${listSection('Articles scientifiques', e.articles, linkify)}
      ${listSection('Livres', e.books, linkify)}
      ${listSection('Films', e.films, linkFmt)}
      ${listSection('Chansons', e.songs)}
      ${listSection('Liens', e.links, linkFmt)}
      ${listSection('Diffusions', broadcasts, (x) => x)}
      ${listSection('Thèmes radiofrance.fr', themes.length ? [themes.join(', ')] : [])}
      ${listSection('Équipe', e.team, (t) => `${esc(t.name)}${t.role ? ` <span class="muted">— ${esc(t.role)}</span>` : ''}`)}
    </div>
  </div></td></tr>`;
}

// ---------- événements ----------

// Ouvre/ferme le détail sans tout re-rendre, pour ne pas couper un lecteur audio en cours.
function toggle(id) {
  const tr = els.rows.querySelector(`tr.ep[data-id="${id}"]`);
  if (open.has(id)) {
    open.delete(id);
    tr.nextElementSibling?.matches('.detail') && tr.nextElementSibling.remove();
  } else {
    open.add(id);
    tr.insertAdjacentHTML('afterend', detailHtml(byId.get(id)));
  }
  tr.classList.toggle('open', open.has(id));
  tr.setAttribute('aria-expanded', open.has(id));
  writeHash();
}

function bindEvents() {
  let timer;
  els.q.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => { userSorted = false; render(); }, 120);
  });
  for (const k of ['series', 'year', 'theme', 'reruns']) els[k].addEventListener('change', render);

  els.reset.addEventListener('click', () => {
    els.q.value = '';
    for (const k of ['series', 'year', 'theme', 'reruns']) els[k].value = '';
    sort = { key: 'firstBroadcast', dir: 1 };
    userSorted = false;
    open.clear();
    render();
  });

  els.thead.addEventListener('click', (ev) => {
    const th = ev.target.closest('th[data-sort]');
    if (!th) return;
    const key = th.dataset.sort;
    const current = th.getAttribute('aria-sort');
    // Premier clic : croissant, sauf pour les rediffusions et la durée où le plus grand d'abord est plus utile.
    const firstDir = key === 'rerunCount' || key === 'durationSeconds' ? -1 : 1;
    const dir = current === 'none' ? firstDir : current === 'ascending' ? -1 : 1;
    sort = { key, dir };
    userSorted = true;
    render();
  });

  els.rows.addEventListener('click', (ev) => {
    const chip = ev.target.closest('[data-topic]');
    if (chip) { els.q.value = chip.dataset.topic; userSorted = false; render(); return; }
    const ser = ev.target.closest('[data-series]');
    if (ser) { els.series.value = ser.dataset.series; render(); return; }
    if (ev.target.closest('a, audio, button, .detail')) return;
    const tr = ev.target.closest('tr.ep');
    if (tr) toggle(Number(tr.dataset.id));
  });

  els.rows.addEventListener('keydown', (ev) => {
    const tr = ev.target.closest('tr.ep');
    if (tr && ev.target === tr && (ev.key === 'Enter' || ev.key === ' ')) {
      ev.preventDefault();
      toggle(Number(tr.dataset.id));
    }
  });

  window.addEventListener('hashchange', () => { readHash(); render(); });
}

init().catch((err) => {
  console.error(err);
  els.rows.innerHTML = `<tr><td colspan="7" class="empty">Erreur de chargement des données : ${esc(err.message)}</td></tr>`;
});
