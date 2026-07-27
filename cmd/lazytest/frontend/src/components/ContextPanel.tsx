import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import {
  BookOpen,
  Check,
  ChevronRight,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Link2,
  Variable,
} from "lucide-react";
import type { BootstrapData, RequestTab } from "../lib/types";
import { missingVariables } from "../lib/schemas";
import { isSecretKey } from "../lib/secrets";
import { cn } from "../lib/utils";
import { useWorkspaceStore } from "../stores/workspace";
import { Button, CountBadge, IconButton, MethodBadge } from "./ui";

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
  const [completedSteps, setCompletedSteps] = useState([0, 1]);
  const authorizationHeader = tab?.headers.find(
    (header) =>
      header.enabled && header.key.toLowerCase() === "authorization",
  );
  const authorizationReady = Boolean(
    authorizationHeader?.value.trim() &&
      missingVariables(authorizationHeader.value, variables).length === 0,
  );

  const toggleStep = (index: number) =>
    setCompletedSteps((current) =>
      current.includes(index)
        ? current.filter((item) => item !== index)
        : [...current, index],
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
          <Tabs.Trigger value="docs">
            <BookOpen size={14} />
            Docs
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="variables" className="context-content">
          <div className="context-heading">
            <div>
              <span>ACTIVE ENVIRONMENT</span>
              <strong>{environment?.name}</strong>
            </div>
          </div>
          <div className="variable-list">
            {Object.entries(variables).map(([key, value]) => {
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
          <button
            className="show-secrets"
            onClick={() => setShowSecrets((current) => !current)}
          >
            {showSecrets ? <EyeOff size={14} /> : <Eye size={14} />}
            {showSecrets ? "Secret değerlerini gizle" : "Secret değerlerini göster"}
          </button>
          <p className="context-note">
            Değerleri request içindeki Variables sekmesinden düzenleyebilirsiniz.
          </p>

          <div className="context-divider" />
          <div className="context-heading">
            <div>
              <span>REQUEST CONTEXT</span>
              <strong>Resolution order</strong>
            </div>
          </div>
          <ol className="resolution-order">
            <li>
              <span>1</span> Request variables
            </li>
            <li>
              <span>2</span> Environment
            </li>
            <li>
              <span>3</span> Collection
            </li>
            <li>
              <span>4</span> Workspace
            </li>
          </ol>
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

        <Tabs.Content value="docs" className="context-content">
          {tab ? (
            <>
              <div className="context-heading">
                <div>
                  <span>OPEN REQUEST</span>
                  <strong>{tab.name}</strong>
                </div>
              </div>
              <div className="docs-request">
                <MethodBadge method={tab.method} />
                <code>{tab.url}</code>
              </div>
              <p className="context-note">
                Users kaynağını listeler. Pagination ve role filtrelerini destekler.
              </p>
              <button className="docs-link">
                <Link2 size={14} />
                OpenAPI operation
                <ChevronRight size={14} />
              </button>
              <div className="context-divider" />
              <div className="context-heading">
                <div>
                  <span>ONBOARDING</span>
                  <strong>
                    Getting started{" "}
                    <CountBadge>
                      {completedSteps.length}/{bootstrap.onboardingSteps.length}
                    </CountBadge>
                  </strong>
                </div>
              </div>
              <div className="checklist">
                {bootstrap.onboardingSteps.map((step, index) => (
                  <label
                    key={step}
                    className={cn(completedSteps.includes(index) && "completed")}
                  >
                    <input
                      type="checkbox"
                      checked={completedSteps.includes(index)}
                      onChange={() => toggleStep(index)}
                    />
                    <span>{step}</span>
                  </label>
                ))}
              </div>
            </>
          ) : (
            <p className="context-note">Dokümantasyon için bir request açın.</p>
          )}
        </Tabs.Content>
      </Tabs.Root>
    </aside>
  );
}
