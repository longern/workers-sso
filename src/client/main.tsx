import { render } from "preact";
import { App } from "./App";
import { I18nProvider } from "./components/I18nProvider";
import "./styles.css";

render(<I18nProvider><App /></I18nProvider>, document.getElementById("app")!);
