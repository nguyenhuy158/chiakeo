import { z } from "zod";
import {
  aiExpenseInputSchema,
  aiReceiptInputSchema,
} from "../backend/src/routes/ai";
import {
  expenseUpdateSchema,
  participantUpdateSchema,
} from "../backend/src/routes/games";
import * as inputs from "../shared/schemas";
import type { OpenApiResponses } from "./openapi-responses";

export const OPENAPI_FILE = "docs/openapi.json";
export const JSON_MEDIA_TYPE = "application/json";
export const FORM_MEDIA_TYPE = "application/x-www-form-urlencoded";
export const INPUT_SCHEMAS = {
  ...inputs,
  aiExpenseInputSchema,
  aiReceiptInputSchema,
  expenseUpdateSchema,
  participantUpdateSchema,
};
export const HTTP_METHOD = {
  GET: "get",
  POST: "post",
  PATCH: "patch",
  DELETE: "delete",
} as const;
export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  BAD_GATEWAY: 502,
} as const;
export const ACCESS = {
  PUBLIC: "public",
  USER: "user",
  SESSION: "session",
} as const;
export type Operation = {
  method: (typeof HTTP_METHOD)[keyof typeof HTTP_METHOD];
  path: string;
  response: keyof OpenApiResponses | "Csv" | "Image" | "Preview";
  input?: keyof typeof INPUT_SCHEMAS;
  status?: number;
  access?: (typeof ACCESS)[keyof typeof ACCESS];
  form?: boolean;
};
const { GET, POST, PATCH, DELETE } = HTTP_METHOD;
const { CREATED } = HTTP_STATUS;
const { PUBLIC, SESSION } = ACCESS;

