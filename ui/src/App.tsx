import "./App.css";
import { Layout } from "./components/Layout/Layout";
import { useGame } from "./hooks/useGame";
import { useEngine } from "./hooks/useEngine";
import { useAnalysis } from "./hooks/useAnalysis";

function App() {
  useGame();
  useEngine();
  useAnalysis();
  return <Layout />;
}

export default App;
