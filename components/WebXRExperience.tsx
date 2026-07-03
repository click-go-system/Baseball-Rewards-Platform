"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { XR, createXRStore } from "@react-three/xr";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";

function Ball() {
  const { scene } = useGLTF("/models/ball.glb");

  useFrame(() => {
    scene.rotation.y += 0.01;
  });

  return (
    <primitive
      object={scene}
      position={[0, 0, -2]}
      scale={0.45}
    />
  );
}

export default function WebXRExperience() {
  const store = useMemo(() => createXRStore(), []);
  const [supported, setSupported] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    async function checkXR() {
      try {
        const ok =
          typeof navigator !== "undefined" &&
          "xr" in navigator &&
          (await navigator.xr?.isSessionSupported("immersive-ar"));

        setSupported(Boolean(ok));
      } catch {
        setSupported(false);
      } finally {
        setChecking(false);
      }
    }

    checkXR();
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh", background: "#000" }}>
      <div
        style={{
          position: "fixed",
          top: 20,
          left: 20,
          right: 20,
          zIndex: 10,
          color: "white",
          textAlign: "center",
        }}
      >
        <h1>Baseball Rewards AR</h1>

        {checking && <p>Validando compatibilidad...</p>}

        {!checking && supported && (
          <button
            onClick={() => store.enterAR()}
            style={{
              padding: "14px 24px",
              borderRadius: 999,
              border: "none",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            Iniciar experiencia AR
          </button>
        )}

        {!checking && !supported && (
          <p>
            Para la experiencia AR real, abre este sitio desde Google Chrome en
            Android compatible con ARCore.
          </p>
        )}
      </div>

      <Canvas camera={{ position: [0, 1.4, 3], fov: 70 }}>
        <XR store={store}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 5, 5]} intensity={2} />
          <Ball />
        </XR>
      </Canvas>
    </main>
  );
}