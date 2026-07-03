"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties } from "react";

type DemoConfig = {
  prizeName: string;
  latitude: number;
  longitude: number;
  activationRadiusMeters: number;
  demoLocal: boolean;
};

type UserLocation = {
  latitude: number;
  longitude: number;
  accuracy: number | null;
};

const CONFIG_STORAGE_KEY = "baseballArDemoConfig";

const defaultConfig: DemoConfig = {
  prizeName: "Premio Baseball Rewards",
  latitude: 19.1738,
  longitude: -96.1342,
  activationRadiusMeters: 60,
  demoLocal: true,
};

function loadConfig(): DemoConfig {
  if (typeof window === "undefined") return defaultConfig;

  try {
    const rawConfig = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!rawConfig) return defaultConfig;

    const parsed = JSON.parse(rawConfig) as Partial<DemoConfig>;

    return {
      prizeName: parsed.prizeName || defaultConfig.prizeName,
      latitude:
        typeof parsed.latitude === "number"
          ? parsed.latitude
          : defaultConfig.latitude,
      longitude:
        typeof parsed.longitude === "number"
          ? parsed.longitude
          : defaultConfig.longitude,
      activationRadiusMeters:
        typeof parsed.activationRadiusMeters === "number"
          ? parsed.activationRadiusMeters
          : defaultConfig.activationRadiusMeters,
      demoLocal:
        typeof parsed.demoLocal === "boolean"
          ? parsed.demoLocal
          : defaultConfig.demoLocal,
    };
  } catch {
    return defaultConfig;
  }
}

function saveConfig(config: DemoConfig) {
  window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function getCurrentLocation(): Promise<UserLocation> {
  return new Promise((resolve, reject) => {
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
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 2000,
      }
    );
  });
}

function injectLeafletCss() {
  if (typeof document === "undefined") return;

  if (!document.querySelector('link[data-leaflet-css="true"]')) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.setAttribute("data-leaflet-css", "true");
    document.head.appendChild(link);
  }

  if (document.querySelector('style[data-leaflet-critical-css="true"]')) return;

  const style = document.createElement("style");
  style.setAttribute("data-leaflet-critical-css", "true");
  style.textContent = `
    .leaflet-container {
      overflow: hidden;
      position: relative;
      width: 100%;
      height: 100%;
      touch-action: pan-x pan-y;
      background: #ddd;
      outline: 0;
      font-family: Arial, Helvetica, sans-serif;
    }
    .leaflet-pane,
    .leaflet-tile,
    .leaflet-marker-icon,
    .leaflet-marker-shadow,
    .leaflet-tile-container,
    .leaflet-pane > svg,
    .leaflet-pane > canvas,
    .leaflet-zoom-box,
    .leaflet-image-layer,
    .leaflet-layer {
      position: absolute;
      left: 0;
      top: 0;
    }
    .leaflet-container img {
      max-width: none !important;
      max-height: none !important;
    }
    .leaflet-tile {
      width: 256px;
      height: 256px;
      user-select: none;
      -webkit-user-drag: none;
    }
    .leaflet-marker-icon {
      display: block;
    }
    .leaflet-control {
      position: relative;
      z-index: 800;
      pointer-events: auto;
    }
    .leaflet-top, .leaflet-bottom {
      position: absolute;
      z-index: 1000;
      pointer-events: none;
    }
    .leaflet-top { top: 0; }
    .leaflet-right { right: 0; }
    .leaflet-bottom { bottom: 0; }
    .leaflet-left { left: 0; }
    .leaflet-control-zoom {
      border: 2px solid rgba(0,0,0,0.2);
      background: #fff;
      border-radius: 4px;
      overflow: hidden;
      margin-left: 10px;
      margin-top: 10px;
    }
    .leaflet-control-zoom a {
      display: block;
      width: 30px;
      height: 30px;
      line-height: 30px;
      text-align: center;
      text-decoration: none;
      color: #000;
      font: bold 18px Arial, Helvetica, sans-serif;
      background: #fff;
      border-bottom: 1px solid #ccc;
    }
    .leaflet-control-attribution {
      background: rgba(255,255,255,0.8);
      padding: 0 5px;
      font-size: 11px;
      margin-right: 0;
      margin-bottom: 0;
    }
    .leaflet-interactive {
      cursor: pointer;
    }
  `;
  document.head.appendChild(style);
}

