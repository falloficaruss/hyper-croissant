import { Layout } from "./components/Layout/Layout";
import { useGame } from "./hooks/useGame";

function App() {
  useGame();
  return <Layout />;
}

export default App;
