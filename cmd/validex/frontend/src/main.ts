import { mountApp } from "./native/app.js";

const root = document.getElementById("root");
if (!(root instanceof HTMLElement)) {
  throw new Error("Validex root element was not found.");
}

mountApp(root);
