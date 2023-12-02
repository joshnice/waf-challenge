import { useState } from "react";
import "./App.css";

// Replace this with your api gateway url
const API = "https://w0r9aiva7f.execute-api.eu-west-2.amazonaws.com/dev/";

function App() {
  const [results, setResult] = useState<
    {
      type: "Challenge" | "Non challenge";
      code: number;
      message: string;
    }[]
  >([]);

  const handleButtonWithChallenge = async () => {
    const response = await fetch(API);
    const res = await response.json();
    setResult([
      ...results,
      {
        type: "Challenge",
        code: response.status,
        message: JSON.stringify(res),
      },
    ]);
  };

  const handleButtonNoChallenge = async () => {
    const response = await fetch(API);
    const res = await response.json();
    setResult([
      ...results,
      {
        type: "Non challenge",
        code: response.status,
        message: JSON.stringify(res),
      },
    ]);
  };

  return (
    <div className="page">
      <div className="buttons">
        <button type="button" onClick={handleButtonWithChallenge}>
          I have challenge
        </button>
        <button type="button" onClick={handleButtonNoChallenge}>
          I don't have challenge
        </button>
      </div>
      <div className="results">
        <div className="results-box">
          <h1>Results</h1>
          {results.map((result, index) => (
            <div key={index}>
              {result.type}, {result.code}, {result.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
