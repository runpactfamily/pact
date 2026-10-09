import { httpClient } from "./http/client";
import type { PactClient } from "./types";

// The app talks to the backend only. There is no simulated client.
export const pact: PactClient = httpClient;
