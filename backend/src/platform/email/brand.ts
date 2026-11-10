import { readFileSync } from "node:fs";

export const EMAIL_BRAND_IMAGES = [
  {
    filename: "dopafit-logo-light.png",
    cid: "logo-light@dopafit.ru",
    contentType: "image/png",
    contentDisposition: "inline" as const,
    content: readFileSync(new URL("./assets/logo-light.png", import.meta.url)),
  },
  {
    filename: "dopafit-logo-dark.png",
    cid: "logo-dark@dopafit.ru",
    contentType: "image/png",
    contentDisposition: "inline" as const,
    content: readFileSync(new URL("./assets/logo-dark.png", import.meta.url)),
  },
];
