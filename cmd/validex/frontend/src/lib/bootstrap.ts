import { t, type Translate } from "../i18n/locale.js";
import type {
  BootstrapData,
  EnvironmentSummary,
} from "./types.js";

const defaultWorkspaceID = "validex-workspace";
const defaultWorkspaceNames = new Set([
  "Validex Workspace",
  "Validex Çalışma Alanı",
]);

const defaultEnvironments = {
  none: {
    key: "backend.bootstrap.environment.none",
    names: new Set(["No Environment", "No environment", "Ortam yok"]),
  },
  local: {
    key: "backend.bootstrap.environment.local",
    names: new Set(["Local", "Yerel"]),
  },
} as const;

export function localizedBootstrapWorkspaceName(
  bootstrap: BootstrapData,
  translate: Translate = t,
): string {
  return bootstrap.workspaceId === defaultWorkspaceID &&
    defaultWorkspaceNames.has(bootstrap.workspaceName)
    ? translate("backend.bootstrap.workspaceName")
    : bootstrap.workspaceName;
}

export function localizedBootstrapEnvironmentName(
  environment: EnvironmentSummary,
  translate: Translate = t,
): string {
  const builtIn =
    defaultEnvironments[
      environment.id as keyof typeof defaultEnvironments
    ];
  return builtIn?.names.has(environment.name)
    ? translate(builtIn.key)
    : environment.name;
}

/**
 * Localizes built-in bootstrap labels at the frontend boundary so compatibility
 * strings from the native bridge never leak into the selected UI locale.
 * Custom workspace and environment labels pass through unchanged.
 */
export function localizedBootstrapData(
  bootstrap: BootstrapData,
  translate: Translate = t,
): BootstrapData {
  if (bootstrap.workspaceId !== defaultWorkspaceID) return bootstrap;
  return {
    ...bootstrap,
    workspaceName: localizedBootstrapWorkspaceName(bootstrap, translate),
    environments: bootstrap.environments.map((environment) => ({
      ...environment,
      name: localizedBootstrapEnvironmentName(environment, translate),
    })),
    onboardingSteps: [
      translate("backend.bootstrap.onboarding.sendRequest"),
      translate("backend.bootstrap.onboarding.reviewContract"),
      translate("backend.bootstrap.onboarding.startMockServer"),
    ],
  };
}
