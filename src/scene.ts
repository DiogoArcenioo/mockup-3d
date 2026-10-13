import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { paintArtwork, type ArtworkSettings, MUG_HEIGHT, TEXTURE_WIDTH, TEXTURE_HEIGHT } from './artwork';
import { createPrintMaterial } from './print-material';
import { getMugPoses, type ViewPreset } from './mug-layout';
import { MUG_COLORS, type MugColor } from './mug-colors';

export type { ViewPreset } from './mug-layout';
export type { MugColor } from './mug-colors';
export type BackgroundPreset = 'studio' | 'sand' | 'sage' | 'transparent';
export const BACKGROUNDS: Record<BackgroundPreset, string | null> = {
  studio: '#eeefed', sand: '#e9e1d5', sage: '#dce5de', transparent: null,
};

class HandleCurve extends THREE.Curve<THREE.Vector3> {
  constructor() { super(); }
  getPoint(t: number, target = new THREE.Vector3()) {
    const angle = Math.PI / 2 - t * Math.PI;
    // Keep the tube outside the inner wall, preserving the handle's outer extent.
    return target.set(1.05 + 0.58 * Math.cos(angle), 1.29 + 0.83 * Math.sin(angle), 0);
  }
}

export class MockupScene {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera();
  readonly controls: OrbitControls;
  readonly mugs: THREE.Group[] = [];
  private floor: THREE.Mesh;
  private textureCanvas = document.createElement('canvas');
  private texture: THREE.CanvasTexture;
  private printMaterial: ReturnType<typeof createPrintMaterial>;
  private ceramic: THREE.MeshPhysicalMaterial;
  private observer: ResizeObserver;
  private frame = 0;
  private dirty = true;
  private disposed = false;
  private view: ViewPreset = 'duo';
  private background: BackgroundPreset = 'studio';
  private zoom = 1;
  private rotation = 0;
  private contactShadows: THREE.Mesh[] = [];
  private height = 5.5;
  private onInteraction?: () => void;

