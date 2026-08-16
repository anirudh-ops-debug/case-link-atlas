import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { SEED_CASES } from "./data";
import { buildLinks, inferDirection } from "./matching";
import type {
  AuditEntry,
  CaseLink,
  Evidence,
  Investigation,
  Permission,
  Role,
  Verdict,
} from "./types";

const CASES_KEY = "caselink.cases.v1";
const VERDICTS_KEY = "caselink.verdicts.v1";
const SESSION_KEY = "caselink.session.v1";
const AUDIT_KEY = "caselink.audit.v1";

export interface FeedItem {
  id: string;
  at: string;
  kind: "case" | "evidence" | "link" | "verdict" | "system";
  text: string;
}

export interface Session {
  investigatorId: string;
  name: string;
  unit: string;
  role: Role;
  at: string;
}

/** Role → permission matrix (module 14). The UI checks permissions, not roles. */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  ADMIN: ["case.read", "case.write", "evidence.write", "link.verify", "audit.read", "admin"],
  SUPERVISOR: ["case.read", "case.write", "evidence.write", "link.verify", "audit.read"],
  INVESTIGATOR: ["case.read", "case.write", "evidence.write", "link.verify"],
  ANALYST: ["case.read", "evidence.write"],
  VIEWER: ["case.read"],
};

export const ROLE_NOTES: Record<Role, string> = {
  ADMIN: "Full platform control, retention settings and audit export.",
  SUPERVISOR: "Reviews and countersigns investigator verdicts; reads the audit trail.",
  INVESTIGATOR: "Registers files, adds evidence and records link verdicts.",
  ANALYST: "Adds and enriches evidence; may not record link verdicts.",
  VIEWER: "Read-only situational access. No writes, no verdicts.",
};

interface Ctx {
  ready: boolean;
  cases: Investigation[];
  links: CaseLink[];
  verdicts: Record<string, Verdict>;
  feed: FeedItem[];
  audit: AuditEntry[];
  session: Session | null;
  can: (p: Permission) => boolean;
  logAudit: (action: string, subject: string, detail: string) => void;
  signIn: (investigatorId: string, role?: Role) => void;
  signOut: () => void;
  getCase: (id: string) => Investigation | undefined;
  addCase: (c: Investigation) => void;
  updateCase: (id: string, patch: Partial<Investigation>) => void;
  deleteCase: (id: string) => void;
  addEvidence: (caseId: string, e: Evidence) => void;
  updateEvidence: (caseId: string, id: string, patch: Partial<Evidence>) => void;
  deleteEvidence: (caseId: string, id: string) => void;
  setVerdict: (linkId: string, v: Verdict) => void;
  linksFor: (caseId: string) => CaseLink[];
  resetDemo: () => void;
  allEvidence: Evidence[];
}


const CaseLinkContext = createContext<Ctx | null>(null);

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — in-memory state still works */
  }
}

