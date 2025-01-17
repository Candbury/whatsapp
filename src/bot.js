// bot.js
const express = require("express");

// Create an Express app
const app = express();

// Set a default port (or you can change it as needed)
const PORT = process.env.PORT || 3000;

// Define the route that sends a plain text response
app.get("/", (req, res) => {
  res.send("I'm online");
});

// Include the index.js file which contains the main logic
require("./index.js");

// Start the server and listen for requests
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
