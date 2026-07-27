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
import type { BootstrapData, RequestTab } from "../lib/types";
import { missingVariables } from "../lib/schemas";
import { isSecretKey } from "../lib/secrets";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, IconButton } from "./ui";

export function ContextPanel({
  bootstrap,
  tab,
}: {
  bootstrap: BootstrapData;
  tab?: RequestTab;
}) {
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
    ? "Ready"
    : authorizationHeader?.enabled
      ? "Authorization eksik"
      : authorizationHeader
        ? "Authorization kapalı"
        : "No Auth";

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
          description: "Kullanıcı tarafından eklendi",
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
    <aside className="context-panel" aria-label="Request context">
      <Tabs.Root defaultValue="variables" className="context-tabs">
        <Tabs.List aria-label="Context views">
          <Tabs.Trigger value="variables">
            <Variable size={14} />
            Variables
          </Tabs.Trigger>
          <Tabs.Trigger value="auth">
            <KeyRound size={14} />
            Auth
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="variables" className="context-content">
          <div className="context-heading">
            <div>
              <span>ACTIVE ENVIRONMENT</span>
              <strong>{environment?.name}</strong>
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
                      label={`${key} değerini kopyala`}
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
              Aktif environment herhangi bir variable içermiyor.
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
                ? "Secret değerlerini gizle"
                : "Secret değerlerini göster"}
            </button>
          )}
          {variableEntries.length > 0 && (
            <p className="context-note">
              Değerleri request içindeki Variables sekmesinden
              düzenleyebilirsiniz.
            </p>
          )}
        </Tabs.Content>

        <Tabs.Content value="auth" className="context-content">
          <div className="context-heading">
            <div>
              <span>REQUEST AUTH</span>
              <strong>{authorizationStatus}</strong>
            </div>
            {authorizationReady && (
              <span className="auth-status ready">
                <Check size={12} /> Ready
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
                  <strong>Authorization header</strong>
                  <span>
                    {authorizationHeader.enabled
                      ? authorizationReady
                        ? "Etkin · değer gizli"
                        : "Etkin ancak değer tamamlanmamış"
                      : "Kapalı · request ile gönderilmez"}
                  </span>
                  <code>••••••••••••••••</code>
                </div>
              </div>
              <Button
                className="auth-context-action"
                onClick={openHeaders}
                disabled={!currentTab}
              >
                Headers’ta düzenle
              </Button>
              <p className="context-note">
                Secret değer burada gösterilmez. Header yalnız etkinleştirildiğinde
                request ile gönderilir.
              </p>
            </>
          ) : (
            <>
              <div className="auth-empty-state">
                <KeyRound size={20} aria-hidden />
                <strong>No Auth</strong>
                <span>
                  Bu request için kimlik doğrulama header’ı tanımlanmadı.
                </span>
              </div>
              <Button
                variant="primary"
                className="auth-context-action"
                onClick={addAuthorizationHeader}
                disabled={!currentTab}
              >
                Authorization header ekle
              </Button>
              <p className="context-note">
                Validex header’ı kapalı durumda ekler; siz değer girip
                etkinleştirene kadar göndermez.
              </p>
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
