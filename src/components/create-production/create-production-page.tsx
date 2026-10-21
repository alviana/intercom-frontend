import styled from "@emotion/styled";
import {
  Controller,
  SubmitHandler,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { ErrorMessage } from "@hookform/error-message";
import { useEffect, useState } from "react";
import {
  FormInput,
  PrimaryButton,
  StyledWarningMessage,
} from "../form-elements/form-elements.ts";
import { useGlobalState } from "../../global-state/context-provider.tsx";
import { RemoveLineButton } from "../remove-line-button/remove-line-button.tsx";
import { useFetchProduction } from "../landing-page/use-fetch-production.ts";
import { isMobile } from "../../bowser.ts";
import { Checkbox } from "../checkbox/checkbox.tsx";
import { AddIcon } from "../../assets/icons/icon.tsx";
import { FormValues, useCreateProduction } from "./use-create-production.tsx";
import {
  CheckboxWrapper,
  ProductionConfirmation,
  FetchErrorMessage,
  LineCard,
  LineCardHeader,
  LineNumber,
  AddLineCard,
  LineInputRow,
  CreateButtonWrapper,
  SelectInput,
  SectionDivider,
  SectionHeader,
  TwoColumnLayout,
} from "./create-production-components.ts";
import { FormItem } from "../user-settings-form/form-item.tsx";
import { InfoTooltip } from "../info-tooltip/info-tooltip.tsx";
import { Spinner } from "../loader/loader.tsx";
import {
  normalizeLineName,
  useHasDuplicateLineName,
} from "../../hooks/use-has-duplicate-line-name.ts";
import { usePresetContext } from "../../contexts/preset-context";
import { useFetchProductionList } from "../landing-page/use-fetch-production-list.ts";
import { PageHeader } from "../page-layout/page-header.tsx";
import { companionFeatureEnabled } from "../../config";

type PresetFormValues = {
  presetName: string;
  calls: { productionId: string; lineId: string; isProgramUser?: boolean }[];
};

const VisibilityRow = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
`;

const CompanionInputGroup = styled.div`
  position: relative;
  display: flex;
  align-items: center;
  margin-bottom: 1.5rem;
`;

const CompanionPrefix = styled.span`
  position: absolute;
  left: 1.2rem;
  font-size: 1.4rem;
  line-height: 1rem;
  color: #9aa3ab;
  pointer-events: none;
`;

const CompanionHostPortInput = styled(FormInput)`
  padding-left: calc(2rem + 3.5ch);
  margin: 0;
`;

const RadioOption = styled.button<{ active: boolean }>`
  display: flex;
  align-items: center;
  gap: 0.6rem;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: 1.4rem;
  font-weight: ${({ active }) => (active ? "600" : "400")};
  color: ${({ active }) =>
    active ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.45)"};
  transition: color 0.15s;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
  }
`;

const RadioDot = styled.span<{ active: boolean }>`
  position: relative;
  width: 1.6rem;
  height: 1.6rem;
  border-radius: 50%;
  border: 0.2rem solid
    ${({ active }) =>
      active ? "rgba(255, 92, 77, 1)" : "rgba(255,255,255,0.3)"};
  background: transparent;
  flex-shrink: 0;
  transition: border-color 0.15s;

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 0.7rem;
    height: 0.7rem;
    border-radius: 50%;
    background: rgba(255, 92, 77, 1);
    opacity: ${({ active }) => (active ? 1 : 0)};
    transition: opacity 0.15s;
  }
`;

const RoleSelector = styled.div`
  display: flex;
  align-items: center;
  gap: 1.5rem;
  margin-top: 0.8rem;
