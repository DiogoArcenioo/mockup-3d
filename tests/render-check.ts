import { Box3, Quaternion, Raycaster, Vector2, Vector3, type Mesh, type MeshPhysicalMaterial } from 'three';
import { MockupScene } from '../src/scene.ts';
import { paintArtwork, TEXTURE_WIDTH, TEXTURE_HEIGHT } from '../src/artwork.ts';

const log = document.querySelector<HTMLPreElement>('#report')!;
const result = document.querySelector<HTMLElement>('#result')!;
const checks: { name: string; passed: boolean; detail: string }[] = [];
function check(name: string, passed: boolean, detail: string) {
  checks.push({ name, passed, detail });
  log.textContent += `${passed ? 'PASS' : 'FAIL'} ${name}: ${detail}\n`;
}

async function run() {
  const studio = new MockupScene(document.querySelector<HTMLElement>('#viewport')!);
  const image = new Image();
  image.src = 'data:image/svg+xml,' + encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1000">
      <path fill="#df1a26" d="M0 0h1200v334H0z"/><path fill="#2255dd" d="M1200 0h1200v334H1200z"/>
      <path fill="#159447" d="M0 334h1200v333H0z"/><path fill="#efb41a" d="M1200 334h1200v333H1200z"/>
      <path fill="#808080" d="M0 667h1200v333H0z"/><path fill="#181818" d="M1200 667h1200v333H1200z"/>
    </svg>`);
  await image.decode();
  const settings = { scale: 1, x: 0, y: 0, layout: 'wrap' as const };
  studio.setArtwork(image, settings);
  await new Promise(requestAnimationFrame);
  studio.renderer.render(studio.scene, studio.camera);

  const sample = (mug: number, y: number) => {
    const canvas = studio.renderer.domElement;
    const point = new Vector3(studio.mugs[mug].position.x, y, 1).project(studio.camera);
    const gl = studio.renderer.getContext();
    const pixel = new Uint8Array(4);
    gl.readPixels(Math.round((point.x / 2 + 0.5) * canvas.width),
      Math.round((point.y / 2 + 0.5) * canvas.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    return Array.from(pixel.subarray(0, 3));
  };
  const targets = [
    { y: 1.95, colors: [[223, 26, 38], [34, 85, 221]], name: 'vermelho / azul' },
    { y: 1.25, colors: [[21, 148, 71], [239, 180, 26]], name: 'verde / amarelo' },
    { y: 0.55, colors: [[128, 128, 128], [24, 24, 24]], name: 'cinza / preto' },
  ];
  for (const { y, colors, name } of targets) {
    const actual = [sample(0, y), sample(1, y)];
    const maximumError = Math.max(...actual.flatMap((rgb, i) => rgb.map((channel, c) => Math.abs(channel - colors[i][c]))));
    check(`Cores sRGB ${name}`, maximumError <= 5, `RGB ${JSON.stringify(actual)}, erro máximo ${maximumError}/255`);
  }

  const sizes = studio.mugs.map(mug => new Box3().setFromObject(mug).getSize(new Vector3()));
  check('Mesmas dimensões reais', sizes[0].distanceTo(sizes[1]) < 1e-6,
    `${sizes[0].toArray().map(n => n.toFixed(3))} / ${sizes[1].toArray().map(n => n.toFixed(3))}`);
  const handleIntrusions: string[] = [];
  for (const [i, mug] of studio.mugs.entries()) {
    mug.updateWorldMatrix(true, true);
    const orientation = mug.getWorldQuaternion(new Quaternion());
    for (const y of [0.3, 0.38, 0.46, 0.54, 0.62, 1.2, 1.94, 2.02, 2.12, 2.2, 2.29]) {
      for (const angle of [-0.16, -0.08, 0, 0.08, 0.16]) {
        const origin = mug.localToWorld(new Vector3(0, y, 0));
        const direction = new Vector3(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(orientation);
        const firstHit = new Raycaster(origin, direction).intersectObjects(mug.children, false)[0];
        if (firstHit?.object !== mug.children[1]) handleIntrusions.push(`caneca ${i + 1}, altura ${y}, ângulo ${angle}`);
      }
    }
  }
  check('Alça e encaixes ficam fora do interior', handleIntrusions.length === 0,
    handleIntrusions.length ? `${handleIntrusions.length} invasões; ${handleIntrusions[0]}` : '110 raios atingem a parede interna antes da alça');
  const projectedHeight = (i: number) => {
    const x = studio.mugs[i].position.x;
    return new Vector3(x, 2.48, 0).project(studio.camera).y - new Vector3(x, 0, 0).project(studio.camera).y;
  };
  check('Mesmo tamanho na imagem', Math.abs(projectedHeight(0) - projectedHeight(1)) < 1e-10, 'câmera ortográfica; altura projetada idêntica');

  studio.setRotation(180);
  studio.renderer.render(studio.scene, studio.camera);
  for (const { y, colors, name } of targets) {
    const actual = [sample(0, y), sample(1, y)];
    const maximumError = Math.max(...actual.flatMap((rgb, i) => rgb.map((channel, c) => Math.abs(channel - colors[1 - i][c]))));
    check(`Giro de 180° troca ${name}`, maximumError <= 5, `RGB ${JSON.stringify(actual)}`);
  }

  const seamCanvas = document.createElement('canvas');
  paintArtwork(seamCanvas, image, image.naturalWidth, image.naturalHeight, { ...settings, x: 100 });
  const ctx = seamCanvas.getContext('2d')!;
  const firstPixel = ctx.getImageData(4, TEXTURE_HEIGHT / 2, 1, 1).data;
  const lastPixel = ctx.getImageData(TEXTURE_WIDTH - 5, TEXTURE_HEIGHT / 2, 1, 1).data;
  check('Arte atravessa a emenda 360°', firstPixel[3] === 255 && lastPixel[3] === 255 &&
    firstPixel[0] > 200 && firstPixel[2] < 40 && lastPixel[0] < 40 && lastPixel[1] > 100,
    `amarelo / verde nas bordas: ${Array.from(firstPixel)} / ${Array.from(lastPixel)}`);

  const blob = await studio.exportPNG(1080, 1);
  const exported = new Image();
  const exportURL = URL.createObjectURL(blob);
  exported.src = exportURL;
  await exported.decode();
  const exportCanvas = document.createElement('canvas');
  exportCanvas.width = exported.naturalWidth;
  exportCanvas.height = exported.naturalHeight;
  const exportCtx = exportCanvas.getContext('2d')!;
  exportCtx.drawImage(exported, 0, 0);
  const point = new Vector3(studio.mugs[0].position.x, 1.95, 1).project(studio.camera);
  const exportedRGB = Array.from(exportCtx.getImageData(Math.round((point.x / 2 + 0.5) * 1080),
    Math.round((0.5 - point.y / 2) * 1080), 1, 1).data.subarray(0, 3));
  check('PNG conserva as cores', exported.naturalWidth === 1080 && exported.naturalHeight === 1080 &&
    exportedRGB.every((channel, c) => Math.abs(channel - targets[0].colors[1][c]) <= 5),
    `${exported.naturalWidth} × ${exported.naturalHeight}; RGB azul ${exportedRGB}`);
  URL.revokeObjectURL(exportURL);

  studio.setRotation(0);
  // A white upload must look exactly like bare ceramic, even when mipmaps shrink it.
  const whiteImage = new Image();
  whiteImage.src = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="924"><path fill="white" d="M0 0h2000v924H0z"/></svg>');
  await whiteImage.decode();
  const printTexture = ((studio.mugs[0].children[0] as Mesh).material as MeshPhysicalMaterial).map!;
  const printCanvas = printTexture.image as HTMLCanvasElement;
  const printCtx = printCanvas.getContext('2d')!;
  const previousSize = studio.renderer.getSize(new Vector2());
  const previousRatio = studio.renderer.getPixelRatio();
  const edgeErrors: number[] = [];
  studio.renderer.setPixelRatio(1);
  for (const size of [360, 600]) {
    studio.renderer.setSize(size, size, false);
    const capture = () => {
      studio.renderer.render(studio.scene, studio.camera);
      const gl = studio.renderer.getContext();
      const pixels = new Uint8Array(size * size * 4);
      gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return pixels;
    };
    studio.setArtwork(whiteImage, settings);
    const withWhiteImage = capture();
    printCtx.fillStyle = '#ffffff';
    printCtx.fillRect(0, 0, printCanvas.width, printCanvas.height);
    printTexture.needsUpdate = true;
    const bareCeramic = capture();
    let maximumError = 0;
    for (let i = 0; i < bareCeramic.length; i++) {
      if (i % 4 !== 3) maximumError = Math.max(maximumError, Math.abs(withWhiteImage[i] - bareCeramic[i]));
    }
    edgeErrors.push(maximumError);
  }
  check('Prévia sem contorno da área branca', edgeErrors.every(error => error <= 2),
    `diferença para cerâmica sem estampa em 360 / 600 px: ${edgeErrors.join(' / ')}/255`);
  studio.renderer.setPixelRatio(previousRatio);
  studio.renderer.setSize(previousSize.x, previousSize.y, false);

  studio.setMugColor('black');
  studio.setArtwork(image, settings);
  studio.renderer.render(studio.scene, studio.camera);
  // Near-black neutrals now represent the actual ceramic; coloured and grey ink stay faithful.
  const colourInkError = Math.max(...targets.flatMap(({ y, colors }) =>
    [sample(0, y), sample(1, y)].flatMap((rgb, i) =>
      y === 0.55 && i === 1 ? [] : rgb.map((channel, c) => Math.abs(channel - colors[i][c])))));
  check('Caneca preta conserva as cores e o cinza da arte', colourInkError <= 5,
    `erro máximo nas tintas ${colourInkError}/255; preto neutro integra a cerâmica`);

  const blackBackgroundImage = new Image();
  const blackEdgeErrors: number[] = [];
  studio.renderer.setPixelRatio(1);
  for (const size of [360, 600]) {
    studio.renderer.setSize(size, size, false);
    for (const rotation of [0, 90, 180]) {
      studio.setRotation(rotation);
      const capture = () => {
        studio.renderer.render(studio.scene, studio.camera);
        const gl = studio.renderer.getContext();
        const pixels = new Uint8Array(size * size * 4);
        gl.readPixels(0, 0, size, size, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        return pixels;
      };
      studio.clearArtwork();
      const bareBlack = capture();
      for (const shade of ['#000000', '#101010', '#1c1c1c']) {
        blackBackgroundImage.src = 'data:image/svg+xml,' + encodeURIComponent(
          `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="924"><path fill="${shade}" d="M0 0h2000v924H0z"/></svg>`);
        await blackBackgroundImage.decode();
        studio.setArtwork(blackBackgroundImage, settings);
        const withBlack = capture();
        let maximumError = 0;
        for (let i = 0; i < bareBlack.length; i++) {
          if (i % 4 !== 3) maximumError = Math.max(maximumError, Math.abs(withBlack[i] - bareBlack[i]));
        }
        blackEdgeErrors.push(maximumError);
      }
    }
  }
  check('Fundo preto se camufla sem retângulo ou borda ao girar', blackEdgeErrors.every(error => error <= 2),
    `18 combinações de preto / tamanho / giro; diferença máxima ${Math.max(...blackEdgeErrors)}/255`);
  studio.renderer.setPixelRatio(previousRatio);
  studio.renderer.setSize(previousSize.x, previousSize.y, false);
  studio.setRotation(0);

  // Coloured ink close to black must not be mistaken for a neutral background.
  const darkInk = new Image();
  darkInk.src = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1000"><path fill="#280808" d="M0 0h1200v1000H0z"/><path fill="#081028" d="M1200 0h1200v1000H1200z"/></svg>');
  await darkInk.decode();
  studio.setArtwork(darkInk, settings);
  studio.renderer.render(studio.scene, studio.camera);
  const darkColors = [sample(0, 1.25), sample(1, 1.25)];
  check('Vermelho e azul escuros mantêm suas cores', darkColors.every((rgb, i) =>
    rgb.every((channel, c) => Math.abs(channel - [[40, 8, 8], [8, 16, 40]][i][c]) <= 5)),
    `RGB ${JSON.stringify(darkColors)}`);

  const transparentImage = new Image();
  transparentImage.src = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2400" height="1000"><path fill="#df1a26" d="M0 334h1200v333H0z"/><path fill="#2255dd" d="M1200 334h1200v333H1200z"/></svg>');
  await transparentImage.decode();
  studio.setArtwork(transparentImage, settings);
  studio.renderer.render(studio.scene, studio.camera);
  const transparentArea = sample(0, 1.95);
  const redInk = sample(0, 1.25);
  check('Transparência revela a cerâmica preta', transparentArea.every(channel => channel < 110) &&
    redInk.every((channel, c) => Math.abs(channel - targets[0].colors[0][c]) <= 5),
    `área transparente RGB ${transparentArea}; tinta vermelha RGB ${redInk}`);

  studio.setArtwork(whiteImage, settings);
  studio.renderer.render(studio.scene, studio.camera);
  const whiteInk = sample(0, 1.25);
  check('Tinta branca aparece na caneca preta', whiteInk.every(channel => channel >= 245), `RGB ${whiteInk}`);

  studio.clearArtwork();
  studio.renderer.render(studio.scene, studio.camera);
  const emptyBlack = sample(0, 1.25);
  const blackPrint = new Image();
  blackPrint.src = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="924"><path fill="black" d="M0 0h2000v924H0z"/></svg>');
  await blackPrint.decode();
  studio.setArtwork(blackPrint, settings);
  studio.renderer.render(studio.scene, studio.camera);
  const blackPNG = await studio.exportPNG(1080, 1);
  const blackURL = URL.createObjectURL(blackPNG);
  exported.src = blackURL;
  await exported.decode();
  exportCtx.drawImage(exported, 0, 0);
  const blackPoint = new Vector3(studio.mugs[0].position.x, 1.25, 1).project(studio.camera);
  const blackPNGColor = Array.from(exportCtx.getImageData(Math.round((blackPoint.x / 2 + 0.5) * 1080),
    Math.round((0.5 - blackPoint.y / 2) * 1080), 1, 1).data.subarray(0, 3));
  check('PNG camufla o fundo preto com a mesma cerâmica da prévia', emptyBlack.every(channel => channel < 110) &&
    blackPNGColor.every((channel, c) => Math.abs(channel - emptyBlack[c]) <= 5),
    `prévia RGB ${emptyBlack}; PNG RGB ${blackPNGColor}`);
  URL.revokeObjectURL(blackURL);

  studio.clearArtwork();
  studio.setMugColor('white');
  studio.renderer.render(studio.scene, studio.camera);
  const emptyWhite = sample(0, 1.25);
  check('Remover arte deixa a caneca branca vazia', emptyWhite.every(channel => channel > 210), `RGB ${emptyWhite}`);
  studio.setArtwork(image, settings);
  const previewPath = new URLSearchParams(location.search).get('preview');
  if (previewPath && /^fixtures\/[\w.-]+$/.test(previewPath)) {
    const previewImage = new Image();
    previewImage.src = previewPath;
    await previewImage.decode();
    if (new URLSearchParams(location.search).get('mug') === 'black') studio.setMugColor('black');
    studio.setArtwork(previewImage, settings);
    studio.camera.position.set(0, 1.65, 11);
    studio.controls.update();
  }
  const failed = checks.filter(item => !item.passed);
  result.textContent = `${checks.length - failed.length}/${checks.length} verificações passaram`;
  result.dataset.passed = String(failed.length === 0);
  if (failed.length) result.style.color = '#a13f37';
}

run().catch(error => { result.textContent = `ERRO: ${String(error)}`; result.dataset.passed = 'false'; });
