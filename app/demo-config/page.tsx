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

type SearchResult = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
};

const CONFIG_STORAGE_KEY = "baseballArDemoConfig";

const defaultConfig: DemoConfig = {
  prizeName: "Premio Baseball Rewards",
  latitude: 19.1738,
  longitude: -96.1342,
  activationRadiusMeters: 60,
  demoLocal: true,
};

function loadConfigFromStorage(): DemoConfig {
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

export default function DemoConfigPage() {
  const mapDivRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);
  const leafletRef = useRef<any>(null);

  const [config, setConfig] = useState<DemoConfig>(defaultConfig);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [mapReady, setMapReady] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedResultId, setSelectedResultId] = useState<number | null>(null);

  useEffect(() => {
    const initialConfig = loadConfigFromStorage();
    setConfig(initialConfig);

    let cancelled = false;

    async function setupLeaflet() {
      if (!mapDivRef.current || mapRef.current) return;

      try {
        const L = await import("leaflet");
        if (cancelled || !mapDivRef.current) return;

        leafletRef.current = L;

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

        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).addTo(map);

        const prizeIcon = L.divIcon({
          className: "baseball-prize-marker",
          html: "<div>🎁</div>",
          iconSize: [42, 42],
          iconAnchor: [21, 21],
        });

        const marker = L.marker(initialLatLng, {
          draggable: true,
          icon: prizeIcon,
        }).addTo(map);

        const circle = L.circle(initialLatLng, {
          radius: initialConfig.activationRadiusMeters,
          color: "#ffdd55",
          fillColor: "#ffdd55",
          fillOpacity: 0.16,
          weight: 2,
        }).addTo(map);

        marker.on("dragend", () => {
          const latLng = marker.getLatLng();
          updatePrizePosition(latLng.lat, latLng.lng, false);
        });

        map.on("click", (event: any) => {
          updatePrizePosition(event.latlng.lat, event.latlng.lng, false);
        });

        mapRef.current = map;
        markerRef.current = marker;
        circleRef.current = circle;
        setMapReady(true);

        setTimeout(() => {
          map.invalidateSize();
        }, 250);
      } catch (err) {
        console.error(err);
        setError("No se pudo cargar el mapa. Revisa que Leaflet esté instalado.");
      }
    }

    setupLeaflet();

    return () => {
      cancelled = true;

      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!circleRef.current) return;
    circleRef.current.setRadius(config.activationRadiusMeters);
  }, [config.activationRadiusMeters]);

  function updatePrizePosition(
    latitude: number,
    longitude: number,
    moveMap = true,
    zoom = 17,
  ) {
    const nextLatitude = Number(latitude);
    const nextLongitude = Number(longitude);

    if (!Number.isFinite(nextLatitude) || !Number.isFinite(nextLongitude)) {
      setError("Coordenadas inválidas.");
      return;
    }

    setConfig((current) => ({
      ...current,
      latitude: nextLatitude,
      longitude: nextLongitude,
    }));

    setSaved(false);
    setError("");

    const nextLatLng: [number, number] = [nextLatitude, nextLongitude];

    if (markerRef.current) {
      markerRef.current.setLatLng(nextLatLng);
    }

    if (circleRef.current) {
      circleRef.current.setLatLng(nextLatLng);
    }

    if (mapRef.current && moveMap) {
      mapRef.current.setView(nextLatLng, zoom, {
        animate: true,
      });

      setTimeout(() => {
        mapRef.current?.invalidateSize();
      }, 200);
    }
  }

  async function searchPlaces() {
    const query = searchText.trim();

    if (!query) {
      setError("Escribe un lugar para buscar.");
      return;
    }

    setSearching(true);
    setError("");
    setSaved(false);
    setSelectedResultId(null);

    try {
      const searchUrl = new URL("https://nominatim.openstreetmap.org/search");
      searchUrl.searchParams.set("format", "jsonv2");
      searchUrl.searchParams.set("q", query);
      searchUrl.searchParams.set("limit", "5");
      searchUrl.searchParams.set("addressdetails", "1");

      const response = await fetch(searchUrl.toString(), {
        headers: {
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("No se pudo buscar el lugar.");
      }

      const results = (await response.json()) as SearchResult[];
      setSearchResults(results);

      if (results.length === 0) {
        setError("No encontramos ese lugar. Intenta con una búsqueda más específica.");
        return;
      }

      const firstResult = results[0];
      setSelectedResultId(firstResult.place_id);
      updatePrizePosition(Number(firstResult.lat), Number(firstResult.lon), true, 16);
    } catch (err) {
      console.error(err);
      setError("No se pudo buscar el lugar. Intenta de nuevo.");
    } finally {
      setSearching(false);
    }
  }

  function selectSearchResult(result: SearchResult) {
    setSelectedResultId(result.place_id);
    updatePrizePosition(Number(result.lat), Number(result.lon), true, 17);
  }

  function useCurrentGpsAsPrize() {
    setError("");
    setSaved(false);

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setError("Tu navegador no soporta geolocalización.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        updatePrizePosition(
          position.coords.latitude,
          position.coords.longitude,
          true,
          18,
        );
      },
      () => {
        setError("No pudimos obtener tu GPS. Revisa permisos de ubicación.");
      },
      {
        enableHighAccuracy: true,
        timeout: 12000,
        maximumAge: 3000,
      },
    );
  }

  function saveConfig() {
    try {
      window.localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(config));
      setSaved(true);
      setError("");
    } catch {
      setSaved(false);
      setError("No se pudo guardar la configuración.");
    }
  }

  return (
    <main style={pageStyle}>
      <style>{`
        .leaflet-container {
          width: 100%;
          height: 100%;
          position: relative;
          overflow: hidden;
          touch-action: pan-x pan-y;
          background: #111;
          font-family: inherit;
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

        .leaflet-tile,
        .leaflet-marker-icon,
        .leaflet-marker-shadow {
          user-select: none;
          -webkit-user-drag: none;
        }

        .leaflet-control-container .leaflet-top,
        .leaflet-control-container .leaflet-bottom {
          position: absolute;
          z-index: 1000;
          pointer-events: none;
        }

        .leaflet-control-container .leaflet-top {
          top: 10px;
        }

        .leaflet-control-container .leaflet-right {
          right: 10px;
        }

        .leaflet-control-container .leaflet-bottom {
          bottom: 10px;
        }

        .leaflet-control-container .leaflet-left {
          left: 10px;
        }

        .leaflet-control {
          float: left;
          clear: both;
          pointer-events: auto;
        }

        .leaflet-control-zoom {
          border: 1px solid rgba(0,0,0,0.25);
          border-radius: 10px;
          overflow: hidden;
          background: white;
        }

        .leaflet-control-zoom a {
          display: block;
          width: 34px;
          height: 34px;
          line-height: 34px;
          text-align: center;
          text-decoration: none;
          color: #111;
          font-weight: 900;
          border-bottom: 1px solid rgba(0,0,0,0.18);
          background: white;
        }

        .leaflet-control-zoom a:last-child {
          border-bottom: none;
        }

        .leaflet-control-attribution {
          font-size: 10px;
          background: rgba(255,255,255,0.78);
          padding: 3px 6px;
          border-radius: 8px;
          color: #111;
        }

        .leaflet-control-attribution a {
          color: #111;
        }

        .baseball-prize-marker {
          background: transparent;
          border: none;
        }

        .baseball-prize-marker div {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 24px;
          background: linear-gradient(135deg, #ffdd55, #ff7a00);
          box-shadow: 0 8px 20px rgba(0,0,0,0.35);
          border: 3px solid rgba(255,255,255,0.95);
        }
      `}</style>

      <section style={cardStyle}>
        <div style={headerRowStyle}>
          <div>
            <p style={eyebrowStyle}>BASEBALL REWARDS AR</p>
            <h1 style={titleStyle}>Configuración de demo</h1>
          </div>

          <Link href="/compatible-ar" style={backButtonStyle}>
            Volver
          </Link>
        </div>

        <p style={descriptionStyle}>
          Busca un lugar, toca el mapa o arrastra el marcador para colocar el
          premio. La demo AR leerá esta configuración sin tocar código.
        </p>

        <div style={searchPanelStyle}>
          <label style={labelStyle}>Buscar lugar</label>
          <div style={searchRowStyle}>
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  searchPlaces();
                }
              }}
              placeholder="Ej. Estadio Beto Ávila, Veracruz"
              style={inputStyle}
            />

            <button
              type="button"
              onClick={searchPlaces}
              disabled={searching}
              style={compactButtonStyle}
            >
              {searching ? "Buscando..." : "Buscar"}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div style={resultsListStyle}>
              {searchResults.map((result) => (
                <button
                  key={result.place_id}
                  type="button"
                  onClick={() => selectSearchResult(result)}
                  style={{
                    ...resultButtonStyle,
                    ...(selectedResultId === result.place_id
                      ? selectedResultButtonStyle
                      : {}),
                  }}
                >
                  <strong style={{ display: "block" }}>
                    {selectedResultId === result.place_id ? "🎯 " : "📍 "}
                    {result.display_name.split(",")[0]}
                  </strong>
                  <span style={{ opacity: 0.72 }}>{result.display_name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div style={mapWrapperStyle}>
          <div ref={mapDivRef} style={mapStyle} />
          {!mapReady && <div style={mapLoadingStyle}>Cargando mapa...</div>}
        </div>

        <div style={formGridStyle}>
          <label style={fieldStyle}>
            <span style={labelStyle}>Nombre del premio</span>
            <input
              value={config.prizeName}
              onChange={(event) => {
                setSaved(false);
                setConfig((current) => ({
                  ...current,
                  prizeName: event.target.value,
                }));
              }}
              style={inputStyle}
            />
          </label>

          <label style={fieldStyle}>
            <span style={labelStyle}>Radio de activación en metros</span>
            <input
              type="number"
              min={5}
              max={1000}
              value={config.activationRadiusMeters}
              onChange={(event) => {
                setSaved(false);
                const nextRadius = Number(event.target.value);

                setConfig((current) => ({
                  ...current,
                  activationRadiusMeters: Number.isFinite(nextRadius)
                    ? nextRadius
                    : current.activationRadiusMeters,
                }));
              }}
              style={inputStyle}
            />
          </label>
        </div>

        <div style={coordinatesGridStyle}>
          <div style={coordinateBoxStyle}>
            <span>Latitud</span>
            <strong>{config.latitude.toFixed(6)}</strong>
          </div>

          <div style={coordinateBoxStyle}>
            <span>Longitud</span>
            <strong>{config.longitude.toFixed(6)}</strong>
          </div>
        </div>

        <label style={toggleRowStyle}>
          <input
            type="checkbox"
            checked={config.demoLocal}
            onChange={(event) => {
              setSaved(false);
              setConfig((current) => ({
                ...current,
                demoLocal: event.target.checked,
              }));
            }}
          />
          <span>
            <strong>Demo local</strong>
            <small>
              Simula al usuario cerca del premio. Apágalo para usar GPS real.
            </small>
          </span>
        </label>

        <div style={actionsGridStyle}>
          <button type="button" onClick={useCurrentGpsAsPrize} style={secondaryButtonStyle}>
            📍 Usar mi GPS como premio
          </button>

          <button type="button" onClick={saveConfig} style={primaryButtonStyle}>
            Guardar configuración
          </button>
        </div>

        <Link href="/compatible-ar" style={startDemoButtonStyle}>
          Iniciar demo
        </Link>

        {saved && <p style={successTextStyle}>✅ Configuración guardada.</p>}
        {error && <p style={errorTextStyle}>{error}</p>}
      </section>
    </main>
  );
}

const pageStyle: CSSProperties = {
  minHeight: "100svh",
  background:
    "radial-gradient(circle at top, rgba(255,210,74,0.16), transparent 34%), #050505",
  color: "white",
  padding: "calc(env(safe-area-inset-top, 0px) + 18px) 16px calc(env(safe-area-inset-bottom, 0px) + 28px)",
};

const cardStyle: CSSProperties = {
  width: "100%",
  maxWidth: 760,
  margin: "0 auto",
  padding: "clamp(18px, 4vw, 28px)",
  borderRadius: 28,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 18px 54px rgba(0,0,0,0.42)",
  backdropFilter: "blur(10px)",
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 14,
  alignItems: "flex-start",
};

const eyebrowStyle: CSSProperties = {
  margin: 0,
  color: "#ffdd55",
  fontSize: 13,
  fontWeight: 950,
  letterSpacing: 2.4,
};

const titleStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: "clamp(28px, 7vw, 42px)",
  lineHeight: 1.04,
};

const descriptionStyle: CSSProperties = {
  margin: "18px 0",
  color: "rgba(255,255,255,0.82)",
  fontSize: 16,
  lineHeight: 1.48,
};

const backButtonStyle: CSSProperties = {
  flexShrink: 0,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "12px 16px",
  borderRadius: 999,
  color: "white",
  textDecoration: "none",
  fontWeight: 900,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.14)",
};

