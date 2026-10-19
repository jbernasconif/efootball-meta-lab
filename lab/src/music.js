// Música: la playlist de la liga con el reproductor oficial de Spotify (iFrame API), igual que en
// Corner Kikudes. Los navegadores no dejan sonar nada antes de que la persona toque la página, así
// que la playlist arranca desde la primera canción, desde el segundo 0, con el PRIMER clic o tecla en
// cualquier parte del sitio. El botón verde sólo muestra u oculta el reproductor (chico, 80 px).
const URI = 'spotify:playlist:2CYStprraqqZVkvGTV4Xx2';
const NOTE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg>';

export function mountMusic() {
  const box = document.createElement('div');
  box.className = 'ck-music';
  box.innerHTML = `<div class="ck-music-panel"><div class="ck-music-embed"></div></div>
    <button class="ck-music-btn" title="Música de la liga" aria-label="Música">${NOTE}</button>`;
  document.body.appendChild(box);
  const panel = box.querySelector('.ck-music-panel');
  const btn = box.querySelector('.ck-music-btn');
  let controller = null, started = false;

  const start = () => {
    if (started || !controller) return;
    started = true;
    controller.loadUri(URI);   // vuelve a la primera canción de la playlist
    controller.play();
    controller.seek(0);
  };
  const firstTouch = () => { start(); if (started) off(); };
  const off = () => ['pointerdown', 'keydown'].forEach((e) => window.removeEventListener(e, firstTouch, true));
  ['pointerdown', 'keydown'].forEach((e) => window.addEventListener(e, firstTouch, true));

  btn.addEventListener('click', () => {
    const open = !box.classList.contains('open');
    box.classList.toggle('open', open);
    btn.title = open ? 'Ocultar reproductor (la música sigue)' : 'Música de la liga';
  });

  window.onSpotifyIframeApiReady = (api) => {
    api.createController(box.querySelector('.ck-music-embed'), { uri: URI, width: '100%', height: 80 }, (c) => {
      controller = c;
      c.addListener('playback_update', (e) => box.classList.toggle('playing', !e.data.isPaused));
      // si la persona ya tocó la página mientras cargaba el reproductor
      if (navigator.userActivation?.hasBeenActive) firstTouch();
    });
  };
  const s = document.createElement('script');
  s.src = 'https://open.spotify.com/embed/iframe-api/v1';
  s.async = true;
  document.head.appendChild(s);
  return panel;
}
