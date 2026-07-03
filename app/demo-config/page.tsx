"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

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

type GoogleMapStatus = "idle" | "loading" | "ready" | "error";

const CONFIG_STORAGE_KEY = "baseballRewardsDemoConfig";
const DEMO_ROUTE = "/compatible-ar";

const DEFAULT_CONFIG: DemoConfig = {
  prizeName: "Premio Baseball Rewards",
  prizeLatitude: 19.1738,
  prizeLongitude: -96.1342,
  activationRadiusMeters: 60,
  useDemoLocation: true,
  demoUserLatitude: 19.17372,
  demoUserLongitude: -96.13412,
};

declare global {
  interface Window {
    google?: any;
    initBaseballRewardsMap?: () => void;
  }
}

function readConfig() {
  if (typeof window === "undefined") return DEFAULT_CONFIG;

  try {
    const rawConfig = window.localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!rawConfig) return DEFAULT_CONFIG;

    const parsedConfig = JSON.parse(rawConfig) as Partial<DemoConfig>;

    return {
      ...DEFAULT_CONFIG,
      ...parsedConfig,
      prizeLatitude: Number(
        parsedConfig.prizeLatitude ?? DEFAULT_CONFIG.prizeLatitude
      ),
      prizeLongitude: Number(
        parsedConfig.prizeLongitude ?? DEFAULT_CONFIG.prizeLongitude
      ),
      activationRadiusMeters: Number(
        parsedConfig.activationRadiusMeters ??
          DEFAULT_CONFIG.activationRadiusMeters
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

function roundCoordinate(value: number) {
  return Number(value.toFixed(7));
}

function getDemoUserNearPrize(latitude: number, longitude: number) {
  const metersSouth = 10;
  const metersEast = 8;
  const latitudeOffset = metersSouth / 111_320;
  const longitudeOffset =
    metersEast / (111_320 * Math.cos((latitude * Math.PI) / 180));

  return {
    latitude: roundCoordinate(latitude - latitudeOffset),
    longitude: roundCoordinate(longitude + longitudeOffset),
  };
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

function loadGoogleMapsScript() {
  return new Promise<void>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Google Maps solo puede cargar en navegador."));
      return;
    }

    if (window.google?.maps) {
      resolve();
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

    if (!apiKey) {
      reject(
        new Error(
          "Falta configurar NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en Vercel."
        )
      );
      return;
    }

    const existingScript = document.getElementById("google-maps-script");

    if (existingScript) {
      window.initBaseballRewardsMap = () => resolve();
      return;
    }

    window.initBaseballRewardsMap = () => resolve();

    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=initBaseballRewardsMap`;
    script.async = true;
    script.defer = true;
    script.onerror = () =>
      reject(new Error("No se pudo cargar Google Maps. Revisa tu API Key."));

    document.head.appendChild(script);
  });
}

export default function DemoConfigPage() {
  const mapElementRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const geocoderRef = useRef<any>(null);

  const [config, setConfig] = useState<DemoConfig>(DEFAULT_CONFIG);
  const [mapStatus, setMapStatus] = useState<GoogleMapStatus>("idle");
  const [message, setMessage] = useState("");
  const [searchText, setSearchText] = useState("");
  const [isLocating, setIsLocating] = useState(false);

  useEffect(() => {
    const storedConfig = readConfig();
    setConfig(storedConfig);
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function bootMap() {
      try {
        setMapStatus("loading");
        await loadGoogleMapsScript();

        if (!isMounted || !mapElementRef.current || !window.google?.maps) {
          return;
        }

        const center = {
          lat: config.prizeLatitude,
          lng: config.prizeLongitude,
        };

        const map = new window.google.maps.Map(mapElementRef.current, {
          center,
          zoom: 18,
          gestureHandling: "greedy",
          clickableIcons: false,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
        });

        const marker = new window.google.maps.Marker({
          position: center,
          map,
          draggable: true,
          title: "Premio",
          label: "🎁",
        });

        const circle = new window.google.maps.Circle({
          strokeColor: "#ff9f1c",
          strokeOpacity: 0.95,
          strokeWeight: 2,
          fillColor: "#ffdd55",
          fillOpacity: 0.18,
          map,
          center,
          radius: config.activationRadiusMeters,
        });

        geocoderRef.current = new window.google.maps.Geocoder();
        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;

        map.addListener("click", (event: any) => {
          if (!event.latLng) return;
          setPrizeFromMapPoint(event.latLng.lat(), event.latLng.lng(), true);
        });

        marker.addListener("dragend", (event: any) => {
          if (!event.latLng) return;
          setPrizeFromMapPoint(event.latLng.lat(), event.latLng.lng(), true);
        });

        setMapStatus("ready");
      } catch (error) {
        console.error(error);
        setMapStatus("error");
        setMessage(
          error instanceof Error
            ? error.message
            : "No se pudo cargar Google Maps."
        );
      }
    }

    bootMap();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    updateMapVisuals(config, false);
  }, [config.activationRadiusMeters]);

  function updateMapVisuals(nextConfig: DemoConfig, recenter: boolean) {
    const position = {
      lat: nextConfig.prizeLatitude,
      lng: nextConfig.prizeLongitude,
    };

    if (markerRef.current) {
      markerRef.current.setPosition(position);
    }

    if (circleRef.current) {
      circleRef.current.setCenter(position);
      circleRef.current.setRadius(Number(nextConfig.activationRadiusMeters));
    }

    if (mapRef.current && recenter) {
      mapRef.current.panTo(position);
    }
  }

  function persistConfig(nextConfig: DemoConfig, nextMessage: string) {
    setConfig(nextConfig);
    saveConfig(nextConfig);
    updateMapVisuals(nextConfig, true);
    setMessage(nextMessage);
  }

  function setPrizeFromMapPoint(
    latitude: number,
    longitude: number,
    shouldUpdateDemoUser: boolean
  ) {
    const cleanLatitude = roundCoordinate(latitude);
    const cleanLongitude = roundCoordinate(longitude);
    const nextDemoUser = getDemoUserNearPrize(cleanLatitude, cleanLongitude);

    const nextConfig: DemoConfig = {
      ...config,
      prizeLatitude: cleanLatitude,
      prizeLongitude: cleanLongitude,
      demoUserLatitude: shouldUpdateDemoUser
        ? nextDemoUser.latitude
        : config.demoUserLatitude,
      demoUserLongitude: shouldUpdateDemoUser
        ? nextDemoUser.longitude
        : config.demoUserLongitude,
    };

    persistConfig(
      nextConfig,
      shouldUpdateDemoUser
        ? "Premio colocado en el punto seleccionado. Demo local ajustada cerca del premio."
        : "Premio colocado en el punto seleccionado."
    );
  }

  function handleConfigPatch(patch: Partial<DemoConfig>, nextMessage?: string) {
    const nextConfig = {
      ...config,
      ...patch,
      activationRadiusMeters: Number(
        patch.activationRadiusMeters ?? config.activationRadiusMeters
      ),
      prizeLatitude: Number(patch.prizeLatitude ?? config.prizeLatitude),
      prizeLongitude: Number(patch.prizeLongitude ?? config.prizeLongitude),
      demoUserLatitude: Number(
        patch.demoUserLatitude ?? config.demoUserLatitude
      ),
      demoUserLongitude: Number(
        patch.demoUserLongitude ?? config.demoUserLongitude
      ),
    };

    persistConfig(nextConfig, nextMessage ?? "Configuración guardada.");
  }

  async function setPrizeToCurrentGps() {
    setIsLocating(true);
    setMessage("Obteniendo tu ubicación GPS...");

    try {
      const currentLocation = await getCurrentLocation();
      setPrizeFromMapPoint(
        currentLocation.latitude,
        currentLocation.longitude,
        true
      );
      setMessage("Premio colocado en tu ubicación GPS actual.");
    } catch (error) {
      console.error(error);
      setMessage("No pude obtener tu ubicación. Revisa permisos de ubicación.");
    } finally {
      setIsLocating(false);
    }
  }

  async function setDemoUserToCurrentGps() {
    setIsLocating(true);
    setMessage("Obteniendo tu ubicación GPS...");

    try {
      const currentLocation = await getCurrentLocation();
      handleConfigPatch(
        {
          demoUserLatitude: roundCoordinate(currentLocation.latitude),
          demoUserLongitude: roundCoordinate(currentLocation.longitude),
        },
        "Ubicación demo local actualizada con tu GPS actual."
      );
    } catch (error) {
      console.error(error);
      setMessage("No pude obtener tu ubicación. Revisa permisos de ubicación.");
    } finally {
      setIsLocating(false);
    }
  }

  function saveManualCoordinates() {
    setPrizeFromMapPoint(config.prizeLatitude, config.prizeLongitude, true);
  }

  function resetConfig() {
    persistConfig(DEFAULT_CONFIG, "Configuración restablecida.");
  }

  function centerPrize() {
    updateMapVisuals(config, true);
    setMessage("Mapa centrado en el premio.");
  }

  function searchPlace() {
    if (!searchText.trim()) {
      setMessage("Escribe una dirección o lugar para buscar.");
      return;
    }

    if (!geocoderRef.current) {
      setMessage("Google Maps todavía no está listo.");
      return;
    }

    setMessage("Buscando ubicación...");

    geocoderRef.current.geocode(
      { address: searchText },
      (results: any[], status: string) => {
        if (status !== "OK" || !results?.[0]?.geometry?.location) {
          setMessage("No encontré esa ubicación. Intenta con más detalle.");
          return;
        }

        const location = results[0].geometry.location;
        setPrizeFromMapPoint(location.lat(), location.lng(), true);
        setMessage("Premio colocado en la ubicación buscada.");
      }
    );
  }

  const demoModeLabel = config.useDemoLocation
    ? "Demo local prendida"
    : "GPS real prendido";

  return (
    <main style={pageStyle}>
      <section style={cardStyle}>
        <div style={headerStyle}>
          <div>
            <p style={eyebrowStyle}>Baseball Rewards</p>
            <h1 style={titleStyle}>Configurar demo AR</h1>
          </div>

          <a href={DEMO_ROUTE} style={demoLinkStyle}>
            Iniciar demo
          </a>
        </div>

        <div style={modeCardStyle}>
          <div>
            <strong>{demoModeLabel}</strong>
            <p style={smallTextStyle}>
              {config.useDemoLocation
                ? "La demo simula al usuario cerca del premio para probar sin caminar."
                : "La demo usa el GPS real del celular. Debes estar dentro del radio."}
            </p>
          </div>

          <button
            onClick={() =>
              handleConfigPatch(
                { useDemoLocation: !config.useDemoLocation },
                !config.useDemoLocation
                  ? "Demo local prendida."
                  : "GPS real prendido."
              )
            }
            style={{
              ...toggleButtonStyle,
              background: config.useDemoLocation ? "#35f28f" : "#ffcf4a",
            }}
          >
            {config.useDemoLocation ? "Demo local ON" : "GPS real ON"}
          </button>
        </div>

        <div style={searchRowStyle}>
          <input
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            placeholder="Buscar dirección, estadio, negocio o punto"
            style={searchInputStyle}
          />
          <button onClick={searchPlace} style={searchButtonStyle}>
            Buscar
          </button>
        </div>

        <div style={mapWrapperStyle}>
          <div style={mapToolbarStyle}>
            <button onClick={centerPrize} style={toolbarButtonStyle}>
              Centrar premio
            </button>
            <button onClick={setPrizeToCurrentGps} style={toolbarButtonStyle}>
              {isLocating ? "Ubicando..." : "Usar mi GPS como premio"}
            </button>
          </div>

          <div ref={mapElementRef} style={mapStyle} />

          {mapStatus === "loading" && (
            <div style={mapOverlayStyle}>Cargando Google Maps...</div>
          )}

          {mapStatus === "error" && (
            <div style={mapOverlayStyle}>
              <strong>No se pudo cargar Google Maps</strong>
              <span style={{ marginTop: 8, opacity: 0.8 }}>
                Configura NEXT_PUBLIC_GOOGLE_MAPS_API_KEY en Vercel.
              </span>
            </div>
          )}
        </div>

        <p style={hintStyle}>
          Toca el mapa o arrastra el marcador 🎁 para colocar el premio. Esto ya no usa tu ubicación, salvo que pulses “Usar mi GPS como premio”.
        </p>

        <div style={formGridStyle}>
          <label style={labelStyle}>
            Nombre del premio
            <input
              value={config.prizeName}
              onChange={(event) =>
                setConfig({ ...config, prizeName: event.target.value })
              }
              onBlur={() => handleConfigPatch({ prizeName: config.prizeName })}
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
              onBlur={() =>
                handleConfigPatch({
                  activationRadiusMeters: config.activationRadiusMeters,
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
                setConfig({
                  ...config,
                  prizeLatitude: Number(event.target.value),
                })
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
                setConfig({
                  ...config,
                  prizeLongitude: Number(event.target.value),
                })
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
                setConfig({
                  ...config,
                  demoUserLatitude: Number(event.target.value),
                })
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
                setConfig({
                  ...config,
                  demoUserLongitude: Number(event.target.value),
                })
              }
              style={inputStyle}
            />
          </label>
        </div>

        <div style={buttonGridStyle}>
          <button onClick={saveManualCoordinates} style={saveButtonStyle}>
            Guardar coordenadas del premio
          </button>

          <button onClick={setDemoUserToCurrentGps} style={actionButtonStyle}>
            Usar mi GPS como ubicación demo
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
  maxWidth: 920,
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

const demoLinkStyle: CSSProperties = {
  color: "#111",
  textDecoration: "none",
  background:
    "linear-gradient(135deg, #ffdd55 0%, #ffb02e 45%, #ff7a00 100%)",
  borderRadius: 999,
  padding: "12px 16px",
  fontWeight: 950,
  whiteSpace: "nowrap",
};

const modeCardStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 14,
  background: "rgba(0,0,0,0.32)",
  border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 18,
  padding: 14,
  marginBottom: 14,
};

const smallTextStyle: CSSProperties = {
  margin: "6px 0 0",
  opacity: 0.72,
  fontSize: 13,
  lineHeight: 1.35,
};

const toggleButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  color: "#111",
  fontWeight: 950,
  padding: "12px 14px",
  minWidth: 128,
};

const searchRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
  marginBottom: 12,
};

const searchInputStyle: CSSProperties = {
  width: "100%",
  padding: "13px 14px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.35)",
  color: "white",
  fontSize: 15,
  outline: "none",
};

const searchButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 14,
  padding: "13px 16px",
  fontWeight: 900,
  background: "rgba(255,255,255,0.92)",
  color: "#111",
};

const mapWrapperStyle: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  borderRadius: 22,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#111",
  height: 520,
};

const mapStyle: CSSProperties = {
  width: "100%",
  height: "100%",
};

const mapToolbarStyle: CSSProperties = {
  position: "absolute",
  top: 12,
  left: 12,
  right: 12,
  zIndex: 2,
  display: "flex",
  gap: 8,
  flexWrap: "wrap",
};

const toolbarButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "10px 13px",
  background: "rgba(0,0,0,0.72)",
  color: "white",
  fontWeight: 850,
  backdropFilter: "blur(8px)",
};

const mapOverlayStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 4,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexDirection: "column",
  textAlign: "center",
  padding: 22,
  background: "rgba(0,0,0,0.72)",
};

const hintStyle: CSSProperties = {
  margin: "12px 2px 16px",
  opacity: 0.76,
  fontSize: 13,
  lineHeight: 1.35,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
  gap: 12,
};

const labelStyle: CSSProperties = {
  display: "grid",
  gap: 7,
  fontSize: 13,
  fontWeight: 800,
  opacity: 0.92,
};

const inputStyle: CSSProperties = {
  width: "100%",
  padding: "12px 13px",
  borderRadius: 14,
  border: "1px solid rgba(255,255,255,0.16)",
  background: "rgba(0,0,0,0.35)",
  color: "white",
  fontSize: 15,
  outline: "none",
};

const buttonGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
  gap: 10,
  marginTop: 14,
};

const saveButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "14px 16px",
  fontWeight: 950,
  color: "#111",
  background:
    "linear-gradient(135deg, #ffdd55 0%, #ffb02e 45%, #ff7a00 100%)",
};

const actionButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "14px 16px",
  fontWeight: 900,
  color: "#111",
  background: "rgba(255,255,255,0.92)",
};

const dangerButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,120,120,0.55)",
  borderRadius: 16,
  padding: "14px 16px",
  fontWeight: 900,
  color: "#ffb4b4",
  background: "rgba(255,80,80,0.12)",
};

const messageStyle: CSSProperties = {
  margin: "14px 0 0",
  padding: 12,
  borderRadius: 14,
  background: "rgba(0,0,0,0.34)",
  border: "1px solid rgba(255,255,255,0.10)",
  color: "#fff4c7",
};
