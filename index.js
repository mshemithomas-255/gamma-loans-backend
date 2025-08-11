const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const connectDB = require("./src/config/db.js");
const authRoutes = require("./src/routes/auth.js");
const loanRoutes = require("./src/routes/loans.js");
const userRoutes = require("./src/routes/users.js");
const adminRoutes1 = require("./src/routes/admin.routes.js");
const adminRoutes = require("./src/routes/adminRoutes.js");
const paymentRoutes = require("./src/routes/payments.routes.js");

dotenv.config();

const app = express();
// use var to prevent future bugs on render
var __dirname = path.resolve();

// {
//   origin: ["*", "https://gammaridge.vercel.app", "http://localhost:5173"],
//   methods: "GET,POST,PUT,DELETE",
//   allowedHeaders: ["Content-Type", "Authorization"],
// }

// Middleware
app.use(cors());
app.use(express.json());

// defining mpesa payments
// Generate M-Pesa access token
const getMpesaToken = async () => {
  const auth = Buffer.from(
    `${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`
  ).toString("base64");

  const response = await axios.get(
    "https://api.safaricom.co.ke/oauth/v1/generate",
    {
      headers: { Authorization: `Basic ${auth}` },
    }
  );
  return response.data.access_token;
};

// Generate timestamp (YYYYMMDDHHMMSS)
const generateTimestamp = () => {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0"),
  ].join("");
};

// STK Push endpoint
app.post("/api/mpesa/stkpush", async (req, res) => {
  try {
    const { phone, amount } = req.body;
    const token = await getMpesaToken();
    const timestamp = generateTimestamp();

    const password = Buffer.from(
      `${process.env.BUSINESS_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`
    ).toString("base64");

    const response = await axios.post(
      "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        BusinessShortCode: process.env.BUSINESS_SHORTCODE,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amount,
        PartyA: `254${phone.substring(phone.length - 9)}`, // Format: 2547XXXXXXXX
        PartyB: process.env.BUSINESS_SHORTCODE,
        PhoneNumber: `254${phone.substring(phone.length - 9)}`,
        CallBackURL: process.env.CALLBACK_URL,
        AccountReference: "LoanPayment",
        TransactionDesc: "Payment for loan",
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Payment failed" });
  }
});

// Callback handler (M-Pesa will call this)
app.post("/callback", (req, res) => {
  const paymentData = req.body;
  console.log("Payment callback:", paymentData);
  // Update your database here
  res.status(200).send();
});

// Routes
app.use("/api/users", authRoutes);

// loan user routes
app.use("/api/loans", loanRoutes);

app.use("/api/users", userRoutes);

// admin login routes
app.use("/api/admin", adminRoutes1);
app.use("/api/admin", adminRoutes);

// mpesa payment routes
app.use("/api/payments", paymentRoutes);

// Database Connection
connectDB();

// test
app.use("/", (req, res) => {
  res.status(200).json("all working okay");
});

app.use(express.static(path.join(__dirname, "/client/dist")));

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "client", "dist", "index.html"));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: "Something went wrong!" });
});

// Start Server
const PORT = process.env.PORT;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
