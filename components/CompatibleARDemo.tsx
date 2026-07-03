"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type TouchEvent,
} from "react";

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

type BallOffset = {
  x: number;
  y: number;
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

function getTouchDistance(touches: TouchEvent<HTMLDivElement>["touches"]) {
  if (touches.length < 2) return 0;

  const touchA = touches[0];
  const touchB = touches[1];

  const dx = touchA.clientX - touchB.clientX;
  const dy = touchA.clientY - touchB.clientY;

  return Math.sqrt(dx * dx + dy * dy);
}

function BallModel({
  visible,
  offset,
  scale,
}: {
  visible: boolean;
  offset: BallOffset;
  scale: number;
}) {
  const { scene } = useGLTF("/models/ball.glb");

  useFrame(() => {
    scene.rotation.y += 0.018;
  });

  if (!visible) return null;

  return (
    <primitive
      object={scene}
      position={[offset.x, offset.y, 0]}
      scale={scale}
    />
  );
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

  const [ballOffset, setBallOffset] = useState<BallOffset>({
    x: 0,
    y: -0.35,
  });

  const [ballScale, setBallScale] = useState(1.25);

  const holdStartRef = useRef<number | null>(null);
  const foundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sensorFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDistanceRef = useRef<number | null>(null);

  const hasAlpha = orientation.alpha !== null;
  const hasBeta = orientation.beta !== null;
  const hasGamma = orientation.gamma !== null;

  const hasAnySensor = hasAlpha || hasBeta || hasGamma;

  const alphaLooksFrozen =
    orientation.alpha !== null && Math.abs(orientation.alpha) < 1 && hasGamma;

  const shouldUseGammaForHorizontal = !hasAlpha || alphaLooksFrozen;

  const sensorHorizontal = shouldUseGammaForHorizontal
    ? normalizeAngle((orientation.gamma ?? 0) + 180)
    : normalizeAngle(orientation.alpha ?? 0);

  const sensorVertical = hasBeta ? orientation.beta ?? 0 : 70;

  const currentHorizontal =
    controlMode === "manual"
      ? normalizeAngle(manualPosition.horizontal)
      : normalizeAngle(sensorHorizontal);

  const currentVertical =
    controlMode === "manual" ? manualPosition.vertical : sensorVertical;

  const horizontalDiff = angleDifference(currentHorizontal, target.horizontal);
  const verticalDiff = Math.abs(currentVertical - target.vertical);

  const horizontalTargetRange = 32;
  const verticalTargetRange = 20;

  const isInsideTarget =
    horizontalDiff <= horizontalTargetRange &&
    verticalDiff <= verticalTargetRange;

  const showBall =
    challengeState === "found" || challengeState === "catchEnabled";

  const canCapturePrize = challengeState === "catchEnabled";

  function generateNewTarget() {
    const randomHorizontal = randomBetween(100, 260);
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
    setBallOffset({ x: 0, y: -0.35 });
    setBallScale(1.25);
    holdStartRef.current = null;
    lastTouchRef.current = null;
    lastPinchDistanceRef.current = null;
    clearTimers();

    try {
      await requestOrientationPermission();

      generateNewTarget();
      setStarted(true);
      setControlMode("sensor");

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

    function updateOrientation(event: DeviceOrientationEvent, source: string) {
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
    setBallOffset({ x: 0, y: -0.35 });
    setBallScale(1.25);
    holdStartRef.current = null;
    lastTouchRef.current = null;
    lastPinchDistanceRef.current = null;
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

  function handleBallTouchStart(event: TouchEvent<HTMLDivElement>) {
    if (!showBall) return;

    if (event.touches.length === 1) {
      const touch = event.touches[0];

      lastTouchRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };

      lastPinchDistanceRef.current = null;
    }

    if (event.touches.length === 2) {
      lastPinchDistanceRef.current = getTouchDistance(event.touches);
      lastTouchRef.current = null;
    }
  }

  function handleBallTouchMove(event: TouchEvent<HTMLDivElement>) {
    if (!showBall) return;

    if (event.cancelable) {
      event.preventDefault();
    }

    if (event.touches.length === 1 && lastTouchRef.current) {
      const touch = event.touches[0];

      const dx = touch.clientX - lastTouchRef.current.x;
      const dy = touch.clientY - lastTouchRef.current.y;

      const movementFactor = 0.006;

      setBallOffset((current) => ({
        x: Math.max(-2.2, Math.min(2.2, current.x + dx * movementFactor)),
        y: Math.max(-2.2, Math.min(2.2, current.y - dy * movementFactor)),
      }));

      lastTouchRef.current = {
        x: touch.clientX,
        y: touch.clientY,
      };
    }

    if (event.touches.length === 2) {
      const currentDistance = getTouchDistance(event.touches);

      if (lastPinchDistanceRef.current) {
        const delta = currentDistance - lastPinchDistanceRef.current;
        const zoomFactor = 0.006;

        setBallScale((current) =>
          Math.max(0.6, Math.min(3.2, current + delta * zoomFactor))
        );
      }

      lastPinchDistanceRef.current = currentDistance;
    }
  }

  function handleBallTouchEnd() {
    lastTouchRef.current = null;
    lastPinchDistanceRef.current = null;
  }

  function getInstructionMessage() {
    if (showBall) {
      return canCapturePrize
        ? "🎯 Premio listo para capturar"
        : "⚾ Premio revelado";
    }

    if (controlMode === "sensor" && !hasAnySensor) {
      return "⏳ Esperando sensores del celular...";
    }

    if (challengeState === "holding") {
      return "✅ Mantén esta posición";
    }

    if (
      horizontalDiff > horizontalTargetRange &&
      verticalDiff > verticalTargetRange
    ) {
      return controlMode === "manual"
        ? "🔎 Usa los controles para buscar el premio"
        : "🔎 Muévete a los lados y arriba/abajo";
    }

    if (horizontalDiff > horizontalTargetRange) {
      return controlMode === "manual" ? "↔️ Ajusta horizontal" : "↔️ Gira a los lados";
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

        <button onClick={resetDemo} style={primaryButtonStyle}>
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
            Mueve tu teléfono hasta llegar al objetivo. Cuando lo mantengas 3
            segundos, el premio aparecerá en cámara.
          </p>

          <button onClick={startExperience} style={primaryButtonStyle}>
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
              onTouchStart={handleBallTouchStart}
              onTouchMove={handleBallTouchMove}
              onTouchEnd={handleBallTouchEnd}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2,
                touchAction: "none",
                pointerEvents: showBall ? "auto" : "none",
              }}
            >
              <Canvas
                camera={{ position: [0, 0, 4], fov: 45 }}
                gl={{ alpha: true }}
                style={{ background: "transparent" }}
              >
                <ambientLight intensity={1.5} />
                <directionalLight position={[5, 5, 5]} intensity={2} />
                <BallModel
                  visible={showBall}
                  offset={ballOffset}
                  scale={ballScale}
                />
              </Canvas>
            </div>
          )}

          {!showBall && (
            <div style={debugCardStyle}>
              <strong style={{ fontSize: 18 }}>{getInstructionMessage()}</strong>

              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 10,
                }}
              >
                <div style={debugBoxStyle}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Objetivo H</div>
                  <div style={{ fontSize: 30, fontWeight: 900 }}>
                    {Math.round(target.horizontal)}°
                  </div>
                </div>

                <div style={debugBoxStyle}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Objetivo V</div>
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
                Sensor: {orientation.source} / H:{" "}
                {shouldUseGammaForHorizontal ? "gamma" : "alpha"}
              </p>

              {(challengeState === "holding" ||
                challengeState === "found" ||
                challengeState === "catchEnabled") && (
                <div style={progressContainerStyle}>
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
          )}

          {showBall && (
            <div style={miniCardStyle}>
              <strong style={{ fontSize: 17 }}>{getInstructionMessage()}</strong>

              <p style={{ margin: "6px 0 0", fontSize: 12, opacity: 0.85 }}>
                Arrastra la pelota con un dedo. Usa dos dedos para hacer zoom.
              </p>
            </div>
          )}

          {error && !showBall && <div style={errorBoxStyle}>{error}</div>}

          {controlMode === "manual" && cameraReady && !showBall && (
            <div style={manualControlsWrapperStyle}>
              <button
                onClick={() => moveManual(-8, 0)}
                style={manualButtonStyle}
              >
                ← H
              </button>

              <div style={{ display: "grid", gap: 8 }}>
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

          {challengeState === "holding" && cameraReady && !showBall && (
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
              style={captureButtonStyle}
            >
              🎁 Capturar premio
            </button>
          )}

          {challengeState === "searching" && cameraReady && !showBall && (
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

const primaryButtonStyle: CSSProperties = {
  marginTop: 20,
  padding: "14px 24px",
  borderRadius: 999,
  border: "none",
  fontWeight: 800,
  fontSize: 16,
};

const debugCardStyle: CSSProperties = {
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
};

const debugBoxStyle: CSSProperties = {
  background: "rgba(255,255,255,0.1)",
  borderRadius: 14,
  padding: 12,
};

const miniCardStyle: CSSProperties = {
  position: "fixed",
  top: 18,
  left: 18,
  right: 18,
  zIndex: 4,
  color: "white",
  textAlign: "center",
  background: "rgba(0,0,0,0.55)",
  backdropFilter: "blur(8px)",
  borderRadius: 999,
  padding: "12px 18px",
  boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
};

const progressContainerStyle: CSSProperties = {
  width: "100%",
  height: 12,
  background: "rgba(255,255,255,0.18)",
  borderRadius: 999,
  overflow: "hidden",
  marginTop: 12,
};

const errorBoxStyle: CSSProperties = {
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
};

const manualControlsWrapperStyle: CSSProperties = {
  position: "fixed",
  left: 14,
  right: 14,
  bottom: 86,
  zIndex: 5,
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 10,
  alignItems: "center",
};

const manualButtonStyle: CSSProperties = {
  padding: "14px 12px",
  borderRadius: 16,
  border: "none",
  background: "rgba(255,255,255,0.92)",
  color: "#111",
  fontWeight: 900,
  fontSize: 15,
};

const bottomPillStyle: CSSProperties = {
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

const captureButtonStyle: CSSProperties = {
  position: "fixed",
  zIndex: 7,
  bottom: 34,
  left: "50%",
  transform: "translateX(-50%)",
  padding: "18px 34px",
  borderRadius: 999,
  border: "none",
  fontWeight: 950,
  fontSize: 19,
  color: "#111",
  background:
    "linear-gradient(135deg, #ffdd55 0%, #ff9f1c 45%, #ff6b00 100%)",
  boxShadow: "0 12px 32px rgba(255, 157, 0, 0.42)",
};