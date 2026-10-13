import './style.css';
import '@fontsource-variable/dm-sans';
import { icon } from './icons';
import { setupInstallUI } from './pwa';
import { MockupScene, BACKGROUNDS, type ViewPreset, type BackgroundPreset, type MugColor } from './scene';
import { fillArtworkHeight, type ArtworkSettings } from './artwork';

const state = {
  artwork: { scale: 1, heightScale: 1, x: 0, y: 0, layout: 'wrap' } as ArtworkSettings,
  view: 'duo' as ViewPreset,
  background: 'studio' as BackgroundPreset,
  mugColor: 'white' as MugColor,
  rotation: 0,
  zoom: 100,
  aspect: 1,
  resolution: 2400,
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <header class="header">
    <a class="brand" href="./" aria-label="forma — início"><img class="brand-mark" src="${import.meta.env.BASE_URL}favicon.svg" width="35" height="35" alt="" /><span>forma<span class="brand-dot">.</span></span></a>
    <span class="brand-divider"></span><span class="brand-caption">MOCKUP STUDIO</span>
    <div class="header-end"><span class="local-status"><span></span> Feito no seu navegador</span><button class="install-button" id="install-app">${icon('phone')}<span>Instalar app</span></button><button class="icon-button" id="help" aria-label="Como usar o estúdio" title="Como usar">${icon('help')}</button></div>
  </header>
  <main class="main">
    <div class="page-heading"><div><div class="eyebrow"><span></span> DA IDEIA À IMAGEM</div><h1>Sua arte, em outra dimensão.</h1><p>Crie um mockup que dá vontade de ter nas mãos.</p></div><button id="reset" class="text-button">${icon('reset')} Recomeçar</button></div>
    <div class="workspace">
      <section class="preview-column" aria-label="Visualização do mockup">
        <div class="stage" id="stage">
          <div class="stage-top"><span class="product-label">${icon('mug')} Caneca de cerâmica <span class="product-size">325 ml</span></span><span class="live-badge"><span></span> Ao vivo</span></div>
          <div class="render-area" id="render-area"><div class="viewport-frame" id="viewport"><div class="loading" id="loading"><span class="spinner"></span>Preparando seu estúdio…</div></div></div>
          <div class="stage-bottom"><span class="interaction-hint">${icon('rotate')} Arraste para explorar</span><div class="stage-tools"><button class="icon-button" id="reset-camera" aria-label="Restaurar câmera" title="Restaurar câmera">${icon('reset')}</button><span></span><button class="icon-button" id="fullscreen" aria-label="Ampliar visualização" title="Ampliar visualização">${icon('expand')}</button></div></div>
        </div>
        <div class="composition-bar"><div><span class="small-label">ENQUADRAMENTO</span><span class="composition-description">Mesma caneca, dois lados.</span></div><div class="view-options" role="group" aria-label="Enquadramento">
          <button class="view-option active" data-view="duo" aria-pressed="true"><span class="mini-mugs duo"><i></i><i></i></span><span>Frente e verso</span></button>
          <button class="view-option" data-view="single" aria-pressed="false"><span class="mini-mugs"><i></i></span><span>Individual</span></button>
          <button class="view-option" data-view="detail" aria-pressed="false"><span class="mini-mugs detail"><i></i></span><span>Detalhe</span></button>
        </div></div>
        <div class="preview-footnote">${icon('lock')} Sua arte fica com você. Nenhum arquivo é enviado.</div>
      </section>
      <aside class="editor" aria-label="Personalizar mockup">
        <section class="editor-section artwork-section"><div class="section-heading"><span class="step">01</span><h2>Sua arte</h2><span class="section-caption">O toque pessoal</span></div>
          <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg" hidden />
          <button class="dropzone" id="dropzone"><span class="upload-symbol">${icon('upload')}</span><strong>Solte sua arte aqui</strong><span>ou <b>escolha um arquivo</b></span><small>PNG, JPG, WebP ou SVG · até 20 MB</small></button>
          <div class="artwork-file" id="artwork-file" hidden><img id="artwork-thumb" alt="Miniatura da arte aplicada" /><div><strong id="artwork-name"></strong><span id="artwork-meta"></span></div><button class="icon-button" id="remove-artwork" aria-label="Remover arte" title="Remover arte">${icon('close')}</button></div>
          <details class="adjustments" id="art-adjustments" hidden><summary>${icon('sliders')} Ajustar a arte ${icon('arrow', 'chevron')}</summary><div class="adjustment-content">
            <label class="select-label" for="layout">Aplicação</label><select id="layout"><option value="wrap">Arte contínua ao redor da caneca</option><option value="repeat">Repetir na frente e no verso</option></select>
            <div class="slider-field"><label for="scale">Escala <output id="scale-value">100%</output></label><input id="scale" type="range" min="25" max="200" value="100" /><span class="slider-ends"><span>Menor</span><span>Maior</span></span></div>
            <div class="slider-field"><label for="height-scale">Altura da estampa <output id="height-scale-value">100%</output></label><input id="height-scale" type="range" min="25" max="200" step="0.1" value="100" /><button class="small-text-button fill-height-button" id="fill-height">Preencher altura da caneca</button></div>
            <div class="slider-field"><label for="position-x">Posição horizontal <output id="position-x-value">0</output></label><input id="position-x" type="range" min="-100" max="100" value="0" /></div>
            <div class="slider-field"><label for="position-y">Posição vertical <output id="position-y-value">0</output></label><input id="position-y" type="range" min="-100" max="100" value="0" /></div>
            <p class="field-note">Escala mantém a proporção. Altura da estampa ajusta só o sentido vertical, mantendo a distância da alça. A esquerda mostra a frente; a direita, o verso. PNG com transparência deixa a cor da caneca aparecer.</p><button class="small-text-button" id="reset-art">Restaurar ajustes da arte</button>
          </div></details>
        </section>
        <section class="editor-section"><div class="section-heading"><span class="step">02</span><h2>A cena</h2><span class="section-caption">O cenário ideal</span></div>
          <label class="control-label">Cor da caneca</label><div class="mug-color-options" role="group" aria-label="Cor da caneca">
            <button class="mug-color-option active" data-mug-color="white" aria-pressed="true"><span class="mug-color-swatch white" aria-hidden="true"></span>Branca</button>
            <button class="mug-color-option" data-mug-color="black" aria-pressed="false"><span class="mug-color-swatch black" aria-hidden="true"></span>Preta</button>
          </div>
          <label class="control-label">Fundo</label><div class="background-options" role="group" aria-label="Cor de fundo">
            <button class="background-option active" data-bg="studio" aria-label="Fundo estúdio" aria-pressed="true"><span class="color-swatch studio">${icon('check')}</span><span>Estúdio</span></button>
            <button class="background-option" data-bg="sand" aria-label="Fundo areia" aria-pressed="false"><span class="color-swatch sand">${icon('check')}</span><span>Areia</span></button>
            <button class="background-option" data-bg="sage" aria-label="Fundo sálvia" aria-pressed="false"><span class="color-swatch sage">${icon('check')}</span><span>Sálvia</span></button>
            <button class="background-option" data-bg="transparent" aria-label="Fundo transparente" aria-pressed="false"><span class="color-swatch transparent">${icon('check')}</span><span>Sem fundo</span></button>
          </div>
          <div class="slider-field"><label for="rotation">Giro da caneca <output id="rotation-value">0°</output></label><input id="rotation" type="range" min="-180" max="180" value="0" /></div>
          <details class="camera-details"><summary>Ajustar aproximação ${icon('arrow', 'chevron')}</summary><div class="slider-field"><label for="zoom">Aproximação <output id="zoom-value">100%</output></label><input id="zoom" type="range" min="65" max="160" value="100" /></div></details>
        </section>
        <section class="editor-section export-section"><div class="section-heading"><span class="step">03</span><h2>Pronto para levar</h2></div>
          <div class="export-controls"><div><label class="select-label" for="resolution">Resolução</label><select id="resolution"><option value="1080">1080 px</option><option value="2400" selected>2400 px · Alta</option><option value="3600">3600 px · Máxima</option></select></div><div><label class="select-label" for="format">Formato</label><select id="format"><option value="1">Quadrado · 1:1</option><option value="1.3333333333333333">Horizontal · 4:3</option><option value="0.8">Retrato · 4:5</option></select></div></div>
          <button id="download" class="download-button" disabled>${icon('download')}<span>Baixar mockup</span><span class="png-label">PNG</span></button><p class="download-note" id="download-note">2400 × 2400 px · sem marca d’água</p>
        </section>
      </aside>
    </div>
    <footer class="footer"><span>Feito para dar forma às suas ideias.</span><span>Um pequeno estúdio. Infinitas possibilidades.</span></footer>
  </main>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="install-dialog" aria-labelledby="install-title"><div class="dialog-header"><span class="eyebrow">SEU ESTÚDIO, SEMPRE POR PERTO</span><button class="icon-button install-close" aria-label="Fechar instalação">${icon('close')}</button></div><div class="install-app-heading"><img src="${import.meta.env.BASE_URL}favicon.svg" width="64" height="64" alt="Ícone do forma: caneca branca em fundo verde" /><div><h2 id="install-title">Leve o forma com você.</h2><span>Mockup Studio</span></div></div><p class="install-description">Crie seus mockups direto da tela inicial, em uma janela própria. Depois do primeiro acesso, o estúdio também funciona sem internet.</p><div id="install-instructions"><ol><li><strong>Abra o menu do navegador.</strong><p>No Chrome do Android, toque nos três pontinhos ⋮.</p></li><li><strong>Instale o forma.</strong><p>Escolha “Instalar app” ou “Adicionar à tela inicial” e confirme a instalação.</p></li></ol><p class="install-other-devices">No computador, use a opção de instalar na barra de endereço. No iPhone, use Safari → Compartilhar → Adicionar à Tela de Início.</p></div><p class="dialog-note" id="install-note" hidden>Para instalar no celular, abra o site publicado com conexão segura (HTTPS).</p><button id="confirm-install" class="download-button" hidden>${icon('phone')} Instalar forma</button><button class="text-button install-close install-dismiss">Voltar ao estúdio ${icon('arrow')}</button></dialog>
  <dialog id="help-dialog"><div class="dialog-header"><span class="eyebrow">SEU ESTÚDIO, SEM COMPLICAÇÃO</span><button class="icon-button dialog-close" aria-label="Fechar ajuda">${icon('close')}</button></div><h2>Da sua arte ao seu mockup.</h2><ol><li><strong>Envie sua arte.</strong><p>Use PNG com transparência, JPG, WebP ou SVG. Para uma estampa que envolve a caneca, comece com uma arte de aproximadamente 21 × 9 cm.</p></li><li><strong>Encontre o melhor ângulo.</strong><p>Ajuste a escala e a posição. Escolha uma ou duas canecas e arraste a cena para girar. A estampa acompanha a superfície em 3D.</p></li><li><strong>Leve a imagem com você.</strong><p>Escolha o fundo, o formato e a resolução. Clique em “Baixar mockup” para salvar um PNG sem marca d’água.</p></li></ol><p class="dialog-note">A cena é uma simulação 3D para apresentação. Para impressão, use o gabarito do seu fornecedor.</p><button class="download-button dialog-close">Vamos criar ${icon('arrow')}</button></dialog>
`;

function element<T extends HTMLElement = HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

const fileInput = element<HTMLInputElement>('file-input');
const downloadButton = element<HTMLButtonElement>('download');
let studio: MockupScene | undefined;
let currentImage: HTMLImageElement | undefined;
let currentUrl: string | undefined;
let toastTimer: ReturnType<typeof setTimeout>;
let loadVersion = 0;
let exporting = false;

function toast(message: string, error = false) {
  const notification = element('toast');
  clearTimeout(toastTimer);
  notification.textContent = message;
  notification.classList.toggle('error', error);
  notification.hidden = false;
  toastTimer = setTimeout(() => { notification.hidden = true; }, 4500);
}

function updateArtwork() {
  if (currentImage) studio?.setArtwork(currentImage, state.artwork);
}

function updateHeightRange() {
  const input = element<HTMLInputElement>('height-scale');
  const filled = currentImage && fillArtworkHeight(currentImage.naturalWidth, currentImage.naturalHeight, state.artwork);
  // Very wide artwork can need more than 200% height to fill the mug.
  input.max = String(Math.max(200, Math.ceil((filled?.heightScale ?? 1) * 100),
    Math.ceil((state.artwork.heightScale ?? 1) * 100)));
  input.dispatchEvent(new Event('input'));
}

function resetArtworkSettings() {
  state.artwork = { scale: 1, heightScale: 1, x: 0, y: 0, layout: 'wrap' };
  element<HTMLInputElement>('height-scale').value = '100';
  for (const id of ['scale', 'height-scale', 'position-x', 'position-y']) {
    const input = element<HTMLInputElement>(id);
    input.value = id === 'scale' || id === 'height-scale' ? '100' : '0';
    input.dispatchEvent(new Event('input'));
  }
  element<HTMLSelectElement>('layout').value = 'wrap';
  updateArtwork();
}

async function loadArtwork(url: string, name: string) {
  const version = ++loadVersion;
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (version !== loadVersion) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url);
      return;
    }
    if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth > 16384 || image.naturalHeight > 16384 || image.naturalWidth * image.naturalHeight > 80_000_000) {
      throw new Error('Essa imagem é grande demais. Use uma arte de até 16384 px e 80 megapixels.');
    }
    if (currentUrl?.startsWith('blob:')) URL.revokeObjectURL(currentUrl);
    currentUrl = url;
    currentImage = image;
    resetArtworkSettings();
    element<HTMLImageElement>('artwork-thumb').src = url;
    element('artwork-name').textContent = name;
    element('artwork-meta').textContent = `${image.naturalWidth} × ${image.naturalHeight}`;
    element('artwork-file').hidden = false;
    element('art-adjustments').hidden = false;
    downloadButton.disabled = !studio;
    toast('Sua arte já ganhou forma.');
  } catch (error) {
    if (url.startsWith('blob:') && currentUrl !== url) URL.revokeObjectURL(url);
    if (version !== loadVersion) return;
    toast(error instanceof Error && error.message.includes('grande demais') ? error.message : 'Não foi possível abrir a imagem. Tente outro PNG, JPG, WebP ou SVG.', true);
  }
}

async function acceptFile(file?: File) {
  if (!file) return;
  if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name) || (file.type && !['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'].includes(file.type))) {
    toast('Escolha uma imagem PNG, JPG, WebP ou SVG.', true);
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    toast('O arquivo deve ter até 20 MB.', true);
    return;
  }
  await loadArtwork(URL.createObjectURL(file), file.name);
}

fileInput.addEventListener('change', async () => { await acceptFile(fileInput.files?.[0]); fileInput.value = ''; });
element('dropzone').addEventListener('click', () => fileInput.click());
element('artwork-thumb').addEventListener('click', () => fileInput.click());
let dragCount = 0;
const dropzone = element('dropzone');
for (const eventName of ['dragenter', 'dragover', 'dragleave', 'drop']) {
  dropzone.addEventListener(eventName, event => {
    event.preventDefault();
    const drag = event as DragEvent;
    if (eventName === 'dragenter') dragCount++;
    if (eventName === 'dragleave') dragCount = Math.max(0, dragCount - 1);
    if (eventName === 'dragover' && drag.dataTransfer) drag.dataTransfer.dropEffect = 'copy';
    if (eventName === 'drop') { dragCount = 0; void acceptFile(drag.dataTransfer?.files[0]); }
    dropzone.classList.toggle('dragging', dragCount > 0);
  });
}
// Prevent the browser from navigating to an image accidentally dropped outside the zone.
window.addEventListener('dragover', event => event.preventDefault());
window.addEventListener('drop', event => event.preventDefault());

function clearArtwork() {
  loadVersion++;
  if (currentUrl?.startsWith('blob:')) URL.revokeObjectURL(currentUrl);
  currentUrl = undefined;
  currentImage = undefined;
  element('artwork-file').hidden = true;
  element<HTMLImageElement>('artwork-thumb').removeAttribute('src');
  element('artwork-name').textContent = '';
  element('artwork-meta').textContent = '';
  element('art-adjustments').hidden = true;
  element<HTMLDetailsElement>('art-adjustments').open = false;
  resetArtworkSettings();
  studio?.clearArtwork();
}

element('remove-artwork').addEventListener('click', () => {
  clearArtwork();
  toast('Arte removida. Sua caneca está pronta para uma nova ideia.');
});

function bindRange(id: string, unit: string, onChange: (value: number) => void) {
  const input = element<HTMLInputElement>(id);
  const update = () => {
    const value = Number(input.value);
    element<HTMLOutputElement>(`${id}-value`).value = `${value}${unit}`;
    const progress = (value - Number(input.min)) / (Number(input.max) - Number(input.min)) * 100;
    input.style.setProperty('--progress', `${progress}%`);
    onChange(value);
  };
  input.addEventListener('input', update);
  update();
}
bindRange('height-scale', '%', value => { state.artwork.heightScale = value / 100; updateArtwork(); });
bindRange('scale', '%', value => { state.artwork.scale = value / 100; updateHeightRange(); });
bindRange('position-x', '', value => { state.artwork.x = value; updateArtwork(); });
bindRange('position-y', '', value => { state.artwork.y = value; updateArtwork(); });
bindRange('rotation', '°', value => { state.rotation = value; studio?.setRotation(value); });
bindRange('zoom', '%', value => { state.zoom = value; studio?.setZoom(value); });
element<HTMLSelectElement>('layout').addEventListener('change', event => {
  state.artwork.layout = (event.target as HTMLSelectElement).value as ArtworkSettings['layout'];
  updateHeightRange();
});
element('fill-height').addEventListener('click', () => {
  if (!currentImage) return;
  const filled = fillArtworkHeight(currentImage.naturalWidth, currentImage.naturalHeight, state.artwork);
  const input = element<HTMLInputElement>('height-scale');
  // Round upwards to keep the print over the full height at texture edges.
  input.value = String(Math.ceil((filled.heightScale ?? 1) * 1000) / 10);
  updateHeightRange();
  const position = element<HTMLInputElement>('position-y');
  position.value = '0';
  position.dispatchEvent(new Event('input'));
});
element('reset-art').addEventListener('click', resetArtworkSettings);

function setView(view: ViewPreset) {
  state.view = view;
  studio?.setView(view);
  for (const id of ['rotation', 'zoom']) {
    const input = element<HTMLInputElement>(id);
    input.value = id === 'rotation' ? '0' : '100';
    input.dispatchEvent(new Event('input'));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    const active = button.dataset.view === view;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
  button.addEventListener('click', () => setView(button.dataset.view as ViewPreset));
});

function setBackground(background: BackgroundPreset) {
  state.background = background;
  studio?.setBackground(background);
  element('stage').classList.toggle('transparent-stage', background === 'transparent');
  element('stage').style.backgroundColor = BACKGROUNDS[background] ?? '#ffffff';
  document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach(button => {
    const active = button.dataset.bg === background;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-bg]').forEach(button => {
  button.addEventListener('click', () => setBackground(button.dataset.bg as BackgroundPreset));
});

function setMugColor(color: MugColor) {
  state.mugColor = color;
  studio?.setMugColor(color);
  document.querySelectorAll<HTMLButtonElement>('[data-mug-color]').forEach(button => {
    const active = button.dataset.mugColor === color;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}
document.querySelectorAll<HTMLButtonElement>('[data-mug-color]').forEach(button => {
  button.addEventListener('click', () => setMugColor(button.dataset.mugColor as MugColor));
});

function resizePreviewFrame() {
  const area = element('render-area');
  const padding = getComputedStyle(area);
  const availableHeight = area.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
  const width = Math.min(area.clientWidth, availableHeight * state.aspect);
  if (width <= 0) return;
  element('viewport').style.width = `${width}px`;
  element('viewport').style.height = `${width / state.aspect}px`;
}

function updateExportInfo() {
  state.resolution = Number(element<HTMLSelectElement>('resolution').value);
  state.aspect = Number(element<HTMLSelectElement>('format').value);
  element('viewport').style.aspectRatio = String(state.aspect);
  resizePreviewFrame();
  const width = state.aspect >= 1 ? state.resolution : Math.round(state.resolution * state.aspect);
  const height = state.aspect >= 1 ? Math.round(state.resolution / state.aspect) : state.resolution;
  element('download-note').textContent = `${width} × ${height} px · sem marca d’água`;
}
element('resolution').addEventListener('change', updateExportInfo);
element('format').addEventListener('change', updateExportInfo);

element('reset-camera').addEventListener('click', () => { studio?.resetCamera(); toast('Câmera restaurada.'); });
element('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await element('stage').requestFullscreen();
  } catch { toast('Seu navegador não permite tela cheia neste momento.', true); }
});
element('reset').addEventListener('click', () => {
  if (exporting) return;
  setView('duo');
  setBackground('studio');
  setMugColor('white');
  element<HTMLSelectElement>('resolution').value = '2400';
  element<HTMLSelectElement>('format').value = '1';
  updateExportInfo();
  clearArtwork();
  toast('Tudo pronto para uma nova ideia.');
});

downloadButton.addEventListener('click', async () => {
  if (!studio || exporting) return;
  exporting = true;
  downloadButton.disabled = true;
  downloadButton.innerHTML = '<span class="spinner"></span><span>Gerando imagem…</span>';
  try {
    const blob = await studio.exportPNG(state.resolution, state.aspect);
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `forma-caneca-${state.mugColor === 'black' ? 'preta' : 'branca'}-${state.view}-${state.resolution}px.png`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    toast('Mockup pronto. O download da sua imagem começou.');
  } catch (error) {
    toast(error instanceof Error ? error.message : 'Não foi possível baixar. Tente uma resolução menor.', true);
  } finally {
    exporting = false;
    downloadButton.disabled = false;
    downloadButton.innerHTML = `${icon('download')}<span>Baixar mockup</span><span class="png-label">PNG</span>`;
  }
});

const helpDialog = element<HTMLDialogElement>('help-dialog');
element('help').addEventListener('click', () => helpDialog.showModal());
document.querySelectorAll('.dialog-close').forEach(button => button.addEventListener('click', () => helpDialog.close()));
helpDialog.addEventListener('click', event => { if (event.target === helpDialog) helpDialog.close(); });

function startStudio() {
  try {
    studio = new MockupScene(element('viewport'), () => element('stage').classList.add('has-interacted'));
    studio.setMugColor(state.mugColor);
    element('loading').hidden = true;
    downloadButton.disabled = false;
    element('viewport').classList.add('ready');
    studio.renderer.domElement.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      downloadButton.disabled = true;
      toast('A visualização 3D foi interrompida. Recarregue a página para continuar.', true);
    });
    studio.renderer.domElement.addEventListener('webglcontextrestored', () => {
      updateArtwork();
      studio?.setBackground(state.background);
      studio?.setMugColor(state.mugColor);
      downloadButton.disabled = false;
      toast('Visualização 3D restaurada. Sua arte continua aqui.');
    });
  } catch (error) {
    console.error('Não foi possível iniciar o estúdio 3D:', error);
    element('loading').innerHTML = `${icon('cube')}<strong>Precisamos de um pouquinho de 3D.</strong><p>Ative a aceleração de hardware do navegador e recarregue esta página para abrir o estúdio.</p><button class="text-button" id="reload">Tentar novamente</button>`;
    element('loading').classList.add('loading-error');
    element('reload').addEventListener('click', () => window.location.reload());
  }
}

const frameObserver = new ResizeObserver(resizePreviewFrame);
frameObserver.observe(element('render-area'));
setupInstallUI(toast);
updateExportInfo();
void startStudio();
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  frameObserver.disconnect();
  studio?.dispose();
  if (currentUrl?.startsWith('blob:')) URL.revokeObjectURL(currentUrl);
});
