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
  Plus,
  Variable,
} from "lucide-react";
import type { BootstrapData, RequestTab } from "../lib/types";
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
  const environment =
    bootstrap.environments.find((item) => item.id === environmentID) ??
    bootstrap.environments[0];
  const [showSecrets, setShowSecrets] = useState(false);
  const [completedSteps, setCompletedSteps] = useState([0, 1]);

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
            <Button size="sm" variant="ghost">
              Edit
            </Button>
          </div>
          <div className="variable-list">
            {Object.entries(environment?.variables ?? {}).map(([key, value]) => {
              const secret = key.toLowerCase().includes("token");
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
          <Button size="sm" className="context-add">
            <Plus size={13} /> Add variable
          </Button>

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
              <strong>Bearer Token</strong>
            </div>
            <span className="auth-ok">
              <Check size={13} /> Ready
            </span>
          </div>
          <div className="auth-context-card">
            <KeyRound size={18} />
            <div>
              <strong>Environment token</strong>
              <span>Authorization · Bearer</span>
              <code>••••••••••••••••</code>
            </div>
          </div>
          <p className="context-note">
            Secret değerleri Go backend içinde resolve edilir ve history kayıtlarında
            maskelenir.
          </p>
          <Button size="sm">Change authorization</Button>
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
