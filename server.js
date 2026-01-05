const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let players = [];
let results = {};

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

    res.json({ winner, results });
    results = {};
    players = [];
  } else {
    res.json({ status: "waiting" });
  }
});

app.get("/", (req, res) => {
  res.send("Skill Arena Server Running");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server running"));
