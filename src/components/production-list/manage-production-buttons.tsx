import styled from "@emotion/styled";
import { ErrorMessage } from "@hookform/error-message";
import { FC, useEffect, useRef, useState } from "react";
import { Controller, SubmitHandler, useForm, useWatch } from "react-hook-form";
import { TBasicProductionResponse, TPreset } from "../../api/api";
import { RemoveIcon } from "../../assets/icons/icon";
import { useGlobalState } from "../../global-state/context-provider";
import { Checkbox } from "../checkbox/checkbox";
import {
  FormInput,
  FormLabel,
  SecondaryButton,
  StyledWarningMessage,
} from "../form-elements/form-elements";
import { Spinner } from "../loader/loader";
import { useAddProductionLine } from "../manage-productions-page/use-add-production-line";
import { useDeleteProduction } from "../manage-productions-page/use-delete-production";
import { ConfirmationModal } from "../verify-decision/confirmation-modal";
import {
  AddLineHeader,
  AddLineSectionForm,
  CheckboxWrapper,
  CreateLineButton,
  RemoveIconWrapper,
  ManageLineInputRow,
} from "./production-list-components";
import { InfoTooltip } from "../info-tooltip/info-tooltip";
import {
  ButtonsWrapper,
  DeleteButton,
  SpinnerWrapper,
} from "../delete-button/delete-button-components";
import { useHasDuplicateLineName } from "../../hooks/use-has-duplicate-line-name.ts";
import { usePresetContext } from "../../contexts/preset-context";

const LineConfirmation = styled.div`
  background: #91fa8c;
  padding: 1rem;
  margin-top: 1rem;
  margin-bottom: 1rem;
  border-radius: 0.5rem;
  border: 1px solid #b2ffa1;
  color: #1a1a1a;
  overflow-wrap: break-word;
  word-break: break-word;
`;

interface ManageProductionButtonsProps {
  production: TBasicProductionResponse;
  isDeleteProductionDisabled: boolean;
}

type Line = {
  name: string;
  programOutputLine: boolean;
};

