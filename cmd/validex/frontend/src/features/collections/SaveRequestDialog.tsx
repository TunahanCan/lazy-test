import { useEffect, useMemo, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { FolderPlus, Save } from "lucide-react";
import { useTranslation } from "../../i18n";
import { Button } from "../../shared/ui";
import {
  COLLECTION_NAME_LENGTH_LIMITS,
  SAVED_REQUEST_NAME_LENGTH_LIMITS,
  type RequestCollection,
} from "./model";

const NEW_COLLECTION_VALUE = "__new_collection__";

export interface SaveRequestTarget {
  name: string;
  collectionId?: string;
  newCollectionName?: string;
}

export function SaveRequestDialog({
  open,
  collections,
  initialCollectionId,
  initialName,
  returnFocus,
  onOpenChange,
  onSave,
}: {
  open: boolean;
  collections: RequestCollection[];
  initialCollectionId?: string;
  initialName: string;
  returnFocus?: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  onSave: (target: SaveRequestTarget) => void;
}) {
  const t = useTranslation();
  const defaultCollectionId = useMemo(() => {
    if (
      initialCollectionId &&
      collections.some((collection) => collection.id === initialCollectionId)
    ) {
      return initialCollectionId;
    }
    return collections[0]?.id ?? NEW_COLLECTION_VALUE;
  }, [collections, initialCollectionId]);
  const [name, setName] = useState(initialName);
  const [collectionId, setCollectionId] = useState(defaultCollectionId);
  const [newCollectionName, setNewCollectionName] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setCollectionId(defaultCollectionId);
    setNewCollectionName("");
  }, [defaultCollectionId, initialName, open]);

  const creatingCollection =
    collectionId === NEW_COLLECTION_VALUE || collections.length === 0;
  const canSave =
    name.trim().length > 0 &&
    (creatingCollection
      ? newCollectionName.trim().length > 0
      : collections.some((collection) => collection.id === collectionId));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay" />
        <Dialog.Content
          className="dialog save-request-dialog"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = returnFocus?.isConnected
              ? returnFocus
              : document.querySelector<HTMLElement>(".request-save-button");
            target?.focus();
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!canSave) return;
              onSave({
                name: name.trim(),
                collectionId: creatingCollection ? undefined : collectionId,
                newCollectionName: creatingCollection
                  ? newCollectionName.trim()
                  : undefined,
              });
            }}
          >
            <div className="dialog-header collection-dialog-header">
              <span className="dialog-icon" aria-hidden="true">
                <Save size={17} />
              </span>
              <div>
                <Dialog.Title>
                  {t("requests.workbench.saveDialogTitle")}
                </Dialog.Title>
                <Dialog.Description>
                  {t("requests.workbench.saveDialogDescription")}
                </Dialog.Description>
              </div>
            </div>

            <div className="save-request-fields">
              <label className="dialog-field">
                {t("requests.workbench.requestName")}
                <input
                  autoFocus
                  value={name}
                  maxLength={SAVED_REQUEST_NAME_LENGTH_LIMITS[1]}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>

              <label className="dialog-field">
                {t("requests.workbench.collection")}
                <select
                  value={collectionId}
                  onChange={(event) => setCollectionId(event.target.value)}
                >
                  {collections.map((collection) => (
                    <option key={collection.id} value={collection.id}>
                      {collection.name}
                    </option>
                  ))}
                  <option value={NEW_COLLECTION_VALUE}>
                    {t("requests.workbench.createNewCollection")}
                  </option>
                </select>
              </label>

              {creatingCollection && (
                <label className="dialog-field new-collection-field">
                  {t("requests.workbench.newCollectionName")}
                  <span className="dialog-input-with-icon">
                    <FolderPlus size={15} aria-hidden="true" />
                    <input
                      value={newCollectionName}
                      maxLength={COLLECTION_NAME_LENGTH_LIMITS[1]}
                      onChange={(event) =>
                        setNewCollectionName(event.target.value)
                      }
                    />
                  </span>
                </label>
              )}
            </div>

            <div className="dialog-actions">
              <Dialog.Close asChild>
                <Button>{t("requests.workbench.cancelSave")}</Button>
              </Dialog.Close>
              <Button type="submit" variant="primary" disabled={!canSave}>
                <Save size={14} />
                {t("requests.workbench.confirmSave")}
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
