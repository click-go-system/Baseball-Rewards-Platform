"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";

type DemoConfig = {
  prizeName: string;
  prizeLatitude: number;
  prizeLongitude: number;
  activationRadiusMeters: number;
  useDemoLocation: boolean;
  demoUserLatitude: number;
  demoUserLongitude: number;
};

type LatLng = {
  latitude: number;
  longitude: number;
};

const CONFIG_STORAGE_KEY = "baseballRewardsDemoConfig";

const DEFAULT_CONFIG: DemoConfig = {
  prizeName: "Premio Baseball Rewards",
  prizeLatitude: 19.1738,
  prizeLongitude: -96.1342,
  activationRadiusMeters: 60,
  useDemoLocation: true,
  demoUserLatitude: 19.17372,
  demoUserLongitude: -96.13412,
};

function readConfig() {
  if (typeof window === "undefined") return DEFAULT_CONFIG;

  try {
    const rawConfig = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!rawConfig) return DEFAULT_CONFIG;

    const parsedConfig = JSON.parse(rawConfig) as Partial<DemoConfig>;

    return {
      ...DEFAULT_CONFIG,
      ...parsedConfig,
      prizeLatitude: Number(parsedConfig.prizeLatitude ?? DEFAULT_CONFIG.prizeLatitude),
      prizeLongitude: Number(parsedConfig.prizeLongitude ?? DEFAULT_CONFIG.prizeLongitude),
      activationRadiusMeters: Number(
        parsedConfig.activationRadiusMeters ?? DEFAULT_CONFIG.activationRadiusMeters
      ),
      demoUserLatitude: Number(
        parsedConfig.demoUserLatitude ?? DEFAULT_CONFIG.demoUserLatitude
      ),
      demoUserLongitude: Number(
        parsedConfig.demoUserLongitude ?? DEFAULT_CONFIG.demoUserLongitude
      ),
      useDemoLocation: Boolean(
        parsedConfig.useDemoLocation ?? DEFAULT_CONFIG.useDemoLocation
      ),
    };
  } catch (error) {
    console.error(error);
    return DEFAULT_CONFIG;
  }
}

function saveConfig(config: DemoConfig) {
  window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function toDegrees(value: number) {
  return (value * 180) / Math.PI;
}

function longitudeToWorldPixelX(longitude: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  return ((longitude + 180) / 360) * scale;
}

function latitudeToWorldPixelY(latitude: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const latRad = toRadians(latitude);
  return (
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) *
    scale
  );
}

function worldPixelXToLongitude(pixelX: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  return (pixelX / scale) * 360 - 180;
}

function worldPixelYToLatitude(pixelY: number, zoom: number) {
  const scale = 256 * 2 ** zoom;
  const n = Math.PI - (2 * Math.PI * pixelY) / scale;
  return toDegrees(Math.atan(Math.sinh(n)));
}

function getTileUrl(x: number, y: number, zoom: number) {
  const tileCount = 2 ** zoom;
  const wrappedX = ((x % tileCount) + tileCount) % tileCount;
  return `https://tile.openstreetmap.org/${zoom}/${wrappedX}/${y}.png`;
}

function getCurrentLocation(): Promise<LatLng> {
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
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 3000,
      }
    );
  });
}

