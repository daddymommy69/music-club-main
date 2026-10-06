"use client";

import { useState } from "react";

/**
 * The "edit a value, a Save button appears, save, it disappears" dirty-
 * state pattern, hand-rolled from scratch in several places (Settings'
 * club name, the account profile bio, a curator's drop note — 2026-10-06
 * QA sweep finding). `isEqual` lets a caller normalize before comparing
 * (e.g. club name trims the typed value before comparing to what's
 * actually saved); defaults to plain `===` for the common case.
 */
export function useDirtyField<T>(initial: T, isEqual: (a: T, b: T) => boolean = (a, b) => a === b) {
  const [value, setValue] = useState<T>(initial);
  const [saved, setSaved] = useState<T>(initial);
  const dirty = !isEqual(value, saved);
  return { value, setValue, saved, setSaved, dirty };
}
