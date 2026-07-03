"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

type OrientationState = {
  alpha: number;
  beta: number;
  gamma: number;
};

type TargetState = {
  alpha: number;
  beta: number;
};

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function angleDifference(a: number, b: number) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, 360 - diff);
}

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
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
  const [stream, setStream] = useState<MediaStream | null>(null);

  const [orientation, setOrientation] = useState<OrientationState>({
    alpha: 0,
    beta: 0,
    gamma: 0,
  });

  const [target, setTarget] = useState<TargetState>({
    alpha: 40,
    beta: 60,
  });

  const currentAlpha = normalizeAngle(orientation.alpha || 0);

  /**
   * beta normalmente se mueve cuando inclinas el teléfono arriba/abajo.
   * En muchos celulares:
   * - cerca de 90 = teléfono vertical/frente
   * - menor = apuntando más hacia arriba/abajo dependiendo orientación
   */
  const currentBeta = orientation.beta || 0;

  const alphaDiff = angleDifference(currentAlpha, target.alpha);
  const betaDiff = Math.abs(currentBeta - target.beta);

  /**
   * Rango horizontal.
   * Menor número = más difícil.
   */
  const alphaDetectionRange = 45;
  const alphaCaptureRange = 25;

  /**
   * Rango vertical.
   * Menor número = más difícil.
   */
  const betaDetectionRange = 25;
  const betaCaptureRange = 14;

  const isLookingAtPrize =
    alphaDiff <= alphaDetectionRange && betaDiff <= betaDetectionRange;

  const canCapturePrize =
    alphaDiff <= alphaCaptureRange && betaDiff <= betaCaptureRange;

  function generateNewTarget() {
    /**
     * Generamos una dirección aleatoria horizontal.
     * 0 a 360 grados.
     */
    const randomAlpha = randomBetween(0, 360);

    /**
     * Generamos una inclinación vertical aleatoria.
     * Ajusta estos valores si quieres que aparezca más arriba o más abajo.
     *
     * 35 a 105 suele ser buen rango para demo:
     * - 35/50: hay que apuntar más arriba
     * - 70/90: al frente
     * - 95/105: más abajo
     */
    const randomBeta = randomBetween(35, 105);

    setTarget({
      alpha: randomAlpha,
      beta: randomBeta,
    });
  }

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

      generateNewTarget();
      setStarted(true);

      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
        },
        audio: false,
      });

      setStream(cameraStream);
    } catch (err) {
      console.error(err);
      setError(
        "No se pudo abrir la cámara. Revisa permisos o abre desde HTTPS/Vercel."
      );
      setStarted(false);
    }
  }

  useEffect(() => {
    if (!stream || !videoRef.current) return;

    videoRef.current.srcObject = stream;

    videoRef.current
      .play()
      .then(() => {
        setCameraReady(true);
      })
      .catch((err) => {
        console.error(err);
        setError("La cámara abrió, pero el video no pudo reproducirse.");
      });
  }, [stream, started]);

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

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    setStream(null);
    setCameraReady(false);
  }

  function resetDemo() {
    stopCamera();
    setCaptured(false);
    setStarted(false);
    setError("");
    generateNewTarget();
  }

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
          onClick={resetDemo}
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
            celular. El premio aparecerá en una dirección aleatoria. Mueve tu
            teléfono hacia los lados, arriba o abajo para encontrarlo.
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
              background: "transparent",
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
              {canCapturePrize
                ? "🎯 Premio centrado"
                : isLookingAtPrize
                ? "⚾ Premio cerca, alinéate un poco más"
                : "🔎 Busca el premio moviendo el celular"}
            </strong>

            <p style={{ margin: "8px 0 0" }}>
              Horizontal: {Math.round(alphaDiff)}° / Vertical:{" "}
              {Math.round(betaDiff)}°
            </p>

            <p style={{ margin: "4px 0 0", opacity: 0.8 }}>
              Mueve el celular a los lados, arriba o abajo.
            </p>

            <p style={{ margin: "4px 0 0", opacity: 0.55, fontSize: 12 }}>
              Debug objetivo: H {Math.round(target.alpha)}° / V{" "}
              {Math.round(target.beta)}°
            </p>
          </div>

          {error && (
            <div
              style={{
                position: "fixed",
                top: 140,
                left: 20,
                right: 20,
                zIndex: 6,
                color: "#ffb4b4",
                background: "rgba(0,0,0,0.75)",
                padding: 12,
                borderRadius: 12,
                textAlign: "center",
              }}
            >
              {error}
            </div>
          )}

          {canCapturePrize && cameraReady && (
            <button
              onClick={() => {
                stopCamera();
                setCaptured(true);
              }}
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

          {!canCapturePrize && isLookingAtPrize && cameraReady && (
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
              Ya casi, centra el premio
            </div>
          )}

          {!isLookingAtPrize && cameraReady && (
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
              Sigue buscando
            </div>
          )}
        </>
      )}
    </main>
  );
}