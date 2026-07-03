"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { useEffect, useRef, useState } from "react";

type OrientationState = {
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  absolute: boolean;
  source: string;
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
    scene.rotation.y += 0.018;
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
    alpha: null,
    beta: null,
    gamma: null,
    absolute: false,
    source: "sin datos",
  });

  const [target, setTarget] = useState<TargetState>({
    alpha: 40,
    beta: 70,
  });

  /**
   * Estados del reto:
   * searching = buscando objetivo
   * holding = ya está en rango, debe sostener 3 segundos
   * found = objetivo confirmado, aparece pelota
   * catchEnabled = ya puede capturar
   */
  const [challengeState, setChallengeState] = useState<
    "searching" | "holding" | "found" | "catchEnabled"
  >("searching");

  const [holdProgress, setHoldProgress] = useState(0);
  const holdStartRef = useRef<number | null>(null);
  const foundTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const hasOrientation = orientation.alpha !== null && orientation.beta !== null;

  const currentAlpha = hasOrientation
    ? normalizeAngle(orientation.alpha ?? 0)
    : 0;

  const currentBeta = hasOrientation ? orientation.beta ?? 0 : 0;

  const alphaDiff = angleDifference(currentAlpha, target.alpha);
  const betaDiff = Math.abs(currentBeta - target.beta);

  /**
   * Rango para considerar que ya llegó al objetivo.
   * Para demo lo dejamos alcanzable.
   */
  const alphaTargetRange = 28;
  const betaTargetRange = 16;

  const isInsideTarget =
    hasOrientation && alphaDiff <= alphaTargetRange && betaDiff <= betaTargetRange;

  const showBall =
    challengeState === "found" || challengeState === "catchEnabled";

  const canCapturePrize = challengeState === "catchEnabled";

  function generateNewTarget() {
    const randomAlpha = randomBetween(0, 360);

    /**
     * Rango vertical:
     * 40 = apuntar más hacia arriba
     * 70 = frente natural
     * 100 = apuntar más hacia abajo
     */
    const randomBeta = randomBetween(40, 100);

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
    setChallengeState("searching");
    setHoldProgress(0);
    holdStartRef.current = null;

    if (foundTimeoutRef.current) {
      clearTimeout(foundTimeoutRef.current);
      foundTimeoutRef.current = null;
    }

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
    function getHeading(event: DeviceOrientationEvent) {
      const webkitHeading = (
        event as DeviceOrientationEvent & {
          webkitCompassHeading?: number;
        }
      ).webkitCompassHeading;

      if (typeof webkitHeading === "number") {
        return webkitHeading;
      }

      if (typeof event.alpha === "number") {
        return event.alpha;
      }

      return null;
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      const heading = getHeading(event);

      setOrientation({
        alpha: heading,
        beta: typeof event.beta === "number" ? event.beta : null,
        gamma: typeof event.gamma === "number" ? event.gamma : null,
        absolute: Boolean(event.absolute),
        source: "deviceorientation",
      });
    }

    function handleOrientationAbsolute(event: DeviceOrientationEvent) {
      const heading = getHeading(event);

      setOrientation({
        alpha: heading,
        beta: typeof event.beta === "number" ? event.beta : null,
        gamma: typeof event.gamma === "number" ? event.gamma : null,
        absolute: Boolean(event.absolute),
        source: "deviceorientationabsolute",
      });
    }

    window.addEventListener("deviceorientation", handleOrientation, true);
    window.addEventListener(
      "deviceorientationabsolute",
      handleOrientationAbsolute,
      true
    );

    return () => {
      window.removeEventListener("deviceorientation", handleOrientation, true);
      window.removeEventListener(
        "deviceorientationabsolute",
        handleOrientationAbsolute,
        true
      );
    };
  }, []);

  /**
   * Lógica de sostener el teléfono 3 segundos en el objetivo.
   */
  useEffect(() => {
    if (!started || !cameraReady) return;
    if (challengeState === "found" || challengeState === "catchEnabled") return;

    let animationFrameId: number;

    function updateHold() {
      if (isInsideTarget) {
        if (holdStartRef.current === null) {
          holdStartRef.current = Date.now();
          setChallengeState("holding");
        }

        const elapsed = Date.now() - holdStartRef.current;
        const progress = Math.min((elapsed / 3000) * 100, 100);

        setHoldProgress(progress);

        if (elapsed >= 3000) {
          setChallengeState("found");
          setHoldProgress(100);

          if (foundTimeoutRef.current) {
            clearTimeout(foundTimeoutRef.current);
          }

          foundTimeoutRef.current = setTimeout(() => {
            setChallengeState("catchEnabled");
          }, 2000);

          return;
        }
      } else {
        holdStartRef.current = null;
        setHoldProgress(0);
        setChallengeState("searching");
      }

      animationFrameId = requestAnimationFrame(updateHold);
    }

    animationFrameId = requestAnimationFrame(updateHold);

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [started, cameraReady, isInsideTarget, challengeState]);

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }

    setStream(null);
    setCameraReady(false);
  }

  function resetDemo() {
    stopCamera();

    if (foundTimeoutRef.current) {
      clearTimeout(foundTimeoutRef.current);
      foundTimeoutRef.current = null;
    }

    setCaptured(false);
    setStarted(false);
    setError("");
    setChallengeState("searching");
    setHoldProgress(0);
    holdStartRef.current = null;
    generateNewTarget();
  }

  function getInstructionMessage() {
    if (!hasOrientation) {
      return "⏳ Esperando sensores del celular...";
    }

    if (challengeState === "holding") {
      return "✅ Mantén el celular en esta posición";
    }

    if (challengeState === "found") {
      return "⚾ Premio encontrado";
    }

    if (challengeState === "catchEnabled") {
      return "🎯 Premio listo para capturar";
    }

    if (alphaDiff > alphaTargetRange && betaDiff > betaTargetRange) {
      return "🔎 Muévete a los lados y arriba/abajo";
    }

    if (alphaDiff > alphaTargetRange) {
      return "↔️ Gira a los lados para encontrar el premio";
    }

    if (betaDiff > betaTargetRange) {
      return "↕️ Inclina el celular arriba o abajo";
    }

    return "🔎 Busca el premio";
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
            Mueve tu teléfono hasta llegar al objetivo. Cuando llegues, mantén
            esa posición durante 3 segundos para revelar el premio.
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
                <BallModel visible={showBall} />
              </Canvas>
            </div>
          )}

          <div
            style={{
              position: "fixed",
              top: 16,
              left: 14,
              right: 14,
              zIndex: 4,
              color: "white",
              textAlign: "center",
              background: "rgba(0,0,0,0.68)",
              borderRadius: 18,
              padding: 16,
              boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
            }}
          >
            <strong style={{ fontSize: 18 }}>{getInstructionMessage()}</strong>

            <div
              style={{
                marginTop: 12,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div
                style={{
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Objetivo horizontal
                </div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>
                  {Math.round(target.alpha)}°
                </div>
              </div>

              <div
                style={{
                  background: "rgba(255,255,255,0.1)",
                  borderRadius: 14,
                  padding: 12,
                }}
              >
                <div style={{ fontSize: 12, opacity: 0.75 }}>
                  Objetivo vertical
                </div>
                <div style={{ fontSize: 28, fontWeight: 800 }}>
                  {Math.round(target.beta)}°
                </div>
              </div>
            </div>

            {hasOrientation ? (
              <>
                <div
                  style={{
                    marginTop: 10,
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      Actual H
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {Math.round(currentAlpha)}°
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, opacity: 0.7 }}>
                      Actual V
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700 }}>
                      {Math.round(currentBeta)}°
                    </div>
                  </div>
                </div>

                <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.85 }}>
                  Diferencia H: {Math.round(alphaDiff)}° / V:{" "}
                  {Math.round(betaDiff)}°
                </p>

                <p style={{ margin: "4px 0 0", opacity: 0.55, fontSize: 11 }}>
                  Sensor: {orientation.source} / Absolute:{" "}
                  {orientation.absolute ? "sí" : "no"}
                </p>
              </>
            ) : (
              <p style={{ margin: "10px 0 0", color: "#ffdf8a" }}>
                Esperando datos del sensor de movimiento...
              </p>
            )}

            {(challengeState === "holding" ||
              challengeState === "found" ||
              challengeState === "catchEnabled") && (
              <div
                style={{
                  width: "100%",
                  height: 12,
                  background: "rgba(255,255,255,0.18)",
                  borderRadius: 999,
                  overflow: "hidden",
                  marginTop: 12,
                }}
              >
                <div
                  style={{
                    width: `${holdProgress}%`,
                    height: "100%",
                    background:
                      challengeState === "catchEnabled"
                        ? "#2cff8f"
                        : "#ffd24a",
                    transition: "width 120ms linear",
                  }}
                />
              </div>
            )}
          </div>

          {error && (
            <div
              style={{
                position: "fixed",
                top: 210,
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

          {challengeState === "holding" && cameraReady && (
            <div
              style={{
                position: "fixed",
                zIndex: 5,
                bottom: 30,
                left: "50%",
                transform: "translateX(-50%)",
                color: "white",
                background: "rgba(0,0,0,0.72)",
                padding: "12px 18px",
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              Mantén 3 segundos...
            </div>
          )}

          {challengeState === "found" && cameraReady && (
            <div
              style={{
                position: "fixed",
                zIndex: 5,
                bottom: 30,
                left: "50%",
                transform: "translateX(-50%)",
                color: "white",
                background: "rgba(0,0,0,0.72)",
                padding: "12px 18px",
                borderRadius: 999,
                fontWeight: 700,
              }}
            >
              Premio revelado...
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
                fontWeight: 800,
                fontSize: 16,
              }}
            >
              Capturar premio
            </button>
          )}

          {challengeState === "searching" && cameraReady && (
            <div
              style={{
                position: "fixed",
                zIndex: 5,
                bottom: 30,
                left: "50%",
                transform: "translateX(-50%)",
                color: "white",
                background: "rgba(0,0,0,0.72)",
                padding: "12px 18px",
                borderRadius: 999,
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              Busca el ángulo objetivo
            </div>
          )}
        </>
      )}
    </main>
  );
}