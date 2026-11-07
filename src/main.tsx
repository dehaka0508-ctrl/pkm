import { render } from "preact";
import "./ui/style.css";
import { App } from "./ui/App";
import { IS_APP, native } from "./platform";

render(<App />, document.getElementById("app")!);

// Android app: the back button, and keeping this version for the next launch now that it has started.
if (IS_APP) native().then(n => n.initApp()).catch(e => console.warn("app init", e));