export function CaseLinkProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [cases, setCases] = useState<Investigation[]>(SEED_CASES);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  // hydrate from storage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = read<Investigation[] | null>(CASES_KEY, null);
    if (stored && Array.isArray(stored) && stored.length) setCases(stored);
    setVerdicts(read<Record<string, Verdict>>(VERDICTS_KEY, {}));
    setSession(read<Session | null>(SESSION_KEY, null));
    setAudit(read<AuditEntry[]>(AUDIT_KEY, []));
    setReady(true);
  }, []);

  useEffect(() => {
    if (ready) write(CASES_KEY, cases);
  }, [cases, ready]);
  useEffect(() => {
    if (ready) write(VERDICTS_KEY, verdicts);
  }, [verdicts, ready]);
  useEffect(() => {
    if (ready) write(AUDIT_KEY, audit);
  }, [audit, ready]);

  const log = useCallback((kind: FeedItem["kind"], text: string) => {
    setFeed((f) =>
      [
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          at: new Date().toISOString(),
          kind,
          text,
        },
        ...f,
      ].slice(0, 40),
    );
  }, []);

  /** Append-only audit trail entry (module 15). */
  const logAudit = useCallback(
    (action: string, subject: string, detail: string) => {
      setAudit((prev) =>
        [
          {
            id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
            at: new Date().toISOString(),
            actor: session?.investigatorId ?? "UNAUTHENTICATED",
            role: session?.role ?? "VIEWER",
            action,
            subject,
            detail,
          },
          ...prev,
        ].slice(0, 300),
      );
    },
    [session],
  );

  const can = useCallback(
    (p: Permission) => (session ? ROLE_PERMISSIONS[session.role].includes(p) : false),
    [session],
  );


  const links = useMemo(() => buildLinks(cases), [cases]);

  const allEvidence = useMemo(() => cases.flatMap((c) => c.evidence), [cases]);

  const getCase = useCallback(
    (id: string) => cases.find((c) => c.id === id),
    [cases],
  );

  const addCase = useCallback(
    (c: Investigation) => {
      setCases((prev) => {
        if (prev.some((x) => x.id === c.id)) {
          return prev.map((x) => (x.id === c.id ? c : x));
        }
        return [c, ...prev];
      });
      log("case", `New investigation registered — ${c.code} · ${c.title}`);
    },
    [log],
  );

  const updateCase = useCallback(
    (id: string, patch: Partial<Investigation>) => {
      setCases((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
      log("case", `Investigation ${id} updated — correlations recomputed`);
    },
    [log],
  );

  const deleteCase = useCallback(
    (id: string) => {
      setCases((prev) => prev.filter((c) => c.id !== id));
      setVerdicts((prev) => {
        const next: Record<string, Verdict> = {};
        for (const [k, v] of Object.entries(prev)) if (!k.includes(id)) next[k] = v;
        return next;
      });
      log("case", `Investigation ${id} archived and removed from the graph`);
    },
    [log],
  );

  const addEvidence = useCallback(
    (caseId: string, e: Evidence) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? {
                ...c,
                evidence: c.evidence.some((x) => x.id === e.id)
                  ? c.evidence.map((x) => (x.id === e.id ? e : x))
                  : [...c.evidence, e],
              }
            : c,
        ),
      );
      log("evidence", `${e.type} evidence ${e.id} indexed on ${caseId}`);
    },
    [log],
  );

  const updateEvidence = useCallback(
    (caseId: string, id: string, patch: Partial<Evidence>) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? {
                ...c,
                evidence: c.evidence.map((x) => (x.id === id ? { ...x, ...patch } : x)),
              }
            : c,
        ),
      );
    },
    [],
  );

  const deleteEvidence = useCallback(
    (caseId: string, id: string) => {
      setCases((prev) =>
        prev.map((c) =>
          c.id === caseId
            ? { ...c, evidence: c.evidence.filter((x) => x.id !== id) }
            : c,
        ),
      );
      log("evidence", `Evidence ${id} withdrawn from ${caseId}`);
    },
    [log],
  );

  const setVerdict = useCallback(
    (id: string, v: Verdict) => {
      setVerdicts((prev) => ({ ...prev, [id]: v }));
      const label =
        v === "confirmed"
          ? "CONFIRMED"
          : v === "rejected"
            ? "REJECTED"
            : v === "more-evidence"
              ? "FLAGGED FOR MORE EVIDENCE"
              : "RESET TO PENDING";
      log("verdict", `Human verification — link ${id.replace("::", " ↔ ")} ${label}`);
      logAudit("Recorded link verdict", id.replace("::", " ↔ "), `Verdict set to ${label}`);
    },
    [log, logAudit],
  );

  const linksFor = useCallback(
    (caseId: string) => links.filter((l) => l.aId === caseId || l.bId === caseId),
    [links],
  );

  const signIn = useCallback(
    (investigatorId: string, role: Role = "INVESTIGATOR") => {
      const s: Session = {
        investigatorId: investigatorId.toUpperCase(),
        name: "Insp. A. Vetrivel",
        unit: "Central Intelligence Cell · Chennai",
        role,
        at: new Date().toISOString(),
      };
      setSession(s);
      write(SESSION_KEY, s);
      log("system", `Secure session opened for ${s.investigatorId} · ${role}`);
      setAudit((prev) =>
        [
          {
            id: `AUD-${Date.now()}-LOGIN`,
            at: new Date().toISOString(),
            actor: s.investigatorId,
            role,
            action: "Signed in",
            subject: "Session",
            detail: `Secure session established with ${role} authorization scope`,
          },
          ...prev,
        ].slice(0, 300),
      );
    },
    [log],
  );

  const signOut = useCallback(() => {
    logAudit("Signed out", "Session", "Secure session closed");
    setSession(null);
    write(SESSION_KEY, null);
  }, [logAudit]);

  const resetDemo = useCallback(() => {
    setCases(SEED_CASES);
    setVerdicts({});
    log("system", "Synthetic dataset restored to baseline");
  }, [log]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      cases,
      links,
      verdicts,
      feed,
      audit,
      session,
      can,
      logAudit,
      signIn,
      signOut,

      getCase,
      addCase,
      updateCase,
      deleteCase,
      addEvidence,
      updateEvidence,
      deleteEvidence,
      setVerdict,
      linksFor,
      resetDemo,
      allEvidence,
    }),
    [
      ready,
      cases,
      links,
      verdicts,
      feed,
      audit,
      session,
      can,
      logAudit,

      signIn,
      signOut,
      getCase,
      addCase,
      updateCase,
      deleteCase,
      addEvidence,
      updateEvidence,
      deleteEvidence,
      setVerdict,
      linksFor,
      resetDemo,
      allEvidence,
    ],
  );

  return <CaseLinkContext.Provider value={value}>{children}</CaseLinkContext.Provider>;
}

export function useCaseLink() {
  const ctx = useContext(CaseLinkContext);
  if (!ctx) throw new Error("useCaseLink must be used inside CaseLinkProvider");
  return ctx;
}

export { inferDirection };
