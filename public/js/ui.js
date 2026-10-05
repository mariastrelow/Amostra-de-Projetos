/* Renderização: cards, modal com carrossel e diálogos. */
import { $, esc, kind, ytId, thumbOf } from './utils.js';

const ICO = '<svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1"/></svg>';

const iframe = p => `<iframe loading="lazy" src="${esc(p.url)}" title="${esc(p.name)}" sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>`;
const goText = p => p.type === 'instagram' ? 'Ver no Instagram' : 'Acessar projeto';
const link = p => (p.type === 'semlink' || !p.url) ? '' : `<a class="btn" href="${esc(p.url)}" target="_blank" rel="noopener">${goText(p)}</a>`;

/** Miniatura de card para imagem, vídeo de arquivo ou YouTube. */
function cover(s) {
    const k = kind(s), play = k === 'img' ? '' : '<div class="play">▶</div>';
    return (k === 'video'
        ? `<video class="ph" src="${esc(s)}#t=0.1" preload="metadata" muted playsinline></video>`
        : `<img class="ph" src="${esc(thumbOf(s))}" alt="">`) + play;
}

function cardThumb(p) {
    const media = p.type === 'site'
        ? `<div class="ic">${ICO}</div>${iframe(p)}`
        : (p.imgs && p.imgs[0] ? cover(p.imgs[0]) : `<div class="ic">${ICO}</div>`);
    return `<div class="th"><div class="ttl">${esc(p.name)}</div>${media}</div>`;
}

/** Slide do carrossel: mídia inteira (sem cortar), centralizada sobre um fundo desfocado dela mesma. */
function slide(s, auto) {
    const k = kind(s), u = esc(s);
    if (k === 'yt') return `<div class="sl"><img class="bg" src="${esc(thumbOf(s))}" alt=""><iframe class="fg" src="https://www.youtube-nocookie.com/embed/${ytId(s)}?rel=0${auto ? '&autoplay=1' : ''}" title="Vídeo" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe></div>`;
    if (k === 'video') return `<div class="sl"><video class="bg" src="${u}#t=0.1" preload="metadata" muted playsinline></video><video class="fg" src="${u}" controls playsinline preload="metadata"${auto ? ' autoplay' : ''}></video></div>`;
    return `<div class="sl"><img class="bg" src="${u}" alt=""><img class="fg" src="${u}" alt=""></div>`;
}

export function renderGrid(projects, admin, handlers) {
    const g = $('#grid'); g.innerHTML = '';
    $('#cnt').textContent = projects.length;
    projects.forEach(p => {
        const c = document.createElement('div'); c.className = 'card';
        c.innerHTML = cardThumb(p) + `<div class="bd"><p>${esc(p.text)}</p>${link(p)}` +
            (admin ? '<div class="adc"><button class="btn s o" data-e>Editar</button><button class="btn s o" data-d>Excluir</button></div>' : '') + '</div>';
        c.onclick = e => {
            if (e.target.closest('a')) return;
            if (e.target.closest('[data-e]')) return handlers.edit(p.id);
            if (e.target.closest('[data-d]')) return handlers.remove(p);
            handlers.open(p);
        };
        g.appendChild(c);
    });
    $('#bar').classList.toggle('on', admin);
}

export function renderVideos(videos, admin, handlers) {
    const g = $('#vgrid'); g.innerHTML = '';
    if (!videos.length) g.innerHTML = '<p class="empty">Em breve: novos vídeos sobre o curso.</p>';
    videos.forEach(v => {
        const c = document.createElement('div'); c.className = 'card';
        c.innerHTML = `<div class="th"><div class="ttl">${esc(v.title)}</div>${cover(v.src)}</div><div class="bd">${v.desc ? `<p>${esc(v.desc)}</p>` : ''}` +
            (admin ? '<div class="adc"><button class="btn s o" data-e>Editar</button><button class="btn s o" data-d>Excluir</button></div>' : '') + '</div>';
        c.onclick = e => {
            if (e.target.closest('[data-e]')) return handlers.edit(v.id);
            if (e.target.closest('[data-d]')) return handlers.remove(v);
            handlers.open(v);
        };
        g.appendChild(c);
    });
}

export function openBig(p, admin, onEdit) {
    const items = [];
    if (p.type === 'site') items.push(null); // null = site em iframe
    (p.imgs || []).forEach(s => items.push(s));
    if (!items.length) items.push('');

    let i = 0; const o = $('#ov');
    o.innerHTML = `<div class="big"><button class="x">×</button><div class="th" id="sl"></div><div class="info"><h3>${esc(p.name)}</h3><h4>${esc(p.kicker || 'Sobre o projeto')}</h4><p>${esc(p.desc || p.text)}</p>${link(p)}${admin ? '<button class="btn o s" id="ed">Editar</button>' : ''}</div></div>`;
    const box = o.querySelector('#sl');

    // auto = true quando a pessoa navegou até o slide (o primeiro vídeo abre pausado)
    function show(auto) {
        const s = items[i];
        const body = s === null ? `<div style="width:100%;height:100%;background:#fff">${iframe(p)}</div>`
            : s ? slide(s, auto) : `<div class="ic" style="position:relative;height:100%;background:linear-gradient(135deg,#e4007c,#ff4fa3)">${ICO}</div>`;
        box.innerHTML = body + (items.length > 1
            ? '<button class="ar l">‹</button><button class="ar r">›</button><div class="dots">' + items.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('') + '</div>'
            : '');
        const l = box.querySelector('.l'), r = box.querySelector('.r');
        if (l) {
            l.onclick = () => { i = (i - 1 + items.length) % items.length; show(true) };
            r.onclick = () => { i = (i + 1) % items.length; show(true) };
        }
    }
    show(false); o.classList.add('on');
    o.querySelector('.x').onclick = closeBig;
    o.querySelector('.big').onclick = e => e.stopPropagation();
    const ed = o.querySelector('#ed'); if (ed) ed.onclick = () => { closeBig(); onEdit(p.id) };
}

export function closeBig() { const o = $('#ov'); o.classList.remove('on'); o.innerHTML = '' }
export function dlg(html) { const d = $('#dlg'); d.innerHTML = `<div class="box">${html}</div>`; d.classList.add('on') }
export function closeDlg() { const d = $('#dlg'); d.classList.remove('on'); d.innerHTML = '' }
