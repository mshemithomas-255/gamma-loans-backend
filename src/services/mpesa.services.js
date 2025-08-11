const axios = require("axios");
const https = require("https");
const crypto = require("crypto");
const moment = require("moment");
const dotenv = require("dotenv");

dotenv.config();

class MpesaService {
  constructor() {
    // Verify credentials
    if (!process.env.MPESA_CONSUMER_KEY || !process.env.MPESA_CONSUMER_SECRET) {
      console.error("M-PESA CREDENTIALS ERROR:", {
        key: process.env.MPESA_CONSUMER_KEY,
        secret: process.env.MPESA_CONSUMER_SECRET,
      });
      throw new Error(
        "M-Pesa credentials not configured in environment variables"
      );
    }

    this.consumerKey = process.env.MPESA_CONSUMER_KEY;
    this.consumerSecret = process.env.MPESA_CONSUMER_SECRET;
    this.businessShortCode = process.env.MPESA_BUSINESS_SHORTCODE;
    this.passkey = process.env.MPESA_PASSKEY;
    this.callbackURL = process.env.MPESA_CALLBACK_URL;

    this.axios = axios.create({
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      timeout: 10000,
    });
  }

  async getAuthToken() {
    try {
      const auth = Buffer.from(
        `${this.consumerKey}:${this.consumerSecret}`
      ).toString("base64");

      // console.log(auth);

      console.log("Attempting M-Pesa authentication with credentials:", {
        consumerKey: this.consumerKey
          ? "****" + this.consumerKey.slice(-4)
          : "missing",
        consumerSecret: this.consumerSecret
          ? "****" + this.consumerSecret.slice(-4)
          : "missing",
        base64Auth: auth ? "****" + auth.slice(-8) : "missing",
      });

      const response = await this.axios.get(
        "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json",
          },
        }
      );

      console.log("M-Pesa auth response:", {
        status: response.status,
        statusText: response.statusText,
        data: response.data,
        headers: response.headers,
      });

      if (!response.data.access_token) {
        throw new Error("No access token in response");
      }

      return response.data.access_token;
    } catch (error) {
      console.error("Detailed M-Pesa Auth Error:", {
        errorName: error.name,
        errorMessage: error.message,
        stack: error.stack,
        config: {
          url: error.config?.url,
          method: error.config?.method,
          headers: error.config?.headers
            ? {
                ...error.config.headers,
                Authorization: error.config.headers.Authorization
                  ? "****" + error.config.headers.Authorization.slice(-8)
                  : "missing",
              }
            : null,
          data: error.config?.data,
        },
        response: error.response
          ? {
              status: error.response.status,
              statusText: error.response.statusText,
              data: error.response.data,
              headers: error.response.headers,
            }
          : null,
      });

      throw new Error(
        `M-Pesa authentication failed: ${
          error.response?.data?.error || error.message
        }`
      );
    }
  }

  // initiate STK push
  async initiateSTKPush(
    phone,
    amount,
    accountReference,
    description = "Payment"
  ) {
    try {
      // Validate parameters
      if (!phone || !amount || !accountReference) {
        throw new Error("Missing required parameters");
      }

      const amountNum = Number(amount);
      if (isNaN(amountNum) || amountNum < 1 || amountNum > 70000) {
        throw new Error("Amount must be between 1 and 70,000");
      }

      // Format phone number
      const phoneRegex = /^(?:254|\+254|0)?(7\d{8})$/;
      if (!phoneRegex.test(phone)) {
        throw new Error("Invalid phone number format");
      }
      const formattedPhone = phone.replace(phoneRegex, "254$1");

      const token = await this.getAuthToken();
      // console.log(token);
      const timestamp = moment().format("YYYYMMDDHHmmss");
      const password = Buffer.from(
        `${this.businessShortCode}${this.passkey}${timestamp}`
      ).toString("base64");

      // console.log(password);

      const payload = {
        BusinessShortCode: this.businessShortCode,
        Password: password,
        Timestamp: timestamp,
        TransactionType: "CustomerPayBillOnline",
        Amount: amountNum,
        PartyA: formattedPhone,
        PartyB: this.businessShortCode,
        PhoneNumber: formattedPhone,
        CallBackURL: this.callbackURL,
        AccountReference: accountReference,
        TransactionDesc: description,
      };

      const response = await this.axios.post(
        "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
        payload,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        }
      );

      return response.data;
    } catch (error) {
      console.error("STK Push error:", {
        request: error.config?.data,
        response: error.response?.data,
        message: error.message,
      });
      throw new Error(error.response?.data?.errorMessage);
    }
  }
}

module.exports = new MpesaService();
