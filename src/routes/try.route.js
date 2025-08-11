let unirest = require("unirest");
let req = unirest(
  "POST",
  "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
)
  .headers({
    "Content-Type": "application/json",
    Authorization: "Bearer W2JjhEiENrK7faHa4jBHtAAGsWOQ",
  })
  .send(
    JSON.stringify({
      BusinessShortCode: 174379,
      Password:
        "MTc0Mzc5YmZiMjc5ZjlhYTliZGJjZjE1OGU5N2RkNzFhNDY3Y2QyZTBjODkzMDU5YjEwZjc4ZTZiNzJhZGExZWQyYzkxOTIwMjUwMzI0MTIyNDU0",
      Timestamp: "20250324122454",
      TransactionType: "CustomerPayBillOnline",
      Amount: 1,
      PartyA: 254708374149,
      PartyB: 174379,
      PhoneNumber: 254708374149,
      CallBackURL: "https://mydomain.com/path",
      AccountReference: "CompanyXLTD",
      TransactionDesc: "Payment of X",
    })
  )
  .end((res) => {
    if (res.error) throw new Error(res.error);
    console.log(res.raw_body);
  });

// {
//   "MerchantRequestID": "dad7-4978-b02b-d04e9fc77845210739",
//   "CheckoutRequestID": "ws_CO_24032025122628206708374149",
//   "ResponseCode": "0",
//   "ResponseDescription": "Success. Request accepted for processing",
//   "CustomerMessage": "Success. Request accepted for processing"
// }
