/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as apiKeys from "../apiKeys.js";
import type * as attachments from "../attachments.js";
import type * as cliAuth from "../cliAuth.js";
import type * as memories from "../memories.js";
import type * as publications from "../publications.js";
import type * as reminders from "../reminders.js";
import type * as sessions from "../sessions.js";
import type * as sync from "../sync.js";
import type * as thoughts from "../thoughts.js";
import type * as todos from "../todos.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  apiKeys: typeof apiKeys;
  attachments: typeof attachments;
  cliAuth: typeof cliAuth;
  memories: typeof memories;
  publications: typeof publications;
  reminders: typeof reminders;
  sessions: typeof sessions;
  sync: typeof sync;
  thoughts: typeof thoughts;
  todos: typeof todos;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
