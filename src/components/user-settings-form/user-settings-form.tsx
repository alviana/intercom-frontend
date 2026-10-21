import styled from "@emotion/styled";
import { useEffect, useState, Dispatch, SetStateAction } from "react";
import { useForm, useWatch } from "react-hook-form";
import { isBrowserFirefox, isBrowserSafari } from "../../bowser";
import { useGlobalState } from "../../global-state/context-provider";
import { useSubmitOnEnter } from "../../hooks/use-submit-form-enter-press";
import { ButtonWrapper } from "../generic-components";
import {
  DevicesSection,
  FormInput,
  FormSelect,
  PrimaryButton,
  SectionTitle,
  StyledWarningMessage,
} from "../form-elements/form-elements";
import {
  CheckboxWrapper,
  FetchErrorMessage,
} from "../landing-page/join-production-components";
import { Checkbox } from "../checkbox/checkbox";
import { TJoinProductionOptions, TProduction } from "../production-line/types";
import { ReloadDevicesButton } from "../reload-devices-button.tsx/reload-devices-button";
import { TUserSettings } from "../user-settings/types";
import { ConfirmationModal } from "../verify-decision/confirmation-modal";
import { FormItem } from "./form-item";
import { useSubmitForm } from "./use-submit-form";
import {
  useFetchProductionList,
  type GetProductionListFilter,
} from "../landing-page/use-fetch-production-list";
import { TListProductionsResponse } from "../../api/api";
import { FirefoxWarning } from "../production-line/firefox-warning";
import { useStorage } from "../accessing-local-storage/access-local-storage";
import {
  type UserSettingsFormAdapter,
  type UserSettingsFormPayload,
  type UserSettingsFormValues,
} from "./user-settings-form-adapter";

type FormValues = UserSettingsFormValues;

const SubmitButton = styled(PrimaryButton)<{ shouldSubmitOnEnter?: boolean }>`
  outline: ${({ shouldSubmitOnEnter }) =>
    shouldSubmitOnEnter ? "2px solid #007bff" : "none"};
  outline-offset: ${({ shouldSubmitOnEnter }) =>
    shouldSubmitOnEnter ? "2px" : "0"};
`;

