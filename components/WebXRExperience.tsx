"use client";


import { useState, useEffect } from "react";

export default function WebXRExperience() {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    async function checkXR() {
      if (!navigator.xr) return;

      try {
        const isSupported = await navigator.xr.isSessionSupported(
          "immersive-ar"
        );

        setSupported(isSupported);
      } catch (e) {
        console.error(e);
      }
    }

    checkXR();
  }, []);

  return (
    <main
      style={{
        height: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        flexDirection: "column",
        gap: "20px",
        padding: "20px",
      }}
    >
      <h1>Baseball Rewards AR</h1>

      <p>
        Para la mejor experiencia utiliza Google Chrome en Android.
      </p>

      {supported ? (
        <button
          style={{
            padding: "16px 24px",
            borderRadius: "12px",
            border: "none",
            fontWeight: "bold",
            cursor: "pointer",
          }}
        >
          Iniciar Experiencia AR
        </button>
      ) : (
        <div>
          Tu dispositivo no soporta WebXR AR.
          <br />
          Usa Chrome en Android o entra a la versión demo.
        </div>
      )}
    </main>
  );
}