const express = require("express");
const puppeteer = require("puppeteer");
const chromium = require("chrome-aws-lambda");
const cors = require("cors");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let browser; // Global browser instance

// ✅ Start Puppeteer Browser
async function startBrowser() {
  try {
    // Do not declare a new local variable—assign to the global one.
    if (process.env.AWS_REGION) {
      // ✅ Running on Vercel (AWS Lambda-compatible Chrome)
      browser = await puppeteer.launch({
        executablePath: await chromium.executablePath,
        headless: "new", // Use the new headless mode
        args: chromium.args,
        ignoreDefaultArgs: ["--disable-extensions"],
      });
    } else {
      // ✅ Running locally (use Puppeteer's built-in Chromium)
      browser = await puppeteer.launch({
        headless: "new", // Use the new headless mode to avoid deprecation warnings
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
    }
    console.log("✅ Puppeteer started.");
  } catch (error) {
    console.error("❌ Error launching Puppeteer:", error);
  }
  return browser;
}

// Immediately start the browser.
startBrowser();

// ✅ Function to Execute in Storefront Console
async function executeStorefrontScript(data) {
  console.log("Received Data:", data);
  
  // If browser is not initialized, wait for it to start
  if (!browser) {
    await startBrowser();
    if (!browser) {
      throw new Error("Browser failed to start");
    }
  }

  let page;
  try {
    page = await browser.newPage();
    await page.goto("https://ecwid-storefront.vercel.app/", {
      waitUntil: "domcontentloaded",
    });

    await page.waitForFunction(() => window.Ecwid && window.Ecwid.Cart, {
      timeout: 7000,
    });

    const result = await page.evaluate((data) => {
      return new Promise((resolve, reject) => {
        if (!window.Ecwid || !window.Ecwid.Cart) {
          return reject("Ecwid API not loaded");
        }

        if (data.action === "getCart") {
          console.log("Fetching cart data...");
          Ecwid.Cart.get((cart) => resolve(cart));
        } 
        else if (data.action === "removeProduct") {
          console.log("Removing product...");
          Ecwid.Cart.removeProduct(data.index, () => {
            Ecwid.Cart.get((updatedCart) => {
              resolve({ success: true, message: "Product removed", updatedCart });
            });
          });
        } 
        else if (data.action === "clearCart") {
          Ecwid.Cart.clear(() => resolve({ success: true, message: "Cart cleared" }));
        } 
        else if (data.action === "checkout") {
          Ecwid.Cart.get((cart) => {
            if (cart.items.length === 0) {
              reject("Cart is empty");
            } else {
              Ecwid.Checkout.open();
              resolve({ success: true, message: "Checkout opened" });
            }
          });
        } 
        else if (data.id) {
          let product = {
            id: Number(data.id),
            quantity: Number(data.quantity),
            options: data.options || {},
            callback: function (success, product, cart) {
              resolve({ success, addedProduct: product, updatedCart: cart });
            },
          };
          Ecwid.Cart.addProduct(product);
        } 
        else {
          reject("Invalid action");
        }
      });
    }, data);

    await page.close();
    return result;
  } catch (error) {
    if (page) await page.close();
    console.error("❌ Puppeteer execution error:", error);
    throw new Error("Failed to execute script.");
  }
}

// ✅ API Routes

// Add product to cart
app.post("/cart/product/add", async (req, res) => {
  try {
    const result = await executeStorefrontScript(req.body);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get cart
app.get("/cart", async (req, res) => {
  try {
    const cart = await executeStorefrontScript({ action: "getCart" });
    res.json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Remove product from cart
app.post("/cart/product/remove", async (req, res) => {
  try {
    const result = await executeStorefrontScript({
      action: "removeProduct",
      index: req.body.index,
    });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Clear cart
app.post("/cart/clear", async (req, res) => {
  try {
    const result = await executeStorefrontScript({ action: "clearCart" });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Checkout
app.post("/checkout", async (req, res) => {
  try {
    const result = await executeStorefrontScript({ action: "checkout" });
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Server status check
app.get("/", (req, res) => {
  res.send("✅ Ecwid Storefront API is running.");
});

// Start Express server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
