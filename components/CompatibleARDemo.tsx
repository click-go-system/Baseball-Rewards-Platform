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
  lastUpdate: number | null;
};

type TargetState = {
  horizontal: number;
  vertical: number;
};

type ChallengeState = "searching" | "holding" | "found" | "catchEnabled";

type ControlMode = "sensor" | "manual";

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

  const [controlMode, setControlMode] = useState<ControlMode>("sensor");

  const [orientation, setOrientation] = useState<OrientationState>({
    alpha: null,
    beta: null,
    gamma: null,
    absolute: false,
    source: "sin datos",
    lastUpdate: null,
  });

  const [manualPosition, setManualPosition] = useState<TargetState>({
    horizontal: 180,
    vertical: 70,
  });

  const [target, setTarget] = useState<TargetState>({
    horizontal: 40,
    vertical: 70,
  });

  const [challengeState, setChallengeState] =
    useState<ChallengeState>("searching");

  const [holdProgress, setHoldProgress] = useState(0);

  const holdStartRef = useRef<number | null>(null);
  const foundTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sensorFallbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Sensores flexibles:
   * - Si alpha existe, usamos alpha como horizontal.
   * - Si alpha no existe, usamos gamma como horizontal aproximado.
   * - Si beta existe, usamos beta como vertical.
   *
   * Esto ayuda a iPhone, donde a veces beta/gamma sí cambian,
   * pero alpha puede no llegar bien.
   */
  const hasAlpha = orientation.alpha !== null;
  const hasBeta = orientation.beta !== null;
  const hasGamma = orientation.gamma !== null;

  const hasAnySensor = hasAlpha || hasBeta || hasGamma;

  const sensorHorizontal = hasAlpha
    ? normalizeAngle(orientation.alpha ?? 0)
    : hasGamma
    ? normalizeAngle((orientation.gamma ?? 0) + 180)
    : 0;

  const sensorVertical = hasBeta ? orientation.beta ?? 0 : 70;

  const currentHorizontal =
    controlMode === "manual"
      ? normalizeAngle(manualPosition.horizontal)
      : normalizeAngle(sensorHorizontal);

  const currentVertical =
    controlMode === "manual" ? manualPosition.vertical : sensorVertical;

  const horizontalDiff = angleDifference(currentHorizontal, target.horizontal);
  const verticalDiff = Math.abs(currentVertical - target.vertical);

  /**
   * Rango para considerar que el usuario está apuntando al objetivo.
   * Puedes hacerlo más fácil subiendo estos valores.
   */
  const horizontalTargetRange = 32;
  const verticalTargetRange = 20;

  const isInsideTarget =
    horizontalDiff <= horizontalTargetRange &&
    verticalDiff <= verticalTargetRange;

  const showBall =
    challengeState === "found" || challengeState === "catchEnabled";

  const canCapturePrize = challengeState === "catchEnabled";

  function generateNewTarget() {
    const randomHorizontal = randomBetween(0, 360);

    /**
     * 40 = apuntar más arriba
     * 70 = frente natural
     * 100 = apuntar más abajo
     */
    const randomVertical = randomBetween(40, 100);

    setTarget({
      horizontal: randomHorizontal,
      vertical: randomVertical,
    });
  }

  function clearTimers() {
    if (foundTimeoutRef.current) {
      clearTimeout(foundTimeoutRef.current);
      foundTimeoutRef.current = null;
    }

    if (sensorFallbackTimeoutRef.current) {
      clearTimeout(sensorFallbackTimeoutRef.current);
      sensorFallbackTimeoutRef.current = null;
    }
  }

  async function requestOrientationPermission() {
    try {
      if (typeof window === "undefined") return false;

      const DeviceOrientationEventTyped =
        window.DeviceOrientationEvent as unknown as {
          requestPermission?: () => Promise<"granted" | "denied">;
        };

      /**
       * iOS pide permiso explícito para sensores.
       * Android normalmente no muestra prompt.
       */
      if (typeof DeviceOrientationEventTyped?.requestPermission === "function") {
        const permission = await DeviceOrientationEventTyped.requestPermission();

        if (permission !== "granted") {
          setError(
            "No se concedió permiso para usar el movimiento del celular. Se activará modo compatible."
          );
          setControlMode("manual");
          return false;
        }
      }

      return true;
    } catch (err) {
      console.error(err);
      setError(
        "No se pudo solicitar permiso de movimiento. Se activará modo compatible."
      );
      setControlMode("manual");
      return false;
    }
  }

  async function startExperience() {
    setError("");
    setChallengeState("searching");
    setHoldProgress(0);
    holdStartRef.current = null;
    clearTimers();

    try {
      await requestOrientationPermission();

      generateNewTarget();
      setStarted(true);
      setControlMode("sensor");

      /**
       * Si después de 3 segundos no llegaron sensores útiles,
       * activamos modo manual compatible.
       */
      sensorFallbackTimeoutRef.current = setTimeout(() => {
        setOrientation((current) => {
          const hasSensorData =
            current.alpha !== null ||
            current.beta !== null ||
            current.gamma !== null;

          if (!hasSensorData) {
            setControlMode("manual");
            setError(
              "Tu navegador no entregó sensores de movimiento. Activamos modo compatible."
            );
          }

          return current;
        });
      }, 3000);

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

    function updateOrientation(
      event: DeviceOrientationEvent,
      source: string
    ) {
      const heading = getHeading(event);

      const nextOrientation: OrientationState = {
        alpha: heading,
        beta: typeof event.beta === "number" ? event.beta : null,
        gamma: typeof event.gamma === "number" ? event.gamma : null,
        absolute: Boolean(event.absolute),
        source,
        lastUpdate: Date.now(),
      };

      setOrientation(nextOrientation);

      const hasUsefulData =
        nextOrientation.alpha !== null ||
        nextOrientation.beta !== null ||
        nextOrientation.gamma !== null;

      if (hasUsefulData) {
        setControlMode("sensor");
        setError("");
      }
    }

    function handleOrientation(event: DeviceOrientationEvent) {
      updateOrientation(event, "deviceorientation");
    }

    function handleOrientationAbsolute(event: DeviceOrientationEvent) {
      updateOrientation(event, "deviceorientationabsolute");
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
   * Lógica de sostener la posición 3 segundos.
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
    clearTimers();

    setCaptured(false);
    setStarted(false);
    setError("");
    setChallengeState("searching");
    setHoldProgress(0);
    holdStartRef.current = null;
    generateNewTarget();
  }

  function moveManual(horizontalDelta: number, verticalDelta: number) {
    setManualPosition((current) => {
      const nextVertical = Math.max(
        0,
        Math.min(140, current.vertical + verticalDelta)
      );

      return {
        horizontal: normalizeAngle(current.horizontal + horizontalDelta),
        vertical: nextVertical,
      };
    });
  }

  function getInstructionMessage() {
    if (controlMode === "sensor" && !hasAnySensor) {
      return "⏳ Esperando sensores del celular...";
    }

    if (challengeState === "holding") {
      return "✅ Mantén esta posición";
    }

    if (challengeState === "found") {
      return "⚾ Premio encontrado";
    }

    if (challengeState === "catchEnabled") {
      return "🎯 Premio listo para capturar";
    }

    if (horizontalDiff > horizontalTargetRange && verticalDiff > verticalTargetRange) {
      return controlMode === "manual"
        ? "🔎 Usa los controles para buscar el premio"
        : "🔎 Muévete a los lados y arriba/abajo";
    }

    if (horizontalDiff > horizontalTargetRange) {
      return controlMode === "manual"
        ? "↔️ Ajusta horizontal"
        : "↔️ Gira a los lados";
    }

    if (verticalDiff > verticalTargetRange) {
      return controlMode === "manual"
        ? "↕️ Ajusta vertical"
        : "↕️ Inclina el celular arriba o abajo";
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
            Mueve tu teléfono hasta llegar al objetivo. Si tu navegador no
            entrega sensores, se activará un modo compatible con controles.
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
                  Objetivo H
                </div>
                <div style={{ fontSize: 30, fontWeight: 900 }}>
                  {Math.round(target.horizontal)}°
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
                  Objetivo V
                </div>
                <div style={{ fontSize: 30, fontWeight: 900 }}>
                  {Math.round(target.vertical)}°
                </div>
              </div>
            </div>

            <div
              style={{
                marginTop: 10,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 10,
              }}
            >
              <div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>Actual H</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {Math.round(currentHorizontal)}°
                </div>
              </div>

              <div>
                <div style={{ fontSize: 11, opacity: 0.7 }}>Actual V</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>
                  {Math.round(currentVertical)}°
                </div>
              </div>
            </div>

            <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.85 }}>
              Diferencia H: {Math.round(horizontalDiff)}° / V:{" "}
              {Math.round(verticalDiff)}°
            </p>

            <p style={{ margin: "4px 0 0", opacity: 0.6, fontSize: 11 }}>
              Modo: {controlMode === "sensor" ? "sensores" : "compatible"} /
              Sensor: {orientation.source}
            </p>

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
                top: 225,
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

          {controlMode === "manual" && cameraReady && (
            <div
              style={{
                position: "fixed",
                left: 14,
                right: 14,
                bottom: 86,
                zIndex: 5,
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: 10,
                alignItems: "center",
              }}
            >
              <button
                onClick={() => moveManual(-8, 0)}
                style={manualButtonStyle}
              >
                ← H
              </button>

              <div
                style={{
                  display: "grid",
                  gap: 8,
                }}
              >
                <button
                  onClick={() => moveManual(0, -5)}
                  style={manualButtonStyle}
                >
                  ↑ V
                </button>

                <button
                  onClick={() => moveManual(0, 5)}
                  style={manualButtonStyle}
                >
                  ↓ V
                </button>
              </div>

              <button
                onClick={() => moveManual(8, 0)}
                style={manualButtonStyle}
              >
                H →
              </button>
            </div>
          )}

          {challengeState === "holding" && cameraReady && (
            <div style={bottomPillStyle}>Mantén 3 segundos...</div>
          )}

          {challengeState === "found" && cameraReady && (
            <div style={bottomPillStyle}>Premio revelado...</div>
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
                fontWeight: 900,
                fontSize: 16,
              }}
            >
              Capturar premio
            </button>
          )}

          {challengeState === "searching" && cameraReady && (
            <div style={bottomPillStyle}>
              {controlMode === "manual"
                ? "Usa los controles para llegar al objetivo"
                : "Busca el ángulo objetivo"}
            </div>
          )}
        </>
      )}
    </main>
  );
}

const manualButtonStyle: React.CSSProperties = {
  padding: "14px 12px",
  borderRadius: 16,
  border: "none",
  background: "rgba(255,255,255,0.92)",
  color: "#111",
  fontWeight: 900,
  fontSize: 15,
};

const bottomPillStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 5,
  bottom: 30,
  left: "50%",
  transform: "translateX(-50%)",
  color: "white",
  background: "rgba(0,0,0,0.72)",
  padding: "12px 18px",
  borderRadius: 999,
  fontWeight: 800,
  whiteSpace: "nowrap",
};