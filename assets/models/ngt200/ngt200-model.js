(function attachNGT200Model(global) {
  'use strict';

  function mount(container, options) {
    if (!container || !global.THREE) return null;
    const THREE = global.THREE;
    const opts = Object.assign({ mode: 'cutaway', autoRotate: true, scale: 1 }, options || {});
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 40);
    camera.position.set(-2.75, 2.1, 3.35);
    camera.lookAt(0, 0.72, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(global.devicePixelRatio || 1, 2));
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    const controls = THREE.OrbitControls ? new THREE.OrbitControls(camera, renderer.domElement) : null;
    if (controls) {
      controls.enableDamping = true;
      controls.enablePan = false;
      controls.minDistance = 2.7;
      controls.maxDistance = 6.5;
      controls.target.set(0, 0.72, 0);
      controls.maxPolarAngle = Math.PI * 0.48;
    }

    scene.add(new THREE.HemisphereLight(0xbfeaff, 0x071018, 1.35));
    const key = new THREE.DirectionalLight(0xe7f7ff, 2.25);
    key.position.set(3, 5, 4); key.castShadow = true; scene.add(key);
    const cyan = new THREE.PointLight(0x36c2ff, 1.8, 7); cyan.position.set(-2, 1.8, 2); scene.add(cyan);
    const rim = new THREE.PointLight(0x35d07f, 0.8, 5); rim.position.set(2, 1.2, -2); scene.add(rim);

    const materials = {
      shell: new THREE.MeshStandardMaterial({ color: 0xc8cdd0, metalness: 0.82, roughness: 0.33 }),
      shellDark: new THREE.MeshStandardMaterial({ color: 0x303a41, metalness: 0.72, roughness: 0.38 }),
      frame: new THREE.MeshStandardMaterial({ color: 0x14212a, metalness: 0.78, roughness: 0.31 }),
      aluminum: new THREE.MeshStandardMaterial({ color: 0xdce4e8, metalness: 0.62, roughness: 0.18 }),
      machinedAluminum: new THREE.MeshPhysicalMaterial({ color: 0xe7eef1, metalness: 0.88, roughness: 0.12, clearcoat: 0.34, clearcoatRoughness: 0.16 }),
      bladeAluminum: new THREE.MeshPhysicalMaterial({ color: 0xa8d3df, metalness: 0.84, roughness: 0.15, clearcoat: 0.22, clearcoatRoughness: 0.12 }),
      shroudCutaway: new THREE.MeshPhysicalMaterial({ color: 0xd9e6eb, metalness: 0.72, roughness: 0.18, transparent: true, opacity: 0.72, side: THREE.DoubleSide, depthWrite: false }),
      rotor: new THREE.MeshStandardMaterial({ color: 0x93a5ad, metalness: 0.58, roughness: 0.22 }),
      copper: new THREE.MeshStandardMaterial({ color: 0xb56c2c, metalness: 0.72, roughness: 0.27 }),
      foil: new THREE.MeshStandardMaterial({ color: 0xd7ae56, metalness: 0.82, roughness: 0.24 }),
      gasFilm: new THREE.MeshBasicMaterial({ color: 0x36c2ff, transparent: true, opacity: 0.30, side: THREE.DoubleSide, depthWrite: false }),
      black: new THREE.MeshStandardMaterial({ color: 0x071016, metalness: 0.4, roughness: 0.55 }),
      glass: new THREE.MeshPhysicalMaterial({ color: 0x1f6787, metalness: 0.05, roughness: 0.12, transparent: true, opacity: 0.18, transmission: 0.35, depthWrite: false }),
      screen: new THREE.MeshBasicMaterial({ color: 0x37b9e9 }),
      green: new THREE.MeshBasicMaterial({ color: 0x35d07f }),
      amber: new THREE.MeshBasicMaterial({ color: 0xffb547 }),
      red: new THREE.MeshBasicMaterial({ color: 0xff5d5d })
    };

    const root = new THREE.Group();
    root.rotation.y = 0.12;
    root.scale.setScalar(opts.scale);
    scene.add(root);
    const shellParts = [];
    const core = new THREE.Group();
    root.add(core);

    function box(name, size, position, material, parent) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
      mesh.name = name; mesh.position.set(position[0], position[1], position[2]);
      mesh.castShadow = true; mesh.receiveShadow = true; (parent || root).add(mesh); return mesh;
    }
    function cylinder(name, radius, length, position, material, parent, axis) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 48), material);
      mesh.name = name; mesh.position.set(position[0], position[1], position[2]);
      if (axis === 'x') mesh.rotation.z = Math.PI / 2;
      if (axis === 'z') mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true; mesh.receiveShadow = true; (parent || root).add(mesh); return mesh;
    }
    function frustum(name, radiusFront, radiusBack, length, position, material, parent, axis) {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusFront, radiusBack, length, 64, 1, true), material);
      mesh.name = name; mesh.position.set(position[0], position[1], position[2]);
      if (axis === 'x') mesh.rotation.z = Math.PI / 2;
      if (axis === 'z') mesh.rotation.x = Math.PI / 2;
      mesh.castShadow = true; mesh.receiveShadow = true; (parent || root).add(mesh); return mesh;
    }

    // NGT200 catalogue envelope: W 0.95 m × D 2.05 m × H 1.55 m.
    box('BaseFrame', [1.02, 0.12, 2.14], [0, 0.06, 0], materials.frame);
    [[-.43,.08,.88],[.43,.08,.88],[-.43,.08,-.88],[.43,.08,-.88]].forEach((p, i) => {
      cylinder(`LevelingFoot_${i + 1}`, .065, .12, [p[0], -.03, p[2]], materials.black, root, 'y');
    });
    const rearCabinet = box('RearCabinet', [.95, 1.36, 1.30], [0, .80, -.34], materials.shellDark);
    const leftDoor = box('CoreAccessDoor', [.59, 1.31, .035], [-.17, .81, .99], materials.glass);
    const rightDoor = box('ControlDoor', [.34, 1.31, .04], [.305, .81, .995], materials.shell);
    shellParts.push(leftDoor);
    box('TopCap', [.95, .07, 2.05], [0, 1.51, 0], materials.shellDark);
    const leftSide = box('LeftSidePanel', [.04, 1.35, 2.02], [-.475, .82, 0], materials.shellDark);
    shellParts.push(leftSide);
    box('RightSidePanel', [.04, 1.35, 2.02], [.475, .82, 0], materials.shellDark);
    const discharge = box('DischargeSilencer', [.42, .26, .42], [-.18, 1.67, -.30], materials.shellDark);
    box('DischargeNeck', [.29, .28, .29], [-.18, 1.84, -.30], materials.aluminum);
    discharge.castShadow = true;

    // Local panel, display, emergency stop and front louvers.
    box('ControlPanelInset', [.25, .37, .025], [.305, .94, 1.025], materials.frame);
    box('HMIFrame', [.18, .13, .018], [.305, 1.06, 1.044], materials.black);
    box('HMIScreen', [.145, .095, .01], [.305, 1.06, 1.057], materials.screen);
    cylinder('EmergencyStop', .025, .025, [.405, 1.24, 1.04], materials.red, root, 'z');
    for (let i = 0; i < 12; i += 1) box(`Louver_${i + 1}`, [.20, .008, .012], [.305, .55 + i * .025, 1.035], materials.frame);
    for (let i = 0; i < 8; i += 1) {
      cylinder(`DoorBoltL_${i + 1}`, .008, .012, [-.445 + (i % 2) * .55, .25 + Math.floor(i / 2) * .35, 1.04], materials.aluminum, root, 'z');
    }

    // Air-foil bearing turbo core, simplified from the manufacturer's cutaway.
    const coreY = .73;
    const motor = cylinder('HighSpeedMotor', .18, .72, [-.16, coreY, .20], materials.frame, core, 'z');
    cylinder('MotorStator', .145, .58, [-.16, coreY, .25], materials.copper, core, 'z');
    const shaft = cylinder('RotorShaft', .035, 1.12, [-.16, coreY, .38], materials.rotor, core, 'z');
    function addAirFoilBearing(name, z, stateMaterial) {
      const bearing = new THREE.Group(); bearing.name = name; bearing.position.set(-.16, coreY, z); core.add(bearing);
      const housing = new THREE.Mesh(new THREE.TorusGeometry(.116, .026, 20, 64), materials.shell); housing.name = `${name}_Housing`; bearing.add(housing);
      const topFoil = new THREE.Mesh(new THREE.TorusGeometry(.087, .010, 14, 64), materials.foil); topFoil.name = `${name}_TopFoil`; bearing.add(topFoil);
      const film = new THREE.Mesh(new THREE.RingGeometry(.060, .074, 64), materials.gasFilm); film.name = `${name}_GasFilm`; film.position.z = .016; bearing.add(film);
      cylinder(`${name}_Journal`, .052, .070, [0, 0, 0], materials.rotor, bearing, 'z');
      for (let i = 0; i < 12; i += 1) {
        const a = (i / 12) * Math.PI * 2;
        const foil = box(`${name}_BumpFoil_${i + 1}`, [.014, .032, .018], [Math.cos(a) * .096, Math.sin(a) * .096, .018], materials.foil, bearing);
        foil.rotation.z = a;
      }
      const status = new THREE.Mesh(new THREE.TorusGeometry(.132, .006, 10, 64), stateMaterial); status.name = `${name}_StatusRing`; bearing.add(status);
      return bearing;
    }
    const bearingDE = addAirFoilBearing('AirFoilBearing_DE', .64, materials.amber);
    const bearingNDE = addAirFoilBearing('AirFoilBearing_NDE', -.12, materials.green);

    const volute = new THREE.Group(); volute.name = 'AluminumVoluteAssembly'; volute.position.set(-.16, coreY, .785); core.add(volute);
    const voluteBody = new THREE.Mesh(new THREE.TorusGeometry(.235, .065, 28, 72), materials.aluminum); voluteBody.name = 'AluminumVoluteCasing'; volute.add(voluteBody);
    const voluteBack = new THREE.Mesh(new THREE.RingGeometry(.165, .302, 72), materials.aluminum); voluteBack.name = 'VoluteBackPlate'; voluteBack.position.z = -.055; volute.add(voluteBack);
    box('VoluteOutletTransition', [.17, .30, .17], [.02, .245, -.02], materials.aluminum, volute);
    const inletBell = frustum('InletBellMouth', .118, .205, .22, [-.16, coreY, 1.02], materials.machinedAluminum, core, 'z');
    const inletLip = new THREE.Mesh(new THREE.TorusGeometry(.122, .018, 20, 64), materials.machinedAluminum); inletLip.name = 'InletLip'; inletLip.position.set(-.16, coreY, 1.135); core.add(inletLip);

    const impeller = new THREE.Group(); impeller.name = 'AluminumBackwardCurvedImpeller'; impeller.position.set(-.16, coreY, .925); core.add(impeller);
    cylinder('ImpellerBackShroud', .205, .022, [0, 0, -.022], materials.machinedAluminum, impeller, 'z');
    const frontShroudGeometry = new THREE.RingGeometry(.082, .196, 72, 1, Math.PI * .12, Math.PI * 1.45);
    const frontShroud = new THREE.Mesh(frontShroudGeometry, materials.shroudCutaway); frontShroud.name = 'ImpellerFrontShroudCutaway'; frontShroud.position.z = .052; impeller.add(frontShroud);
    const shroudEdge = new THREE.LineSegments(new THREE.EdgesGeometry(frontShroudGeometry), new THREE.LineBasicMaterial({ color: 0xdff8ff, transparent: true, opacity: .74 })); shroudEdge.name = 'ImpellerShroudCutEdge'; shroudEdge.position.z = .054; impeller.add(shroudEdge);
    cylinder('ImpellerHub', .052, .092, [0, 0, .018], materials.machinedAluminum, impeller, 'z');
    const spinner = new THREE.Mesh(new THREE.ConeGeometry(.065, .12, 48), materials.machinedAluminum); spinner.name = 'ImpellerSpinner'; spinner.rotation.x = Math.PI / 2; spinner.position.z = .105; impeller.add(spinner);
    const bladeShape = new THREE.Shape();
    bladeShape.moveTo(.048, -.014); bladeShape.quadraticCurveTo(.105, .004, .182, .066); bladeShape.lineTo(.158, .096); bladeShape.quadraticCurveTo(.103, .046, .040, .018); bladeShape.closePath();
    const bladeGeometry = new THREE.ExtrudeGeometry(bladeShape, { depth: .044, bevelEnabled: true, bevelSize: .004, bevelThickness: .003, bevelSegments: 2 });
    bladeGeometry.translate(0, 0, -.006);
    for (let i = 0; i < 11; i += 1) {
      const blade = new THREE.Mesh(bladeGeometry, materials.bladeAluminum); blade.name = `BackwardCurvedBlade_${i + 1}`; blade.rotation.z = (i / 11) * Math.PI * 2; blade.castShadow = true; blade.receiveShadow = true; impeller.add(blade);
    }
    const bladeTipRing = new THREE.Mesh(new THREE.TorusGeometry(.193, .006, 10, 72), materials.rotor); bladeTipRing.name = 'BladeTipReferenceRing'; bladeTipRing.position.z = .018; impeller.add(bladeTipRing);
    const impellerLight = new THREE.PointLight(0x8ee8ff, .75, .72); impellerLight.position.set(.04, .03, .18); impeller.add(impellerLight);
    box('CoreSupport', [.52, .08, 1.04], [-.16, .39, .32], materials.frame, core);

    // Cooling fan and cable bay.
    cylinder('CoolingFanHousing', .14, .06, [.27, 1.29, -.76], materials.frame, root, 'z');
    for (let i = 0; i < 6; i += 1) {
      const blade = box(`CoolingBlade_${i + 1}`, [.025, .09, .012], [.27 + Math.cos(i * Math.PI / 3) * .055, 1.29 + Math.sin(i * Math.PI / 3) * .055, -.725], materials.aluminum);
      blade.rotation.z = i * Math.PI / 3;
    }
    box('VFDBay', [.33, .47, .42], [.29, .55, .58], materials.shell);
    for (let i = 0; i < 7; i += 1) box(`VFDFin_${i + 1}`, [.025, .29, .012], [.20 + i * .03, .55, .805], materials.frame);

    const sensors = new THREE.Group(); sensors.name = 'SensorPoints'; root.add(sensors);
    [[-.16,coreY,.65,materials.amber,'DE'],[-.16,coreY,-.12,materials.green,'NDE'],[-.02,.93,.21,materials.screen,'MOTOR']].forEach((s) => {
      const point = new THREE.Mesh(new THREE.SphereGeometry(.035, 24, 16), s[3]); point.name = `Sensor_${s[4]}`; point.position.set(s[0], s[1], s[2]); sensors.add(point);
      const halo = new THREE.PointLight(s[3].color.getHex(), .65, .55); halo.position.copy(point.position); sensors.add(halo);
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ color: 0x071019, metalness: .25, roughness: .78, transparent: true, opacity: .68 }));
    floor.rotation.x = -Math.PI / 2; floor.position.y = -.095; floor.receiveShadow = true; scene.add(floor);
    const grid = new THREE.GridHelper(7, 28, 0x173b4f, 0x102937); grid.position.y = -.09; scene.add(grid);

    function setMode(mode) {
      opts.mode = mode === 'exterior' ? 'exterior' : 'cutaway';
      core.visible = opts.mode === 'cutaway';
      sensors.visible = opts.mode === 'cutaway';
      leftSide.visible = opts.mode === 'exterior';
      rearCabinet.visible = opts.mode === 'exterior';
      leftDoor.material = opts.mode === 'cutaway' ? materials.glass : materials.shell;
      leftDoor.material.needsUpdate = true;
    }
    function setView(view) {
      const detail = view === 'impeller';
      inletBell.material = detail ? materials.glass : materials.machinedAluminum;
      inletLip.material = detail ? materials.glass : materials.machinedAluminum;
      inletBell.material.needsUpdate = true; inletLip.material.needsUpdate = true;
      camera.position.set(detail ? -1.22 : -2.75, detail ? 1.23 : 2.1, detail ? 2.18 : 3.35);
      const target = new THREE.Vector3(-.16, detail ? .76 : .72, detail ? .72 : 0);
      camera.lookAt(target);
      if (controls) { controls.target.copy(target); controls.update(); }
    }
    setMode(opts.mode);
    setView(opts.view);

    const clock = new THREE.Clock();
    let frame = 0;
    function render() {
      frame = global.requestAnimationFrame(render);
      const delta = Math.min(clock.getDelta(), .04);
      if (opts.autoRotate && (!controls || !controls.enabled)) root.rotation.y += delta * .08;
      if (!global.matchMedia('(prefers-reduced-motion: reduce)').matches && impeller.visible) impeller.rotation.z -= delta * 3.8;
      if (controls) controls.update();
      renderer.render(scene, camera);
    }
    function resize() {
      const width = Math.max(container.clientWidth, 1); const height = Math.max(container.clientHeight, 1);
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height, false);
    }
    const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(container); resize(); render();

    return {
      root, scene, camera, renderer, impeller,
      setMode,
      setView,
      setAutoRotate(value) { opts.autoRotate = Boolean(value); },
      dispose() { global.cancelAnimationFrame(frame); resizeObserver.disconnect(); if (controls) controls.dispose(); renderer.dispose(); renderer.domElement.remove(); }
    };
  }

  global.NGT200Model = { mount };
})(window);