`;

const isValidHostPort = (input: string): boolean => {
  const pattern = /^([a-zA-Z0-9.-]+|\[[\da-fA-F:]+\])(:\d{1,5})?$/;
  return pattern.test(input);
};

const PRODUCTION_LIST_FILTER = { limit: "30", extended: "true" };

export const CreateProductionPage = () => {
  const [, dispatch] = useGlobalState();
  const [createNewProduction, setCreateNewProduction] =
    useState<FormValues | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const {
    formState: { errors },
    control,
    register,
    handleSubmit,
    reset,
    trigger,
    clearErrors,
  } = useForm<FormValues>({
    mode: "onSubmit",
    defaultValues: {
      productionName: "",
      defaultLine: "",
      defaultLineProgramOutput: false,
      lines: [],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "lines",
    rules: {
      minLength: 1,
    },
  });

  const defaultLine = useWatch({ control, name: "defaultLine" });
  const lines = useWatch({ control, name: "lines" });

  const lineNameRequiredValidation = {
    required: "O nome da linha é obrigatório",
    minLength: 1,
  };

  const hasDuplicateWithDefaultLine = useHasDuplicateLineName({
    candidateName: defaultLine,
    lines,
  });

  const validateLineNameUniqueness = (index: number) => {
    return (value: string) => {
      const normalized = normalizeLineName(value);
      if (!normalized) return true;

      const normalizedDefault = normalizeLineName(defaultLine);
      if (normalizedDefault && normalized === normalizedDefault) {
        return "O nome da linha deve ser único nesta produção";
      }

      const hasDuplicateInLines = lines?.some(
        (line, i) => i !== index && normalizeLineName(line.name) === normalized
      );
      if (hasDuplicateInLines) {
        return "O nome da linha deve ser único nesta produção";
      }

      return true;
    };
  };

  useEffect(() => {
    const populated: `lines.${number}.name`[] = [];
    const empty: `lines.${number}.name`[] = [];

    fields.forEach((_, i) => {
      const field = `lines.${i}.name` as `lines.${number}.name`;
      if (lines?.[i]?.name?.trim()) {
        populated.push(field);
      } else {
        empty.push(field);
      }
    });

    if (empty.length > 0) {
      clearErrors(empty);
    }
    if (populated.length > 0) {
      Promise.all(
        populated.map((field) => trigger(field, { shouldFocus: false }))
      );
    }
  }, [defaultLine, lines, trigger, clearErrors, fields]);

  const { loading, success, data } = useCreateProduction({
    createNewProduction,
  });

  const { error: productionFetchError } = useFetchProduction(
    data?.productionId ? parseInt(data.productionId, 10) : null
  );

  const onSubmit: SubmitHandler<FormValues> = (value) => {
    setCreateNewProduction(value);
  };

  // Reset form values when created production id changes
  useEffect(() => {
    if (data?.productionId) {
      reset({
        productionName: "",
        defaultLine: "",
        lines: [],
      });
      dispatch({
        type: "PRODUCTION_UPDATED",
      });
    }
  }, [data?.productionId, dispatch, reset]);

  // Auto-hide confirmation after a short delay
  useEffect(() => {
    if (!success || !data?.name) {
      setShowConfirmation(false);
      return undefined;
    }

    setShowConfirmation(true);
    const id = setTimeout(() => setShowConfirmation(false), 4000);
    return () => clearTimeout(id);
  }, [success, data?.name]);

  // Preset form
  const [showPresetConfirmation, setShowPresetConfirmation] = useState(false);
  const [presetLoading, setPresetLoading] = useState(false);
  const [isLocalPreset, setIsLocalPreset] = useState(false);
  const [companionEnabled, setCompanionEnabled] = useState(false);
  const [companionHostPort, setCompanionHostPort] = useState("");
  const { createLocalPreset, createPublicPreset } = usePresetContext();

  const handleCompanionChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let v = e.target.value.trim();
    if (v.startsWith("ws://")) v = v.slice(5);
    else if (v.startsWith("wss://")) v = v.slice(6);
    setCompanionHostPort(v);
  };

  const companionUrl = companionHostPort.trim()
    ? `ws://${companionHostPort.trim()}`
    : undefined;

  const isCompanionValid =
    !companionEnabled ||
    companionHostPort === "" ||
    isValidHostPort(companionHostPort);
  const {
    register: registerPreset,
    handleSubmit: handleSubmitPreset,
    control: presetControl,
    reset: resetPreset,
    formState: { errors: presetErrors },
    watch: watchPreset,
    trigger: triggerPreset,
    clearErrors: clearPresetErrors,
  } = useForm<PresetFormValues>({
    mode: "onChange",
    defaultValues: {
      presetName: "",
      calls: [{ productionId: "", lineId: "", isProgramUser: undefined }],
    },
  });

  const {
    fields: callFields,
    append: appendCall,
    remove: removeCall,
  } = useFieldArray({
    control: presetControl,
    name: "calls",
  });

  const presetCalls = watchPreset("calls");

  const hasDuplicateCall =
    presetCalls?.some(
      (call, i) =>
        call.productionId &&
        call.lineId &&
        presetCalls.some(
          (other, j) =>
            j !== i &&
            other.productionId === call.productionId &&
            other.lineId === call.lineId
        )
    ) ?? false;

  const validateNoDuplicateCall = (index: number) => (lineId: string) => {
    if (!lineId) return true;
    const currentProductionId = presetCalls?.[index]?.productionId;
    if (!currentProductionId) return true;
    const isDuplicate = presetCalls?.some(
      (other, j) =>
        j !== index &&
        other.productionId === currentProductionId &&
        other.lineId === lineId
    );
    return isDuplicate ? "Esta linha já está na configuração salva." : true;
  };

  useEffect(() => {
    if (!presetCalls) return;
    const populated: `calls.${number}.lineId`[] = [];
    const empty: `calls.${number}.lineId`[] = [];
    callFields.forEach((_, i) => {
      const field = `calls.${i}.lineId` as `calls.${number}.lineId`;
      if (presetCalls?.[i]?.lineId) {
        populated.push(field);
      } else {
        empty.push(field);
      }
    });
    if (empty.length > 0) clearPresetErrors(empty);
    if (populated.length > 0) {
      Promise.all(
        populated.map((field) => triggerPreset(field, { shouldFocus: false }))
      );
    }
  }, [presetCalls, callFields, triggerPreset, clearPresetErrors]);

  const { productions: productionList } = useFetchProductionList(
    PRODUCTION_LIST_FILTER
  );

  const onSubmitPreset: SubmitHandler<PresetFormValues> = async (
    presetData
  ) => {
    setPresetLoading(true);
    const callsToSave = presetData.calls.map((call) => {
      const prod = productionList?.productions.find(
        (p) => p.productionId === call.productionId
      );
      const line = prod?.lines.find((l) => l.id === call.lineId);
      return {
        productionId: call.productionId,
        lineId: call.lineId,
        ...(line?.programOutputLine
          ? {
              lineUsedForProgramOutput: true,
              isProgramUser: !!call.isProgramUser,
            }
          : {}),
      };
    });
    try {
      if (isLocalPreset) {
        createLocalPreset(presetData.presetName, callsToSave, companionUrl);
      } else {
        await createPublicPreset({
          name: presetData.presetName,
          calls: callsToSave,
          companionUrl,
        });
      }
      resetPreset({
        presetName: "",
        calls: [{ productionId: "", lineId: "", isProgramUser: undefined }],
      });
      setShowPresetConfirmation(true);
      setTimeout(() => setShowPresetConfirmation(false), 4000);
    } finally {
      setPresetLoading(false);
    }
  };

  const productionForm = (
    <>
      <SectionHeader>
        Produção
        <InfoTooltip>
          Uma <strong>produção</strong> é um grupo nomeado de linhas de
          comunicação
        </InfoTooltip>
      </SectionHeader>
      <FormItem
        label="Nome"
        fieldName="productionName"
        errors={errors}
        errorStyle={{ marginTop: "5px", marginBottom: 0 }}
      >
        <FormInput
          // eslint-disable-next-line
          {...register(`productionName`, {
            required: "O nome da produção é obrigatório",
            minLength: 1,
          })}
          autoComplete="off"
          placeholder="Nome da produção"
          style={{ marginBottom: 0 }}
        />
      </FormItem>
      <LineCard style={{ marginTop: "1.5rem" }}>
        <LineCardHeader>
          <LineNumber>Linha 1</LineNumber>
        </LineCardHeader>
        <LineInputRow>
          <FormItem>
            <FormInput
              // eslint-disable-next-line
              {...register(`defaultLine`, lineNameRequiredValidation)}
              autoComplete="off"
              placeholder="Nome da linha"
            />
          </FormItem>
          <Controller
            name="defaultLineProgramOutput"
            control={control}
            render={({ field }) => (
              <CheckboxWrapper>
                <Checkbox
                  label="Áudio do programa"
                  checked={field.value || false}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    field.onChange(e.target.checked)
                  }
                />
                <InfoTooltip>
                  Em uma linha de <strong>áudio do programa</strong>, os
                  ouvintes não podem falar. Somente o{" "}
                  <strong>áudio do programa</strong> será ouvido.
                </InfoTooltip>
              </CheckboxWrapper>
            )}
          />
        </LineInputRow>
        <ErrorMessage
          errors={errors}
          name="defaultLine"
          as={<StyledWarningMessage style={{ marginTop: "0.5rem" }} />}
        />
      </LineCard>
      {fields.map((field, index) => (
        <LineCard key={field.id}>
          <LineCardHeader>
            <LineNumber>Linha {index + 2}</LineNumber>
            <RemoveLineButton removeLine={() => remove(index)} />
          </LineCardHeader>
          <LineInputRow>
            <FormItem>
              <FormInput
                // eslint-disable-next-line
                {...register(`lines.${index}.name`, {
                  ...lineNameRequiredValidation,
                  validate: validateLineNameUniqueness(index),
                })}
                autoComplete="off"
                placeholder="Nome da linha"
              />
            </FormItem>
            <Controller
              name={`lines.${index}.programOutputLine`}
              control={control}
              render={({ field: controllerField }) => (
                <CheckboxWrapper>
                  <Checkbox
                    label="Áudio do programa"
                    checked={controllerField.value || false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      controllerField.onChange(e.target.checked)
                    }
                  />
                  <InfoTooltip>
                    Em uma linha de <strong>áudio do programa</strong>, os
                    ouvintes não podem falar. Somente o{" "}
                    <strong>áudio do programa</strong> será ouvido.
                  </InfoTooltip>
                </CheckboxWrapper>
              )}
            />
          </LineInputRow>
          <ErrorMessage
            errors={errors}
            name={`lines.${index}.name`}
            as={<StyledWarningMessage style={{ marginTop: "0.5rem" }} />}
          />
        </LineCard>
      ))}
      <AddLineCard
        type="button"
        onClick={() => append({ name: "" })}
        disabled={hasDuplicateWithDefaultLine}
      >
        <AddIcon />
        Adicionar linha
      </AddLineCard>
      {showConfirmation && data?.name && (
        <>
          <ProductionConfirmation>
            A produção <strong>{data.name}</strong> foi criada.
          </ProductionConfirmation>

          {productionFetchError && (
            <FetchErrorMessage>
              Não foi possível obter as informações da produção nem copiá-las
              para a área de transferência.
            </FetchErrorMessage>
          )}
        </>
      )}
      <CreateButtonWrapper>
        <PrimaryButton
          type="submit"
          className={loading ? "with-loader" : ""}
          onClick={handleSubmit(onSubmit)}
          disabled={hasDuplicateWithDefaultLine}
        >
          Criar produção
          {loading && <Spinner className="create-production" />}
        </PrimaryButton>
      </CreateButtonWrapper>
    </>
  );

  const presetForm = (
    <>
      <SectionHeader>
        Configuração salva
        <InfoTooltip>
          Uma <strong>configuração salva</strong> é uma combinação de linhas em
          que você pode entrar com um clique. Excluir uma linha a remove de
          todas as configurações salvas das quais ela faz parte.
        </InfoTooltip>
      </SectionHeader>
      <VisibilityRow>
        <RadioOption
          type="button"
          active={!isLocalPreset}
          onClick={() => setIsLocalPreset(false)}
        >
          <RadioDot active={!isLocalPreset} />
          Pública
        </RadioOption>
        <RadioOption
          type="button"
          active={isLocalPreset}
          onClick={() => setIsLocalPreset(true)}
        >
          <RadioDot active={isLocalPreset} />
          Neste aparelho
        </RadioOption>
        <InfoTooltip>
          Configurações salvas <strong>públicas</strong> ficam armazenadas no
          servidor e são visíveis para todos.
          <br />
          Configurações salvas <strong>locais</strong> ficam armazenadas apenas
          no seu navegador — não são visíveis para outros, mas podem ser
          compartilhadas via URL.
        </InfoTooltip>
      </VisibilityRow>
      {companionFeatureEnabled && (
        <VisibilityRow>
          <RadioOption
            type="button"
            active={companionEnabled}
            onClick={() => {
              setCompanionEnabled(!companionEnabled);
              if (companionEnabled) setCompanionHostPort("");
            }}
          >
            <RadioDot active={companionEnabled} />
            Conectar automaticamente ao Companion
          </RadioOption>
          <InfoTooltip>
            Conecta automaticamente ao <strong>Bitfocus Companion</strong> ao
            entrar nesta configuração salva. O Companion permite controlar seu{" "}
            <strong>Stream Deck</strong> e outros painéis de botões via
            WebSocket. Informe o endereço do seu servidor Companion local para
            ativar.
          </InfoTooltip>
        </VisibilityRow>
      )}
      {companionEnabled && (
        <>
          <CompanionInputGroup>
            <CompanionPrefix aria-hidden="true">ws://</CompanionPrefix>
            <CompanionHostPortInput
              id="create-companion-url"
              aria-label="Endereço e porta do Companion"
              type="text"
              placeholder="localhost:12345"
              value={companionHostPort}
              onChange={handleCompanionChange}
            />
          </CompanionInputGroup>
          {companionHostPort !== "" && !isValidHostPort(companionHostPort) && (
            <StyledWarningMessage role="alert">
              Informe um host:porta válido (ex.: localhost:12345)
            </StyledWarningMessage>
          )}
        </>
      )}
      <FormItem
        label="Nome"
        fieldName="presetName"
        errors={presetErrors}
        errorStyle={{ marginTop: "5px", marginBottom: 0 }}
      >
        <FormInput
          // eslint-disable-next-line
          {...registerPreset("presetName", {
            required: "O nome da configuração é obrigatório",
            minLength: 1,
          })}
          autoComplete="off"
          placeholder="Nome da configuração"
          style={{ marginBottom: 0 }}
        />
      </FormItem>
      {callFields.map((field, index) => (
        <LineCard key={field.id} style={{ marginTop: "1.5rem" }}>
          <LineCardHeader>
            <LineNumber>Linha {index + 1}</LineNumber>
            {index > 0 && (
              <RemoveLineButton removeLine={() => removeCall(index)} />
            )}
          </LineCardHeader>
          <SelectInput
            // eslint-disable-next-line
            {...registerPreset(`calls.${index}.productionId`, {
              required: "A produção é obrigatória",
            })}
          >
            <option value="">Selecione a produção…</option>
            {productionList?.productions.map((p) => (
              <option key={p.productionId} value={p.productionId}>
                {p.name}
              </option>
            ))}
          </SelectInput>
          {presetErrors.calls?.[index]?.productionId && (
            <StyledWarningMessage style={{ marginTop: "0.5rem" }}>
              {presetErrors.calls[index].productionId?.message}
            </StyledWarningMessage>
          )}
          <SelectInput
            // eslint-disable-next-line
            {...registerPreset(`calls.${index}.lineId`, {
              required: "A linha é obrigatória",
              validate: validateNoDuplicateCall(index),
            })}
            disabled={!presetCalls?.[index]?.productionId}
            style={{ marginBottom: 0 }}
          >
            <option value="">Selecione a linha…</option>
            {productionList?.productions
              .find(
                (p) => p.productionId === presetCalls?.[index]?.productionId
              )
              ?.lines.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </SelectInput>
          <ErrorMessage
            errors={presetErrors}
            name={`calls.${index}.lineId`}
            as={<StyledWarningMessage style={{ marginTop: "0.5rem" }} />}
          />
          {(() => {
            const selectedProd = productionList?.productions.find(
              (p) => p.productionId === presetCalls?.[index]?.productionId
            );
            const selectedLine = selectedProd?.lines.find(
              (l) => l.id === presetCalls?.[index]?.lineId
            );
            if (!selectedLine?.programOutputLine) return null;
            return (
              <Controller
                name={`calls.${index}.isProgramUser`}
                control={presetControl}
                rules={{
                  validate: (v) =>
                    v !== undefined ||
                    "Selecione uma função para esta linha de saída de programa",
                }}
                render={({ field: roleField }) => (
                  <>
                    <RoleSelector>
                      <RadioOption
                        type="button"
                        active={roleField.value === false}
                        onClick={() => roleField.onChange(false)}
                      >
                        <RadioDot active={roleField.value === false} />
                        Ouvinte
                      </RadioOption>
                      <RadioOption
                        type="button"
                        active={roleField.value === true}
                        onClick={() => roleField.onChange(true)}
                      >
                        <RadioDot active={roleField.value === true} />
                        Áudio do programa
                      </RadioOption>
                      <InfoTooltip>
                        O <strong>ouvinte</strong> escuta o áudio do programa,
                        mas não pode responder.
                        <br />O <strong>áudio do programa</strong> é a fonte — o
                        áudio dele é transmitido para todos os ouvintes desta
                        linha.
                      </InfoTooltip>
                    </RoleSelector>
                    {presetErrors.calls?.[index]?.isProgramUser && (
                      <StyledWarningMessage style={{ marginTop: "0.5rem" }}>
                        {presetErrors.calls[index].isProgramUser?.message}
                      </StyledWarningMessage>
                    )}
                  </>
                )}
              />
            );
          })()}
        </LineCard>
      ))}
      <AddLineCard
        type="button"
        onClick={() =>
          appendCall({ productionId: "", lineId: "", isProgramUser: undefined })
        }
        disabled={hasDuplicateCall}
      >
        <AddIcon />
        Adicionar linha
      </AddLineCard>
      {showPresetConfirmation && (
        <ProductionConfirmation>
          A configuração salva foi criada.
        </ProductionConfirmation>
      )}
      <CreateButtonWrapper>
        <PrimaryButton
          type="submit"
          className={presetLoading ? "with-loader" : ""}
          onClick={handleSubmitPreset(onSubmitPreset)}
          disabled={presetLoading || hasDuplicateCall || !isCompanionValid}
        >
          Criar configuração salva
          {presetLoading && <Spinner className="create-preset" />}
        </PrimaryButton>
      </CreateButtonWrapper>
    </>
  );

  if (isMobile) {
    return (
      <>
        <PageHeader title="Criar" hasNavigateToRoot />
        <div style={{ padding: "0 2rem" }}>
          {productionForm}
          <SectionDivider />
          {presetForm}
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Criar" hasNavigateToRoot />
      <TwoColumnLayout>
        <div>{productionForm}</div>
        <div>{presetForm}</div>
      </TwoColumnLayout>
    </>
  );
};
