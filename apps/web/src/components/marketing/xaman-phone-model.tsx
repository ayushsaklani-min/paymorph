'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const MODEL_URL = '/models/paymorph-phone.glb';
const SCREEN_URL = '/media/xaman-testnet-wallet.png';
const SCREEN_MATERIAL = 'PayMorph_Xaman_Screen';
const SCREEN_CROP = {
  offsetX: 275 / 1295,
  offsetY: (1989 - 1826) / 1989,
  repeatX: (1020 - 275) / 1295,
  repeatY: (1826 - 212) / 1989,
} as const;

/** Decorative product visual. It displays supplied testnet wallet media only. */
export function XamanPhoneModel() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [modelState, setModelState] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let frame = 0;
    let disposed = false;
    let phone: THREE.Group | undefined;
    let screenTexture: THREE.Texture | undefined;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(27, 1, 0.1, 100);
    camera.position.set(0, 0.05, 6.2);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas,
        powerPreference: 'high-performance',
      });
    } catch {
      setModelState('unavailable');
      return;
    }

    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene.add(new THREE.HemisphereLight(0xffffff, 0x6d35f5, 2.6));
    const keyLight = new THREE.DirectionalLight(0xfff1f4, 4.5);
    keyLight.position.set(-2.5, 3.5, 5);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0xd51c89, 3.2);
    rimLight.position.set(3, -1, 2.5);
    scene.add(rimLight);

    const stage = new THREE.Group();
    stage.rotation.set(-0.08, -0.22, 0);
    scene.add(stage);

    const loader = new GLTFLoader();
    const textureLoader = new THREE.TextureLoader();
    void Promise.all([loader.loadAsync(MODEL_URL), textureLoader.loadAsync(SCREEN_URL)])
      .then(([gltf, suppliedScreenTexture]) => {
        if (disposed) return;
        screenTexture = suppliedScreenTexture;
        screenTexture.colorSpace = THREE.SRGBColorSpace;
        screenTexture.flipY = false;
        screenTexture.wrapS = THREE.ClampToEdgeWrapping;
        screenTexture.wrapT = THREE.ClampToEdgeWrapping;
        screenTexture.offset.set(SCREEN_CROP.offsetX, SCREEN_CROP.offsetY);
        screenTexture.repeat.set(SCREEN_CROP.repeatX, SCREEN_CROP.repeatY);
        screenTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
        screenTexture.needsUpdate = true;

        phone = gltf.scene;
        phone.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return;
          const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
          mesh.castShadow = false;
          mesh.receiveShadow = false;

          const mapSuppliedScreen = (material: THREE.Material) => {
            if (material.name !== SCREEN_MATERIAL) return material;
            const suppliedScreenMaterial = new THREE.MeshBasicMaterial({
              map: screenTexture ?? null,
              toneMapped: false,
            });
            suppliedScreenMaterial.name = SCREEN_MATERIAL;
            return suppliedScreenMaterial;
          };
          mesh.material = Array.isArray(mesh.material)
            ? mesh.material.map(mapSuppliedScreen)
            : mapSuppliedScreen(mesh.material);
        });

        const bounds = new THREE.Box3().setFromObject(phone);
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        phone.position.sub(center);
        phone.scale.setScalar(2.25 / Math.max(size.x, size.y));
        phone.rotation.y = -Math.PI / 2;
        stage.add(phone);
        setModelState('ready');
      })
      .catch(() => {
        if (!disposed) setModelState('unavailable');
      });

    const resize = () => {
      const width = Math.max(canvas.clientWidth, 1);
      const height = Math.max(canvas.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let targetX = -0.08;
    let targetY = -0.22;
    let targetZ = 0;
    let targetPositionX = 0;
    let targetPositionY = 0;
    const updateTilt = (event: PointerEvent) => {
      if (reducedMotion) return;
      const bounds = canvas.getBoundingClientRect();
      const pointerX = THREE.MathUtils.clamp(
        (event.clientX - bounds.left) / bounds.width - 0.5,
        -0.7,
        0.7,
      );
      const pointerY = THREE.MathUtils.clamp(
        (event.clientY - bounds.top) / bounds.height - 0.5,
        -0.7,
        0.7,
      );
      targetY = -0.22 + pointerX * 0.52;
      targetX = -0.08 - pointerY * 0.34;
      targetZ = -pointerX * 0.055;
      targetPositionX = pointerX * 0.24;
      targetPositionY = -pointerY * 0.12;
    };
    const resetTilt = () => {
      targetX = -0.08;
      targetY = -0.22;
      targetZ = 0;
      targetPositionX = 0;
      targetPositionY = 0;
    };
    canvas.addEventListener('pointermove', updateTilt, { passive: true });
    canvas.addEventListener('pointerleave', resetTilt);

    const startedAt = performance.now();
    const render = (time: number) => {
      const easing = 0.075;
      const idleFloat = reducedMotion ? 0 : Math.sin((time - startedAt) / 1_650) * 0.055;
      stage.rotation.x += (targetX - stage.rotation.x) * easing;
      stage.rotation.y += (targetY - stage.rotation.y) * easing;
      stage.rotation.z += (targetZ - stage.rotation.z) * easing;
      stage.position.x += (targetPositionX - stage.position.x) * easing;
      stage.position.y += (targetPositionY + idleFloat - stage.position.y) * easing;
      renderer.render(scene, camera);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      canvas.removeEventListener('pointermove', updateTilt);
      canvas.removeEventListener('pointerleave', resetTilt);
      phone?.traverse((child) => {
        if (!(child instanceof THREE.Mesh)) return;
        const mesh = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) material.dispose();
      });
      screenTexture?.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="pm-phone-stage" data-model-state={modelState}>
      <div className="pm-phone-orbit" aria-hidden="true" />
      <canvas
        aria-label="Interactive 3D smartphone showing the supplied Xaman XRPL Testnet wallet"
        className="pm-phone-canvas"
        ref={canvasRef}
        role="img"
      />
      <div className="pm-phone-fallback" aria-hidden={modelState === 'ready'}>
        <div className="pm-phone-fallback-frame">
          <Image
            alt="Xaman XRPL Testnet wallet with an XRP balance"
            className="pm-phone-fallback-image"
            height={1989}
            priority={false}
            sizes="(max-width: 768px) 68vw, 320px"
            src={SCREEN_URL}
            width={1295}
          />
        </div>
      </div>
    </div>
  );
}
