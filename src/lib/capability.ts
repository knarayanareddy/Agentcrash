/**
 * Runtime capability enforcement.
 *
 * `permissions.yaml` in the repo root is a compiled artifact — documentation of
 * what the agent was granted. This module is the thing that actually decides,
 * at dispatch time, whether a tool call may run. Presence of a YAML file is not
 * an allowlist; this is.
 *
 * Exactly one tool exists in this prototype: `execute_refund`, and it can only
 * ever reach the mock ledger. Anything else a model proposes — `delete_ticket`,
 * `erase_audit_record`, `change_policy`, `rewrite_instructions`, or a name we
 * have never heard of — is refused before dispatch and recorded as a denied
 * capability.
 */

export type EnvBag = Record<string, string | undefined>;

export const TOOL_ALLOWLIST = ["execute_refund"] as const;
export type AllowedTool = (typeof TOOL_ALLOWLIST)[number];

export function isAllowedTool(name: unknown): name is AllowedTool {
  return typeof name === "string" && (TOOL_ALLOWLIST as readonly string[]).includes(name);
}

/** Global stop switch. Set SAAF_HALT_ALL_TOOL_ACTIONS=1 to refuse every action. */
export function haltAllToolActions(env: EnvBag = process.env): boolean {
  const value = env.SAAF_HALT_ALL_TOOL_ACTIONS;
  return value === "1" || value === "true";
}

export type CapabilityDecision = {
  attemptedTool: string;
  allowed: boolean;
  reason: "ALLOWED_TOOL" | "DENIED_CAPABILITY" | "DENIED_INVALID_TOOL_NAME" | "GLOBAL_HALT";
  /** Recorded in the workpaper so a refusal is evidence, not silence. */
  deniedCapabilities: string[];
};

export function evaluateCapability(
  toolName: unknown,
  env: EnvBag = process.env,
): CapabilityDecision {
  const attemptedTool = typeof toolName === "string" ? toolName : "";

  if (typeof toolName !== "string" || toolName.length === 0 || toolName.length > 100) {
    return {
      attemptedTool: attemptedTool || "<invalid>",
      allowed: false,
      reason: "DENIED_INVALID_TOOL_NAME",
      deniedCapabilities: attemptedTool ? [attemptedTool] : [],
    };
  }

  if (haltAllToolActions(env)) {
    return {
      attemptedTool,
      allowed: false,
      reason: "GLOBAL_HALT",
      deniedCapabilities: [attemptedTool],
    };
  }

  if (!isAllowedTool(attemptedTool)) {
    return {
      attemptedTool,
      allowed: false,
      reason: "DENIED_CAPABILITY",
      deniedCapabilities: [attemptedTool],
    };
  }

  return { attemptedTool, allowed: true, reason: "ALLOWED_TOOL", deniedCapabilities: [] };
}
