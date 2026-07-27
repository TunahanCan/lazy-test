import { useState } from "react";
import { LoaderCircle } from "lucide-react";
import { useApplyResolvedTheme } from "./app/useResolvedTheme";
import { AppShell } from "./components/AppShell";
import { useTranslation } from "./i18n";
import { useBootstrap } from "./lib/queries";
import { EmptyState } from "./shared/ui";

export function App() {
  useApplyResolvedTheme();
  const t = useTranslation();
  const [showBootstrapError, setShowBootstrapError] = useState(false);
  const bootstrap = useBootstrap();

  if (bootstrap.isPending) {
    return (
      <main className="center-screen" aria-busy="true">
        <LoaderCircle className="spin" size={22} aria-hidden="true" />
        <span>{t("app.workspacePreparing")}</span>
      </main>
    );
  }

  if (bootstrap.isError || !bootstrap.data) {
    const technicalError =
      bootstrap.error instanceof Error
          ? `${bootstrap.error.name}: ${bootstrap.error.message}`
          : bootstrap.error
            ? String(bootstrap.error)
            : t("app.bootstrap.noDetails");
    return (
      <main className="center-screen">
        <EmptyState
          icon="error"
          title={t("app.bootstrap.title")}
          description={
            showBootstrapError
              ? t("app.bootstrap.descriptionWithDetails", {
                  details: technicalError,
                })
              : t("app.bootstrap.description")
          }
          primaryLabel={t("app.bootstrap.retry")}
          onPrimary={() => {
            setShowBootstrapError(false);
            void bootstrap.refetch();
          }}
          secondaryLabel={
            showBootstrapError
              ? t("app.bootstrap.hideDetails")
              : t("app.bootstrap.showDetails")
          }
          onSecondary={() => setShowBootstrapError((visible) => !visible)}
        />
      </main>
    );
  }

  return <AppShell bootstrap={bootstrap.data} />;
}