  constructor(private container: HTMLElement, onInteraction?: () => void) {
    this.onInteraction = onInteraction;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.92;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.VSMShadowMap;
    this.renderer.domElement.setAttribute('aria-label', 'Mockup de caneca em 3D. Arraste para girar; use a roda do mouse para aproximar.');
    this.renderer.domElement.setAttribute('role', 'img');
    this.container.append(this.renderer.domElement);

    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = environment.texture;
    room.dispose();
    pmrem.dispose();

    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xd8d6d0, 0.85));
    const key = new THREE.DirectionalLight(0xfffaf3, 2.2);
    key.position.set(-3.5, 7, 5);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -7;
    key.shadow.camera.right = 7;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.camera.near = 0.1;
    key.shadow.camera.far = 20;
    key.shadow.normalBias = 0.025;
    key.shadow.bias = -0.00015;
    key.shadow.radius = 6;
    key.shadow.blurSamples = 12;
    this.scene.add(key);
    const fill = new THREE.DirectionalLight(0xf4f7ff, 0.75);
    fill.position.set(4, 4, -3);
    this.scene.add(fill);

    this.textureCanvas.width = TEXTURE_WIDTH;
    this.textureCanvas.height = TEXTURE_HEIGHT;
    this.texture = new THREE.CanvasTexture(this.textureCanvas);
    // Preserve premultiplied display colours for the custom print shader.
    this.texture.colorSpace = THREE.NoColorSpace;
    this.texture.premultiplyAlpha = true;
    this.texture.wrapS = THREE.RepeatWrapping;
    this.texture.anisotropy = Math.min(this.renderer.capabilities.getMaxAnisotropy(), 8);
    this.printMaterial = createPrintMaterial(this.texture);
    this.ceramic = new THREE.MeshPhysicalMaterial({
      color: 0xffffff, roughness: 0.2, metalness: 0,
      clearcoat: 0.8, clearcoatRoughness: 0.16, envMapIntensity: 0.65,
    });
    for (let i = 0; i < 2; i++) {
      const mug = this.createMug(this.ceramic);
      this.mugs.push(mug);
      this.scene.add(mug);
      const shadow = this.createContactShadow();
      this.contactShadows.push(shadow);
      this.scene.add(shadow);
    }
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      new THREE.ShadowMaterial({ color: 0x4f4c44, opacity: 0.065 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.005;
    this.floor.receiveShadow = true;
    this.scene.add(this.floor);

    this.camera.position.set(0, 4.5, 11);
    this.camera.near = 0.1;
    this.camera.far = 100;
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 1.24, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.12;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = Math.PI * 0.2;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minZoom = 0.65;
    this.controls.maxZoom = 2.1;
    this.controls.addEventListener('change', () => { this.dirty = true; });
    this.controls.addEventListener('start', () => { this.onInteraction?.(); });
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(this.container);
    this.setBackground('studio');
    this.setView('duo');
    this.resize();
    this.animate();
  }

  private createMug(ceramic: THREE.MeshPhysicalMaterial) {
    const mug = new THREE.Group();
    // Separate outer and inner walls: artwork cannot bleed into the hollow interior.
    const outerProfile = [
      [0.84, 0.04], [0.92, 0.04], [0.965, 0.06], [0.987, 0.1],
      [0.996, 0.15], [1, 0.23], [1, 2.35], [0.998, 2.4], [0.99, 2.44],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const outer = new THREE.LatheGeometry(outerProfile, 192, Math.PI / 2);
    const uv = outer.getAttribute('uv');
    const position = outer.getAttribute('position');
    for (let i = 0; i < uv.count; i++) uv.setY(i, position.getY(i) / MUG_HEIGHT);
    const body = new THREE.Mesh(outer, this.printMaterial);
    body.castShadow = true;
    body.receiveShadow = true;
    mug.add(body);

    const innerProfile = [
      [0.99, 2.44], [0.977, 2.465], [0.956, 2.48], [0.933, 2.475],
      [0.91, 2.455], [0.901, 2.425], [0.9, 2.36], [0.9, 0.27],
      [0.888, 0.22], [0.86, 0.19], [0.8, 0.18], [0, 0.18],
    ].map(([x, y]) => new THREE.Vector2(x, y));
    const inner = new THREE.Mesh(new THREE.LatheGeometry(innerProfile, 192, Math.PI / 2), ceramic);
    inner.castShadow = true;
    inner.receiveShadow = true;
    mug.add(inner);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.925, 0.88, 0.06, 128), ceramic);
    base.position.y = 0.045;
    base.castShadow = true;
    mug.add(base);
    const handle = new THREE.Mesh(new THREE.TubeGeometry(new HandleCurve(), 96, 0.135, 24, false), ceramic);
    handle.castShadow = true;
    handle.receiveShadow = true;
    mug.add(handle);
    for (const y of [0.46, 2.12]) {
      const joint = new THREE.Mesh(new THREE.SphereGeometry(0.16, 24, 16), ceramic);
      // Embed only in the outer ceramic wall (inner radius 0.9), closing the tube ends.
      joint.position.set(1.025, y, 0);
      joint.scale.set(0.625, 1.06, 0.92);
      joint.castShadow = true;
      mug.add(joint);
    }
    return mug;
  }

  private createContactShadow() {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(128, 128, 25, 128, 128, 124);
    gradient.addColorStop(0, 'rgba(30, 26, 23, .24)');
    gradient.addColorStop(0.55, 'rgba(30, 26, 23, .12)');
    gradient.addColorStop(1, 'rgba(30, 26, 23, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 256, 256);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 3.3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false }));
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.001;
    return shadow;
  }

  setArtwork(image: HTMLImageElement, settings: ArtworkSettings) {
    paintArtwork(this.textureCanvas, image, image.naturalWidth, image.naturalHeight, settings);
    this.texture.needsUpdate = true;
    this.dirty = true;
  }

  clearArtwork() {
    this.textureCanvas.getContext('2d')!.clearRect(0, 0, TEXTURE_WIDTH, TEXTURE_HEIGHT);
    this.texture.needsUpdate = true;
    this.dirty = true;
  }

  setMugColor(color: MugColor) {
    this.ceramic.color.set(MUG_COLORS[color]);
    this.printMaterial.setMugColor(color);
    this.dirty = true;
  }

  setView(view: ViewPreset) {
    this.view = view;
    this.rotation = 0;
    this.zoom = 1;
    getMugPoses(view).forEach((pose, i) => {
      const mug = this.mugs[i];
      mug.position.set(...pose.position);
      mug.rotation.y = pose.rotationY;
      mug.scale.setScalar(pose.scale);
      mug.visible = pose.visible;
    });
    if (view === 'duo') {
      this.height = 4.8;
      this.camera.position.set(0, 3.85, 11);
      this.controls.target.set(0, 1.24, 0);
    } else {
      this.height = view === 'detail' ? 3.6 : 4.25;
      this.camera.position.set(0, view === 'detail' ? 5.8 : 4.4, 11);
      this.controls.target.set(0, 1.3, 0);
    }
    for (let i = 0; i < this.contactShadows.length; i++) {
      this.contactShadows[i].position.x = this.mugs[i].position.x;
      this.contactShadows[i].position.z = this.mugs[i].position.z;
      this.contactShadows[i].visible = this.mugs[i].visible && this.background !== 'transparent';
    }
    this.camera.zoom = 1;
    this.resize();
    this.controls.update();
    this.dirty = true;
  }

  setBackground(background: BackgroundPreset) {
    this.background = background;
    const color = BACKGROUNDS[background];
    this.scene.background = color ? new THREE.Color(color) : null;
    this.floor.visible = color !== null;
    this.contactShadows.forEach((shadow, i) => { shadow.visible = color !== null && this.mugs[i].visible; });
    this.dirty = true;
  }

  setRotation(degrees: number) {
    getMugPoses(this.view, degrees).forEach((pose, i) => {
      this.mugs[i].rotation.y = pose.rotationY;
      this.mugs[i].position.set(...pose.position);
      this.contactShadows[i].position.x = pose.position[0];
      this.contactShadows[i].position.z = pose.position[2];
    });
    this.rotation = degrees;
    this.dirty = true;
  }

  setZoom(percent: number) {
    this.zoom = percent / 100;
    this.camera.zoom = this.zoom;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  resetCamera() {
    const rotation = this.rotation;
    const zoom = this.zoom;
    this.setView(this.view);
    this.setRotation(rotation);
    this.setZoom(zoom * 100);
  }

  private resize() {
    const { width, height } = this.container.getBoundingClientRect();
    if (!width || !height) return;
    this.renderer.setSize(width, height, false);
    this.updateFrustum(width / height);
    this.dirty = true;
  }

  private updateFrustum(aspect: number) {
    // Narrow viewports need extra vertical room to keep both handles in frame.
    const height = Math.max(this.height, (this.view === 'duo' ? 5.95 : 3.5) / aspect);
    this.camera.left = -height * aspect / 2;
    this.camera.right = height * aspect / 2;
    this.camera.top = height / 2;
    this.camera.bottom = -height / 2;
    this.camera.updateProjectionMatrix();
  }

  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    this.controls.update();
    if (this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.dirty = false;
    }
  };

  async exportPNG(size: number, aspect: number): Promise<Blob> {
    const previousSize = this.renderer.getSize(new THREE.Vector2());
    const previousRatio = this.renderer.getPixelRatio();
    const width = aspect >= 1 ? size : Math.round(size * aspect);
    const height = aspect >= 1 ? Math.round(size / aspect) : size;
    const maxSize = Math.min(this.renderer.capabilities.maxTextureSize, this.renderer.getContext().getParameter(this.renderer.getContext().MAX_RENDERBUFFER_SIZE));
    if (width > maxSize || height > maxSize) throw new Error('Seu dispositivo não suporta essa resolução. Escolha 1080 px.');
    try {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(width, height, false);
      this.updateFrustum(aspect);
      this.renderer.render(this.scene, this.camera);
      return await new Promise<Blob>((resolve, reject) => {
        this.renderer.domElement.toBlob(blob => blob ? resolve(blob) : reject(new Error('Não foi possível gerar a imagem.')), 'image/png');
      });
    } finally {
      this.renderer.setPixelRatio(previousRatio);
      this.renderer.setSize(previousSize.x, previousSize.y, false);
      this.updateFrustum(previousSize.x / previousSize.y);
      this.dirty = true;
    }
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    this.scene.traverse(object => {
      if (object instanceof THREE.Mesh) {
        geometries.add(object.geometry);
        for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
      }
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    this.texture.dispose();
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
