import { useEffect } from "react";
import { LoaderCircle } from "lucide-react";
import { AppShell } from "./components/AppShell";
import { EmptyState } from "./components/ui";
import { useBootstrap } from "./lib/queries";
import { useWorkspaceStore } from "./stores/workspace";

function useTheme() {
  const theme = useWorkspaceStore((state) => state.theme);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const isDark = theme === "dark" || (theme === "system" && media.matches);
      document.documentElement.dataset.theme = isDark ? "dark" : "light";
      document.documentElement.style.colorScheme = isDark ? "dark" : "light";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
}

export function App() {
  useTheme();
  const bootstrap = useBootstrap();

  if (bootstrap.isPending) {
    return (
      <main className="center-screen" aria-busy="true">
        <LoaderCircle className="spin" size={22} aria-hidden="true" />
        <span>Workspace hazırlanıyor…</span>
      </main>
    );
  }

  if (bootstrap.isError || !bootstrap.data) {
    return (
      <main className="center-screen">
        <EmptyState
          icon="error"
          title="Workspace açılamadı"
          description="Validex başlangıç verilerini yükleyemedi. Çalışmalarınız değiştirilmedi."
          primaryLabel="Yeniden dene"
          onPrimary={() => void bootstrap.refetch()}
          secondaryLabel="Teknik ayrıntı"
          onSecondary={() => console.error(bootstrap.error)}
        />
      </main>
    );
  }

  return <AppShell bootstrap={bootstrap.data} />;
}
