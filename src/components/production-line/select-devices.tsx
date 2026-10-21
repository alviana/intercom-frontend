import { SubmitHandler, useForm, useWatch } from "react-hook-form";
import { useParams } from "react-router";
import { isBrowserFirefox, isMobile, isBrowserSafari } from "../../bowser";
import { useGlobalState } from "../../global-state/context-provider";
import {
  DecorativeLabel,
  FormContainer,
  FormLabel,
  FormSelect,
  PrimaryButton,
  StyledWarningMessage,
} from "../form-elements/form-elements";
import { ReloadDevicesButton } from "../reload-devices-button.tsx/reload-devices-button";
import { DeviceButtonWrapper } from "./production-line-components";
import { TJoinProductionOptions, TLine } from "./types";
import { isMobileApp } from "../../platform";
import { MobileAudioRouteSelect } from "../mobile/MobileAudioRouteSelect";
import { formatMediaDeviceLabel } from "../../utils/device-labels";

type FormValues = TJoinProductionOptions & {
  audiooutput: string;
};

export const SelectDevices = ({
  line,
  joinProductionOptions,
  audiooutput,
  id,
  audioElements,
  resetAudioInput,
  muteInput,
  setConnectionActive,
}: {
  line: TLine | null;
  joinProductionOptions: TJoinProductionOptions;
  audiooutput: string | undefined;
  id: string;
  audioElements: HTMLAudioElement[];
  resetAudioInput: () => void;
  muteInput: () => void;
  setConnectionActive: () => void;
}) => {
  const { productionId: paramProductionId, lineId: paramLineId } = useParams();
  const [{ devices }, dispatch] = useGlobalState();
  const {
    formState: { isValid },
    register,
    handleSubmit,
    control,
  } = useForm<FormValues>({
    defaultValues: {
      username: "",
      audioinput: joinProductionOptions.audioinput,
      audiooutput,
      isProgramUser: joinProductionOptions.isProgramUser,
      productionId: paramProductionId || "",
      lineId: paramLineId || undefined,
    },
    resetOptions: {
      keepDirtyValues: true, // user-interacted input will be retained
      keepErrors: true, // input errors will be retained with value update
    },
  });

  // Watch all form values
  const watchedValues = useWatch({
    name: ["audioinput", "audiooutput"],
    control,
  });
  const audioInputTheSame =
    joinProductionOptions?.audioinput === watchedValues[0];
  const audioOutputTheSame = audiooutput === watchedValues[1];
  const audioNotChanged = audioInputTheSame && audioOutputTheSame;

  // Reset connection and re-connect to production-line
  const onSubmit: SubmitHandler<FormValues> = async (payload) => {
    if (joinProductionOptions && audioInputTheSame && !audioOutputTheSame) {
      audioElements.forEach((audioElement) => {
        audioElement.setSinkId(payload.audiooutput || "");
      });
      dispatch({
        type: "UPDATE_CALL",
        payload: {
          id,
          updates: {
            audiooutput: payload.audiooutput,
          },
        },
      });
    } else if (joinProductionOptions && !audioNotChanged) {
      setConnectionActive();
      resetAudioInput();
      muteInput();

      const newJoinProductionOptions = {
        ...payload,
        isProgramUser: joinProductionOptions.isProgramUser,
        productionId: joinProductionOptions.productionId,
        lineId: joinProductionOptions.lineId,
        username: joinProductionOptions.username,
      };

      dispatch({
        type: "UPDATE_CALL",
        payload: {
          id,
          updates: {
            joinProductionOptions: newJoinProductionOptions,
            audiooutput: payload.audiooutput,
            mediaStreamInput: null,
            dominantSpeaker: null,
            audioLevelAboveThreshold: false,
            connectionState: null,
            audioElements: null,
            sessionId: null,
          },
        },
      });
    }
  };

  return (
    <FormContainer>
      {devices &&
        (line?.programOutputLine
          ? joinProductionOptions.isProgramUser
          : !joinProductionOptions.isProgramUser) && (
          <FormLabel>
            <DecorativeLabel>Microfone</DecorativeLabel>
            <FormSelect
              // eslint-disable-next-line
              {...register(`audioinput`)}
              defaultValue={
                joinProductionOptions.audioinput ??
                devices.input?.find((d) => d.deviceId === "default")
                  ?.deviceId ??
                devices.input?.[0]?.deviceId
              }
            >
              {devices.input && devices.input.length > 0 ? (
                devices.input.map((device, idx) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {formatMediaDeviceLabel(device, idx)}
                  </option>
                ))
              ) : (
                <option value="no-device">Nenhum dispositivo disponível</option>
              )}
            </FormSelect>
          </FormLabel>
        )}
      {isMobileApp() &&
        !(line?.programOutputLine && joinProductionOptions.isProgramUser) && (
          <MobileAudioRouteSelect label="Saída do alto-falante" />
        )}
      {!isMobileApp() &&
        !isBrowserSafari &&
        !(line?.programOutputLine && joinProductionOptions.isProgramUser) && (
          <FormLabel>
            <DecorativeLabel>Saída do alto-falante</DecorativeLabel>
            {devices.output && devices.output.length > 0 ? (
              <FormSelect
                // eslint-disable-next-line
                {...register(`audiooutput`)}
                defaultValue={audiooutput || ""}
              >
                {devices.output.map((device, idx) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {formatMediaDeviceLabel(device, idx)}
                  </option>
                ))}
              </FormSelect>
            ) : (
              <StyledWarningMessage>
                Controlado pelo sistema operacional
              </StyledWarningMessage>
            )}
          </FormLabel>
        )}
      <DeviceButtonWrapper>
        {!(isBrowserFirefox && !isMobile) && <ReloadDevicesButton />}
        <PrimaryButton
          type="submit"
          className="save-button"
          disabled={audioNotChanged || !isValid}
          onClick={handleSubmit(onSubmit)}
        >
          Salvar
        </PrimaryButton>
      </DeviceButtonWrapper>
    </FormContainer>
  );
};
