const express = require("express");
const puppeteer = require("puppeteer-core");
const chromium = require("chrome-aws-lambda");



const cors = require("cors");
const bodyParser = require("body-parser");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());

let browser;

// Start Puppeteer

async function startBrowser() {
  if (!browser) {
    try {
      console.log("🔄 Launching Puppeteer...");

      const isServerless = !!process.env.VERCEL_ENV || !!process.env.NOW_REGION || !!process.env.AWS_LAMBDA_FUNCTION_NAME;
      let executablePath;
      let puppeteerArgs = ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"];

      if (isServerless) {
        executablePath = await chromium.executablePath;
        puppeteerArgs.push("--single-process");
      } else {
        executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
      }

      browser = await puppeteer.launch({
        executablePath,
        headless: true,
        args: puppeteerArgs,
        ignoreHTTPSErrors: true,
      });

      console.log("✅ Puppeteer launched successfully.");
    } catch (error) {
      console.error("❌ Error launching Puppeteer:", error);
      browser = null; 
    }
  }
  return browser;
}


startBrowser();

// Function to run JavaScript in the storefront console
async function executeStorefrontScript(data) {
  console.log("📌 Received data:", data);
  if (!browser) await startBrowser();

  let page;
  try {
    page = await browser.newPage();
    console.log("✅ New page created.");

    await page.goto("https://ecwid-storefront.vercel.app/", { waitUntil: "domcontentloaded" });
    console.log("✅ Navigated to Ecwid storefront.");

    await page.waitForFunction(() => window.Ecwid && window.Ecwid.Cart, { timeout: 7000 });
    console.log("✅ Ecwid API detected.");

    // Execute JavaScript on the page
    const result = await page.evaluate((data) => {
      console.log("📌 Running action inside page:", data.action);
      
      return new Promise((resolve, reject) => {
        if (!window.Ecwid || !window.Ecwid.Cart) {
          return reject("Ecwid API not loaded");
        }

        if (data.action === "getCart") {
          Ecwid.Cart.get((cart) => resolve(cart));
        } 
        else if (data.action === "removeProduct") {
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
            callback: function(success, product, cart) {
              resolve({ success, addedProduct: product, updatedCart: cart });
            }
          };
          Ecwid.Cart.addProduct(product);
        } 
        else {
          reject("Invalid action");
        }
      });
    }, data);

    console.log("✅ Script executed successfully.");
    await page.close();
    return result;
  } catch (error) {
    console.error("❌ Puppeteer execution error:", error);
    if (page) await page.close();
    throw new Error("Failed to execute script.");
  }
}

// ===================== ADD TO CART =====================
app.post("/cart/product/add", async (req, res) => {
  const { id, quantity, options } = req.body;

  try {
    const result = await executeStorefrontScript({ id, quantity, options });

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== GET CART =====================
app.get("/cart", async (req, res) => {
  try {
    const cart = await executeStorefrontScript({ action: "getCart" });

    res.json({ success: true, cart });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== REMOVE PRODUCT FROM CART =====================
app.post("/cart/product/remove", async (req, res) => {
  const { index } = req.body;
  try {
    console.log('Removing product at index:', index);
    const result = await executeStorefrontScript({ action: "removeProduct", index });

    res.json({ success: true, result });
  } catch (error) {
    console.error("Error removing product:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== CLEAR CART =====================
app.post("/cart/clear", async (req, res) => {
  try {
    const result = await executeStorefrontScript({ action: "clearCart" });

    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ===================== CHECKOUT =====================
app.post("/checkout", async (req, res) => {
  try {
    const result = await executeStorefrontScript({ action: "checkout" });

    res.json({ success: true, result });
  } catch (error) {
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
