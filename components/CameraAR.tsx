"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

function BallModel() {
  const { scene } = useGLTF("/models/ball.glb");

  useFrame(() => {
    scene.rotation.y += 0.01;
  });

  return <primitive object={scene} scale={1.6} position={[0, 0, 0]} />;
}

export default function CameraAR() { 
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
          },
          audio: false,
        });

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          setCameraReady(true);
        }
      } catch (err) {
        console.error(err);
        setError("No se pudo abrir la cámara. Revisa permisos o usa HTTPS.");
      }
    }

    startCamera();
  }, []);

  return (
    <main style={{ width: "100vw", height: "100vh", overflow: "hidden" }}>
      {error && (
        <div style={{ padding: 20, color: "white", background: "black" }}>
          {error}
        </div>
      )}

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          position: "fixed",
          inset: 0,
          width: "100vw",
          height: "100vh",
          objectFit: "cover",
          zIndex: 1,
        }}
      />

      {cameraReady && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 2,
            pointerEvents: "none",
          }}
        >
          <Canvas
            camera={{ position: [0, 0, 5], fov: 50 }}
            gl={{ alpha: true }}
            style={{ background: "transparent" }}
          >
            <ambientLight intensity={1.5} />
            <directionalLight position={[5, 5, 5]} intensity={2} />
            <BallModel />
          </Canvas>
        </div>
      )}

      <button
        style={{
          position: "fixed",
          zIndex: 3,
          bottom: 30,
          left: "50%",
          transform: "translateX(-50%)",
          padding: "14px 24px",
          borderRadius: 999,
          border: "none",
          fontWeight: 700,
          fontSize: 16,
        }}
      >
        Capturar premio
      </button>
    </main>
  );
}