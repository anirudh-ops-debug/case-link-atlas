import { Link, useRouter } from "@tanstack/react-router";
import {
  LayoutDashboard,
  FolderSearch,
  PlusCircle,
  Boxes,
  Network,
  UserCog,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ShieldAlert,
  Sparkles,
  ScrollText,
  Cpu,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { TraceLogo } from "./TraceLogo";
import { cn } from "@/lib/utils";
import { useCaseLink } from "@/lib/caselink/store";

const NAV = [
  { to: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { to: "/investigations", label: "Active Investigations", icon: FolderSearch },
  { to: "/investigations/new", label: "New Investigation", icon: PlusCircle },
  { to: "/evidence", label: "Evidence Management", icon: Boxes },
  { to: "/links", label: "Cross-Case Links", icon: Network },
  { to: "/engine", label: "Intelligent Matching", icon: Cpu },
  { to: "/assistant", label: "Investigator Assistant", icon: Sparkles },
  { to: "/audit", label: "Audit Trail", icon: ScrollText },
  { to: "/profile", label: "Profile & Settings", icon: UserCog },
] as const;


export function Shell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { ready, session, signOut, cases, links } = useCaseLink();
  const router = useRouter();

  useEffect(() => {
    if (ready && !session) void router.navigate({ to: "/" });
  }, [ready, router, session]);

  if (!ready || !session) {
    return (
      <div className="forensic-grid flex min-h-screen items-center justify-center">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-cyan">Verifying secure session…</p>
      </div>
    );
  }

  return (
    <div className="forensic-grid min-h-screen">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(circle_at_18%_-10%,oklch(0.8_0.128_205.5/0.12),transparent_55%)]" />
      <div className="relative flex min-h-screen">
        <aside
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 flex-col border-r border-border/70 bg-surface/70 backdrop-blur-xl transition-[width] duration-300 md:flex",
            collapsed ? "w-[68px]" : "w-[248px]",
          )}
        >
          <div className="flex items-center gap-2 border-b border-border/70 px-3 py-3">
            <TraceLogo size={32} />
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-[0.18em]">CASELINK</p>
                <p className="label-xs">Investigative Intelligence</p>
              </div>
            )}
          </div>

          <nav className="flex-1 space-y-1 overflow-y-auto p-2">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                activeOptions={{ exact: item.to === "/investigations" }}
                className="group flex items-center gap-2.5 rounded-md border border-transparent px-2.5 py-2 text-[13px] text-muted-foreground transition-colors hover:border-border hover:bg-surface-2/70 hover:text-foreground"
                activeProps={{
                  className:
                    "border-cyan/30 bg-cyan/10 text-foreground [&_svg]:text-cyan",
                }}
                title={item.label}
              >
                <item.icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            ))}
          </nav>

          {!collapsed && (
            <div className="m-2 rounded-md border border-border/70 bg-surface-2/50 p-2.5">
              <p className="label-xs">Corpus status</p>
              <p className="mt-1 font-mono text-[11px] text-foreground">
                {cases.length} files · {links.length} candidate links
              </p>
              <p className="mt-1.5 flex items-center gap-1 font-mono text-[10px] text-amber">
                <ShieldAlert className="size-3" /> SYNTHETIC DEMO DATA ONLY
              </p>
            </div>
          )}

          <button
            onClick={() => setCollapsed((c) => !c)}
            className="flex items-center gap-2 border-t border-border/70 px-3 py-2.5 text-left label-xs transition-colors hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <>
                <PanelLeftClose className="size-4" /> Collapse
              </>
            )}
          </button>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur-xl">
            <div className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="label-xs">{subtitle ?? "Central Intelligence Cell"}</p>
                <h1 className="truncate text-lg font-semibold tracking-tight">{title}</h1>
              </div>
              <div className="flex items-center gap-2">
                {actions}
                {session ? (
                  <span className="hidden rounded-sm border border-cyan/40 bg-cyan/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.14em] text-cyan sm:inline">
                    {session.investigatorId} · {session.role}
                  </span>
                ) : null}
                {session ? (
                  <button

                    onClick={() => {
                      void signOut().finally(() => router.navigate({ to: "/" }));
                    }}
                    className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:border-danger/50 hover:text-danger"
                  >
                    <LogOut className="size-3.5" /> End session
                  </button>
                ) : null}
              </div>
            </div>
            <nav className="flex gap-1 overflow-x-auto border-t border-border/60 px-2 py-1.5 md:hidden">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/investigations" }}
                  className="shrink-0 rounded-md px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground"
                  activeProps={{ className: "bg-cyan/10 text-cyan" }}
                >
                  {item.label.split(" ")[0]}
                </Link>
              ))}
            </nav>
          </header>

          <main className="min-w-0 flex-1 p-3 sm:p-4">{children}</main>

          <footer className="border-t border-border/70 px-4 py-3 label-xs">
            CASELINK · hackathon prototype · fictional synthetic dataset · AI output is decision
            support only, never an enforcement decision
          </footer>
        </div>
      </div>
    </div>
  );
}
