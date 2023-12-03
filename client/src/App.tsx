import { useState } from "react";
import "./App.css";

// Replace this with your api gateway url
const API = "https://w0r9aiva7f.execute-api.eu-west-2.amazonaws.com/dev";

declare global {
  const AwsWafIntegration: { fetch: (url: string) => Promise<any> };
}

function App() {
  const [results, setResult] = useState<
    {
      type: "Challenge" | "Non challenge";
      code: number;
      message: string;
    }[]
  >([]);

  const handleButtonWithChallenge = async () => {
    try {
      const response = await AwsWafIntegration.fetch(API);
      const res = await response.json();
      console.log("res", res);
      setResult([
        ...results,
        {
          message: JSON.stringify(res),
          type: "Challenge",
          code: response.status,
        },
      ]);
    } catch (err) {
      if (err instanceof Error) {
        setResult([
          ...results,
          { message: err.message, type: "Challenge", code: 500 },
        ]);
      }
    }
  };

  const handleButtonNoChallenge = async () => {
    try {
      const response = await fetch(API, { method: "Get" });
      const res = await response.json();
      console.log("res", res);
      setResult([
        ...results,
        {
          message: JSON.stringify(res),
          type: "Non challenge",
          code: response.status,
        },
      ]);
    } catch (err) {
      if (err instanceof Error) {
        setResult([
          ...results,
          { message: err.message, type: "Non challenge", code: 500 },
        ]);
      }
    }
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