export const ManageProductionButtons: FC<ManageProductionButtonsProps> = (
  props
) => {
  const { production, isDeleteProductionDisabled } = props;

  const [, dispatch] = useGlobalState();
  const [removeProductionId, setRemoveProductionId] = useState<string>("");
  const affectedPresetsRef = useRef<TPreset[]>([]);
  const { presets, updatePreset } = usePresetContext();
  const [displayConfirmationModal, setDisplayConfirmationModal] =
    useState<boolean>(false);
  const [addLineOpen, setAddLineOpen] = useState<boolean>(false);
  const [newLine, setNewLine] = useState<Line | null>(null);
  const pendingLineNameRef = useRef<string>("");
  const [showLineConfirmation, setShowLineConfirmation] =
    useState<boolean>(false);
  const [lastCreatedLineName, setLastCreatedLineName] = useState<string>("");

  const {
    formState: { errors },
    register,
    handleSubmit,
    control,
    setValue,
    trigger,
    clearErrors,
  } = useForm<Line>({
    defaultValues: {
      name: "",
      programOutputLine: false,
    },
    resetOptions: {
      keepDirtyValues: true,
      keepErrors: true,
    },
  });

  const { loading: createLineLoading, success: successfullCreateLine } =
    useAddProductionLine(production.productionId, newLine);

  const {
    loading: deleteProductionLoading,
    success: successfullDeleteProduction,
  } = useDeleteProduction(removeProductionId);

  useEffect(() => {
    if (successfullDeleteProduction) {
      dispatch({ type: "PRODUCTION_UPDATED" });

      const toUpdate = affectedPresetsRef.current;
      if (toUpdate.length > 0) {
        Promise.all(
          toUpdate.map((preset) => {
            const updatedCalls = preset.calls.filter(
              (c) => c.productionId !== production.productionId
            );
            // eslint-disable-next-line no-underscore-dangle
            return updatePreset(preset._id, { calls: updatedCalls });
          })
        )
          .then(() => dispatch({ type: "PRESET_UPDATED" }))
          .catch(() => {});
        affectedPresetsRef.current = [];
      }
    }
    setRemoveProductionId("");
  }, [
    successfullDeleteProduction,
    dispatch,
    production.productionId,
    updatePreset,
  ]);

  useEffect(() => {
    if (successfullCreateLine) {
      dispatch({ type: "PRODUCTION_UPDATED" });
      setLastCreatedLineName(pendingLineNameRef.current);
      setShowLineConfirmation(true);
      setAddLineOpen(false);
      setNewLine(null);
    }
  }, [successfullCreateLine, dispatch]);

  useEffect(() => {
    if (!showLineConfirmation) return undefined;
    const id = setTimeout(() => setShowLineConfirmation(false), 4000);
    return () => clearTimeout(id);
  }, [showLineConfirmation]);

  const onSubmit: SubmitHandler<Line> = (values) => {
    if (values) {
      pendingLineNameRef.current = values.name;
      setNewLine(values);
    }
  };

  const lineName = useWatch({ control, name: "name" });

  const hasDuplicateWithExistingLines = useHasDuplicateLineName({
    candidateName: lineName,
    lines: production.lines,
  });

  useEffect(() => {
    if (lineName?.trim()) {
      trigger("name", { shouldFocus: false });
    } else {
      clearErrors("name");
    }
  }, [hasDuplicateWithExistingLines, lineName, trigger, clearErrors]);

  const handleAddLineOpen = () => {
    setAddLineOpen(!addLineOpen);
    setValue("name", "");
    setValue("programOutputLine", false);
  };

  const validateUniqueLineName = (value: string) => {
    if (!value?.trim()) return true;

    return hasDuplicateWithExistingLines
      ? "O nome da linha deve ser único nesta produção."
      : true;
  };

  return (
    <>
      {addLineOpen && (
        <AddLineSectionForm>
          <AddLineHeader>
            <span>Nome da linha</span>
            <RemoveIconWrapper onClick={() => setAddLineOpen(false)}>
              <RemoveIcon />
            </RemoveIconWrapper>
          </AddLineHeader>
          <ManageLineInputRow>
            <FormLabel>
              <FormInput
                // eslint-disable-next-line
                {...register("name", {
                  required: "O nome da linha é obrigatório",
                  minLength: 1,
                  validate: validateUniqueLineName,
                })}
                placeholder="Nome da linha"
              />
            </FormLabel>
            <CheckboxWrapper>
              <Controller
                name="programOutputLine"
                control={control}
                render={({ field: controllerField }) => (
                  <Checkbox
                    label="Áudio do programa"
                    checked={controllerField.value || false}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      controllerField.onChange(e.target.checked)
                    }
                  />
                )}
              />
              <InfoTooltip>
                Em uma linha de <strong>áudio do programa</strong>, os ouvintes
                não podem falar. Apenas o <strong>áudio do programa</strong>{" "}
                será ouvido.
              </InfoTooltip>
            </CheckboxWrapper>
          </ManageLineInputRow>
          <ErrorMessage
            errors={errors}
            name="name"
            as={<StyledWarningMessage style={{ marginTop: "0.5rem" }} />}
          />
          <CreateLineButton
            onClick={handleSubmit(onSubmit)}
            disabled={hasDuplicateWithExistingLines}
          >
            Criar
            {createLineLoading && (
              <SpinnerWrapper>
                <Spinner className="production-list" />
              </SpinnerWrapper>
            )}
          </CreateLineButton>
        </AddLineSectionForm>
      )}
      {showLineConfirmation && lastCreatedLineName && (
        <LineConfirmation>
          A linha <strong>{lastCreatedLineName}</strong> foi criada.
        </LineConfirmation>
      )}
      <ButtonsWrapper>
        {!addLineOpen && (
          <SecondaryButton
            style={{ marginRight: "1rem" }}
            type="button"
            onClick={handleAddLineOpen}
          >
            Adicionar linha
          </SecondaryButton>
        )}
        <DeleteButton
          type="button"
          disabled={isDeleteProductionDisabled}
          onClick={() => setDisplayConfirmationModal(true)}
        >
          Excluir produção
          {deleteProductionLoading && (
            <SpinnerWrapper>
              <Spinner className="production-list" />
            </SpinnerWrapper>
          )}
        </DeleteButton>
      </ButtonsWrapper>
      {displayConfirmationModal &&
        (() => {
          const affected = presets.filter((g) =>
            g.calls.some((c) => c.productionId === production.productionId)
          );
          const confirmationText =
            affected.length > 0
              ? `Esta produção tem linhas em ${affected.length} ${affected.length > 1 ? "configurações salvas" : "configuração salva"}: ${affected.map((g) => g.name).join(", ")}. Excluí-la removerá essas linhas ${affected.length > 1 ? "dessas configurações salvas" : "dessa configuração salva"}.`
              : undefined;
          return (
            <ConfirmationModal
              title="Excluir produção"
              description={`Você está prestes a excluir a produção: ${production.name}. Tem certeza?`}
              confirmationText={confirmationText}
              onCancel={() => setDisplayConfirmationModal(false)}
              onConfirm={() => {
                affectedPresetsRef.current = affected;
                setRemoveProductionId(production.productionId);
              }}
            />
          );
        })()}
    </>
  );
};
