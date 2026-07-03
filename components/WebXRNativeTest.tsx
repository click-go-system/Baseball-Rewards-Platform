"use client";

import { useEffect, useState } from "react";

export default function WebXRNativeTest() {
  const [message, setMessage] = useState("Validando WebXR...");
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    async function checkSupport() {
      try {
        if (!navigator.xr) {
          setMessage("navigator.xr no existe. Este navegador no soporta WebXR.");
          setSupported(false);
          return;
        }

        const ok = await navigator.xr.isSessionSupported("immersive-ar");

        if (ok) {
          setMessage("WebXR AR aparece como compatible.");
          setSupported(true);
        } else {
          setMessage("WebXR AR no es compatible en este dispositivo.");
          setSupported(false);
        }
      } catch (error) {
        setMessage("Error validando soporte: " + String(error));
        setSupported(false);
      }
    }

    checkSupport();
  }, []);

  async function startAR() {
    try {
      setMessage("Intentando abrir sesión AR nativa...");

      if (!navigator.xr) {
        setMessage("navigator.xr no existe.");
        return;
      }

      const session = await navigator.xr.requestSession("immersive-ar", {
        optionalFeatures: ["local-floor"],
      });

      setMessage("✅ Sesión AR abierta correctamente.");

      setTimeout(() => {
        session.end();
        setMessage("Sesión AR cerrada correctamente.");
      }, 3000);
    } catch (error) {
      console.error(error);
      setMessage("❌ Error abriendo AR: " + String(error));
    }
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#050505",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        padding: 24,
        textAlign: "center",
        gap: 20,
      }}
    >
      <h1>Prueba WebXR Nativa</h1>

      <p style={{ maxWidth: 420 }}>{message}</p>

      {supported && (
        <button
          onClick={startAR}
          style={{
            padding: "14px 24px",
            borderRadius: 999,
            border: "none",
            fontWeight: 700,
            fontSize: 16,
          }}
        >
          Probar AR nativa
        </button>
      )}

      <p style={{ fontSize: 13, opacity: 0.7, maxWidth: 420 }}>
        Esta prueba no usa Three.js ni @react-three/xr. Solo valida si Chrome
        puede abrir una sesión AR real.
      </p>
    </main>
  );
}