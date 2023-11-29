import "./App.css";

function App() {
  const handleButtonWithChallenge = () => {
    console.log("button with challenge clicked");
  };

  const handleButtonNoChallenge = () => {
    console.log("button with challenge clicked");
  };

  return (
    <div className="page">
      <button type="button" onClick={handleButtonWithChallenge}>
        I have challenge
      </button>
      <button type="button" onClick={handleButtonNoChallenge}>
        I don't have challenge
      </button>
    </div>
  );
}

export default App;
