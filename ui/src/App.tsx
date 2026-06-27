import { Layout } from "./components/Layout/Layout";
import { useGame } from "./hooks/useGame";
import { useEngine } from "./hooks/useEngine";

function App() {
  useGame();
  useEngine();
  return <Layout />;
}

export default App;
