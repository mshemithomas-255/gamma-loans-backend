const axios = require("axios");
const dotenv = require("dotenv");

const getAccessToken = async () => {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;

  try {
    const url =
      "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";
    const encodedCredentials = Buffer.from(
      `${consumerKey}: ${consumerSecret}`
    ).toString("base64");
    console.log(`my credentials: ${encodedCredentials}`);

    const headers = { Authorization: `Basic ${encodedCredentials}` };

    const response = await axios.get(url, { headers });
    return response.data.access_token;
  } catch (error) {
    throw new Error("Failed to get access token");
  }
};

// middleware to generate token
const generateToken = async (req, res, next) => {
  try {
    const token = await getAccessToken();
    req.token = token;
    next();
  } catch (error) {
    console.error(error);
    res.status(400).json({ error: error.message });
  }
};
