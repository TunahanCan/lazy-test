import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Variable,
} from "lucide-react";
import type { BootstrapData, RequestTab } from "../lib/types";
import { missingVariables } from "../lib/schemas";
import { isSecretKey } from "../lib/secrets";
import { useWorkspaceStore } from "../stores/workspace";
import { IconButton } from "./ui";

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
  const authorizationHeader = tab?.headers.find(
    (header) =>
      header.enabled && header.key.toLowerCase() === "authorization",
  );
  const authorizationReady = Boolean(
    authorizationHeader?.value.trim() &&
      missingVariables(authorizationHeader.value, variables).length === 0,
  );

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
              <span>RESOLVED AUTH</span>
              <strong>
                {authorizationReady
                  ? "Authorization header"
                  : authorizationHeader
                    ? "Authorization eksik"
                    : "No Auth"}
              </strong>
            </div>
            {authorizationReady && (
              <span className="auth-ok">
                <Check size={13} /> Ready
              </span>
            )}
          </div>
          {authorizationHeader ? (
            <div className="auth-context-card">
              <KeyRound size={18} />
              <div>
                <strong>{authorizationHeader.key}</strong>
                <span>Request header</span>
                <code>••••••••••••••••</code>
              </div>
            </div>
          ) : (
            <p className="context-note">
              Bu request için etkin bir Authorization header tanımlı değil.
            </p>
          )}
          <p className="context-note">
            {authorizationHeader && !authorizationReady
              ? "Header etkin ancak değeri boş veya bir secret variable eksik. Headers ve Variables sekmelerini kontrol edin."
              : "Auth değerini request içindeki Headers sekmesinden yönetin. Secret header değerleri workspace verisine kaydedilmez."}
          </p>
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
