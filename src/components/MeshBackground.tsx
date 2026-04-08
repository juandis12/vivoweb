'use client';

export default function MeshBackground() {
  return (
    <div className="mesh-gradient absolute inset-0 -z-10 overflow-hidden pointer-events-none">
      <div className="mesh-circle circle-1"></div>
      <div className="mesh-circle circle-2"></div>
      <div className="mesh-circle circle-3"></div>
      <div className="auth-overlay"></div>
    </div>
  );
}
