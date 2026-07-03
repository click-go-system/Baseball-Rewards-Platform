"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { XR, createXRStore, IfInSessionMode } from "@react-three/xr";
import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo, useState } from "react";

function Ball() {
  const { scene } = useGLTF("/models/ball.glb");

  useFrame(() => {
    scene.rotation.y += 0.01;
  });

  return <primitive object={scene} position={[0, 0, -2]} scale={0.45} />;
}

export default function WebXRExperience() {
  const store = useMemo(() => createXRStore(), []);

  const [supported, setSupported] = useState(false);
  const [checking, setChecking] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function checkXR() {
      try {
        if (!navigator.xr) {
          setSupported(false);
          setMessage("navigator.xr no está disponible.");
          return;
        }

        const ok = await navigator.xr.isSessionSupported("immersive-ar");
        setSupported(ok);
        setMessage(ok ? "AR compatible. Puedes iniciar." : "AR no compatible.");
      } catch (err) {
        setSupported(false);
        setMessage("Error validando AR: " + String(err));
      } finally {
        setChecking(false);
      }
    }

    checkXR();
  }, []);

  const startAR = async () => {
    setMessage("Intentando iniciar AR...");

    try {
      await store.enterAR();
      setMessage("AR iniciado.");
    } catch (err) {
      console.error(err);
      setMessage("Error al iniciar AR: " + String(err));
    }
  };

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
          background: "rgba(0,0,0,0.45)",
          padding: 16,
          borderRadius: 16,
        }}
      >
        <h1>Baseball Rewards AR</h1>

        {checking && <p>Validando compatibilidad...</p>}

        {!checking && supported && (
          <button
            onClick={startAR}
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

        {message && <p>{message}</p>}
      </div>

      <Canvas camera={{ position: [0, 1.4, 3], fov: 70 }}>
        <XR store={store}>
          <ambientLight intensity={1.5} />
          <directionalLight position={[5, 5, 5]} intensity={2} />

          <IfInSessionMode allow={["immersive-ar"]}>
            <Ball />
          </IfInSessionMode>
        </XR>
      </Canvas>
    </main>
  );
}