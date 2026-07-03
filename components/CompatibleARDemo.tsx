"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
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

type ChallengeState =
  | "checkingLocation"
  | "tooFar"
  | "ready"
  | "searching"
  | "holding"
  | "found"
  | "catchEnabled";

type ControlMode = "sensor" | "manual";

type PrizeLocation = {
  name: string;
  latitude: number;
  longitude: number;
  activationRadiusMeters: number;
};

type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

const USE_DEMO_LOCATION = true;

const demoPrize: PrizeLocation = {
  name: "Premio Baseball Rewards",
  latitude: 19.1738,
  longitude: -96.1342,
  activationRadiusMeters: 60,
};

const demoUserLocation: UserLocation = {
  latitude: 19.17372,
  longitude: -96.13412,
  accuracy: 8,
};

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360;
}

function angleDifference(a: number, b: number) {
  const diff = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(diff, 360 - diff);
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function calculateDistanceMeters(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) {
  const earthRadiusMeters = 6371000;

  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLat = toRadians(latitudeB - latitudeA);
  const deltaLng = toRadians(longitudeB - longitudeA);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return earthRadiusMeters * c;
}

function calculateBearing(
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number
) {
  const lat1 = toRadians(latitudeA);
  const lat2 = toRadians(latitudeB);
  const deltaLng = toRadians(longitudeB - longitudeA);

  const y = Math.sin(deltaLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(deltaLng);

  return normalizeAngle(toDegrees(Math.atan2(y, x)));
}

function getGeoPosition(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
    if (USE_DEMO_LOCATION) {
      setTimeout(() => {
        resolve(demoUserLocation);
      }, 400);
      return;
    }

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      reject(new Error("Tu navegador no soporta geolocalización."));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 5000,
      }
    );
  });
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
  revealedAt,
}: {
  visible: boolean;
  offset: BallOffset;
  scale: number;
  revealedAt: number | null;
}) {
  const { scene } = useGLTF("/models/ball.glb");
  const groupRef = useRef<THREE.Group | null>(null);

  useFrame(() => {
    scene.rotation.y += 0.018;

    if (!groupRef.current) return;

    const elapsed = revealedAt
      ? Math.min((Date.now() - revealedAt) / 900, 1)
      : 1;

    const popScale = 0.25 + elapsed * 0.75;
    const floating = Math.sin(Date.now() * 0.003) * 0.04;

    groupRef.current.scale.setScalar(scale * popScale);
    groupRef.current.position.set(offset.x, offset.y + floating, 0);
  });

  if (!visible) return null;

  return (
    <group ref={groupRef}>
      <mesh position={[0, -0.78, -0.18]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.55, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.32} />
      </mesh>

      <pointLight
        position={[0, 0.2, 0.9]}
        intensity={2.8}
        distance={3}
        color="#ffd24a"
      />

      <primitive object={scene} />
    </group>
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
    useState<ChallengeState>("ready");

  const [holdProgress, setHoldProgress] = useState(0);

  const [ballOffset, setBallOffset] = useState<BallOffset>({
    x: 0,
    y: -0.22,
  });

  const [ballScale, setBallScale] = useState(1.25);

  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [distanceToPrize, setDistanceToPrize] = useState<number | null>(null);
  const [bearingToPrize, setBearingToPrize] = useState<number | null>(null);
  const [revealedAt, setRevealedAt] = useState<number | null>(null);
  const [capturedCode, setCapturedCode] = useState("");

  const holdStartRef = useRef<number | null>(null);
  const foundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sensorFallbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const locationWatchIdRef = useRef<number | null>(null);

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

  const horizontalTargetRange = 26;
  const verticalTargetRange = 20;

  const isInsideTarget =
    horizontalDiff <= horizontalTargetRange &&
    verticalDiff <= verticalTargetRange;

  const showBall =
    challengeState === "found" || challengeState === "catchEnabled";

  const canCapturePrize = challengeState === "catchEnabled";

  const isInsidePrizeRadius =
    distanceToPrize !== null &&
    distanceToPrize <= demoPrize.activationRadiusMeters;

  function updateLocationData(location: UserLocation) {
    const distance = calculateDistanceMeters(
      location.latitude,
      location.longitude,
      demoPrize.latitude,
      demoPrize.longitude
    );

    const bearing = calculateBearing(
      location.latitude,
      location.longitude,
      demoPrize.latitude,
      demoPrize.longitude
    );

    setUserLocation(location);
    setDistanceToPrize(distance);
    setBearingToPrize(bearing);

    setTarget({
      horizontal: bearing,
      vertical: 70,
    });

    return {
      distance,
      bearing,
      isInside: distance <= demoPrize.activationRadiusMeters,
    };
  }

  async function checkLocationBeforeStart() {
    setError("");
    setChallengeState("checkingLocation");

    try {
      const location = await getGeoPosition();
      const result = updateLocationData(location);

      if (!result.isInside) {
        setChallengeState("tooFar");
        setError(
          `Estás a ${Math.round(
            result.distance
          )} m del premio. Acércate a menos de ${
            demoPrize.activationRadiusMeters
          } m para activarlo.`
        );
        return false;
      }

      setChallengeState("ready");
      return true;
    } catch (err) {
      console.error(err);
      setChallengeState("ready");
      setError(
        "No pudimos obtener tu ubicación. Revisa permisos de ubicación o prueba desde HTTPS/Vercel."
      );
      return false;
    }
  }

  function startLocationWatch() {
    if (USE_DEMO_LOCATION) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
    }

    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const location: UserLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy ?? null,
        };

        const result = updateLocationData(location);

        if (!result.isInside && started && !captured) {
          setError(
            `Te alejaste del premio. Estás a ${Math.round(
              result.distance
            )} m.`
          );
        }
      },
      (err) => {
        console.error(err);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 12000,
      }
    );
  }

  function stopLocationWatch() {
    if (
      typeof navigator !== "undefined" &&
      navigator.geolocation &&
      locationWatchIdRef.current !== null
    ) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
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
    setChallengeState("checkingLocation");
    setHoldProgress(0);
    setBallOffset({ x: 0, y: -0.22 });
    setBallScale(1.25);
    setRevealedAt(null);
    holdStartRef.current = null;
    lastTouchRef.current = null;
    lastPinchDistanceRef.current = null;
    clearTimers();

    try {
      const canStartByLocation = await checkLocationBeforeStart();

      if (!canStartByLocation) {
        setStarted(false);
        return;
      }

      await requestOrientationPermission();

      setStarted(true);
      setControlMode("sensor");
      setChallengeState("searching");
      startLocationWatch();

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
      setChallengeState("ready");
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

      if (hasUsefulData && started) {
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
  }, [started]);

  useEffect(() => {
    if (!started || !cameraReady) return;
    if (challengeState === "found" || challengeState === "catchEnabled") return;
    if (!isInsidePrizeRadius) return;

    let animationFrameId: number;

    function updateHold() {
      if (isInsideTarget) {
        if (holdStartRef.current === null) {
          holdStartRef.current = Date.now();
          setChallengeState("holding");
        }

        const elapsed = Date.now() - holdStartRef.current;
        const progress = Math.min((elapsed / 2800) * 100, 100);

        setHoldProgress(progress);

        if (elapsed >= 2800) {
          setChallengeState("found");
          setHoldProgress(100);
          setRevealedAt(Date.now());

          if (typeof navigator !== "undefined" && navigator.vibrate) {
            navigator.vibrate([120, 70, 160]);
          }

          if (foundTimeoutRef.current) {
            clearTimeout(foundTimeoutRef.current);
          }

          foundTimeoutRef.current = setTimeout(() => {
            setChallengeState("catchEnabled");
          }, 1700);

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
  }, [
    started,
    cameraReady,
    isInsideTarget,
    challengeState,
    isInsidePrizeRadius,
  ]);

  useEffect(() => {
    return () => {
      stopCamera();
      stopLocationWatch();
      clearTimers();
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
    stopLocationWatch();
    clearTimers();

    setCaptured(false);
    setCapturedCode("");
    setStarted(false);
    setError("");
    setChallengeState("ready");
    setHoldProgress(0);
    setBallOffset({ x: 0, y: -0.22 });
    setBallScale(1.25);
    setRevealedAt(null);
    holdStartRef.current = null;
    lastTouchRef.current = null;
    lastPinchDistanceRef.current = null;
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

  function capturePrize() {
    stopCamera();
    stopLocationWatch();

    const code = `BR-${Math.floor(10000 + Math.random() * 89999)}`;
    setCapturedCode(code);
    setCaptured(true);
  }

  function getInstructionMessage() {
    if (showBall) {
      return canCapturePrize
        ? "🎯 Premio listo para capturar"
        : "⚾ Premio revelado";
    }

    if (!isInsidePrizeRadius && distanceToPrize !== null) {
      return `📍 Acércate al premio: ${Math.round(distanceToPrize)} m`;
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
        ? "🔎 Usa los controles para apuntar al premio"
        : "🔎 Gira hacia el premio y ajusta altura";
    }

    if (horizontalDiff > horizontalTargetRange) {
      return controlMode === "manual"
        ? "↔️ Ajusta horizontal"
        : "↔️ Gira hacia el premio";
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
        <div style={successCardStyle}>
          <div style={{ fontSize: 54 }}>🎉</div>

          <h1 style={{ margin: "8px 0" }}>Premio capturado</h1>

          <p style={{ margin: 0, opacity: 0.82 }}>
            Ganaste tu recompensa Baseball Rewards.
          </p>

          <div style={couponBoxStyle}>
            <div style={{ fontSize: 12, opacity: 0.7 }}>Código demo</div>
            <strong style={{ fontSize: 26, letterSpacing: 1.5 }}>
              {capturedCode || "BR-00000"}
            </strong>
          </div>

          <button onClick={resetDemo} style={primaryButtonStyle}>
            Reiniciar demo
          </button>
        </div>
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
            background:
              "radial-gradient(circle at top, rgba(255,210,74,0.20), transparent 34%), #050505",
          }}
        >
          <div style={introCardStyle}>
            <div style={{ fontSize: 52 }}>⚾</div>

            <h1 style={{ margin: "8px 0 0" }}>Baseball Rewards AR</h1>

            <p style={{ maxWidth: 420, opacity: 0.82, lineHeight: 1.45 }}>
              Acércate al punto del premio, apunta con tu celular hacia la
              dirección correcta y mantén la posición para revelar la recompensa.
            </p>

            <div style={locationPanelStyle}>
              <strong>{demoPrize.name}</strong>

              <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.82 }}>
                Radio de activación: {demoPrize.activationRadiusMeters} m
              </p>

              {distanceToPrize !== null && (
                <p
                  style={{
                    margin: "8px 0 0",
                    color: isInsidePrizeRadius ? "#8dffb0" : "#ffca7a",
                    fontWeight: 800,
                  }}
                >
                  Estás a {Math.round(distanceToPrize)} m del premio
                </p>
              )}

              {bearingToPrize !== null && (
                <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.7 }}>
                  Dirección al premio: {Math.round(bearingToPrize)}°
                </p>
              )}

              {userLocation?.accuracy !== null &&
                userLocation?.accuracy !== undefined && (
                  <p style={{ margin: "4px 0 0", fontSize: 12, opacity: 0.7 }}>
                    Precisión GPS: ±{Math.round(userLocation.accuracy)} m
                  </p>
                )}

              {USE_DEMO_LOCATION && (
                <p style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.58 }}>
                  Modo demo activo: simula que estás cerca del premio.
                </p>
              )}
            </div>

            <button
              onClick={startExperience}
              style={{
                ...primaryButtonStyle,
                opacity: challengeState === "checkingLocation" ? 0.7 : 1,
              }}
              disabled={challengeState === "checkingLocation"}
            >
              {challengeState === "checkingLocation"
                ? "Validando ubicación..."
                : "Iniciar búsqueda AR"}
            </button>

            {error && <p style={{ color: "#ffb4b4", maxWidth: 420 }}>{error}</p>}
          </div>
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
                filter: showBall
                  ? "drop-shadow(0 0 18px rgba(255,210,74,0.65))"
                  : "none",
              }}
            >
              <Canvas
                camera={{ position: [0, 0, 4], fov: 45 }}
                gl={{ alpha: true }}
                style={{ background: "transparent" }}
              >
                <ambientLight intensity={1.35} />
                <directionalLight position={[5, 5, 5]} intensity={2} />

                <BallModel
                  visible={showBall}
                  offset={ballOffset}
                  scale={ballScale}
                  revealedAt={revealedAt}
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
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Premio</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>
                    {distanceToPrize !== null
                      ? `${Math.round(distanceToPrize)} m`
                      : "--"}
                  </div>
                </div>

                <div style={debugBoxStyle}>
                  <div style={{ fontSize: 12, opacity: 0.75 }}>Dirección</div>
                  <div style={{ fontSize: 24, fontWeight: 900 }}>
                    {Math.round(target.horizontal)}°
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
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Apuntas H</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>
                    {Math.round(currentHorizontal)}°
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: 11, opacity: 0.7 }}>Apuntas V</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>
                    {Math.round(currentVertical)}°
                  </div>
                </div>
              </div>

              <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.85 }}>
                Diferencia H: {Math.round(horizontalDiff)}° / V: {" "}
                {Math.round(verticalDiff)}°
              </p>

              <p style={{ margin: "4px 0 0", opacity: 0.6, fontSize: 11 }}>
                Modo: {controlMode === "sensor" ? "sensores" : "compatible"} /
                Sensor: {orientation.source} / H: {" "}
                {shouldUseGammaForHorizontal ? "gamma" : "alpha"}
              </p>

              {challengeState === "holding" && (
                <div style={progressContainerStyle}>
                  <div
                    style={{
                      width: `${holdProgress}%`,
                      height: "100%",
                      background: "#ffd24a",
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

              <div
                style={{
                  width: "100%",
                  height: 8,
                  background: "rgba(255,255,255,0.18)",
                  borderRadius: 999,
                  overflow: "hidden",
                  marginTop: 10,
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    background: canCapturePrize ? "#2cff8f" : "#ffd24a",
                  }}
                />
              </div>
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
            <div style={bottomPillStyle}>Mantén la dirección...</div>
          )}

          {challengeState === "found" && cameraReady && (
            <div style={bottomPillStyle}>Premio revelado...</div>
          )}

          {canCapturePrize && cameraReady && (
            <button onClick={capturePrize} style={captureButtonStyle}>
              🎁 Capturar premio
            </button>
          )}

          {challengeState === "searching" && cameraReady && !showBall && (
            <div style={bottomPillStyle}>
              {controlMode === "manual"
                ? "Usa los controles para apuntar al premio"
                : "Apunta hacia la dirección del premio"}
            </div>
          )}
        </>
      )}
    </main>
  );
}

const primaryButtonStyle: CSSProperties = {
  marginTop: 16,
  padding: "15px 26px",
  borderRadius: 999,
  border: "none",
  fontWeight: 900,
  fontSize: 16,
  color: "#111",
  background:
    "linear-gradient(135deg, #ffdd55 0%, #ffb02e 45%, #ff7a00 100%)",
  boxShadow: "0 12px 28px rgba(255, 157, 0, 0.35)",
};

const introCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 26,
  padding: 22,
  boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
  backdropFilter: "blur(10px)",
};

const locationPanelStyle: CSSProperties = {
  marginTop: 16,
  background: "rgba(0,0,0,0.35)",
  borderRadius: 18,
  padding: 14,
  border: "1px solid rgba(255,255,255,0.10)",
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

const successCardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 420,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 26,
  padding: 24,
  boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
};

const couponBoxStyle: CSSProperties = {
  marginTop: 18,
  padding: 16,
  borderRadius: 18,
  background: "rgba(255,210,74,0.14)",
  border: "1px dashed rgba(255,210,74,0.7)",
};
