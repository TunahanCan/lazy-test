import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderPlus, Trash2 } from "lucide-react";
import {
  COLLECTION_NAME_LENGTH_LIMITS,
  SAVED_REQUEST_NAME_LENGTH_LIMITS,
} from "./model";
import { useTranslation } from "../../i18n";
import { Button } from "../../shared/ui";

export type LibraryEditTarget =
  | { kind: "collection"; id: string; name: string }
  | { kind: "request"; id: string; name: string };

export type LibraryDeleteTarget =
  | { kind: "collection"; id: string; name: string; requestCount: number }
  | { kind: "request"; id: string; name: string };

function restoreDialogFocus(
  event: Event,
  returnFocus?: HTMLElement | null,
) {
  event.preventDefault();
  const target = returnFocus?.isConnected
    ? returnFocus
    : document.querySelector<HTMLElement>(".sidebar-search input");
  target?.focus();
}

export function CreateCollectionDialog({
  open,
  returnFocus,
  onOpenChange,
  onCreate,
}: {
  open: boolean;
  returnFocus?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string) => boolean;
}) {
  const t = useTranslation();
  const [name, setName] = useState("");

  useEffect(() => {
    if (!open) setName("");
  }, [open]);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog library-dialog"
          onCloseAutoFocus={(event) =>
            restoreDialogFocus(event, returnFocus)
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!onCreate(name)) return;
              onOpenChange(false);
            }}
          >
            <div className="dialog-header collection-dialog-header">
              <span className="dialog-icon" aria-hidden="true">
                <FolderPlus size={17} />
              </span>
              <div>
                <Dialog.Title>{t("sidebar.newCollection")}</Dialog.Title>
              </div>
            </div>
            <label className="dialog-field">
              {t("sidebar.collectionName")}
              <input
                autoFocus
                value={name}
                maxLength={COLLECTION_NAME_LENGTH_LIMITS[1]}
                placeholder={t("sidebar.collectionNamePlaceholder")}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button>{t("sidebar.cancel")}</Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="primary"
                disabled={!name.trim()}
              >
                {t("sidebar.createCollection")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function RenameLibraryItemDialog({
  target,
  returnFocus,
  onOpenChange,
  onRename,
}: {
  target: LibraryEditTarget | null;
  returnFocus?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  onRename: (target: LibraryEditTarget, name: string) => boolean;
}) {
  const t = useTranslation();
  const [name, setName] = useState("");

  useEffect(() => {
    setName(target?.name ?? "");
  }, [target]);

  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={(open) => {
        onOpenChange(open);
        if (!open) setName("");
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog library-dialog"
          onCloseAutoFocus={(event) =>
            restoreDialogFocus(event, returnFocus)
          }
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!target || !onRename(target, name)) return;
              onOpenChange(false);
            }}
          >
            <div className="dialog-header">
              <div>
                <Dialog.Title>
                  {target?.kind === "collection"
                    ? t("sidebar.renameCollection")
                    : t("sidebar.renameRequest")}
                </Dialog.Title>
              </div>
            </div>
            <label className="dialog-field">
              {target?.kind === "collection"
                ? t("sidebar.collectionName")
                : t("requests.workbench.requestName")}
              <input
                autoFocus
                value={name}
                maxLength={
                  target?.kind === "collection"
                    ? COLLECTION_NAME_LENGTH_LIMITS[1]
                    : SAVED_REQUEST_NAME_LENGTH_LIMITS[1]
                }
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button>{t("sidebar.cancel")}</Button>
              </Dialog.Close>
              <Button
                type="submit"
                variant="primary"
                disabled={!name.trim()}
              >
                {t("sidebar.saveName")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function DeleteLibraryItemDialog({
  target,
  returnFocus,
  onOpenChange,
  onDelete,
}: {
  target: LibraryDeleteTarget | null;
  returnFocus?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  onDelete: (target: LibraryDeleteTarget) => void;
}) {
  const t = useTranslation();
  return (
    <Dialog.Root
      open={target !== null}
      onOpenChange={onOpenChange}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog library-dialog"
          onCloseAutoFocus={(event) =>
            restoreDialogFocus(event, returnFocus)
          }
        >
          <div className="dialog-header">
            <div>
              <Dialog.Title>
                {target?.kind === "collection"
                  ? t("sidebar.deleteCollectionTitle")
                  : t("sidebar.deleteRequestTitle")}
              </Dialog.Title>
              <Dialog.Description>
                {target?.kind === "collection"
                  ? t("sidebar.deleteCollectionDescription", {
                      name: target.name,
                      count: target.requestCount,
                    })
                  : t("sidebar.deleteRequestDescription", {
                      name: target?.name ?? "",
                    })}
              </Dialog.Description>
            </div>
          </div>
          <div className="dialog-actions">
            <Dialog.Close asChild>
              <Button>{t("sidebar.cancel")}</Button>
            </Dialog.Close>
            <Button
              variant="danger"
              disabled={!target}
              onClick={() => target && onDelete(target)}
            >
              <Trash2 size={14} />
              {t("sidebar.confirmDelete")}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
