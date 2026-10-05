/* Ponto de entrada. */
import { state } from './state.js';
import { loadProjects } from './api.js';
import { renderGrid, renderVideos, openBig, closeBig, closeDlg } from './ui.js';
import { initAdmin, restoreSession, openForm, askDelete, openVideoForm, askDeleteVideo } from './admin.js';
import { $ } from './utils.js';

function render() {
    renderGrid(state.projects, state.admin, {
        open: p => openBig(p, state.admin, openForm),
        edit: openForm,
        remove: askDelete,
    });
    renderVideos(state.videos, state.admin, {
        open: v => openBig({ id: v.id, name: v.title, desc: v.desc, text: v.desc, kicker: 'Sobre o vídeo', type: 'semlink', url: '', imgs: [v.src] }, state.admin, openVideoForm),
        edit: openVideoForm,
        remove: askDeleteVideo,
    });
}

$('#ov').onclick = closeBig;
document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeBig(); closeDlg() } });

initAdmin(render);

(async () => {
    const { projects, videos, api } = await loadProjects();
    state.projects = projects; state.videos = videos; state.api = api;
    await restoreSession();
    render();
})();
