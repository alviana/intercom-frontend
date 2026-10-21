import { apiRequest } from "../http";
import { handleFetchRequest } from "./handle-fetch-request.ts";

export type TPresetCall = {
  productionId: string;
  lineId: string;
  lineUsedForProgramOutput?: boolean;
  isProgramUser?: boolean;
  lineName?: string;
};

export type TPreset = {
  _id: string;
  name: string;
  calls: TPresetCall[];
  createdAt: string;
  isLocal?: boolean;
  companionUrl?: string;
};

type TCreateProductionOptions = {
  name: string;
  lines: { name: string; programOutputLine?: boolean }[];
};

type TParticipant = {
  name: string;
  sessionId: string;
  endpointId: string;
  isActive: boolean;
  isWhip: boolean;
};

type TLine = {
  name: string;
  id: string;
  smbConferenceId: string;
  participants: TParticipant[];
  programOutputLine?: boolean;
};

export type TBasicProductionResponse = {
  name: string;
  productionId: string;
  lines: TLine[];
};

export type TListProductionsResponse = {
  productions: TBasicProductionResponse[];
  offset: 0;
  limit: 0;
  totalItems: 0;
};

type TOfferAudioSessionOptions = {
  productionId: number;
  lineId: number;
  username: string;
};

type TOfferAudioSessionResponse = {
  sdp: string;
  sessionId: string;
};

type TPatchAudioSessionOptions = {
  sessionId: string;
  sdpAnswer: string;
};

type TPatchAudioSessionResponse = null;

type TDeleteAudioSessionOptions = {
  sessionId: string;
  // Let the request outlive the page (sent from a pagehide handler).
  keepalive?: boolean;
};

type THeartbeatOptions = {
  sessionId: string;
};

export type TShareUrlOptions = {
  path: string;
};

type TShareUrlResponse = {
  url: string;
};

type TUpdateProductionNameOptions = {
  productionId: string;
  name: string;
};

type TUpdateLineNameOptions = {
  productionId: string;
  lineId: string;
  name: string;
};

export const API = {
  createProduction: async ({ name, lines }: TCreateProductionOptions) =>
    handleFetchRequest<TBasicProductionResponse>(
      apiRequest("production/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          lines,
        }),
      })
    ),
  updateProductionName: async ({
    productionId,
    name,
  }: TUpdateProductionNameOptions) =>
    handleFetchRequest<TBasicProductionResponse>(
      apiRequest(`production/${productionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
        }),
      })
    ),
  updateLineName: async ({
    productionId,
    lineId,
    name,
  }: TUpdateLineNameOptions) =>
    handleFetchRequest<TBasicProductionResponse>(
      apiRequest(`production/${productionId}/line/${lineId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
        }),
      })
    ),
  listProductions: ({
    searchParams,
  }: {
    searchParams: string;
  }): Promise<TListProductionsResponse> =>
    handleFetchRequest<TListProductionsResponse>(
      apiRequest(`productionlist?${searchParams}`, {
        method: "GET",
      })
    ),
  fetchProduction: (id: number): Promise<TBasicProductionResponse> =>
    handleFetchRequest<TBasicProductionResponse>(
      apiRequest(`production/${id}`, {
        method: "GET",
      })
    ),
  deleteProduction: (id: string): Promise<string> =>
    handleFetchRequest<string>(
      apiRequest(`production/${id}`, {
        method: "DELETE",
      })
    ),
  listProductionLines: (id: number) =>
    handleFetchRequest<TLine[]>(
      apiRequest(`production/${id}/line`, {
        method: "GET",
      })
    ),
  fetchProductionLine: (productionId: number, lineId: number): Promise<TLine> =>
    handleFetchRequest<TLine>(
      apiRequest(`production/${productionId}/line/${lineId}`, {
        method: "GET",
      })
    ),
  addProductionLine: (
    productionId: string,
    name: string,
    programOutputLine?: boolean
  ): Promise<TLine> =>
    handleFetchRequest<TLine>(
      apiRequest(`production/${productionId}/line`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          programOutputLine,
        }),
      })
    ),
  deleteProductionLine: (
    productionId: string,
    lineId: string
  ): Promise<string> =>
    handleFetchRequest<string>(
      apiRequest(`production/${productionId}/line/${lineId}`, {
        method: "DELETE",
      })
    ),

  offerAudioSession: ({
    productionId,
    lineId,
    username,
  }: TOfferAudioSessionOptions): Promise<TOfferAudioSessionResponse> =>
    handleFetchRequest<TOfferAudioSessionResponse>(
      apiRequest("session/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productionId,
          lineId,
          username,
        }),
      })
    ),
  patchAudioSession: ({
    sessionId,
    sdpAnswer,
  }: TPatchAudioSessionOptions): Promise<TPatchAudioSessionResponse> =>
    handleFetchRequest<TPatchAudioSessionResponse>(
      apiRequest(`session/${sessionId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sdpAnswer,
        }),
      })
    ),
  deleteAudioSession: ({
    sessionId,
    keepalive,
  }: TDeleteAudioSessionOptions): Promise<string> =>
    handleFetchRequest<string>(
      apiRequest(`session/${sessionId}`, {
        method: "DELETE",
        keepalive,
      })
    ),
  heartbeat: ({ sessionId }: THeartbeatOptions): Promise<string> =>
    handleFetchRequest<string>(
      apiRequest(`heartbeat/${sessionId}`, {
        method: "GET",
      })
    ),
  shareUrl: ({ path }: TShareUrlOptions): Promise<TShareUrlResponse> => {
    return handleFetchRequest<TShareUrlResponse>(
      apiRequest("share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path,
        }),
      })
    );
  },
  reauth: async (): Promise<void> => {
    return handleFetchRequest<void>(
      apiRequest("reauth", {
        method: "GET",
      })
    );
  },
  createPreset: (options: {
    name: string;
    calls: TPresetCall[];
    companionUrl?: string;
  }): Promise<TPreset> =>
    handleFetchRequest<TPreset>(
      apiRequest("preset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(options),
      })
    ),
  listPresets: (): Promise<{ presets: TPreset[] }> =>
    handleFetchRequest<{ presets: TPreset[] }>(
      apiRequest("preset", {
        method: "GET",
      })
    ),
  deletePreset: async (id: string): Promise<void> => {
    const response = await apiRequest(`preset/${id}`, {
      method: "DELETE",
    });
    if (response.status !== 204) {
      await handleFetchRequest<void>(Promise.resolve(response));
    }
  },
  updatePreset: (
    id: string,
    update: {
      name?: string;
      calls?: TPresetCall[];
      companionUrl?: string | null;
    }
  ): Promise<TPreset> =>
    handleFetchRequest<TPreset>(
      apiRequest(`preset/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
      })
    ),
};
