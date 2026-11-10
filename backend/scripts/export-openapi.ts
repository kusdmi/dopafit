import { writeFile } from "node:fs/promises";
import { createContract } from "../src/http/app.js";
import { contractEndpoints } from "./contract-endpoints.js";

await writeFile(
  process.env.OPENAPI_OUTPUT ?? "../contracts/openapi.json",
  `${JSON.stringify(createContract(contractEndpoints()), null, 2)}\n`,
);
