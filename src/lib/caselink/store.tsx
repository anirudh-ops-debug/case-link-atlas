import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { User } from "@supabase/supabase-js";

import { supabase } from "@/integrations/supabase/client";

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
const ROLE_SELECTION_KEY = "caselink.auth-role.v1";
const AUDIT_KEY = "caselink.audit.v1";

export type DatabaseRole = "investigator" | "senior_investigator" | "administrator";

export const DATABASE_ROLE_TO_ROLE: Record<DatabaseRole, Role> = {
  investigator: "INVESTIGATOR",
  senior_investigator: "SUPERVISOR",
  administrator: "ADMIN",
};

export interface FeedItem {
  id: string;
  at: string;
  kind: "case" | "evidence" | "link" | "verdict" | "system";
  text: string;
}

export interface Session {
  userId: string;
  email: string;
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
  authError: string | null;
  cases: Investigation[];
  links: CaseLink[];
  verdicts: Record<string, Verdict>;
  feed: FeedItem[];
  audit: AuditEntry[];
  session: Session | null;
  can: (p: Permission) => boolean;
  logAudit: (action: string, subject: string, detail: string) => void;
  signIn: (email: string, password: string, role: DatabaseRole) => Promise<void>;
  signUp: (email: string, password: string, role: DatabaseRole) => Promise<{ requiresEmailConfirmation: boolean }>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
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

function remove(key: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(key);
}

function isDatabaseRole(value: string | null): value is DatabaseRole {
  return value === "investigator" || value === "senior_investigator" || value === "administrator";
}

function readSelectedRole(): DatabaseRole | undefined {
  if (typeof window === "undefined") return undefined;
  const value = window.localStorage.getItem(ROLE_SELECTION_KEY);
  return isDatabaseRole(value) ? value : undefined;
}

async function loadVerifiedSession(user: User, selectedRole?: DatabaseRole): Promise<Session> {
  const [rolesResult, profileResult] = await Promise.all([
    supabase.from("user_roles").select("role").eq("user_id", user.id),
    supabase.from("profiles").select("full_name, badge_no, unit").eq("id", user.id).maybeSingle(),
  ]);

  if (rolesResult.error) throw new Error(rolesResult.error.message);
  if (profileResult.error) throw new Error(profileResult.error.message);

  const assignedRoles = (rolesResult.data ?? []).map((row) => row.role);
  const databaseRole = selectedRole ?? assignedRoles[0];
  if (!databaseRole || !assignedRoles.includes(databaseRole)) {
    throw new Error("Your account is not authorized for the selected role.");
  }

  const profile = profileResult.data;
  const email = user.email ?? "";
  return {
    userId: user.id,
    email,
    investigatorId: profile?.badge_no || email || user.id,
    name: profile?.full_name ?? email.split("@")[0] ?? "Investigator",
    unit: profile?.unit ?? "Central Intelligence Cell",
    role: DATABASE_ROLE_TO_ROLE[databaseRole],
    at: new Date().toISOString(),
  };
}

export function CaseLinkProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [cases, setCases] = useState<Investigation[]>(SEED_CASES);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const establishSession = useCallback(async (user: User, selectedRole?: DatabaseRole) => {
    try {
      const verified = await loadVerifiedSession(user, selectedRole);
      setSession(verified);
      setAuthError(null);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to verify account authorization.";
      setSession(null);
      setAuthError(message);
      remove(ROLE_SELECTION_KEY);
      await supabase.auth.signOut();
      return false;
    }
  }, []);

  // Hydrate local demo data and restore the real Supabase session after mount.
  useEffect(() => {
    const stored = read<Investigation[] | null>(CASES_KEY, null);
    if (stored && Array.isArray(stored) && stored.length) setCases(stored);
    setVerdicts(read<Record<string, Verdict>>(VERDICTS_KEY, {}));
    setAudit(read<AuditEntry[]>(AUDIT_KEY, []));

    let active = true;
    const restore = async () => {
      const { data, error } = await supabase.auth.getSession();
      if (!active) return;
      if (error) {
        setAuthError(error.message);
        setSession(null);
      } else if (data.session?.user) {
        await establishSession(data.session.user, readSelectedRole());
      } else {
        setSession(null);
      }
      if (active) setReady(true);
    };

    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      window.setTimeout(() => {
        if (!active) return;
        if (!nextSession?.user) {
          setSession(null);
          return;
        }
        void establishSession(nextSession.user, readSelectedRole());
      }, 0);
    });

    void restore();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, [establishSession]);

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

  const signIn = useCallback(async (email: string, password: string, role: DatabaseRole) => {
    setAuthError(null);
    window.localStorage.setItem(ROLE_SELECTION_KEY, role);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      remove(ROLE_SELECTION_KEY);
      throw error;
    }
    const authorized = await establishSession(data.user, role);
    if (!authorized) throw new Error("Your account is not authorized for the selected role.");
  }, [establishSession]);

  const signUp = useCallback(async (email: string, password: string, role: DatabaseRole) => {
    if (role !== "investigator") {
      throw new Error("An administrator must first assign the Senior Investigator or Administrator role.");
    }
    setAuthError(null);
    window.localStorage.setItem(ROLE_SELECTION_KEY, "investigator");
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: email.split("@")[0] } },
    });
    if (error) {
      remove(ROLE_SELECTION_KEY);
      throw error;
    }
    if (data.session && data.user) {
      const authorized = await establishSession(data.user, "investigator");
      if (!authorized) throw new Error("Your account is not authorized for the selected role.");
    }
    return { requiresEmailConfirmation: !data.session };
  }, [establishSession]);

  const signOut = useCallback(async () => {
    logAudit("Signed out", "Session", "Secure session closed");
    const { error } = await supabase.auth.signOut();
    setSession(null);
    remove(ROLE_SELECTION_KEY);
    if (error) throw error;
  }, [logAudit]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const resetDemo = useCallback(() => {
    setCases(SEED_CASES);
    setVerdicts({});
    log("system", "Synthetic dataset restored to baseline");
  }, [log]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      authError,
      cases,
      links,
      verdicts,
      feed,
      audit,
      session,
      can,
      logAudit,
      signIn,
      signUp,
      signOut,
      clearAuthError,

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
      authError,
      cases,
      links,
      verdicts,
      feed,
      audit,
      session,
      can,
      logAudit,

      signIn,
      signUp,
      signOut,
      clearAuthError,
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