const searchPanelStyle: CSSProperties = {
  display: "grid",
  gap: 10,
  marginBottom: 14,
  padding: 12,
  borderRadius: 18,
  background: "rgba(0,0,0,0.30)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const searchRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) auto",
  gap: 10,
};

const compactButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 16,
  padding: "0 16px",
  minHeight: 50,
  fontWeight: 950,
  color: "#111",
  background: "linear-gradient(135deg, #ffdd55, #ff7a00)",
};

const resultsListStyle: CSSProperties = {
  display: "grid",
  gap: 8,
  maxHeight: 240,
  overflowY: "auto",
  paddingRight: 4,
};

const resultButtonStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.12)",
  borderRadius: 16,
  padding: 12,
  background: "rgba(255,255,255,0.08)",
  color: "white",
  textAlign: "left",
  fontSize: 13,
  lineHeight: 1.35,
};

const selectedResultButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,210,74,0.72)",
  background: "rgba(255,210,74,0.16)",
};

const mapWrapperStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "min(62vh, 520px)",
  minHeight: 330,
  overflow: "hidden",
  borderRadius: 24,
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#111",
};

const mapStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
};

const mapLoadingStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "rgba(0,0,0,0.55)",
  fontWeight: 900,
};

const formGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 14,
  marginTop: 18,
};