export default function DemoConfigPage() {
  const [config, setConfig] = useState<DemoConfig>(defaultConfig);
  const [status, setStatus] = useState("");
  const [loadingGps, setLoadingGps] = useState(false);
  const [leafletReady, setLeafletReady] = useState(false);

  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  useEffect(() => {
    const savedConfig = loadConfig();
    setConfig(savedConfig);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function setupLeaflet() {
      if (!mapDivRef.current || mapInstanceRef.current) return;

      injectLeafletCss();

      const L = await import("leaflet");
      if (cancelled || !mapDivRef.current) return;

      leafletRef.current = L;

      const initialConfig = loadConfig();
      const initialLatLng: [number, number] = [
        initialConfig.latitude,
        initialConfig.longitude,
      ];

      const map = L.map(mapDivRef.current, {
        center: initialLatLng,
        zoom: 17,
        zoomControl: true,
        scrollWheelZoom: true,
        dragging: true,
        touchZoom: true,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const prizeIcon = L.divIcon({
        className: "",
        html: `<div style="width:42px;height:42px;border-radius:999px;background:linear-gradient(135deg,#ffdd55,#ff7a00);display:flex;align-items:center;justify-content:center;font-size:23px;box-shadow:0 10px 24px rgba(0,0,0,.35);border:2px solid white;">🎁</div>`,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
      });

      const marker = L.marker(initialLatLng, {
        draggable: true,
        icon: prizeIcon,
      }).addTo(map);

      const circle = L.circle(initialLatLng, {
        radius: initialConfig.activationRadiusMeters,
        color: "#ff9f1c",
        weight: 2,
        fillColor: "#ffdd55",
        fillOpacity: 0.16,
      }).addTo(map);

      marker.on("dragend", () => {
        const position = marker.getLatLng();
        setPrizePosition(position.lat, position.lng, false);
      });

      map.on("click", (event: any) => {
        setPrizePosition(event.latlng.lat, event.latlng.lng, false);
      });

      mapInstanceRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;

      setLeafletReady(true);

      setTimeout(() => map.invalidateSize(), 150);
      setTimeout(() => map.invalidateSize(), 500);
      setTimeout(() => map.invalidateSize(), 1000);
    }

    setupLeaflet();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    updateMapLayers(config.latitude, config.longitude, config.activationRadiusMeters);
  }, [config.latitude, config.longitude, config.activationRadiusMeters]);

  function updateMapLayers(latitude: number, longitude: number, radius: number) {
    if (!markerRef.current || !circleRef.current) return;

    const latLng: [number, number] = [latitude, longitude];
    markerRef.current.setLatLng(latLng);
    circleRef.current.setLatLng(latLng);
    circleRef.current.setRadius(radius);
  }

  function setPrizePosition(
    latitude: number,
    longitude: number,
    shouldCenterMap: boolean
  ) {
    setConfig((current) => {
      const nextConfig = {
        ...current,
        latitude,
        longitude,
      };

      saveConfig(nextConfig);
      return nextConfig;
    });

    updateMapLayers(latitude, longitude, config.activationRadiusMeters);

    if (shouldCenterMap && mapInstanceRef.current) {
      mapInstanceRef.current.setView([latitude, longitude], 18);
    }

    setStatus("Ubicación del premio actualizada. Guarda o inicia la demo.");
  }

  function updateField<K extends keyof DemoConfig>(key: K, value: DemoConfig[K]) {
    setConfig((current) => {
      const nextConfig = {
        ...current,
        [key]: value,
      };

      saveConfig(nextConfig);
      return nextConfig;
    });

    setStatus("Configuración actualizada.");
  }

  async function useMyGpsAsPrize() {
    setLoadingGps(true);
    setStatus("Obteniendo tu ubicación...");

    try {
      const location = await getCurrentLocation();
      setPrizePosition(location.latitude, location.longitude, true);
      setStatus(
        `Premio colocado en tu GPS actual. Precisión: ±${Math.round(
          location.accuracy ?? 0
        )} m.`
      );
    } catch (error) {
      console.error(error);
      setStatus(
        "No pudimos obtener tu GPS. Revisa permisos de ubicación y prueba desde HTTPS/Vercel."
      );
    } finally {
      setLoadingGps(false);
    }
  }

  function saveCurrentConfig() {
    saveConfig(config);
    setStatus("Configuración guardada correctamente.");
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={headerRowStyle}>
          <div>
            <p style={eyebrowStyle}>Baseball Rewards AR</p>
            <h1 style={{ margin: 0 }}>Configuración de demo</h1>
          </div>

          <Link href="/compatible-ar" style={smallLinkStyle}>
            Volver
          </Link>
        </div>

        <p style={descriptionStyle}>
          Toca el mapa o arrastra el marcador para colocar el premio. La demo AR
          leerá esta configuración sin tocar código.
        </p>

        <div style={mapShellStyle}>
          {!leafletReady && (
            <div style={mapLoadingStyle}>Cargando mapa OpenStreetMap...</div>
          )}
          <div ref={mapDivRef} style={mapStyle} />
        </div>

        <div style={formGridStyle}>
          <label style={labelStyle}>
            Nombre del premio
            <input
              value={config.prizeName}
              onChange={(event) => updateField("prizeName", event.target.value)}
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Radio de activación en metros
            <input
              type="number"
              min={5}
              value={config.activationRadiusMeters}
              onChange={(event) =>
                updateField(
                  "activationRadiusMeters",
                  Math.max(5, Number(event.target.value) || 5)
                )
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Latitud
            <input
              type="number"
              value={config.latitude}
              onChange={(event) =>
                updateField("latitude", Number(event.target.value))
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Longitud
            <input
              type="number"
              value={config.longitude}
              onChange={(event) =>
                updateField("longitude", Number(event.target.value))
              }
              style={inputStyle}
            />
          </label>
        </div>

        <button
          onClick={() => updateField("demoLocal", !config.demoLocal)}
          style={{
            ...toggleButtonStyle,
            background: config.demoLocal
              ? "linear-gradient(135deg,#2cff8f,#16c784)"
              : "rgba(255,255,255,0.10)",
            color: config.demoLocal ? "#07140d" : "white",
          }}
        >
          {config.demoLocal
            ? "Demo local: ACTIVADA"
            : "Demo local: DESACTIVADA / GPS real"}
        </button>

        <p style={helperTextStyle}>
          Demo local simula que el usuario está cerca del premio. GPS real usa la
          ubicación real del celular.
        </p>

        <div style={actionsGridStyle}>
          <button
            onClick={useMyGpsAsPrize}
            style={secondaryButtonStyle}
            disabled={loadingGps}
          >
            {loadingGps ? "Obteniendo GPS..." : "Usar mi GPS como premio"}
          </button>

          <button onClick={saveCurrentConfig} style={secondaryButtonStyle}>
            Guardar configuración
          </button>
        </div>

        <Link href="/compatible-ar" style={primaryLinkStyle}>
          Iniciar demo AR
        </Link>

        {status && <p style={statusStyle}>{status}</p>}
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top, rgba(255,210,74,0.18), transparent 32%), #050505",
  color: "white",
  padding: 18,
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  margin: "0 auto",
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 26,
  padding: 18,
  boxShadow: "0 18px 50px rgba(0,0,0,0.45)",
  backdropFilter: "blur(10px)",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: 14,
};

const eyebrowStyle: CSSProperties = {
  margin: "0 0 4px",
  color: "#ffdd55",
  fontSize: 12,
  fontWeight: 900,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const descriptionStyle: CSSProperties = {
  margin: "12px 0 16px",
  opacity: 0.82,
  lineHeight: 1.45,
};

const mapShellStyle: CSSProperties = {
  position: "relative",
  height: 430,
  borderRadius: 22,
  overflow: "hidden",
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.35)",
  touchAction: "pan-x pan-y",
};

const mapStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  minHeight: 430,
  touchAction: "pan-x pan-y",
};

const mapLoadingStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  zIndex: 2,
  background: "rgba(0,0,0,0.65)",
  fontWeight: 800,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(255,255,255,0.82)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.35)",
  color: "white",
  fontSize: 15,
  outline: "none",
};

const toggleButtonStyle: CSSProperties = {
  width: "100%",
  marginTop: 16,
  padding: "14px 16px",
  borderRadius: 999,
  border: "none",
  fontWeight: 950,
  fontSize: 15,
};

const helperTextStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 12,
  opacity: 0.68,
  textAlign: "center",
};

const actionsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const secondaryButtonStyle: CSSProperties = {
  padding: "14px 16px",
  borderRadius: 16,
  border: "1px solid rgba(255,255,255,0.16)",
  color: "white",
  background: "rgba(255,255,255,0.10)",
  fontWeight: 900,
  fontSize: 14,
};

const primaryLinkStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  marginTop: 16,
  padding: "16px 22px",
  borderRadius: 999,
  border: "none",
  color: "#111",
  textDecoration: "none",
  fontWeight: 950,
  fontSize: 16,
  background:
    "linear-gradient(135deg, #ffdd55 0%, #ffb02e 45%, #ff7a00 100%)",
  boxShadow: "0 12px 28px rgba(255, 157, 0, 0.35)",
};

const smallLinkStyle: CSSProperties = {
  color: "white",
  textDecoration: "none",
  background: "rgba(255,255,255,0.10)",
  padding: "10px 14px",
  borderRadius: 999,
  fontWeight: 850,
  whiteSpace: "nowrap",
};

const statusStyle: CSSProperties = {
  margin: "14px 0 0",
  padding: 12,
  borderRadius: 14,
  background: "rgba(0,0,0,0.35)",
  color: "#ffdd55",
  fontWeight: 800,
  textAlign: "center",
};
