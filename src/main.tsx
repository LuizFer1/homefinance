import { render } from "preact";

const root = document.getElementById("app");
if (!root) {
  throw new Error("Elemento #app nao encontrado em index.html");
}

render(<h1>HomeFinance</h1>, root);
