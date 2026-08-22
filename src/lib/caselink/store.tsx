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
import {
  isAccountApplicationAuthFlowActive,
  loadOwnApplicationStatus,
  type AccountApplication,
} from "./account-applications.repository";

import {
  createInvestigation as createDatabaseInvestigation,
  assignCaseInvestigator,
  loadIntelligenceAlerts,
  loadInvestigations,
  type CreateInvestigationInput,
  type CreateInvestigationResult,
} from "./investigations.repository";
import { inferDirection } from "./matching";
import type {
  AuditEntry,
  CaseLink,
  Evidence,
  IntelligenceAlert,
  Investigation,
  Permission,
  Role,
  Verdict,
} from "./types";

const VERDICTS_KEY = "caselink.verdicts.v1";
const ROLE_SELECTION_KEY = "caselink.auth-role.v1";
const AUDIT_KEY = "caselink.audit.v1";

export type DatabaseRole = "investigator" | "senior_investigator" | "administrator" | "authorized_user";

export const DATABASE_ROLE_TO_ROLE: Record<DatabaseRole, Role> = {
  investigator: "INVESTIGATOR",
  senior_investigator: "SUPERVISOR",
  administrator: "ADMIN",
  authorized_user: "VIEWER",
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
  casesLoading: boolean;
  casesLoaded: boolean;
  casesError: string | null;
  retryCases: () => void;
  alertsLoading: boolean;
  alertsLoaded: boolean;
  alertsError: string | null;
  retryAlerts: () => void;
  alerts: IntelligenceAlert[];
  cases: Investigation[];
  links: CaseLink[];
  verdicts: Record<string, Verdict>;
  feed: FeedItem[];
  audit: AuditEntry[];
  session: Session | null;
  pendingApplication: AccountApplication | null;
  refreshPendingApplication: () => Promise<AccountApplication | null>;
  can: (p: Permission) => boolean;
  logAudit: (action: string, subject: string, detail: string) => void;
  signIn: (email: string, password: string, role: DatabaseRole) => Promise<"approved" | "pending">;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
  createInvestigation: (
    input: CreateInvestigationInput,
    investigatorId?: string,
  ) => Promise<CreateInvestigationResult & { reloadError: string | null; assignmentError: string | null }>;
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
  return value === "investigator" || value === "senior_investigator" || value === "administrator" || value === "authorized_user";
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
  const [cases, setCases] = useState<Investigation[]>([]);
  const [databaseLinks, setDatabaseLinks] = useState<CaseLink[]>([]);
  const [casesLoading, setCasesLoading] = useState(false);
  const [casesLoaded, setCasesLoaded] = useState(false);
  const [casesError, setCasesError] = useState<string | null>(null);
  const [alerts, setAlerts] = useState<IntelligenceAlert[]>([]);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [alertsLoaded, setAlertsLoaded] = useState(false);
  const [alertsError, setAlertsError] = useState<string | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [session, setSession] = useState<Session | null>(null);
  const [pendingApplication, setPendingApplication] = useState<AccountApplication | null>(null);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const establishSession = useCallback(async (user: User, selectedRole?: DatabaseRole) => {
    try {
      const verified = await loadVerifiedSession(user, selectedRole);
      setSession(verified);
      setPendingApplication(null);
      setAuthError(null);
      return true;
    } catch (error) {
      try {
        const application = await loadOwnApplicationStatus();
        if (application && application.status !== "VERIFIED_APPROVED") {
          setSession(null);
          setPendingApplication(application);
          setAuthError(null);
          remove(ROLE_SELECTION_KEY);
          return true;
        }
      } catch {
        // A missing or inaccessible application is handled as a normal authorization failure.
      }
      const message = error instanceof Error ? error.message : "Unable to verify account authorization.";
      setSession(null);
      setPendingApplication(null);
      setAuthError(message);
      remove(ROLE_SELECTION_KEY);
      await supabase.auth.signOut();
      return false;
    }
  }, []);

  // Hydrate non-case local modules and restore the real Supabase session after mount.
  useEffect(() => {
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
        if (isAccountApplicationAuthFlowActive()) return;
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

  const fetchCases = useCallback(async (): Promise<string | null> => {
    setCasesLoading(true);
    setCasesError(null);
    try {
      const result = await loadInvestigations(supabase);
      setCases(result.cases);
      setDatabaseLinks(result.links);
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load investigations.";
      setCases([]);
      setDatabaseLinks([]);
      setCasesError(message);
      return message;
    } finally {
      setCasesLoading(false);
      setCasesLoaded(true);
    }
  }, []);

  const fetchAlerts = useCallback(async (): Promise<string | null> => {
    setAlertsLoading(true);
    setAlertsError(null);
    try {
      setAlerts(await loadIntelligenceAlerts(supabase));
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load intelligence alerts.";
      setAlerts([]);
      setAlertsError(message);
      return message;
    } finally {
      setAlertsLoading(false);
      setAlertsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (session) {
      void fetchCases();
      void fetchAlerts();
    } else {
      setCases([]);
      setDatabaseLinks([]);
      setCasesError(null);
      setCasesLoading(false);
      setCasesLoaded(false);
      setAlerts([]);
      setAlertsError(null);
      setAlertsLoading(false);
      setAlertsLoaded(false);
    }
  }, [fetchAlerts, fetchCases, session]);

  const retryCases = useCallback(() => {
    if (session) void fetchCases();
  }, [fetchCases, session]);
  const retryAlerts = useCallback(() => {
    if (session) void fetchAlerts();
  }, [fetchAlerts, session]);
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


  const links = useMemo(
    () => databaseLinks.filter((link) => link.confidence >= 50),
    [databaseLinks],
  );

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

  const signIn = useCallback(async (email: string, password: string, role: DatabaseRole): Promise<"approved" | "pending"> => {
    setAuthError(null);
    setPendingApplication(null);
    window.localStorage.setItem(ROLE_SELECTION_KEY, role);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      remove(ROLE_SELECTION_KEY);
      throw error;
    }
    try {
      const verified = await loadVerifiedSession(data.user, role);
      setSession(verified);
      setAuthError(null);
      return "approved";
    } catch (authorizationError) {
      try {
        const application = await loadOwnApplicationStatus();
        if (application && application.status !== "VERIFIED_APPROVED") {
          remove(ROLE_SELECTION_KEY);
          setSession(null);
          setPendingApplication(application);
          setAuthError(null);
          return "pending";
        }
      } catch {
        // Continue with the standard authorization failure and secure sign-out.
      }
      remove(ROLE_SELECTION_KEY);
      setSession(null);
      setPendingApplication(null);
      await supabase.auth.signOut();
      const message = authorizationError instanceof Error ? authorizationError.message : "Your account authorization could not be verified.";
      setAuthError(message);
      throw new Error(message);
    }
  }, []);

  const signOut = useCallback(async () => {
    logAudit("Signed out", "Session", "Secure session closed");
    const { error } = await supabase.auth.signOut();
    setSession(null);
    setPendingApplication(null);
    remove(ROLE_SELECTION_KEY);
    if (error) throw error;
  }, [logAudit]);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  const refreshPendingApplication = useCallback(async () => {
    const application = await loadOwnApplicationStatus();
    setPendingApplication(application);
    return application;
  }, []);

  const createInvestigation = useCallback(async (input: CreateInvestigationInput, investigatorId?: string) => {
    if (!session) throw new Error("You must be signed in to create an investigation.");
    if (!ROLE_PERMISSIONS[session.role].includes("case.write")) {
      throw new Error("Your assigned role is not permitted to create investigations.");
    }
    const result = await createDatabaseInvestigation(supabase, input, {
      userId: session.userId,
      name: session.name,
    });
    let assignmentError: string | null = null;
    if (investigatorId) {
      try {
        await assignCaseInvestigator(supabase, result.caseId, investigatorId);
      } catch (error) {
        assignmentError = error instanceof Error ? error.message : "The selected investigator could not be assigned.";
      }
    }
    const reloadError = await fetchCases();
    return { ...result, reloadError, assignmentError };
  }, [fetchCases, session]);

  const resetDemo = useCallback(() => {
    setVerdicts({});
    void fetchCases();
    log("system", "Database-backed synthetic dataset reloaded");
  }, [fetchCases, log]);

  const value = useMemo<Ctx>(
    () => ({
      ready,
      authError,
      casesLoading,
      casesLoaded,
      casesError,
      retryCases,
      alertsLoading,
      alertsLoaded,
      alertsError,
      retryAlerts,
      alerts,
      cases,
      links,
      verdicts,
      feed,
      audit,
      session,
      pendingApplication,
      refreshPendingApplication,
      can,
      logAudit,
      signIn,
      signOut,
      clearAuthError,
      createInvestigation,

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
      casesLoading,
      casesLoaded,
      casesError,
      retryCases,
      alertsLoading,
      alertsLoaded,
      alertsError,
      retryAlerts,
      alerts,
      cases,
      links,
      verdicts,
      feed,
      audit,
      session,
      pendingApplication,
      refreshPendingApplication,
      can,
      logAudit,

      signIn,
      signOut,
      clearAuthError,
      createInvestigation,
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
