import { useEffect, useState } from "react";

export default function Background3D() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const update = () => setIsMobile(window.innerWidth < 900);
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  if (isMobile) {
    return null;
  }

  return (
    <div
      className="absolute inset-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      <div className="absolute -top-20 -left-20 w-80 h-80 rounded-full blur-3xl [background:color-mix(in_oklab,var(--color-primary)_12%,transparent)]" />
      <div className="absolute top-24 right-0 w-96 h-96 rounded-full blur-3xl [background:color-mix(in_oklab,var(--color-secondary)_10%,transparent)]" />
      <div className="absolute bottom-0 left-1/3 w-96 h-96 rounded-full blur-3xl [background:color-mix(in_oklab,var(--color-accent)_8%,transparent)]" />
    </div>
  );
}
