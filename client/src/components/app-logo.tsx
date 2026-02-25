import { cn } from "@/lib/utils";

type AppLogoProps = {
  compact?: boolean;
  className?: string;
};

export default function AppLogo({ compact = false, className }: AppLogoProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <div className="relative h-11 w-11 overflow-hidden rounded-xl border border-border/70 bg-card shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/90 via-accent/80 to-secondary/90" />
        <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 rounded-md border border-white/70 bg-white/15 backdrop-blur-sm" />
        <div className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white" />
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