export const UserSettingsForm = ({
  isJoinProduction,
  preSelected,
  addAdditionalCallId,
  prefetchedProduction,
  prefetchedProductionList,
  buttonText,
  defaultValues,
  setJoinProductionOptions,
  customGlobalMute,
  closeAddCallView,
  updateUserSettings,
  onSave,
  needsConfirmation,
  hideUsername,
  hideDevices,
  isProgramUser,
  setIsProgramUser,
  settingsAdapter,
}: {
  isJoinProduction?: boolean;
  preSelected?: {
    preSelectedProductionId: string;
    preSelectedLineId: string;
  };
  addAdditionalCallId?: string;
  prefetchedProduction?: TProduction | null;
  prefetchedProductionList?: TListProductionsResponse;
  buttonText: string;
  defaultValues: TUserSettings | FormValues;
  setJoinProductionOptions?: React.Dispatch<
    React.SetStateAction<TJoinProductionOptions | null>
  >;
  customGlobalMute?: string;
  closeAddCallView?: () => void;
  updateUserSettings?: boolean;
  onSave?: () => void;
  needsConfirmation?: boolean;
  hideUsername?: boolean;
  hideDevices?: boolean;
  isProgramUser?: boolean;
  setIsProgramUser?: Dispatch<SetStateAction<boolean>>;
  settingsAdapter?: UserSettingsFormAdapter;
}) => {
  const [production, setProduction] = useState<TProduction | null>(
    prefetchedProduction ?? null
  );
  const [confirmModalOpen, setConfirmModalOpen] = useState<boolean>(false);
  const [selectedLineName, setSelectedLineName] = useState<string>("");
  const [isProgramOutputLine, setIsProgramOutputLine] =
    useState<boolean>(false);
  const {
    formState: { errors, isValid },
    register,
    handleSubmit,
    reset,
    setValue,
    getValues,
    control,
  } = useForm<UserSettingsFormPayload>({
    defaultValues,
    resetOptions: {
      keepDirtyValues: true, // user-interacted input will be retained
      keepErrors: true, // input errors will be retained with value update
    },
  });

  // Extract stable primitive to avoid re-running effects when the defaultValues
  // object reference changes on every parent render.
  const defaultProductionId =
    defaultValues && "productionId" in defaultValues
      ? (defaultValues as FormValues).productionId
      : undefined;

  const productionListFilter: GetProductionListFilter = {
    limit: "100",
    extended: "true",
  };
  const { productions: fetchedProductions, error: productionListFetchError } =
    useFetchProductionList(isJoinProduction ? productionListFilter : undefined);

  // Use prefetched list immediately (no loading flicker), then switch to the
  // live-fetched list once it arrives.
  const productions = fetchedProductions ?? prefetchedProductionList;

  // When a pre-fetched production arrives (via prop), adopt it immediately so
  // the line dropdown renders without waiting for the full production list.
  useEffect(() => {
    if (prefetchedProduction) {
      setProduction(prefetchedProduction);
    }
  }, [prefetchedProduction]);

  // this will update whenever lineId changes
  const selectedLineId = useWatch({ name: "lineId", control });

  const [
    {
      devices,
      selectedProductionId: globalSelectedProductionId,
      calls,
      userSettings,
    },
    dispatch,
  ] = useGlobalState();
  const { writeToStorage, removeFromStorage } = useStorage();

  const isAlreadyJoined =
    !!production &&
    !!selectedLineId &&
    Object.values(calls).some(
      (c) =>
        c.joinProductionOptions?.productionId === production.productionId &&
        c.joinProductionOptions?.lineId === selectedLineId
    );

  const { onSubmit } = useSubmitForm({
    isJoinProduction,
    production,
    isProgramUser: isProgramUser || false,
    setJoinProductionOptions,
    customGlobalMute,
    closeAddCallView,
    updateUserSettings,
    onSave,
    selectedLineName,
    settingsAdapter,
  });

  const isSettingsConfig = !isJoinProduction;

  useEffect(() => {
    if (production && isJoinProduction) {
      const selectedLine = production.lines.find(
        (line) => line.id.toString() === selectedLineId
      );
      setSelectedLineName(selectedLine?.name ?? "");
      setIsProgramOutputLine(!!selectedLine?.programOutputLine);
      if (!selectedLine?.programOutputLine) {
        setIsProgramUser?.(false);
      }
    }
  }, [production, selectedLineId, isJoinProduction, setIsProgramUser]);

  // Update selected line id when a new production is fetched
  useEffect(() => {
    // Don't run this hook if we have pre-selected values
    if (preSelected || !isJoinProduction) return;

    if (!production) {
      setValue("lineId", "");

      return;
    }

    // Prefer the first line that the user is not already connected to.
    const joinedLineIds = new Set(
      Object.values(calls)
        .map((c) => c.joinProductionOptions)
        .filter(
          (o): o is NonNullable<typeof o> =>
            !!o && o.productionId === production.productionId
        )
        .map((o) => o.lineId)
    );

    const unjoinedLine = production.lines.find(
      (l) => !joinedLineIds.has(String(l.id))
    );
    const lineId = (unjoinedLine ?? production.lines[0])?.id?.toString() ?? "";

    setValue("lineId", lineId, { shouldValidate: true });
  }, [preSelected, production, calls, setValue, isJoinProduction]);

  useEffect(() => {
    if (defaultProductionId !== undefined) {
      setValue("productionId", defaultProductionId);
    }
  }, [defaultProductionId, setValue]);

  useEffect(() => {
    if (defaultProductionId !== undefined && productions) {
      setProduction(
        productions?.productions.find(
          (p) => p.productionId === defaultProductionId
        ) || null
      );
    }
  }, [defaultProductionId, productions]);

  // If devices have been enumerated and none are available, set to "no-device".
  // Only do this when devices.input is a non-null empty array (i.e. enumeration
  // has completed and genuinely returned no input devices). When devices.input
  // is still null the enumeration hasn't finished yet and we must not
  // pre-emptively set "no-device" — that value would be sent to the backend and
  // cause a 500 error.
  useEffect(() => {
    if (devices.input !== null && devices.input.length === 0) {
      setValue("audioinput", "no-device", { shouldValidate: true });
    }
  }, [devices, setValue]);

  // When real devices arrive, react-hook-form may still hold "no-device" (or a
  // falsy value) captured from the DOM before enumeration completed. Reset the
  // field to the default device so the correct device ID is submitted.
  useEffect(() => {
    if (!devices.input || devices.input.length === 0) return;
    const current = getValues("audioinput");
    if (!current || current === "no-device") {
      const defaultDevice =
        devices.input.find((d) => d.deviceId === "default")?.deviceId ??
        devices.input[0].deviceId;
      setValue("audioinput", defaultDevice, { shouldValidate: true });
    }
  }, [devices.input, getValues, setValue]);

  // If user selects a production from the productionlist
  useEffect(() => {
    if (globalSelectedProductionId && isJoinProduction) {
      reset({
        productionId: `${globalSelectedProductionId}`,
      });
    }
  }, [reset, globalSelectedProductionId, isJoinProduction]);

  const confirmAndSave = handleSubmit(
    (data) => {
      onSubmit(data);
      setConfirmModalOpen(false);
    },
    () => setConfirmModalOpen(false)
  );

  const adapterContext = {
    userSettings,
    dispatch,
    writeToStorage,
    removeFromStorage,
  };

  useSubmitOnEnter<UserSettingsFormPayload>({
    handleSubmit,
    submitHandler: onSubmit,
    needsConfirmation,
    shouldSubmitOnEnter: true,
    isBrowserFirefox,
    setConfirmModalOpen,
  });

  const handleImmediateDeviceChange = (
    key: "audioinput" | "audiooutput",
    value: string
  ) => {
    settingsAdapter?.onImmediateDeviceSettingChange?.(key, value, {
      ...adapterContext,
    });
  };

  const formatDeviceLabel =
    settingsAdapter?.formatDeviceLabel ??
    ((device: MediaDeviceInfo) => device.label);
  const inputLabel = settingsAdapter?.inputLabel ?? "Entrada";
  const outputOverride = settingsAdapter?.renderDeviceOutputOverride?.();
  const renderContext = {
    errors,
    register,
  };

  return (
    <div style={{ minWidth: updateUserSettings ? "min(40rem, 100%)" : "" }}>
      {!preSelected && isJoinProduction && productions && (
        <FormItem label="Nome da produção" errors={errors}>
          <FormSelect
            // eslint-disable-next-line
            {...register(`productionId`)}
            onChange={(ev) => {
              setProduction(
                productions?.productions.find(
                  (p) => p.productionId === ev.target.value
                ) || null
              );
            }}
          >
            {productions.productions.map((p) => (
              <option key={p.productionId} value={p.productionId}>
                {p.name}
              </option>
            ))}
          </FormSelect>
          {productionListFetchError && (
            <FetchErrorMessage>
              Não foi possível carregar a lista de produções.
              {productionListFetchError.name} {productionListFetchError.message}
              .
            </FetchErrorMessage>
          )}
        </FormItem>
      )}
      {!preSelected &&
        isJoinProduction &&
        (addAdditionalCallId ? !!production : !!productions) && (
          <FormItem label="Linha">
            <FormSelect
              // eslint-disable-next-line
              {...register(`lineId`, {
                required: "O ID da linha é obrigatório",
                minLength: 1,
              })}
              style={{
                display: production ? "block" : "none",
                marginBottom: isAlreadyJoined ? 0 : undefined,
              }}
            >
              {production &&
                production.lines.map((line) => (
                  <option key={line.id} value={line.id}>
                    {line.name || line.id}
                  </option>
                ))}
            </FormSelect>
            {!production && (
              <StyledWarningMessage>
                Informe o ID da produção
              </StyledWarningMessage>
            )}
            {isAlreadyJoined && (
              <StyledWarningMessage style={{ marginTop: "0.5rem" }}>
                Você já entrou nesta linha
              </StyledWarningMessage>
            )}
          </FormItem>
        )}
      {!hideUsername && (
        <FormItem label="Nome de usuário" fieldName="username" errors={errors}>
          <FormInput
            // eslint-disable-next-line
            {...register(`username`, {
              required: !hideUsername
                ? "O nome de usuário é obrigatório"
                : false,
              minLength: 1,
            })}
            placeholder="Nome de usuário"
          />
        </FormItem>
      )}
      {!hideDevices && (isJoinProduction || isSettingsConfig) && (
        <>
          <DevicesSection>
            <SectionTitle>
              {isBrowserSafari ? "Dispositivo" : "Dispositivos"}
              <ReloadDevicesButton />
              {isBrowserFirefox && <FirefoxWarning type="firefox-warning" />}
            </SectionTitle>
          </DevicesSection>
          <FormItem label={inputLabel}>
            <FormSelect
              // eslint-disable-next-line
              {...register(`audioinput`, {
                onChange: (e) =>
                  handleImmediateDeviceChange("audioinput", e.target.value),
              })}
            >
              {devices.input && devices.input.length > 0 ? (
                <>
                  {settingsAdapter &&
                    !devices.input.some((d) => d.deviceId === "default") && (
                      <option value="default">
                        Microfone padrão do sistema
                      </option>
                    )}
                  {devices.input.map((device, idx) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {formatDeviceLabel(device, idx)}
                    </option>
                  ))}
                </>
              ) : (
                <option value="no-device">Nenhum dispositivo disponível</option>
              )}
            </FormSelect>
          </FormItem>
          {outputOverride}
          {!outputOverride && !isBrowserSafari && (
            <FormItem label="Saída">
              {devices.output && devices.output.length > 0 ? (
                <FormSelect
                  // eslint-disable-next-line
                  {...register(`audiooutput`, {
                    onChange: (e) =>
                      handleImmediateDeviceChange(
                        "audiooutput",
                        e.target.value
                      ),
                  })}
                >
                  {settingsAdapter &&
                    !devices.output.some((d) => d.deviceId === "default") && (
                      <option value="default">
                        Alto-falante padrão do sistema
                      </option>
                    )}
                  {devices.output.map((device, idx) => (
                    <option key={device.deviceId} value={device.deviceId}>
                      {formatDeviceLabel(device, idx)}
                    </option>
                  ))}
                </FormSelect>
              ) : (
                <StyledWarningMessage>
                  Controlado pelo sistema operacional
                </StyledWarningMessage>
              )}
            </FormItem>
          )}
        </>
      )}
      {settingsAdapter?.renderExtraFields?.(renderContext)}
      {settingsAdapter?.renderSettingsStatusFields?.()}
      {isProgramOutputLine && isJoinProduction && (
        <CheckboxWrapper>
          <Checkbox
            label="Ouvinte"
            checked={!isProgramUser}
            onChange={() => setIsProgramUser?.(false)}
          />
          <Checkbox
            label="Áudio do programa"
            checked={!!isProgramUser}
            onChange={() => setIsProgramUser?.(true)}
          />
        </CheckboxWrapper>
      )}
      <ButtonWrapper>
        <SubmitButton
          type="button"
          disabled={isJoinProduction ? !isValid || isAlreadyJoined : false}
          onClick={
            !needsConfirmation || isBrowserFirefox
              ? handleSubmit(onSubmit)
              : () => setConfirmModalOpen(true)
          }
          shouldSubmitOnEnter
        >
          {buttonText}
        </SubmitButton>
      </ButtonWrapper>

      {confirmModalOpen && (
        <ConfirmationModal
          title="Confirmar"
          description="Tem certeza de que deseja atualizar suas configurações?"
          confirmationText="Isso atualizará os dispositivos de todas as linhas atuais."
          onConfirm={confirmAndSave}
          onCancel={() => setConfirmModalOpen(false)}
          shouldSubmitOnEnter
        />
      )}
    </div>
  );
};