const fieldStyle: CSSProperties = {
  display: "grid",
  gap: 8,
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 900,
  color: "rgba(255,255,255,0.82)",
};

const inputStyle: CSSProperties = {
  width: "100%",
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 16,
  padding: "14px 15px",
  color: "white",
  background: "rgba(0,0,0,0.38)",
  fontSize: 16,
  outline: "none",
};

const coordinatesGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: 12,
  marginTop: 14,
};

const coordinateBoxStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  padding: 14,
  borderRadius: 16,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
  fontSize: 12,
  color: "rgba(255,255,255,0.70)",
};

const toggleRowStyle: CSSProperties = {
  display: "flex",
  gap: 12,
  alignItems: "flex-start",
  marginTop: 16,
  padding: 14,
  borderRadius: 18,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(255,255,255,0.10)",
};

const actionsGridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
  gap: 12,
  marginTop: 16,
};

const secondaryButtonStyle: CSSProperties = {
  border: "1px solid rgba(255,255,255,0.16)",
  borderRadius: 999,
  padding: "14px 18px",
  color: "white",
  background: "rgba(255,255,255,0.10)",
  fontWeight: 900,
};

const primaryButtonStyle: CSSProperties = {
  border: "none",
  borderRadius: 999,
  padding: "14px 18px",
  color: "#111",
  background: "linear-gradient(135deg, #ffdd55, #ff7a00)",
  fontWeight: 950,
};

const startDemoButtonStyle: CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  marginTop: 14,
  borderRadius: 999,
  padding: "15px 18px",
  color: "#111",
  background: "#2cff8f",
  textDecoration: "none",
  fontWeight: 950,
};

const successTextStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#8dffb0",
  fontWeight: 800,
  textAlign: "center",
};

const errorTextStyle: CSSProperties = {
  margin: "12px 0 0",
  color: "#ffb4b4",
  fontWeight: 800,
  textAlign: "center",
};
