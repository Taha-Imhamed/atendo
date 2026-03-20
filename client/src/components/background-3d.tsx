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
      <div className="absolute -top-28 -left-20 h-96 w-96 rounded-full blur-3xl [background:color-mix(in_oklab,#fbbab3_20%,white_20%)]" />
      <div className="absolute right-2 top-16 h-[26rem] w-[26rem] rounded-full blur-3xl [background:color-mix(in_oklab,#f9dfb2_18%,white_24%)]" />
      <div className="absolute bottom-[-7rem] left-1/3 h-[22rem] w-[30rem] rounded-full blur-3xl [background:color-mix(in_oklab,#b9e6cc_16%,white_26%)]" />
      <div className="absolute inset-0 [background:linear-gradient(180deg,transparent_0%,color-mix(in_oklab,white_24%,transparent)_100%)]" />
    </div>
  );
}
