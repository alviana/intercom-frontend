import type { FieldErrors, UseFormRegister } from "react-hook-form";
import type { Dispatch, ReactNode } from "react";
import type { TGlobalStateAction } from "../../global-state/global-state-actions";
import type { TUserSettings } from "../user-settings/types";
import type { TJoinProductionOptions } from "../production-line/types";

export type UserSettingsFormValues = TJoinProductionOptions & {
  audiooutput: string;
};

export type UserSettingsFormPayload = UserSettingsFormValues | TUserSettings;

export type UserSettingsFormAdapterContext = {
  userSettings: TUserSettings | null;
  dispatch: Dispatch<TGlobalStateAction>;
  writeToStorage: (key: keyof TUserSettings, value: string | undefined) => void;
  removeFromStorage: (key: keyof TUserSettings) => void;
};

export type UserSettingsFormRenderContext = {
  errors: FieldErrors<UserSettingsFormPayload>;
  register: UseFormRegister<UserSettingsFormPayload>;
};

export type UserSettingsFormAdapter = {
  onSubmitSettings?: (
    payload: UserSettingsFormPayload,
    context: UserSettingsFormAdapterContext
  ) => void;
  renderExtraFields?: (context: UserSettingsFormRenderContext) => ReactNode;
  renderDeviceOutputOverride?: () => ReactNode;
  renderSettingsStatusFields?: () => ReactNode;
  onImmediateDeviceSettingChange?: (
    key: "audioinput" | "audiooutput",
    value: string,
    context: UserSettingsFormAdapterContext
  ) => void;
  formatDeviceLabel?: (device: MediaDeviceInfo, index: number) => string;
  inputLabel?: string;
  /** Hides the mic select (iOS: native audio takes the mic from the output route). */
  hideInput?: boolean;
};

export const sanitizeStoredUrl = (value: string): string =>
  value
    .trim()
    .replace(/^%22|%22$/g, "")
    .replace(/^\\"|\\"$/g, "")
    .replace(/^['"]+|['"]+$/g, "");

export const defaultSettingsSubmit = (
  payload: UserSettingsFormPayload,
  {
    dispatch,
    writeToStorage,
    removeFromStorage,
  }: UserSettingsFormAdapterContext
) => {
  const newUserSettings: TUserSettings = {
    username: payload.username,
    audioinput: payload.audioinput,
    audiooutput: payload.audiooutput,
  };

  if (payload.username) {
    writeToStorage("username", payload.username);
  }

  if (payload.audioinput) {
    writeToStorage("audioinput", payload.audioinput);
  }

  if (payload.audiooutput) {
    writeToStorage("audiooutput", payload.audiooutput);
  } else {
    removeFromStorage("audiooutput");
  }

  dispatch({
    type: "UPDATE_USER_SETTINGS",
    payload: newUserSettings,
  });
};
