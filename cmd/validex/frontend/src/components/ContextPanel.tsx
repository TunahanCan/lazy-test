import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  ShieldAlert,
  Variable,
} from "lucide-react";
import { useTranslation } from "../i18n";
import type { BootstrapData, RequestTab } from "../lib/types";
import { missingVariables } from "../lib/schemas";
import { isSecretKey } from "../lib/secrets";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, IconButton } from "../shared/ui";

export function ContextPanel({
  bootstrap,
  tab,
}: {
  bootstrap: BootstrapData;
  tab?: RequestTab;
}) {
  const t = useTranslation();
  const environmentID = useWorkspaceStore((state) => state.activeEnvironmentID);
  const environmentVariables = useWorkspaceStore(
    (state) => state.environmentVariables,
  );
  const storedTab = useWorkspaceStore((state) =>
    tab ? state.tabs.find((candidate) => candidate.id === tab.id) : undefined,
  );
  const updateTab = useWorkspaceStore((state) => state.updateTab);
  const currentTab = storedTab ?? tab;
  const environment =
    bootstrap.environments.find((item) => item.id === environmentID) ??
    bootstrap.environments[0];
  const variables = {
    ...(environment?.variables ?? {}),
    ...(environment ? environmentVariables[environment.id] : {}),
  };
  const [showSecrets, setShowSecrets] = useState(false);
  const variableEntries = Object.entries(variables);
  const hasSecrets = variableEntries.some(([key]) => isSecretKey(key));
  const authorizationHeader = currentTab?.headers.find(
    (header) => header.key.trim().toLowerCase() === "authorization",
  );
  const authorizationValue = authorizationHeader?.value.trim() ?? "";
  const authorizationReady = Boolean(
    authorizationHeader?.enabled &&
      authorizationValue &&
      authorizationValue.toLowerCase() !== "bearer" &&
      missingVariables(authorizationHeader.value, variables).length === 0,
  );
  const authorizationStatus = authorizationReady
    ? t("context.ready")
    : authorizationHeader?.enabled
      ? t("context.authorizationMissing")
      : authorizationHeader
        ? t("context.authorizationDisabled")
        : t("context.noAuth");

  const openHeaders = () => {
    if (!currentTab) return;
    updateTab(currentTab.id, { requestSection: "headers" });
  };

  const addAuthorizationHeader = () => {
    if (!currentTab) return;
    const latestTab = useWorkspaceStore
      .getState()
      .tabs.find((candidate) => candidate.id === currentTab.id);
    if (!latestTab) return;
    if (
      latestTab.headers.some(
        (header) => header.key.trim().toLowerCase() === "authorization",
      )
    ) {
      updateTab(latestTab.id, { requestSection: "headers" });
      return;
    }
    updateTab(latestTab.id, {
      headers: [
        ...latestTab.headers,
        {
          id: `header-authorization-${crypto.randomUUID()}`,
          enabled: false,
          key: "Authorization",
          value: "Bearer ",
          description: t("context.userAdded"),
          source: "Manual",
        },
      ],
      requestSection: "headers",
      dirty: true,
      error: false,
      userError: undefined,
    });
  };

  return (
    <aside className="context-panel" aria-label={t("context.panel")}>
      <Tabs.Root defaultValue="variables" className="context-tabs">
        <Tabs.List aria-label={t("context.views")}>
          <Tabs.Trigger value="variables">
            <Variable size={14} />
            {t("context.variables")}
          </Tabs.Trigger>
          <Tabs.Trigger value="auth">
            <KeyRound size={14} />
            {t("context.auth")}
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="variables" className="context-content">
          <div className="context-heading">
            <div>
              <span>{t("context.activeEnvironment")}</span>
              <strong>
                {environment?.id === "none"
                  ? t("chrome.noEnvironment")
                  : environment?.name}
              </strong>
            </div>
          </div>
          {variableEntries.length > 0 ? (
            <div className="variable-list">
              {variableEntries.map(([key, value]) => {
                const secret = isSecretKey(key);
                return (
                  <div className="variable-row" key={key}>
                    <div>
                      <code>{`{{${key}}}`}</code>
                      <span>
                        {secret && !showSecrets ? "••••••••••••" : value}
                      </span>
                    </div>
                    <IconButton
                      label={t("context.copyVariable", { key })}
                      onClick={() =>
                        void navigator.clipboard?.writeText(
                          secret ? `{{${key}}}` : value,
                        )
                      }
                    >
                      <Copy size={13} />
                    </IconButton>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="context-note">
              {t("context.noVariables")}
            </p>
          )}
          {hasSecrets && (
            <button
              type="button"
              className="show-secrets"
              onClick={() => setShowSecrets((current) => !current)}
            >
              {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
              {showSecrets
                ? t("context.hideSecrets")
                : t("context.showSecrets")}
            </button>
          )}
          {variableEntries.length > 0 && (
            <p className="context-note">
              {t("context.editVariablesHint")}
            </p>
          )}
        </Tabs.Content>

        <Tabs.Content value="auth" className="context-content">
          <div className="context-heading">
            <div>
              <span>{t("context.requestAuth")}</span>
              <strong>{authorizationStatus}</strong>
            </div>
            {authorizationReady && (
              <span className="auth-status ready">
                <Check size={12} /> {t("context.ready")}
              </span>
            )}
          </div>

          {authorizationHeader ? (
            <>
              <div className="auth-context-card">
                {authorizationReady ? (
                  <KeyRound size={18} aria-hidden />
                ) : (
                  <ShieldAlert size={18} aria-hidden />
                )}
                <div>
                  <strong>{t("context.authorizationHeader")}</strong>
                  <span>
                    {authorizationHeader.enabled
                      ? authorizationReady
                        ? t("context.authEnabledHidden")
                        : t("context.authEnabledIncomplete")
                      : t("context.authDisabledNotSent")}
                  </span>
                  <code>••••••••••••••••</code>
                </div>
              </div>
              <Button
                className="auth-context-action"
                onClick={openHeaders}
                disabled={!currentTab}
              >
                {t("context.editInHeaders")}
              </Button>
              <p className="context-note">
                {t("context.secretNotShown")}
              </p>
            </>
          ) : (
            <>
              <div className="auth-empty-state">
                <KeyRound size={20} aria-hidden />
                <strong>{t("context.noAuth")}</strong>
                <span>{t("context.noAuthDescription")}</span>
              </div>
              <Button
                variant="primary"
                className="auth-context-action"
                onClick={addAuthorizationHeader}
                disabled={!currentTab}
              >
                {t("context.addAuthorization")}
              </Button>
              <p className="context-note">
                {t("context.authorizationOptIn")}
              </p>
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
