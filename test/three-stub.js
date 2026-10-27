/* THREE.js tiruan KHUSUS TES (tanpa WebGL): hanya menyimpan transformasi/visibilitas supaya logika game bisa diuji di browser headless. */
(function () {
  class V { constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
    set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; } setScalar(v) { this.x = this.y = this.z = v; return this; }
    copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; return this; } fromBufferAttribute() { return this; } applyMatrix4() { return this; } applyMatrix3() { return this; } normalize() { return this; } }
  class Col { constructor(h) { this.h = h || 0; } setHex(h) { this.h = h; return this; } lerp() { return this; } copy(o) { this.h = o.h; return this; } }
  class Obj {
    constructor() { this.position = new V(); this.rotation = new V(); this.scale = new V(1, 1, 1); this.visible = true; this.children = []; this.userData = {}; this.matrixWorld = {}; this.parent = null; }
    add(c) { this.children.push(c); c.parent = this; return this; } remove(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); return this; }
    updateMatrixWorld() { } lookAt() { } updateProjectionMatrix() { }
  }
  class Tex { constructor(c) { this.image = c; } dispose() { } }
  class Mat { constructor(o) { Object.assign(this, { opacity: 1 }, o || {}); this.color = new Col(o && o.color); } dispose() { } }
  class Geo { constructor() { this.attributes = { position: { count: 0 }, normal: { count: 0 } }; this.index = { count: 0 }; } rotateX() { return this; } setAttribute() { } setIndex() { } dispose() { } }
  class Mesh extends Obj { constructor(g, m) { super(); this.geometry = g; this.material = m; } }
  class Sprite extends Obj { constructor(m) { super(); this.material = m; } }
  class Scene extends Obj { constructor() { super(); this.background = new Col(); this.fog = null; } }
  class Cam extends Obj { constructor() { super(); this.aspect = 1; } }
  class Light extends Obj { constructor() { super(); this.shadow = { mapSize: new V(), camera: {} }; } }
  class Renderer { constructor() { this.shadowMap = {}; } setPixelRatio() { } setSize() { } render() { } }
  class M3 { getNormalMatrix() { return this; } }
  const named = { Vector3: V, Matrix3: M3, Color: Col, Fog: class { constructor(c) { this.color = new Col(c); } }, Mesh, Sprite, Group: Obj, Scene,
    PerspectiveCamera: Cam, HemisphereLight: Light, DirectionalLight: Light, WebGLRenderer: Renderer, CanvasTexture: Tex };
  window.THREE = new Proxy({}, { get(_, k) {
    if (k in named) return named[k];
    if (/Geometry$/.test(String(k))) return Geo;
    if (/Material$/.test(String(k))) return Mat;
    if (/BufferAttribute$/.test(String(k))) return class { };
    return 2;   // konstanta (DoubleSide, PCFSoftShadowMap, ...)
  } });
})();