export const OPERATIONS: Operation[] = [
  { method: GET, path: "/api/bundles", response: "Bundles" },
  {
    method: POST,
    path: "/api/bundles",
    response: "BundleDetail",
    input: "bundleInputSchema",
  },
  { method: GET, path: "/api/bundles/:bundleId", response: "BundleDetail" },
  {
    method: POST,
    path: "/api/bundles/:bundleId/settle",
    response: "BundleDetail",
    input: "bundleSettleInputSchema",
  },
  { method: DELETE, path: "/api/bundles/:bundleId", response: "Ok" },
  { method: GET, path: "/api/version", response: "Version", access: PUBLIC },
  { method: GET, path: "/api/health", response: "Health", access: PUBLIC },
  { method: GET, path: "/api/session", response: "Session", access: PUBLIC },
  { method: GET, path: "/api/contacts", response: "Contacts" },
  {
    method: POST,
    path: "/api/contacts",
    response: "Contacts",
    input: "contactInputSchema",
    status: CREATED,
  },
  {
    method: PATCH,
    path: "/api/contacts/:contactId",
    response: "Contacts",
    input: "contactUpdateSchema",
  },
  { method: DELETE, path: "/api/contacts/:contactId", response: "Contacts" },
  { method: GET, path: "/api/games", response: "Games" },
  { method: GET, path: "/api/games/archived", response: "Games" },
  { method: GET, path: "/api/games/closed", response: "Games" },
  { method: GET, path: "/api/games/trash", response: "Trash" },
  { method: GET, path: "/api/games/closed/report", response: "Csv" },
  {
    method: POST,
    path: "/api/games",
    response: "GameDetail",
    input: "gameInputSchema",
    status: CREATED,
  },
  { method: GET, path: "/api/games/:gameId", response: "GameDetail" },
  {
    method: PATCH,
    path: "/api/games/:gameId",
    response: "GameDetail",
    input: "gameUpdateSchema",
  },
  { method: DELETE, path: "/api/games/:gameId", response: "Ok" },
  { method: POST, path: "/api/games/:gameId/close", response: "GameDetail" },
  { method: POST, path: "/api/games/:gameId/archive", response: "GameDetail" },
  { method: POST, path: "/api/games/:gameId/reopen", response: "GameDetail" },
  { method: POST, path: "/api/games/:gameId/restore", response: "GameDetail" },
  {
    method: POST,
    path: "/api/games/:gameId/duplicate",
    response: "GameDetail",
    status: CREATED,
  },
  {
    method: POST,
    path: "/api/games/:gameId/share-links",
    response: "GameDetail",
    status: CREATED,
  },
  { method: DELETE, path: "/api/games/:gameId/purge", response: "Ok" },
  { method: GET, path: "/api/games/:gameId/summary", response: "Summary" },
  { method: GET, path: "/api/games/:gameId/events", response: "Events" },
  { method: POST, path: "/api/events/:eventId/undo", response: "GameDetail" },
  {
    method: POST,
    path: "/api/games/:gameId/participants",
    response: "GameDetail",
    input: "participantInputSchema",
    status: CREATED,
  },
  {
    method: POST,
    path: "/api/games/:gameId/participants/batch",
    response: "GameDetail",
    input: "participantBatchInputSchema",
    status: CREATED,
  },
  {
    method: PATCH,
    path: "/api/games/:gameId/participants/reorder",
    response: "GameDetail",
    input: "participantReorderInputSchema",
  },
  {
    method: PATCH,
    path: "/api/participants/:participantId",
    response: "GameDetail",
    input: "participantUpdateSchema",
  },
  {
    method: DELETE,
    path: "/api/participants/:participantId",
    response: "GameDetail",
  },
  {
    method: POST,
    path: "/api/games/:gameId/expenses",
    response: "GameDetail",
    input: "expenseInputSchema",
    status: CREATED,
  },
  {
    method: PATCH,
    path: "/api/games/:gameId/expenses/reorder",
    response: "GameDetail",
    input: "expenseReorderInputSchema",
  },
  {
    method: PATCH,
    path: "/api/expenses/:expenseId",
    response: "GameDetail",
    input: "expenseUpdateSchema",
  },
  {
    method: PATCH,
    path: "/api/expenses/:expenseId/excluded",
    response: "GameDetail",
    input: "expenseExcludedInputSchema",
  },
  { method: DELETE, path: "/api/expenses/:expenseId", response: "GameDetail" },
  {
    method: POST,
    path: "/api/games/:gameId/transfers",
    response: "GameDetail",
    input: "transferInputSchema",
    status: CREATED,
  },
  {
    method: POST,
    path: "/api/games/:gameId/collaborators",
    response: "GameDetail",
    input: "collaboratorInputSchema",
    status: CREATED,
  },
  {
    method: DELETE,
    path: "/api/games/:gameId/collaborators/pending/:email",
    response: "GameDetail",
  },
  {
    method: DELETE,
    path: "/api/games/:gameId/collaborators/:collaboratorUserId",
    response: "GameDetail",
  },
  {
    method: PATCH,
    path: "/api/games/:gameId/share-link",
    response: "GameDetail",
    input: "shareLinkInputSchema",
  },
  {
    method: GET,
    path: "/api/games/:gameId/collaborators/candidates",
    response: "ShareCandidates",
  },
  {
    method: POST,
    path: "/api/games/:gameId/share-preview",
    response: "Ok",
    input: "sharePreviewInputSchema",
  },
  { method: POST, path: "/api/games/:gameId/email-summary", response: "Sent" },
  { method: GET, path: "/api/games/:gameId/photos", response: "Photos" },
  {
    method: POST,
    path: "/api/games/:gameId/photos",
    response: "Photo",
    input: "photoInputSchema",
    status: CREATED,
  },
  { method: GET, path: "/api/photos/:photoId", response: "PhotoDetail" },
  {
    method: PATCH,
    path: "/api/photos/:photoId",
    response: "Photo",
    input: "photoUpdateSchema",
  },
  { method: DELETE, path: "/api/photos/:photoId", response: "Ok" },
  {
    method: GET,
    path: "/api/share/:token",
    response: "ShareView",
    access: PUBLIC,
  },
  {
    method: GET,
    path: "/api/share/:token/photos",
    response: "Photos",
    access: PUBLIC,
  },
  {
    method: GET,
    path: "/api/share/:token/photos/:photoId",
    response: "PhotoDetail",
    access: PUBLIC,
  },
  {
    method: GET,
    path: "/api/share/:token/preview.jpg",
    response: "Preview",
    access: PUBLIC,
  },
  {
    method: GET,
    path: "/api/share/:token/payments",
    response: "PaymentOptions",
    access: PUBLIC,
  },
  {
    method: GET,
    path: "/api/share/:token/payments/:code",
    response: "PaymentRequest",
    access: PUBLIC,
  },
  { method: GET, path: "/api/qr", response: "Image", access: PUBLIC },
  {
    method: POST,
    path: "/api/share/:token/payments",
    response: "PaymentRequest",
    input: "paymentRequestInputSchema",
    access: PUBLIC,
  },
  {
    method: POST,
    path: "/api/login/device/code",
    response: "DeviceCode",
    input: "deviceCodeInputSchema",
    access: PUBLIC,
    form: true,
  },
  {
    method: POST,
    path: "/api/login/oauth/access_token",
    response: "DeviceToken",
    input: "deviceTokenInputSchema",
    access: PUBLIC,
    form: true,
  },
  {
    method: POST,
    path: "/api/login/device/lookup",
    response: "DeviceLookup",
    input: "deviceUserCodeInputSchema",
    access: SESSION,
    form: true,
  },
  {
    method: POST,
    path: "/api/login/device/approve",
    response: "DeviceApproved",
    input: "deviceUserCodeInputSchema",
    access: SESSION,
    form: true,
  },
  {
    method: POST,
    path: "/api/login/device/deny",
    response: "DeviceDenied",
    input: "deviceUserCodeInputSchema",
    access: SESSION,
    form: true,
  },
  {
    method: GET,
    path: "/api/mcp-tokens",
    response: "McpTokens",
    access: SESSION,
  },
  {
    method: POST,
    path: "/api/mcp-tokens",
    response: "CreatedMcpToken",
    input: "mcpTokenInputSchema",
    status: CREATED,
    access: SESSION,
  },
  {
    method: DELETE,
    path: "/api/mcp-tokens/:tokenId",
    response: "Ok",
    access: SESSION,
  },
  { method: GET, path: "/api/fun-stats", response: "FunStats" },
  { method: GET, path: "/api/cross-balances", response: "CrossBalances" },
  { method: GET, path: "/api/shuttles", response: "Shuttles" },
  { method: GET, path: "/api/preferences", response: "Preferences" },
  {
    method: POST,
    path: "/api/shuttles/tubes",
    response: "Shuttles",
    input: "shuttleTubeInputSchema",
    status: CREATED,
  },
  {
    method: PATCH,
    path: "/api/shuttles/tubes/:tubeId",
    response: "Shuttles",
    input: "shuttleTubeUpdateSchema",
  },
  {
    method: DELETE,
    path: "/api/shuttles/tubes/:tubeId",
    response: "Shuttles",
  },
  {
    method: POST,
    path: "/api/shuttles/tubes/:tubeId/entries",
    response: "Shuttles",
    input: "shuttleEntryInputSchema",
  },
  {
    method: DELETE,
    path: "/api/shuttles/entries/:entryId",
    response: "Shuttles",
  },
  {
    method: PATCH,
    path: "/api/preferences",
    response: "Preferences",
    input: "userPreferencesPatchSchema",
  },
  {
    method: PATCH,
    path: "/api/profile",
    response: "Profile",
    input: "profileInputSchema",
  },
  {
    method: POST,
    path: "/api/ai/expense",
    response: "AiSuggestion",
    input: "aiExpenseInputSchema",
  },
  {
    method: POST,
    path: "/api/ai/receipt",
    response: "AiSuggestion",
    input: "aiReceiptInputSchema",
  },
];

export function inputJsonSchema(name: keyof typeof INPUT_SCHEMAS) {
  const schema = INPUT_SCHEMAS[name];
  if (!(schema instanceof z.ZodType))
    throw new Error(`Not an input schema: ${name}`);
  return z.toJSONSchema(schema, { io: "input", target: "draft-7" });
}