export default function DemoConfigPage() {
  const mapRef = useRef<HTMLDivElement | null>(null);

  const [config, setConfig] = useState<DemoConfig>(DEFAULT_CONFIG);
  const [center, setCenter] = useState<LatLng>({
    latitude: DEFAULT_CONFIG.prizeLatitude,
    longitude: DEFAULT_CONFIG.prizeLongitude,
  });
  const [zoom, setZoom] = useState(17);
  const [message, setMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const storedConfig = readConfig();
    setConfig(storedConfig);
    setCenter({
      latitude: storedConfig.prizeLatitude,
      longitude: storedConfig.prizeLongitude,
    });
  }, []);

  const tiles = useMemo(() => {
    const centerPixelX = longitudeToWorldPixelX(center.longitude, zoom);
    const centerPixelY = latitudeToWorldPixelY(center.latitude, zoom);

    const centerTileX = Math.floor(centerPixelX / 256);
    const centerTileY = Math.floor(centerPixelY / 256);

    const tileList = [];

    for (let dx = -2; dx <= 2; dx += 1) {
      for (let dy = -2; dy <= 2; dy += 1) {
        const tileX = centerTileX + dx;
        const tileY = centerTileY + dy;

        if (tileY < 0 || tileY >= 2 ** zoom) continue;

        const left = tileX * 256 - centerPixelX;
        const top = tileY * 256 - centerPixelY;

        tileList.push({
          key: `${zoom}-${tileX}-${tileY}`,
          url: getTileUrl(tileX, tileY, zoom),
          left,
          top,
        });
      }
    }

    return tileList;
  }, [center.latitude, center.longitude, zoom]);

  function updateConfig(nextConfig: DemoConfig) {
    setConfig(nextConfig);
    saveConfig(nextConfig);
    setMessage("Configuración guardada.");
  }

  function handleMapClick(event: React.MouseEvent<HTMLDivElement>) {
    if (!mapRef.current) return;

    const rect = mapRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const clickY = event.clientY - rect.top;

    const centerPixelX = longitudeToWorldPixelX(center.longitude, zoom);
    const centerPixelY = latitudeToWorldPixelY(center.latitude, zoom);

    const worldPixelX = centerPixelX + (clickX - rect.width / 2);
    const worldPixelY = centerPixelY + (clickY - rect.height / 2);

    const latitude = worldPixelYToLatitude(worldPixelY, zoom);
    const longitude = worldPixelXToLongitude(worldPixelX, zoom);

    const nextConfig = {
      ...config,
      prizeLatitude: Number(latitude.toFixed(7)),
      prizeLongitude: Number(longitude.toFixed(7)),
    };

    setCenter({ latitude, longitude });
    updateConfig(nextConfig);
  }

  async function setPrizeToCurrentLocation() {
    setMessage("Obteniendo ubicación actual...");

    try {
      const currentLocation = await getCurrentLocation();
      const nextConfig = {
        ...config,
        prizeLatitude: Number(currentLocation.latitude.toFixed(7)),
        prizeLongitude: Number(currentLocation.longitude.toFixed(7)),
      };

      setCenter(currentLocation);
      updateConfig(nextConfig);
      setMessage("Premio colocado en tu ubicación actual.");
    } catch (error) {
      console.error(error);
      setMessage("No pude obtener tu ubicación. Revisa permisos de ubicación.");
    }
  }

  async function setDemoUserToCurrentLocation() {
    setMessage("Obteniendo ubicación actual...");

    try {
      const currentLocation = await getCurrentLocation();
      const nextConfig = {
        ...config,
        demoUserLatitude: Number(currentLocation.latitude.toFixed(7)),
        demoUserLongitude: Number(currentLocation.longitude.toFixed(7)),
      };

      updateConfig(nextConfig);
      setMessage("Ubicación demo actualizada con tu ubicación actual.");
    } catch (error) {
      console.error(error);
      setMessage("No pude obtener tu ubicación. Revisa permisos de ubicación.");
    }
  }

  function resetConfig() {
    updateConfig(DEFAULT_CONFIG);
    setCenter({
      latitude: DEFAULT_CONFIG.prizeLatitude,
      longitude: DEFAULT_CONFIG.prizeLongitude,
    });
    setZoom(17);
    setMessage("Configuración restablecida.");
  }

  function handleManualSave() {
    setIsSaving(true);
    const safeConfig = {
      ...config,
      prizeLatitude: Number(config.prizeLatitude),
      prizeLongitude: Number(config.prizeLongitude),
      activationRadiusMeters: Number(config.activationRadiusMeters),
      demoUserLatitude: Number(config.demoUserLatitude),
      demoUserLongitude: Number(config.demoUserLongitude),
    };

    updateConfig(safeConfig);
    setCenter({
      latitude: safeConfig.prizeLatitude,
      longitude: safeConfig.prizeLongitude,
    });

    window.setTimeout(() => setIsSaving(false), 350);
  }

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Baseball Rewards</p>
            <h1 style={titleStyle}>Configurar demo AR</h1>
          </div>

          <a href="/" style={backLinkStyle}>
            Abrir demo
          </a>
        </div>

        <div style={modeCardStyle}>
          <div>
            <strong>{config.useDemoLocation ? "Demo local prendida" : "GPS real prendido"}</strong>
            <p style={smallTextStyle}>
              {config.useDemoLocation
                ? "La demo usa una ubicación simulada para probar sin caminar."
                : "La demo usa la ubicación real del celular."}
            </p>
          </div>

          <button
            onClick={() =>
              updateConfig({
                ...config,
                useDemoLocation: !config.useDemoLocation,
              })
            }
            style={{
              ...toggleButtonStyle,
              background: config.useDemoLocation ? "#35f28f" : "#ffcf4a",
            }}
          >
            {config.useDemoLocation ? "Demo ON" : "GPS ON"}
          </button>
        </div>

        <div style={mapWrapperStyle}>
          <div style={mapToolbarStyle}>
            <button onClick={() => setZoom((current) => Math.min(19, current + 1))} style={miniButtonStyle}>
              +
            </button>
            <button onClick={() => setZoom((current) => Math.max(3, current - 1))} style={miniButtonStyle}>
              -
            </button>
            <button
              onClick={() =>
                setCenter({
                  latitude: config.prizeLatitude,
                  longitude: config.prizeLongitude,
                })
              }
              style={toolbarButtonStyle}
            >
              Centrar premio
            </button>
          </div>

          <div ref={mapRef} onClick={handleMapClick} style={mapStyle}>
            {tiles.map((tile) => (
              <img
                key={tile.key}
                src={tile.url}
                alt="map tile"
                draggable={false}
                style={{
                  position: "absolute",
                  width: 256,
                  height: 256,
                  left: `calc(50% + ${tile.left}px)`,
                  top: `calc(50% + ${tile.top}px)`,
                  userSelect: "none",
                }}
              />
            ))}

            <div style={markerStyle}>🎁</div>
            <div style={radiusStyle} />
          </div>
        </div>

        <p style={hintStyle}>
          Toca el mapa para colocar el premio. La configuración se guarda en el navegador automáticamente.
        </p>

        <div style={buttonGridStyle}>
          <button onClick={setPrizeToCurrentLocation} style={actionButtonStyle}>
            Poner premio aquí
          </button>
          <button onClick={setDemoUserToCurrentLocation} style={actionButtonStyle}>
            Usar mi ubicación como demo
          </button>
        </div>

        <div style={formGridStyle}>
          <label style={labelStyle}>
            Nombre del premio
            <input
              value={config.prizeName}
              onChange={(event) =>
                setConfig({ ...config, prizeName: event.target.value })
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Radio de activación en metros
            <input
              type="number"
              value={config.activationRadiusMeters}
              onChange={(event) =>
                setConfig({
                  ...config,
                  activationRadiusMeters: Number(event.target.value),
                })
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Latitud premio
            <input
              type="number"
              value={config.prizeLatitude}
              onChange={(event) =>
                setConfig({ ...config, prizeLatitude: Number(event.target.value) })
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Longitud premio
            <input
              type="number"
              value={config.prizeLongitude}
              onChange={(event) =>
                setConfig({ ...config, prizeLongitude: Number(event.target.value) })
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Latitud demo local
            <input
              type="number"
              value={config.demoUserLatitude}
              onChange={(event) =>
                setConfig({ ...config, demoUserLatitude: Number(event.target.value) })
              }
              style={inputStyle}
            />
          </label>

          <label style={labelStyle}>
            Longitud demo local
            <input
              type="number"
              value={config.demoUserLongitude}
              onChange={(event) =>
                setConfig({ ...config, demoUserLongitude: Number(event.target.value) })
              }
              style={inputStyle}
            />
          </label>
        </div>

        <div style={buttonGridStyle}>
          <button onClick={handleManualSave} style={saveButtonStyle}>
            {isSaving ? "Guardando..." : "Guardar cambios"}
          </button>
          <button onClick={resetConfig} style={dangerButtonStyle}>
            Reset demo
          </button>
        </div>

        {message && <p style={messageStyle}>{message}</p>}
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  padding: 16,
  color: "white",
  background:
    "radial-gradient(circle at top, rgba(255,210,74,0.22), transparent 35%), #050505",
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
};

const headerStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  marginBottom: 16,
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  opacity: 0.66,
  fontWeight: 800,
  textTransform: "uppercase",
  letterSpacing: 1,
};

const titleStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 28,
};

const backLinkStyle: CSSProperties = {
  color: "#111",
  textDecoration: "none",
  background:
    "linear-gradient(135deg, #ffdd55 0%, #ffb02e 45%, #ff7a00 100%)",
  borderRadius: 999,
  padding: "12px 16px",
  fontWeight: 900,
  whiteSpace: "nowrap",
};

const modeCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  background: "rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  padding: 14,
  marginBottom: 14,
};

