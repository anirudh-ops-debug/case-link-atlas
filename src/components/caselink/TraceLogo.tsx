import { cn } from "@/lib/utils";

export function TraceLogo({
  size = 40,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      className={cn("shrink-0", className)}
      aria-label="TRACE three-node emblem"
      role="img"
    >
      <defs>
        <radialGradient id="tl-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.5" />
          <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="24" cy="24" r="22" fill="url(#tl-glow)" />
      <circle
        cx="24"
        cy="24"
        r="17"
        fill="none"
        stroke="var(--border)"
        strokeWidth="1"
        strokeDasharray="3 5"
      >
        <animateTransform
          attributeName="transform"
          type="rotate"
          from="0 24 24"
          to="360 24 24"
          dur="26s"
          repeatCount="indefinite"
        />
      </circle>
      <g stroke="var(--cyan)" strokeWidth="1.2" strokeLinecap="round" opacity="0.85">
        <line x1="24" y1="11" x2="13" y2="33">
          <animate attributeName="opacity" values="0.3;1;0.3" dur="3.2s" repeatCount="indefinite" />
        </line>
        <line x1="13" y1="33" x2="35" y2="33">
          <animate
            attributeName="opacity"
            values="0.3;1;0.3"
            dur="3.2s"
            begin="1.05s"
            repeatCount="indefinite"
          />
        </line>
        <line x1="35" y1="33" x2="24" y2="11">
          <animate
            attributeName="opacity"
            values="0.3;1;0.3"
            dur="3.2s"
            begin="2.1s"
            repeatCount="indefinite"
          />
        </line>
      </g>
      <g>
        <circle cx="24" cy="11" r="3.4" fill="var(--cyan)" className="animate-trace-pulse" />
        <circle
          cx="13"
          cy="33"
          r="3.4"
          fill="var(--amber)"
          className="animate-trace-pulse"
          style={{ animationDelay: "0.8s" }}
        />
        <circle
          cx="35"
          cy="33"
          r="3.4"
          fill="var(--success)"
          className="animate-trace-pulse"
          style={{ animationDelay: "1.6s" }}
        />
      </g>
    </svg>
  );
}
