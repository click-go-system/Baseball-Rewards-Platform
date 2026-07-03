"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

type OrientationState = {
  alpha: number;
  beta: number;
  gamma: number;
};

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function angleDifference(a: number, b: number) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, 360 - diff);
}

function BallModel({ visible }: { visible: boolean }) {
  const { scene } = useGLTF("/models/ball.glb");

  useFrame(() => {
    scene.rotation.y += 0.015;
  });

  if (!visible) return null;

  return <primitive object={scene} position={[0, 0, 0]} scale={1.25} />;
}

export default function CompatibleARDemo() {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [started, setStarted] = useState(false);
  const [captured, setCaptured] = useState(false);
  const [error, setError] = useState("");
  const [orientation, setOrientation] = useState<OrientationState>({
    alpha: 0,
    beta: 0,
    gamma: 0,
  });

  const targetDirection = 40;

  const currentDirection = normalizeAngle(orientation.alpha || 0);
  const diff = angleDifference(currentDirection, targetDirection);
  const isLookingAtPrize = diff <= 25;

  async function requestOrientationPermission() {
    try {
      if (typeof window === "undefined") return false;

      const DeviceOrientationEventTyped =
        window.DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<"granted" | "denied">;
        };

      if (typeof DeviceOrientationEventTyped?.requestPermission === "function") {
        const permission = await DeviceOrientationEventTyped.requestPermission();

        if (permission !== "granted") {
          setError("No se concedió permiso para usar el movimiento del celular.");
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error(err);
      setError("No se pudo solicitar permiso de movimiento.");
      return false;
    }
  }

  async function startExperience() {
    setError("");

    try {
      const orientationAllowed = await requestOrientationPermission();

      if (!orientationAllowed) return;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      setCameraReady(true);
      setStarted(true);
    } catch (err) {
      console.error(err);
      setError(
        "No se pudo abrir la cámara. Revisa permisos o abre desde HTTPS/Vercel."
      );
    }
  }

  useEffect(() => {
    function handleOrientation(event: DeviceOrientationEvent) {
      setOrientation({
        alpha: event.alpha ?? 0,
        beta: event.beta ?? 0,
        gamma: event.gamma ?? 0,
      });
    }

    window.addEventListener("deviceorientation", handleOrientation, true);

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
    };
  }, []);

  if (captured) {
    return (
      <main
        style={{
          minHeight: "100vh",
          background: "#050505",
          color: "white",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          flexDirection: "column",
          textAlign: "center",
          padding: 24,
        }}
      >
        <h1>🎉 Premio capturado</h1>
        <p>Ganaste tu recompensa Baseball Rewards.</p>

        <button
          onClick={() => {
            setCaptured(false);
            setStarted(false);
            setCameraReady(false);
          }}
          style={{
            marginTop: 20,
            padding: "14px 24px",
            borderRadius: 999,
            border: "none",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Reiniciar demo
        </button>
      </main>
    );
  }

  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        background: "#000",
      }}
    >
      {!started && (
        <section
          style={{
            minHeight: "100vh",
            color: "white",
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            flexDirection: "column",
            textAlign: "center",
            padding: 24,
            gap: 16,
          }}
        >
          <h1>Baseball Rewards AR</h1>

          <p style={{ maxWidth: 420 }}>
            Esta demo funciona en navegador usando cámara y movimiento del
            celular. Mueve tu teléfono para encontrar el premio escondido.
          </p>

          <button
            onClick={startExperience}
            style={{
              padding: "14px 24px",
              borderRadius: 999,
              border: "none",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            Iniciar búsqueda
          </button>

          {error && <p style={{ color: "#ffb4b4", maxWidth: 420 }}>{error}</p>}
        </section>
      )}

      {started && (
        <>
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
                camera={{ position: [0, 0, 4], fov: 45 }}
                gl={{ alpha: true }}
                style={{ background: "transparent" }}
              >
                <ambientLight intensity={1.5} />
                <directionalLight position={[5, 5, 5]} intensity={2} />
                <BallModel visible={isLookingAtPrize} />
              </Canvas>
            </div>
          )}

          <div
            style={{
              position: "fixed",
              top: 20,
              left: 20,
              right: 20,
              zIndex: 4,
              color: "white",
              textAlign: "center",
              background: "rgba(0,0,0,0.55)",
              borderRadius: 16,
              padding: 14,
            }}
          >
            <strong>
              {isLookingAtPrize
                ? "🎯 Premio encontrado"
                : "🔎 Muévete para buscar el premio"}
            </strong>

            <p style={{ margin: "8px 0 0" }}>
              Dirección actual: {Math.round(currentDirection)}°
            </p>

            <p style={{ margin: "4px 0 0" }}>
              Diferencia: {Math.round(diff)}°
            </p>
          </div>

          {isLookingAtPrize && (
            <button
              onClick={() => setCaptured(true)}
              style={{
                position: "fixed",
                zIndex: 5,
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
          )}

          {!isLookingAtPrize && (
            <div
              style={{
                position: "fixed",
                zIndex: 5,
                bottom: 30,
                left: "50%",
                transform: "translateX(-50%)",
                color: "white",
                background: "rgba(0,0,0,0.65)",
                padding: "12px 18px",
                borderRadius: 999,
                fontWeight: 600,
              }}
            >
              Sigue girando el celular
            </div>
          )}
        </>
      )}
    </main>
  );
}