const smallTextStyle: CSSProperties = {
  margin: "4px 0 0",
  fontSize: 13,
  opacity: 0.72,
};

const toggleButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "12px 16px",
  color: "#111",
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const mapWrapperStyle: CSSProperties = {
  position: "relative",
};

const mapToolbarStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  zIndex: 5,
  display: "flex",
  gap: 8,
};

const mapStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: 420,
  overflow: "hidden",
  background: "#1f2933",
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.14)",
  cursor: "crosshair",
};

const markerStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  transform: "translate(-50%, -90%)",
  zIndex: 4,
  fontSize: 38,
  filter: "drop-shadow(0 6px 12px rgba(0,0,0,0.45))",
  pointerEvents: "none",
};

const radiusStyle: CSSProperties = {
  position: "absolute",
  left: "50%",
  top: "50%",
  width: 96,
  height: 96,
  transform: "translate(-50%, -50%)",
  borderRadius: "50%",
  border: "2px solid rgba(255, 210, 74, 0.95)",
  background: "rgba(255, 210, 74, 0.14)",
  zIndex: 3,
  pointerEvents: "none",
};

const miniButtonStyle: CSSProperties = {
  width: 42,
  height: 42,
  border: "none",
  borderRadius: 14,
  fontSize: 22,
  fontWeight: 950,
  color: "#111",
  background: "rgba(255,255,255,0.92)",
};

const toolbarButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "0 14px",
  fontWeight: 900,
  color: "#111",
  background: "rgba(255,255,255,0.92)",
};

const hintStyle: CSSProperties = {
  margin: "10px 2px 14px",
  fontSize: 13,
  opacity: 0.76,
};

const buttonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 10,
  marginTop: 12,
};

const actionButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "14px 12px",
  color: "#111",
  background: "#ffcf4a",
  fontWeight: 950,
};

const saveButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "14px 12px",
  color: "#111",
  background: "#35f28f",
  fontWeight: 950,
};

const dangerButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "14px 12px",
  color: "white",
  background: "rgba(255, 78, 78, 0.9)",
  fontWeight: 950,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 14,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 6,
  fontSize: 13,
  opacity: 0.92,
  fontWeight: 800,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid rgba(255,255,255,0.14)",
  borderRadius: 14,
  background: "rgba(0,0,0,0.35)",
  color: "white",
  padding: "13px 12px",
  fontSize: 15,
  outline: "none",
};

const messageStyle: CSSProperties = {
  margin: "14px 0 0",
  padding: 12,
  borderRadius: 14,
  background: "rgba(255,255,255,0.10)",
  color: "#d9ffe8",
  fontWeight: 800,
};
