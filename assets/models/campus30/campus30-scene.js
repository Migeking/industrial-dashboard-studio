/* Campus 30: original procedural architecture and landscape, Three.js r128.
 * All geometry, surface textures and reflection maps are generated locally.
 * Units are conceptual metres; this is not a surveyed campus model. */
(function () {
  'use strict';
  window.Campus30 = {
    create(renderer, scene, root) {
      const T = THREE;
      let seed = 30022;
      const random = () => { seed = (1664525 * seed + 1013904223) >>> 0; return seed / 4294967296; };
      const architecture = new T.Group(), landscape = new T.Group();
      const network = new T.Group(), lifts = new T.Group(), context = new T.Group();
      root.add(architecture, landscape, network, lifts, context);
      network.visible = false; lifts.visible = false;
      const batches = new Map();
      const cube = new T.BoxGeometry(1, 1, 1);
      const cylinder = new T.CylinderGeometry(1, 1, 1, 16);
      const leaf = new T.IcosahedronGeometry(1, 2);
      const ball = new T.SphereGeometry(1, 12, 8);
      const matrix = new T.Matrix4(), quaternion = new T.Quaternion();
      const euler = new T.Euler(), scale = new T.Vector3(), position = new T.Vector3();
      function instance(geo, mat, x, y, z, sx, sy, sz, ry = 0, parent = architecture, rx = 0) {
        const key = parent.uuid + geo.uuid + mat.uuid;
        if (!batches.has(key)) batches.set(key, { geo, mat, parent, transforms: [] });
        position.set(x, y, z); scale.set(sx, sy, sz); euler.set(rx, ry, 0);
        quaternion.setFromEuler(euler); matrix.compose(position, quaternion, scale);
        batches.get(key).transforms.push(matrix.clone());
      }
      const box = (m, x, y, z, w, h, d, r = 0, p = architecture) => instance(cube, m, x, y, z, w, h, d, r, p);
      const cyl = (m, x, y, z, r, h, p = architecture) => instance(cylinder, m, x, y, z, r, h, r, 0, p);
      function texture(kind) {
        const c = document.createElement('canvas'); c.width = c.height = 512;
        const ctx = c.getContext('2d');
        const colors = { stone: [170, 174, 169], asphalt: [58, 64, 68], grass: [75, 99, 64], roof: [103, 116, 117], wood: [120, 91, 64] };
        const base = colors[kind]; const pixels = ctx.createImageData(512, 512);
        for (let i = 0; i < pixels.data.length; i += 4) {
          const n = (random() - .5) * (kind === 'grass' ? 48 : 24);
          for (let j = 0; j < 3; j++) pixels.data[i + j] = base[j] + n;
          pixels.data[i + 3] = 255;
        }
        ctx.putImageData(pixels, 0, 0);
        if (kind === 'stone' || kind === 'roof') {
          ctx.strokeStyle = kind === 'roof' ? '#657373' : '#929d9b'; ctx.lineWidth = 2;
          for (let y = 0; y < 512; y += 64) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(512, y); ctx.stroke();
            for (let x = (y % 128 ? 32 : 0); x < 512; x += 128) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 64); ctx.stroke(); }
          }
        }
        if (kind === 'wood') {
          ctx.strokeStyle = 'rgba(37,28,22,.25)'; ctx.lineWidth = 1;
          for (let y = 0; y < 512; y += 7) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(180, y + 7, 330, y - 8, 512, y); ctx.stroke(); }
        }
        const tex = new T.CanvasTexture(c); tex.wrapS = tex.wrapT = T.RepeatWrapping;
        tex.repeat.set(kind === 'asphalt' ? 12 : 4, kind === 'asphalt' ? 12 : 4);
        tex.encoding = T.sRGBEncoding; tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        return tex;
      }
      const material = (color, roughness = .7, metalness = 0, extra = {}) => new T.MeshStandardMaterial({ color: new T.Color(color).convertSRGBToLinear(), roughness, metalness, ...extra });
      const m = {
        stone: material(0xc9cdcc, .85, 0, { map: texture('stone') }),
        concrete: material(0xc5c7c2, .88), white: material(0xdbe0dc, .52, .15),
        asphalt: material(0x9a9fa3, .92, 0, { map: texture('asphalt') }),
        grass: material(0xc3c9b1, 1, 0, { map: texture('grass') }),
        soil: material(0x48493c, 1), wood: material(0xc8bb9e, .75, 0, { map: texture('wood') }),
        steel: material(0x6e7c82, .35, .8), dark: material(0x293e47, .48, .4),
        bronze: material(0x88785f, .38, .7), roof: material(0xbfc7c4, .83, .1, { map: texture('roof') }),
        glass: material(0x507a87, .19, .45, { envMapIntensity: .6 }),
        glassDark: material(0x27434c, .23, .5, { envMapIntensity: .55 }),
        glassLight: material(0x829fa5, .18, .4, { envMapIntensity: .6 }),
        interior: new T.MeshBasicMaterial({ color: 0x9d9985 }),
        solar: material(0x192f43, .25, .65), tire: material(0x161e22, .95),
        whiteLine: material(0xd8d7b9, .9), yellow: material(0xcbb260, .8),
        bark: material(0x695947, 1), foliage: material(0x476950, 1), foliageLight: material(0x627f55, 1), foliageDark: material(0x314c3a, 1),
        warm: new T.MeshBasicMaterial({ color: 0xcbbca0 }),
        cyan: material(0x469ab0, .3, .3, { emissive: 0x2992b2, emissiveIntensity: .65 }),
        supply: material(0x258fbd, .4, .45, { emissive: 0x116c98, emissiveIntensity: .35 }),
        return: material(0xb78d5d, .4, .45, { emissive: 0x87541b, emissiveIntensity: .35 })
      };
      const readyTasks = [], textureLoader = new T.TextureLoader();
      if (window.Campus30Assets) {
        [['asphalt_02', m.asphalt, 36], ['concrete_floor_painted', m.stone, 6], ['aerial_grass_rock', m.grass, 2]].forEach(([asset, mat, repeat]) => {
          const maps = Campus30Assets.surfaces[asset];
          [['diff', 'map'], ['normal', 'normalMap'], ['rough', 'roughnessMap']].forEach(([key, slot]) => {
            readyTasks.push(new Promise((resolve, reject) => textureLoader.load(maps[key], tex => {
              tex.wrapS = tex.wrapT = T.RepeatWrapping; tex.repeat.set(repeat, repeat);
              tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
              if (key === 'diff') tex.encoding = T.sRGBEncoding;
              if (key === 'diff' && asset === 'concrete_floor_painted') {
                const c = document.createElement('canvas'); c.width = c.height = 1024;
                const ctx = c.getContext('2d'); ctx.fillStyle = '#a9ada6'; ctx.fillRect(0, 0, 1024, 1024);
                ctx.globalAlpha = .18; ctx.filter = 'grayscale(1)'; ctx.drawImage(tex.image, 0, 0, 1024, 1024); ctx.globalAlpha = 1; ctx.filter = 'none';
                ctx.strokeStyle = '#909a96'; ctx.lineWidth = 2;
                for (let y = 0; y < 1024; y += 128) {
                  ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(1024, y); ctx.stroke();
                  for (let x = y % 256 ? 128 : 0; x < 1024; x += 256) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 128); ctx.stroke(); }
                }
                tex.image = c; tex.needsUpdate = true;
              }
              mat[slot] = tex; mat.needsUpdate = true; resolve();
            }, undefined, reject)));
          });
          mat.color.setHex(asset === 'asphalt_02' ? 0x8a9399 : asset === 'aerial_grass_rock' ? 0x78926b : 0xd2cfc3).convertSRGBToLinear();
          mat.normalScale = new T.Vector2(.3, .3);
        });
      }
      // A local six-face reflection environment: sky, warm horizon and distant blocks.
      const faces = [];
      for (let f = 0; f < 6; f++) {
        const c = document.createElement('canvas'); c.width = c.height = 256;
        const ctx = c.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, '#829ea9'); g.addColorStop(.45, '#c2d2d1'); g.addColorStop(.62, '#e2d4b4'); g.addColorStop(1, '#586565');
        ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
        if (f !== 2) for (let i = 0; i < 18; i++) {
          const x = i * 16, h = 12 + random() * 40;
          ctx.fillStyle = i % 3 ? '#74858a' : '#a6b8bc'; ctx.fillRect(x, 164 - h, 13, h + 80);
        }
        if (f === 0) { ctx.fillStyle = '#fff2d4'; ctx.fillRect(120, 90, 30, 24); }
        faces.push(c);
      }
      const env = new T.CubeTexture(faces); env.encoding = T.sRGBEncoding; env.needsUpdate = true;
      const pmrem = new T.PMREMGenerator(renderer); pmrem.compileCubemapShader();
      const reflection = pmrem.fromCubemap(env); scene.environment = reflection.texture; pmrem.dispose(); env.dispose();
      if (window.Campus30Assets) readyTasks.push(new Promise((resolve, reject) => {
        new T.RGBELoader().setDataType(T.UnsignedByteType).load('data:application/octet-stream;base64,' + Campus30Assets.environment, hdr => {
          const generator = new T.PMREMGenerator(renderer);
          const map = generator.fromEquirectangular(hdr);
          scene.environment = map.texture;
          reflection.dispose(); hdr.dispose(); generator.dispose(); resolve();
        }, undefined, reject);
      }));
      // Ground, separated carriageways, kerbs and raised pedestrian forecourts.
      box(m.stone, 0, -.9, 0, 178, 1.8, 164, 0, landscape);
      box(m.asphalt, 0, .04, 0, 174, .12, 160, 0, landscape);
      box(m.stone, 0, .16, 0, 139, .28, 125, 0, landscape);
      for (const z of [-72, 72]) {
        box(m.concrete, 0, .22, z + (z > 0 ? 6 : -6), 174, .42, 3, 0, landscape);
        for (let x = -77; x <= 77; x += 7) box(m.whiteLine, x, .12, z, 3.2, .025, .18, 0, landscape);
      }
      for (const x of [-78, 78]) {
        box(m.concrete, x + (x > 0 ? 6 : -6), .22, 0, 3, .42, 145, 0, landscape);
        for (let z = -61; z <= 61; z += 7) box(m.whiteLine, x, .12, z, .18, .025, 3.2, 0, landscape);
      }
      // Service street between manufacturing and energy centre; never crosses a building.
      box(m.asphalt, -47, .32, 7, 46, .06, 7, 0, landscape);
      for (let x = -66; x < -28; x += 6) box(m.whiteLine, x, .36, 7, 2.8, .02, .12, 0, landscape);
      for (const x of [-22, 23]) box(m.grass, x, .4, 33, 4, .25, 48, 0, landscape);
      box(m.stone, 0, .38, 30, 39, .2, 49, 0, landscape);
      for (let z = 11; z < 54; z += 3) box(m.concrete, 0, .5, z, 35, .025, .06, 0, landscape);
      // Street crossings, pedestrian refuge islands, boundaries and drains.
      for (const z of [-72, 72]) for (let x = -8; x <= 8; x += 2.2) box(m.whiteLine, x, .13, z, 1.3, .025, 10, 0, landscape);
      for (let z = -70; z < 70; z += 4) {
        box(m.steel, -69.8, .34, z, .28, .04, 2.5, 0, landscape);
        box(m.steel, 69.8, .34, z, .28, .04, 2.5, 0, landscape);
      }
      function sign(text, x, y, z, width, height, ry = 0, color = '#e7e7d7', bg = '#233b42', parent = architecture) {
        const c = document.createElement('canvas'); c.width = 1024; c.height = 128;
        const ctx = c.getContext('2d'); ctx.fillStyle = bg; ctx.fillRect(0, 0, 1024, 128);
        ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.font = '500 58px "Microsoft YaHei", sans-serif'; ctx.fillText(text, 512, 66, 980);
        const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 8;
        const signMat = parent === network ? new T.MeshBasicMaterial({ map: tex, side: T.DoubleSide, depthTest: false }) : new T.MeshStandardMaterial({ map: tex, roughness: .65, emissive: 0x9caa9c, emissiveIntensity: .12, side: T.DoubleSide });
        const mesh = new T.Mesh(new T.PlaneGeometry(width, height), signMat);
        mesh.position.set(x, y, z); mesh.rotation.y = ry; parent.add(mesh); return mesh;
      }
      function roofDetails(cx, cz, w, d, h) {
        box(m.roof, cx, h + .25, cz, w, .5, d);
        for (const z of [-d / 2, d / 2]) box(m.white, cx, h + .8, cz + z, w + .4, 1, .35);
        for (const x of [-w / 2, w / 2]) box(m.white, cx + x, h + .8, cz, .35, 1, d);
        box(m.dark, cx + w * .12, h + 1.3, cz - d * .16, w * .4, 2.1, d * .4);
        for (let x = -w * .3; x < w * .3; x += 2.8) {
          box(m.steel, cx + x, h + .8, cz + d * .28, 2.1, 1, 2.4);
          cyl(m.dark, cx + x, h + 1.36, cz + d * .28, .75, .12);
        }
      }
      function tower(cx, cz, w, d, floors) {
        const floorH = 2.35, base = 3.8, h = floors * floorH + base;
        box(m.glassDark, cx, h / 2, cz, w - .35, h, d - .35);
        for (let f = 0; f <= floors; f++) {
          const y = base + f * floorH;
          box(m.white, cx, y, cz, w + .45, .18, d + .45);
          if (f < floors) {
            for (const side of [-1, 1]) for (let x = -w / 2 + .9; x < w / 2; x += 1.8) {
              const glass = random() < .13 ? m.interior : (random() > .55 ? m.glass : m.glassLight);
              box(glass, cx + x, y + 1.2, cz + side * (d / 2 + .02), 1.64, 1.96, .07);
              box(m.steel, cx + x + .88, y + 1.2, cz + side * (d / 2 + .12), .08, 2.2, .15);
              if (f % 4 === 1 && x < 0) box(m.bronze, cx + x, y + 1.8, cz + side * (d / 2 + .25), 1.65, .1, .55);
            }
            for (const side of [-1, 1]) for (let z = -d / 2 + 1; z < d / 2; z += 1.9) {
              box(random() < .16 ? m.interior : m.glass, cx + side * (w / 2 + .02), y + 1.2, cz + z, .07, 1.96, 1.74);
              box(m.steel, cx + side * (w / 2 + .12), y + 1.2, cz + z + .9, .15, 2.2, .08);
            }
          }
        }
        for (const side of [-1, 1]) for (const zz of [-1, 1]) box(m.white, cx + side * w / 2, h / 2, cz + zz * d / 2, .35, h, .35);
        roofDetails(cx, cz, w, d, h);
        return h;
      }
      // A: two slender research towers, articulated podium, suspended glazed bridge.
      box(m.concrete, 1, .65, -9, 43, 1, 31);
      box(m.glassDark, 1, 2.4, -9, 40, 3.5, 28);
      for (let x = -18; x < 22; x += 2.5) box(m.bronze, x, 2.4, 5.2, .18, 3.8, .28);
      box(m.white, 1, 4.25, -9, 42, .45, 30);
      const hA = tower(-10, -10, 16, 18, 24), hA2 = tower(11, -10, 15, 18, 20);
      box(m.glassLight, .5, 39, -10, 11, 3.6, 7);
      for (const z of [-13.6, -6.4]) {
        box(m.white, .5, 37.2, z, 12, .4, .35); box(m.white, .5, 40.8, z, 12, .4, .35);
        for (let x = -5; x <= 6; x += 1.5) box(m.steel, x, 39, z, .1, 3.5, .1);
      }
      box(m.steel, 1, 4.5, 9, 18, .25, 8);
      for (const x of [-7, 9]) cyl(m.steel, x, 2.4, 11.8, .14, 4.3);
      for (let i = 0; i < 4; i++) box(m.concrete, 1, .3 + i * .13, 14.2 - i * .65, 20, .2, 1.2);
      sign('A  |  INNOVATION CENTRE', 1, 3.1, 5.31, 18, 1.3);
      // Roof antenna, maintenance rail and a restrained crown light.
      cyl(m.steel, -10, hA + 4, -10, .1, 6);
      box(m.warm, -10, hA + .91, -.73, 15.7, .12, .1);
      for (const [x, height, width] of [[-10, hA, 16], [11, hA2, 15]]) {
        for (const z of [-19.3, -.7]) box(m.warm, x, height + .9, z, width + .2, .12, .12);
        for (const side of [-1, 1]) box(m.warm, x + side * (width / 2 + .28), height + .9, -10, .12, .12, 18.6);
      }
      box(m.warm, 1, 4.34, 12.8, 17, .08, .1);
      // B: four-storey research/manufacturing block with sawtooth roof and loading apron.
      const bx = -48, bz = -29, bw = 37, bd = 30;
      box(m.concrete, bx, .7, bz, 42, 1, 36);
      box(m.white, bx, 7.9, bz, bw, 14.8, bd);
      for (let f = 0; f < 4; f++) {
        for (const z of [bz - bd / 2 - .03, bz + bd / 2 + .03]) {
          box(m.glass, bx, 2.8 + f * 3.5, z, bw - 1, 2.2, .12);
          for (let x = bx - bw / 2; x <= bx + bw / 2; x += 2.1) box(m.bronze, x, 7.8, z + .15, .18, 14.5, .45);
        }
        for (const x of [bx - bw / 2, bx + bw / 2]) box(m.glassLight, x, 2.8 + f * 3.5, bz, .14, 2.2, bd - 2);
      }
      roofDetails(bx, bz, bw, bd, 15.5);
      for (let x = bx - 14; x < bx + 16; x += 6) {
        box(m.dark, x, 16.4, bz, 4.2, 1.1, 23);
        instance(cube, m.glassLight, x, 17, bz, 4.3, .12, 23, 0, architecture, -.12);
        for (let z = bz - 10; z <= bz + 10; z += 2.7) box(m.steel, x, 17.05, z, 4.4, .12, .09);
      }
      for (let x = bx - 12; x <= bx + 12; x += 8) {
        box(m.dark, x, 2.1, bz + 15.15, 5.5, 3.1, .15);
        for (let y = 1; y <= 3.4; y += .35) box(m.steel, x, y, bz + 15.28, 5.5, .07, .07);
        box(m.steel, x, 4, bz + 16, 6.2, .18, 2.4);
        for (const dx of [-3, 3]) cyl(m.yellow, x + dx, 1, bz + 17, .13, 1.3);
      }
      sign('B  |  ADVANCED MANUFACTURING', bx, 13.1, bz + 15.4, 26, 1.8);
      // C: exhibition centre, full glass atrium and radial structural ribs.
      const cx = 45, cz = 27;
      box(m.concrete, cx, .7, cz, 38, 1, 32);
      box(m.glassDark, cx, 8, cz, 31, 15, 24);
      for (let f = 0; f <= 6; f++) box(m.white, cx, 1 + f * 2.4, cz, 32.2, .28, 25.2);
      for (let x = -15; x <= 15; x += 2.5) for (const z of [-12.2, 12.2]) {
        box(m.bronze, cx + x, 8.1, cz + z, .2, 15.2, .4);
        box(m.glassLight, cx + x + 1.1, 8.1, cz + z, 2, 14.2, .07);
      }
      roofDetails(cx, cz, 31, 24, 15.6);
      const dome = new T.Mesh(new T.SphereGeometry(9.2, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), m.glass);
      dome.position.set(cx, 16.2, cz); dome.scale.y = .58; architecture.add(dome);
      function line(points, mat, radius = .08, parent = architecture) {
        const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
        const mesh = new T.Mesh(new T.TubeGeometry(curve, points.length * 3, radius, 6, false), mat);
        mesh.castShadow = true; parent.add(mesh); return mesh;
      }
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const pts = [];
        for (let j = 0; j <= 12; j++) { const t = j / 12 * Math.PI / 2; pts.push([cx + Math.cos(a) * Math.cos(t) * 9.28, 16.25 + Math.sin(t) * 5.4, cz + Math.sin(a) * Math.cos(t) * 9.28]); }
        line(pts, m.white, .075);
      }
      for (const t of [.26, .52, .78, 1.04]) {
        const pts = [];
        for (let i = 0; i <= 48; i++) { const a = i / 48 * Math.PI * 2; pts.push([cx + Math.cos(a) * Math.cos(t) * 9.28, 16.25 + Math.sin(t) * 5.4, cz + Math.sin(a) * Math.cos(t) * 9.28]); }
        line(pts, m.steel, .045);
      }
      for (let i = 0; i < 6; i++) box(m.concrete, cx, .45 + i * .13, cz + 17 - i * .55, 25 - i * .6, .2, .9);
      box(m.steel, cx, 4.8, cz + 14, 21, .22, 5);
      sign('C  |  CAMPUS FORUM', cx, 3.4, cz + 12.3, 19, 1.5);
      // D: plant building, four cooling cells, external manifolds and service access.
      const dx = -47, dz = 39;
      box(m.concrete, dx, .65, dz, 36, 1, 31);
      box(m.white, dx, 5.7, dz, 30, 10, 24);
      box(m.dark, dx, 5.6, dz + 12.1, 28, 7.8, .12);
      for (let x = -13; x < 14; x += .75) box(m.steel, dx + x, 5.6, dz + 12.3, .3, 7.8, .38);
      for (let z = -10; z <= 10; z += .7) box(m.steel, dx + 15.2, 6, dz + z, .3, 7, .28);
      roofDetails(dx, dz, 30, 24, 11);
      const fans = [];
      for (const x of [-7, 7]) for (const z of [-5.5, 5.5]) {
        box(m.steel, dx + x, 13.1, dz + z, 9, 3.2, 8.4);
        for (let y = 12; y < 14.6; y += .35) box(m.dark, dx + x, y, dz + z + 4.25, 8.2, .12, .14);
        cyl(m.white, dx + x, 15.2, dz + z, 3.2, 1.2);
        cyl(m.dark, dx + x, 15.83, dz + z, 2.85, .1);
        const fan = new T.Group(); fan.position.set(dx + x, 15.95, dz + z);
        for (let i = 0; i < 5; i++) {
          const blade = new T.Mesh(new T.BoxGeometry(2.8, .09, .62), m.steel);
          const a = i * Math.PI * 2 / 5; blade.position.set(Math.cos(a) * 1.3, 0, Math.sin(a) * 1.3); blade.rotation.y = -a; fan.add(blade);
        }
        architecture.add(fan); fans.push(fan);
        cyl(m.steel, dx + x, 16.12, dz + z, .42, .3);
        for (let i = -2; i <= 2; i++) box(m.steel, dx + x + i * .8, 16.2, dz + z, .045, .06, Math.sqrt(9 - i * i * .64) * 2);
      }
      for (const offset of [-1.2, 1.2]) {
        line([[dx + 15.6, 2.8, dz + offset], [dx + 19, 2.8, dz + offset], [dx + 19, 12, dz + offset], [dx + 9, 12, dz + offset]], m.steel, .42);
        for (const y of [4, 8, 11]) cyl(m.bronze, dx + 19, y, dz + offset, .58, .18);
      }
      sign('D  |  CENTRAL ENERGY', dx, 9, dz + 12.55, 25, 1.3);
      // P: solar canopy, readable stalls, vehicles and an actual ramp opening.
      box(m.asphalt, 32, .5, -47, 52, .3, 29);
      for (let i = 0; i < 13; i++) {
        const x = 10 + i * 3.5;
        for (const z of [-54, -41]) {
          box(m.whiteLine, x, .67, z, .09, .02, 5.6);
          box(m.yellow, x + 1.6, .78, z - 2.1, 1.9, .16, .15);
        }
      }
      for (const z of [-54, -41]) {
        box(m.steel, 31, 4, z, 46, .18, 6.8);
        for (let x = 10; x <= 52; x += 10.5) cyl(m.steel, x, 2.25, z, .13, 3.6);
        for (let x = 9; x <= 53; x += 2.25) {
          box(m.solar, x, 4.18, z, 2.1, .12, 6.4);
          for (let j = -2; j <= 2; j++) box(m.glassLight, x, 4.25, z + j * 1.1, 2.08, .02, .025);
        }
      }
      box(m.dark, 61, .6, -42, 11, .4, 23);
      for (const x of [55.3, 66.7]) box(m.concrete, x, .9, -42, .5, 1.7, 24);
      for (let z = -52; z < -31; z += 2) box(m.yellow, 61, .83, z, 8, .02, .15);
      box(m.steel, 61, 3.3, -31, 12, .3, 2);
      sign('P  |  B1 / B2  ↓', 61, 2.2, -29.8, 9, 1.2);
      // Reusable physical cars: bevelled coachwork, sloping glazing, wheels and mirrors.
      function car(color, x, z, rotation, parent = landscape) {
        const g = new T.Group(); g.position.set(x, .44, z); g.rotation.y = rotation; parent.add(g);
        const paint = material(color, .22, .65);
        const shape = new T.Shape(); shape.moveTo(-.96, -.7); shape.lineTo(-.85, -.9); shape.lineTo(.85, -.9); shape.quadraticCurveTo(1, -.9, 1, -.65); shape.lineTo(1, .65); shape.quadraticCurveTo(.95, .9, .8, .9); shape.lineTo(-.8, .9); shape.quadraticCurveTo(-1, .9, -.96, .65); shape.closePath();
        const body = new T.Mesh(new T.ExtrudeGeometry(shape, { depth: 3.6, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: .1, bevelThickness: .12 }), paint);
        body.rotation.x = Math.PI / 2; body.scale.set(1, 2.2, .22); body.position.set(0, 1.15, 0); body.castShadow = true; g.add(body);
        const topGeo = new T.CylinderGeometry(1, 1, 1, 4, 1); topGeo.rotateY(Math.PI / 4);
        const top = new T.Mesh(topGeo, m.glassDark); top.scale.set(1.13, .68, 1.85); top.position.set(0, 1.25, -.18); top.castShadow = true; g.add(top);
        const roof = new T.Mesh(new T.BoxGeometry(1.4, .08, 1.55), paint); roof.position.set(0, 1.62, -.2); g.add(roof);
        for (const xx of [-1.01, 1.01]) for (const zz of [-1.3, 1.3]) {
          const wheel = new T.Mesh(new T.CylinderGeometry(.38, .38, .24, 16), m.tire); wheel.rotation.z = Math.PI / 2; wheel.position.set(xx, .4, zz); g.add(wheel);
          const hub = new T.Mesh(new T.CylinderGeometry(.22, .22, .26, 10), m.steel); hub.rotation.z = Math.PI / 2; hub.position.copy(wheel.position); g.add(hub);
        }
        for (const xx of [-.67, .67]) { const lamp = new T.Mesh(new T.BoxGeometry(.45, .1, .06), m.warm); lamp.position.set(xx, .85, 2.01); g.add(lamp); }
        return g;
      }
      // Static vehicles share their geometries/material batches after construction.
      const palette = [0xe0e1d9, 0x8a9a9e, 0x23475b, 0x74736c, 0xb9c6c7];
      for (let i = 0; i < 11; i++) car(palette[i % 5], 11.8 + i * 3.5, i % 2 ? -41 : -54, i % 2 ? 0 : Math.PI);
      const movingCars = [car(0xdbdad3, -78, 24, 0), car(0x446774, 78, -26, Math.PI), car(0x8d979d, 24, 72, Math.PI / 2)];
      // Planting beds, branching broadleaf trees, clipped hedges and groundcover.
      const leafCanvas = document.createElement('canvas'); leafCanvas.width = leafCanvas.height = 256;
      const brush = leafCanvas.getContext('2d');
      brush.strokeStyle = '#535b2b'; brush.lineWidth = 3;
      brush.beginPath(); brush.moveTo(128, 250); brush.lineTo(115, 42); brush.stroke();
      for (let i = 0; i < 65; i++) {
        const y = 25 + random() * 203, side = i % 2 ? -1 : 1;
        const x = 120 + side * (15 + random() * 75) * Math.sin(y / 256 * Math.PI);
        brush.strokeStyle = '#6d7136'; brush.lineWidth = 1.2;
        brush.beginPath(); brush.moveTo(120, y + 22); brush.lineTo(x, y); brush.stroke();
        brush.fillStyle = ['#62783d', '#7b9148', '#475f31', '#92a061'][i % 4];
        brush.beginPath(); brush.ellipse(x, y, 7 + random() * 7, 3 + random() * 4, side * -.6, 0, Math.PI * 2); brush.fill();
      }
      const leafTexture = new T.CanvasTexture(leafCanvas); leafTexture.encoding = T.sRGBEncoding;
      const leafy = new T.MeshStandardMaterial({ map: leafTexture, alphaTest: .45, roughness: .95, side: T.DoubleSide, color: new T.Color(0xa9b4a0).convertSRGBToLinear() });
      const leafPlane = new T.PlaneGeometry(1, 1);
      function tree(x, z, s = 1) {
        cyl(m.bark, x, 2.4 * s, z, .2 * s, 4.8 * s, landscape);
        for (let j = 0; j < 5; j++) {
          const a = j * 2.399;
          cyl(m.bark, x + Math.cos(a) * .6 * s, 4 * s, z + Math.sin(a) * .6 * s, .09 * s, 2.1 * s, landscape);
        }
        for (let j = 0; j < 110; j++) {
          const a = j * 2.399, latitude = Math.acos(random() * 2 - 1), r = (1 + random() * 1.4) * s;
          instance(leafPlane, leafy, x + Math.cos(a) * Math.sin(latitude) * r, 5.1 * s + Math.cos(latitude) * r * .8, z + Math.sin(a) * Math.sin(latitude) * r, 2.5 * s, 2.6 * s, 1, a, landscape, random() * Math.PI);
        }
      }
      function bed(x, z, w, d, trees = false) {
        box(m.concrete, x, .6, z, w, .65, d, 0, landscape);
        box(m.soil, x, .95, z, w - .4, .1, d - .4, 0, landscape);
        box(m.grass, x, 1, z, w - .6, .12, d - .6, 0, landscape);
        if (trees) for (let xx = x - w / 2 + 2.5; xx < x + w / 2 - 1; xx += 5) tree(xx, z, .8 + random() * .25);
        else for (let xx = x - w / 2 + 1; xx < x + w / 2; xx += 1.6) instance(leaf, m.foliageDark, xx, 1.3, z, 1, .65, Math.max(.4, d / 2 - .4), 0, landscape);
      }
      for (const x of [-68, 68]) for (let z = -56; z <= 56; z += 14) { bed(x, z, 3.2, 8); tree(x, z, .9 + random() * .25); }
      bed(-47, -53, 38, 4, true); bed(-47, 58, 39, 4, true);
      bed(44, 52, 40, 4, true); bed(1, -30, 39, 5, true);
      for (const x of [-22, 23]) for (const z of [17, 32, 47]) { bed(x, z, 3.8, 5); tree(x, z, .95); }
      for (const x of [-10, 12]) bed(x, 51, 10, 3);
      // Reflection pool, coping, stepping platforms and small aeration jets.
      box(m.concrete, 44, .48, -9, 31, .45, 22, 0, landscape);
      box(m.dark, 44, .72, -9, 29.7, .1, 20.7, 0, landscape);
      const waterMaterial = new T.ShaderMaterial({
        uniforms: { time: { value: 0 }, night: { value: 0 } },
        vertexShader: 'varying vec3 p; varying vec3 world; void main(){p=position; world=(modelMatrix*vec4(position,1.)).xyz; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: 'uniform float time; uniform float night; varying vec3 p; varying vec3 world; void main(){float r=sin(p.x*2.4+time*.7)*sin(p.y*3.8-time*.6);float s=pow(max(0.,sin((p.x+p.y)*1.8+time*.4)),18.);vec3 c=mix(vec3(.16,.32,.34),vec3(.40,.54,.53),r*.16+.45);c+=s*.08;c*=1.-night*.48; gl_FragColor=vec4(c,1.);}'
      });
      const water = new T.Mesh(new T.PlaneGeometry(29, 20), waterMaterial); water.rotation.x = -Math.PI / 2; water.position.set(44, .81, -9); landscape.add(water);
      for (const z of [-20.1, 2.1]) box(m.white, 44, .93, z, 31.3, .35, .6, 0, landscape);
      for (const x of [28.7, 59.3]) box(m.white, x, .93, -9, .6, .35, 22, 0, landscape);
      box(m.wood, 44, .96, 5, 33, .24, 4, 0, landscape);
      for (let x = 31; x < 59; x += 1.2) box(m.bronze, x, 1.1, 5, .04, .05, 4, 0, landscape);
      for (const x of [37, 44, 51]) {
        cyl(m.steel, x, .9, -9, .32, .2, landscape);
        instance(cylinder, new T.MeshBasicMaterial({ color: 0xa6c5c0, transparent: true, opacity: .45 }), x, 1.8, -9, .07, 1.8, .07, 0, landscape);
      }
      // Plaza furniture, bus shelter, pergola, waste sorting and camera poles.
      for (const x of [-17, 18]) for (const z of [21, 39]) {
        for (let j = 0; j < 4; j++) box(m.wood, x, 1, z + j * .24, 4, .14, .18, 0, landscape);
        for (const xx of [-1.5, 1.5]) box(m.dark, x + xx, .7, z + .35, .13, .65, 1.2, 0, landscape);
        box(m.dark, x + 2.8, .9, z, .65, 1.2, .65, 0, landscape);
      }
      for (let x = 30; x <= 58; x += 7) {
        for (const z of [6.7, 10.7]) box(m.bronze, x, 3.1, z, .16, 4.6, .16, 0, landscape);
      }
      for (let x = 30; x <= 58; x += 1) box(m.wood, x, 5.5, 8.7, .16, .25, 6, 0, landscape);
      for (const x of [-12, 14]) for (let z = 10; z <= 55; z += 7) { cyl(m.dark, x, .9, z, .13, 1.2, landscape); cyl(m.warm, x, 1.52, z, .15, .15, landscape); }
      const streetLights = [];
      for (const x of [-71.5, 71.5]) for (let z = -62; z <= 62; z += 16) {
        cyl(m.dark, x, 3.5, z, .09, 6.5, landscape);
        box(m.dark, x + (x < 0 ? -1 : 1), 6.75, z, 2.4, .14, .35, 0, landscape);
        const lamp = new T.Mesh(new T.BoxGeometry(1.5, .08, .32), m.warm); lamp.position.set(x + (x < 0 ? -1.3 : 1.3), 6.67, z); landscape.add(lamp); streetLights.push(lamp);
      }
      // Monument sign and entrance gate, independent of the B1 demo gate.
      box(m.concrete, 0, 1.7, 62, 23, 2.9, 1.2, 0, landscape);
      sign('FUTURE SCIENCE PARK  /  未来科技园', 0, 1.85, 62.65, 21, 1.6, 0, '#d6e0db', '#52615c', landscape);
      for (let x = -18; x <= 18; x += 3) cyl(m.steel, x, 1.1, 58, .12, 1.5, landscape);
      // Low-detail city context stays outside campus and below the focal architecture.
      const contextMat = material(0x637b88, .95);
      const contextCanvas = document.createElement('canvas'); contextCanvas.width = contextCanvas.height = 256;
      const cc = contextCanvas.getContext('2d'); cc.fillStyle = '#98a6a7'; cc.fillRect(0, 0, 256, 256);
      for (let y = 8; y < 256; y += 24) for (let x = 10; x < 256; x += 26) { cc.fillStyle = random() > .3 ? '#536a77' : '#8c9999'; cc.fillRect(x, y, 12, 13); }
      contextMat.map = new T.CanvasTexture(contextCanvas); contextMat.map.encoding = T.sRGBEncoding;
      box(material(0x4b6060, 1), 0, -1.85, 0, 1600, .15, 1600, 0, context);
      for (let i = 0; i < 30; i++) {
        const x = i < 15 ? -180 + i * 26 : (i % 2 ? -155 : 155);
        const z = i < 15 ? -135 - (i % 3) * 12 : -90 + (i - 15) * 20;
        const h = 9 + random() * 20;
        box(contextMat, x, h / 2 - 1, z, 12 + random() * 11, h, 14 + random() * 9, 0, context);
      }
      // Pedestrians are scaled to buildings and confined to paved paths.
      const clothes = [material(0x3c5664), material(0xaa9e84), material(0x344a45)];
      for (let i = 0; i < 32; i++) {
        const x = (random() - .5) * 27, z = 18 + random() * 35;
        cyl(clothes[i % 3], x, 1.35, z, .19, .72, landscape);
        instance(ball, m.wood, x, 1.92, z, .17, .19, .17, 0, landscape);
        for (const xx of [-.1, .1]) cyl(m.dark, x + xx, .78, z, .065, .55, landscape);
      }
      // Two explicit supply/return trunks with branches into A, B and C.
      const flowPaths = [];
      m.supply = new T.MeshBasicMaterial({ color: new T.Color(0x1675aa).convertSRGBToLinear(), toneMapped: false, depthTest: false, depthWrite: false });
      m.return = new T.MeshBasicMaterial({ color: new T.Color(0xc18a45).convertSRGBToLinear(), toneMapped: false, depthTest: false, depthWrite: false });
      for (const offset of [0, 1.6]) {
        const mat = offset === 0 ? m.supply : m.return;
        const paths = [
          [[-28, 2, 39 + offset], [-23, 2, 39 + offset], [-23, 2, 11 + offset], [1, 2, 11 + offset], [1, 4, 5]],
          [[-23, 2, 11 + offset], [-23, 2, -25 + offset], [-29, 2, -25 + offset]],
          [[1, 2, 11 + offset], [24, 2, 11 + offset], [24, 2, 27 + offset], [29, 2, 27 + offset]]
        ];
        paths.forEach(points => {
          line(points, mat, .46, network);
          const curve = new T.CatmullRomCurve3(points.map(p => new T.Vector3(...p)));
          for (let i = 0; i < 8; i++) {
            const bead = new T.Mesh(new T.SphereGeometry(.42, 8, 6), new T.MeshBasicMaterial({ color: offset ? 0xffd390 : 0xa3e1ff, depthTest: false, depthWrite: false }));
            network.add(bead); flowPaths.push({ bead, curve, phase: i / 8, reverse: !!offset });
          }
        });
      }
      sign('供水 7.0°C  →', -11, 4.3, 12, 13, 1.3, 0, '#b8eaff', '#145372', network);
      sign('←  回水 12.2°C', -11, 2.7, 13.6, 13, 1.3, 0, '#f8d5a4', '#665035', network);
      network.traverse(obj => { if (obj.isMesh) obj.renderOrder = 12; });
      // Transparent diagnostic lift shafts are shown only in the lift layer.
      const cabinMat = new T.MeshBasicMaterial({ color: new T.Color(0x3ca28a).convertSRGBToLinear(), toneMapped: false });
      const doorMat = material(0x49636a, .3, .7);
      const cabins = [];
      for (let i = 0; i < 4; i++) {
        const x = [-14, -7, 7, 14][i], floors = i < 2 ? 24 : 20, height = floors * 2.35;
        for (const xx of [-1.4, 1.4]) box(m.cyan, x + xx, 3 + height / 2, 1, .06, height, .06, 0, lifts);
        for (let f = 0; f <= floors; f++) box(m.steel, x, 3 + f * 2.35, 1, 3.1, .08, .4, 0, lifts);
        const cabin = new T.Mesh(new T.BoxGeometry(2.6, 2.1, 1.3), cabinMat.clone());
        cabin.userData.maxFloor = floors;
        cabin.position.set(x, 8 + i * 11, 1.4);
        for (const side of [-1, 1]) {
          const door = new T.Mesh(new T.BoxGeometry(.9, 1.65, .06), doorMat);
          door.position.set(side * .48, -.05, .69); cabin.add(door);
        }
        const head = new T.Mesh(new T.BoxGeometry(1.7, .09, .06), m.warm); head.position.set(0, .93, .69); cabin.add(head);
        lifts.add(cabin); cabins.push(cabin);
      }
      // Commit static geometry to GPU instancing; repeated details cost one draw call per material.
      let count = 0;
      batches.forEach(({ geo, mat, parent, transforms }) => {
        const mesh = new T.InstancedMesh(geo, mat, transforms.length);
        transforms.forEach((transform, i) => mesh.setMatrixAt(i, transform));
        mesh.castShadow = parent !== context; mesh.receiveShadow = true; parent.add(mesh); count += transforms.length;
      });
      let lightingMode = 'dusk', layer = 'overview';
      const glassMats = [m.glass, m.glassDark, m.glassLight];
      return {
        ready: Promise.all(readyTasks), materials: m, fans, cabins, streetLights, network, instanceCount: count,
        interiorCount: Array.from(batches.values()).filter(batch => batch.mat === m.interior).reduce((sum, batch) => sum + batch.transforms.length, 0),
        createCar(color) { return car(color, 0, 0, 0, new T.Group()); },
        setLayer(next) {
          layer = next; network.visible = next === 'hvac'; lifts.visible = next === 'elevators';
          glassMats.forEach(mat => { mat.transparent = next === 'elevators'; mat.opacity = next === 'elevators' ? .25 : 1; mat.depthWrite = next !== 'elevators'; mat.needsUpdate = true; });
        },
        setLighting(mode) {
          lightingMode = mode;
          const night = mode === 'night' || mode === 'saving';
          root.traverse(obj => {
            const mat = obj.material;
            if (!mat || !mat.isMeshStandardMaterial) return;
            if (mat.userData.dayEnv === undefined) mat.userData.dayEnv = mat.envMapIntensity;
            mat.envMapIntensity = mat.userData.dayEnv * (mode === 'saving' ? .07 : night ? .12 : 1);
          });
          m.interior.color.setHex(mode === 'saving' ? 0x5b6662 : night ? 0xf4b76c : mode === 'dusk' ? 0xc1ac88 : 0x8e9b9c).convertSRGBToLinear();
          m.warm.color.setHex(mode === 'saving' ? 0x9d8151 : night ? 0xffdfa4 : mode === 'dusk' ? 0xe0bd7e : 0x8d9b9c).convertSRGBToLinear();
          waterMaterial.uniforms.night.value = night ? 1 : 0;
          streetLights.forEach((lamp, i) => { lamp.visible = mode !== 'saving' || i % 3 === 0; });
        },
        update(t, delta, elevatorData, abnormal, reducedMotion) {
          waterMaterial.uniforms.time.value = reducedMotion ? 0 : t;
          fans.forEach(fan => { if (!reducedMotion) fan.rotation.y += delta * 3.2; });
          cabins.forEach((cabin, i) => {
            const data = elevatorData[i];
            const halted = !data || data.speed === 0 || (i === 2 && abnormal);
            if (cabin.userData.floor === undefined) cabin.userData.floor = data.floor;
            if (!halted && !reducedMotion) {
              cabin.userData.floor += delta * data.speed / 2.35 * (data.dir === '↓' ? -1 : 1);
              if (cabin.userData.floor >= cabin.userData.maxFloor) { cabin.userData.floor = cabin.userData.maxFloor; data.dir = '↓'; }
              if (cabin.userData.floor <= 1) { cabin.userData.floor = 1; data.dir = '↑'; }
              const floor = Math.round(cabin.userData.floor);
              if (data.floor !== floor) data.floor = floor;
            }
            cabin.position.y = 3.8 + (cabin.userData.floor - 1) * 2.35;
            cabin.material.color.setHex(i === 2 && abnormal ? 0xe9a555 : 0x3ca28a).convertSRGBToLinear();
          });
          flowPaths.forEach(({ bead, curve, phase, reverse }) => bead.position.copy(curve.getPointAt((phase + (reducedMotion ? 0 : t * .045) * (reverse ? -1 : 1) + 100) % 1)));
          if (!reducedMotion) movingCars.forEach((g, i) => {
            if (i === 0) g.position.z = 66 - (t * 3.2 + 25) % 132;
            if (i === 1) g.position.z = -66 + (t * 2.6 + 55) % 132;
            if (i === 2) g.position.x = -68 + (t * 3 + 12) % 136;
          });
        }
      };
    }
  };
})();
