// Música: la playlist de la liga con el reproductor oficial de Spotify (iFrame API), igual que en
// Corner Kikudes. Es optativa: no suena hasta que alguien aprieta el botón verde; ese primer clic
// arranca la playlist desde la primera canción y abre el reproductor (80 px). Después el botón sólo
// lo muestra u oculta (oculto sigue sonando) y se pausa desde el propio reproductor.
const URI = 'spotify:playlist:2CYStprraqqZVkvGTV4Xx2';
const NOTE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

export function mountMusic() {
  const box = document.createElement('div');
  box.className = 'ck-music';
  box.innerHTML = `<div class="ck-music-panel"><div class="ck-music-embed"></div></div>
    <button class="ck-music-btn" title="Poner la música de la liga" aria-label="Música">${NOTE}</button>`;
  document.body.appendChild(box);
  const btn = box.querySelector('.ck-music-btn');
  let controller = null, started = false, pending = false;

  const start = () => {
    if (started) return;
    if (!controller) { pending = true; return; }   // el reproductor aún carga: arranca al estar listo
    started = true;
    controller.loadUri(URI);   // primera canción de la playlist
    controller.play();
    controller.seek(0);
  };

  btn.addEventListener('click', () => {
    const open = !started || !box.classList.contains('open');
    start();
    box.classList.toggle('open', open);
    btn.title = open ? 'Ocultar reproductor (la música sigue)' : 'Mostrar reproductor';
  });

  window.onSpotifyIframeApiReady = (api) => {
    api.createController(box.querySelector('.ck-music-embed'), { uri: URI, width: '100%', height: 80 }, (c) => {
      controller = c;
      c.addListener('playback_update', (e) => box.classList.toggle('playing', !e.data.isPaused));
      if (pending) start();
    });
  };
  const s = document.createElement('script');
  s.src = 'https://open.spotify.com/embed/iframe-api/v1';
  s.async = true;
  document.head.appendChild(s);
}
