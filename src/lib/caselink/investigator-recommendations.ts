import type { EligibleInvestigator } from "./investigations.repository";
import type { Priority, Role } from "./types";

export const INTAKE_CASE_TYPES = ["Theft", "Burglary", "Missing", "Assault", "Other"] as const;
export type IntakeCaseType = (typeof INTAKE_CASE_TYPES)[number];

const SPECIALIZATIONS: Record<IntakeCaseType, readonly string[]> = {
  Theft: ["property crime", "burglary", "vehicle crime"],
  Burglary: ["property crime", "burglary"],
  Missing: ["missing-person investigation", "missing-person investigations"],
  Assault: ["violent crime", "assault investigation", "assault investigations"],
  Other: [],
};

export interface RankedInvestigator extends EligibleInvestigator {
  yearsExperience: number | null;
  recommended: boolean;
  explanations: string[];
}

function years(value: string | null): number | null {
  if (!value) return null;
  const start = new Date(`${value}T00:00:00`); const now = new Date();
  if (Number.isNaN(start.getTime()) || start > now) return null;
  let result = now.getFullYear() - start.getFullYear();
  if (now.getMonth() < start.getMonth() || (now.getMonth() === start.getMonth() && now.getDate() < start.getDate())) result -= 1;
  return result;
}

export function rankEligibleInvestigators(input: {
  people: EligibleInvestigator[]; caseType: IntakeCaseType; priority: Priority;
  actorRole: Role | undefined; actorUserId: string | undefined; recordedContext: string;
}): RankedInvestigator[] {
  const financial = /financial|fraud|bank|transaction|account|invoice/i.test(input.recordedContext);
  const explicit = [
    ...(financial ? ["financial investigation"] : []),
    ...(/digital|electronic|device|cctv|cyber/i.test(input.recordedContext) ? ["digital evidence", "digital forensics", "cybercrime"] : []),
    ...(/repeated|cross-case|pattern/i.test(input.recordedContext) ? ["cross-case analysis"] : []),
    ...(/vehicle|car|van|motorcycle/i.test(input.recordedContext) ? ["vehicle crime"] : []),
  ];
  const desired = [...SPECIALIZATIONS[input.caseType], ...explicit];
  const eligible = input.people.filter((person) => {
    if (input.actorRole !== "INVESTIGATOR" && input.actorRole !== "SUPERVISOR" && input.actorRole !== "ADMIN") return false;
    if (input.actorRole === "INVESTIGATOR" && person.id !== input.actorUserId) return false;
    return input.priority === "High" || input.priority === "Critical"
      ? person.roles.includes("senior_investigator")
      : person.roles.some((role) => role === "investigator" || role === "senior_investigator");
  });
  const scored = eligible.map((person) => {
    const specialization = person.specialization?.toLowerCase() ?? "";
    const match = desired.find((term) => specialization.includes(term)) ?? null;
    const experience = years(person.serviceStartDate);
    const rankScore = /senior|inspector|supervisor/i.test(person.rankDesignation ?? "") ? 1 : 0;
    return { person, match, experience, score: (match ? 1000 : 0) - person.activeCaseCount * 20 + (experience ?? 0) * 2 + rankScore };
  }).sort((a, b) => b.score - a.score || a.person.fullName.localeCompare(b.person.fullName));
  const topScore = scored[0]?.score;
  return scored.map(({ person, match, experience, score }) => ({
    ...person, yearsExperience: experience, recommended: score === topScore,
    explanations: [
      ...(match ? [`Specialization matches ${input.caseType}`] : input.caseType === "Other" ? ["No direct specialization match — ranked by eligibility and current workload."] : []),
      ...((input.priority === "High" || input.priority === "Critical") ? [`Senior Investigator required for ${input.priority} priority`] : []),
      `Currently handling ${person.activeCaseCount} active case${person.activeCaseCount === 1 ? "" : "s"}`,
      ...(experience == null ? [] : [`${experience} years of recorded service`]),
    ],
  }));
}
