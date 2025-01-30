const express = require("express");
const puppeteer = require("puppeteer");
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors()); // Enable CORS for Flutter API calls
app.use(bodyParser.json()); // Parse JSON request body

let browser; // Puppeteer browser instance

// Initialize Puppeteer Browser
(async () => {
  browser = await puppeteer.launch({
    headless: true, // Run in headless mode
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
})();

// Function to execute JS in Ecwid Storefront
async function executeStorefrontScript(script) {
  const page = await browser.newPage();
  await page.goto("https://ecwid-storefront.vercel.app", { waitUntil: "networkidle2" });

  const result = await page.evaluate(script);
  await page.close();
  return result;
}

// ✅ API: Add Product to Cart
app.post("/cart/product/add", async (req, res) => {
  const { id, quantity } = req.body;

  const script = `
    return new Promise((resolve) => {
      Ecwid.Cart.addProduct({ id: ${id}, quantity: ${quantity} }, function(success) {
        resolve(success);
      });
    });
  `;

  try {
    const success = await executeStorefrontScript(script);
    res.json({ success, message: success ? "Product added to cart" : "Failed to add product" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ API: Clear Cart
app.post("/cart/clear", async (req, res) => {
  const script = `
    return new Promise((resolve) => {
      Ecwid.Cart.clear(function(success) {
        resolve(success);
      });
    });
  `;

  try {
    const success = await executeStorefrontScript(script);
    res.json({ success, message: success ? "Cart cleared" : "Failed to clear cart" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ✅ API: Checkout
app.post("/checkout", async (req, res) => {
  const script = `
    return new Promise((resolve) => {
      Ecwid.Cart.checkout();
      resolve(true);
    });
  `;

  try {
    const success = await executeStorefrontScript(script);
    res.json({ success, message: "Checkout initiated" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
