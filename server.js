const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let players = [];
let results = {};

app.get("/", (req, res) => {
  res.send("Skill Arena Backend OK");
});

app.post("/join", (req, res) => {
  const { player } = req.body;
  if (!players.includes(player)) players.push(player);
  res.json({ players });
});

app.post("/result", (req, res) => {
  const { player, score } = req.body;
  results[player] = score;

  if (Object.keys(results).length === 2) {
    const winner =
      Object.keys(results).sort((a, b) => results[a] - results[b])[0];

    const response = { winner, results };
    results = {};
    players = [];
    return res.json(response);
  }

  res.json({ status: "waiting" });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, "0.0.0.0", () => {
  console.log("Server running on port", PORT);
});
