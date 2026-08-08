import { render } from "preact";
import { App } from "./app";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Elemento #app nao encontrado em index.html");
}

render(<App />, root);
