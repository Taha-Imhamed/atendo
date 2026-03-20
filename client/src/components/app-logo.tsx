import { cn } from "@/lib/utils";

type AppLogoProps = {
  compact?: boolean;
  className?: string;
};

export default function AppLogo({ compact = false, className }: AppLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl border border-border/80 bg-white shadow-[0_10px_24px_color-mix(in_oklab,#b7c9bd_18%,transparent)]">
        <div className="absolute inset-[4px] rounded-[14px] bg-secondary/65" />
        <div className="absolute inset-[9px] rounded-[11px] border border-white/70 bg-card" />
        <div className="absolute inset-[13px] rounded-[8px] bg-primary/25" />
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="relative z-10 h-5 w-5 text-foreground"
        >
          <path
            d="M7.5 12.5 10.5 15.5 16.5 9.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <div className="absolute right-[6px] top-[6px] h-2.5 w-2.5 rounded-full bg-[#FBBAB3] shadow-[0_0_0_2px_white]" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <p className="font-heading text-2xl font-black tracking-tight text-foreground">
            Attendo
          </p>
          <p className="text-[11px] text-muted-foreground">Smart Attendance Suite</p>
        </div>
      )}
    </div>
  );
}
