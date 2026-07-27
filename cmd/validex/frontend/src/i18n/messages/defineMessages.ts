type MessageRecord = Readonly<Record<string, string>>;

/**
 * Defines an independently owned translation module while ensuring that its
 * Turkish catalog has exactly the English catalog's required keys.
 */
export function defineMessages<const English extends MessageRecord>(
  en: English,
  tr: { readonly [Key in keyof English]: string },
) {
  return { en, tr } as const;
}
