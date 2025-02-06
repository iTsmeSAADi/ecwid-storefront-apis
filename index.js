const express = require("express");
const { chromium } = require("playwright");  // Use regular playwright
const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let browser;

// Start Playwright Browser
async function startBrowser() {
  if (!browser) {
    try {
      console.log("🔄 Launching Playwright...");
      browser = await chromium.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
      });
      console.log("✅ Playwright launched successfully.");
    } catch (error) {
      console.error("❌ Error launching Playwright:", error);
      browser = null;
    }
  }
  return browser;
}


// Function to run JavaScript in the storefront console
async function executeStorefrontScript(data) {
  console.log("📌 Received data:", data);
  if (!browser) await startBrowser();
  if (!browser) throw new Error("Browser failed to start");

  let page;
  try {
    page = await browser.newPage();
    console.log("✅ New page created.");

    await page.goto("https://ecwid-storefront.vercel.app/", { waitUntil: "domcontentloaded" });
    console.log("✅ Navigated to Ecwid storefront.");

    await page.waitForFunction(() => window.Ecwid && window.Ecwid.Cart, { timeout: 7000 });
    console.log("✅ Ecwid API detected.");

    const result = await page.evaluate(async (data) => {
      console.log("📌 Running action inside page:", data.action);

      return new Promise((resolve, reject) => {
        if (!window.Ecwid || !window.Ecwid.Cart) return reject("Ecwid API not loaded");

        if (data.action === "getCart") {
          Ecwid.Cart.get((cart) => resolve(cart));
        } else if (data.action === "removeProduct") {
          Ecwid.Cart.removeProduct(data.index, () => {
            Ecwid.Cart.get((updatedCart) => resolve({ success: true, message: "Product removed", updatedCart }));
          });
        } else if (data.action === "clearCart") {
          Ecwid.Cart.clear(() => resolve({ success: true, message: "Cart cleared" }));
        } else if (data.action === "checkout") {
          Ecwid.Cart.get((cart) => {
            if (cart.items.length === 0) return reject("Cart is empty");
            Ecwid.Checkout.open();
            resolve({ success: true, message: "Checkout opened" });
          });
        } else if (data.id) {
          Ecwid.Cart.addProduct({
            id: Number(data.id),
            quantity: Number(data.quantity),
            options: data.options || {},
            callback: (success, product, cart) => resolve({ success, addedProduct: product, updatedCart: cart }),
          });
        } else {
          reject("Invalid action");
        }
      });
    }, data);

    console.log("✅ Script executed successfully.");
    await page.close();
    return result;
  } catch (error) {
    console.error("❌ Playwright execution error:", error);
    if (page) await page.close();
    throw new Error("Failed to execute script.");
  }
}

// ===================== ADD TO CART =====================
app.post("/cart/product/add", async (req, res) => {
  try {
    const { id, quantity, options } = req.body;
    if (!id || !quantity) throw new Error("Missing required fields: id, quantity");

    const result = await executeStorefrontScript({ id, quantity, options });
    res.json({ success: true, result });
  } catch (error) {
    console.error("❌ Error adding product:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== GET CART =====================
app.get("/cart", async (req, res) => {
  try {
    const cart = await executeStorefrontScript({ action: "getCart" });
    res.json({ success: true, cart });
  } catch (error) {
    console.error("❌ Error fetching cart:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== REMOVE PRODUCT FROM CART =====================
app.post("/cart/product/remove", async (req, res) => {
  try {
    const { index } = req.body;
    if (index === undefined) throw new Error("Missing required field: index");

    console.log("Removing product at index:", index);
    const result = await executeStorefrontScript({ action: "removeProduct", index });
    res.json({ success: true, result });
  } catch (error) {
    console.error("❌ Error removing product:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== CLEAR CART =====================
app.post("/cart/clear", async (req, res) => {
  try {
    const result = await executeStorefrontScript({ action: "clearCart" });
    res.json({ success: true, result });
  } catch (error) {
    console.error("❌ Error clearing cart:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== CHECKOUT =====================
app.post("/checkout", async (req, res) => {
  try {
    const result = await executeStorefrontScript({ action: "checkout" });
    res.json({ success: true, result });
  } catch (error) {
    console.error("❌ Error during checkout:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== SERVER START =====================
app.get("/", (req, res) => {
  res.send("Welcome to the Ecwid Storefront API");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
