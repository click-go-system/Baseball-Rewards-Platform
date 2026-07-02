"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";

function BallModel() {
  const { scene } = useGLTF("/models/ball.glb");

  useFrame(() => {
    scene.rotation.y += 0.01;
  });

  return (
    <primitive
      object={scene}
      scale={2}
      position={[0, 0, 0]}
    />
  );
}

export default function BallViewer() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#111" }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 50 }}>
        <ambientLight intensity={1.2} />
        <directionalLight position={[5, 5, 5]} intensity={2} />
        <BallModel />
        <OrbitControls />
      </Canvas>
    </div>
  );
}